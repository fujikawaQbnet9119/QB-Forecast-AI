
import React, { useState, useRef, useCallback } from 'react';
import { analyzeStore, GlobalStats, calculateGlobalABC } from '../services/analysisEngine';
import { StoreData } from '../types';
import Papa from 'papaparse';

interface DataViewProps {
    setAllStores: (stores: { [name: string]: StoreData }) => void;
    setGlobalMaxDate: (date: Date) => void;
    forecastMonths: number;
    setForecastMonths: (months: number) => void;
    dataType: 'sales' | 'customers';
    setDataType: (type: 'sales' | 'customers') => void;
    onComplete: () => void;
}

interface RawDataPoint {
    region: string;
    prefecture: string;
    block: string;
    storeName: string;
    date: Date;
    dateStr: string;
    value: number;
}

const DataView: React.FC<DataViewProps> = ({ setAllStores, setGlobalMaxDate, forecastMonths, setForecastMonths, dataType, setDataType, onComplete }) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [stats, setStats] = useState<{ rows: number; stores: number } | null>(null);
    const [encoding, setEncoding] = useState<string>('UTF-8');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [previewLines, setPreviewLines] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (selectedFile: File) => {
        setFile(selectedFile);
        setFileName(selectedFile.name);
        
        // Quick preview (read first few bytes)
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split(/\r?\n/).slice(0, 5);
            setPreviewLines(lines);
        };
        reader.readAsText(selectedFile.slice(0, 5000), encoding);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const processData = async () => {
        if (!file) return;
        setIsProcessing(true);
        setProgress(5);

        // 1. Parse CSV using PapaParse
        Papa.parse(file, {
            encoding: encoding,
            skipEmptyLines: true,
            complete: async (results) => {
                setProgress(20);
                
                try {
                    const rawData: RawDataPoint[] = [];
                    let globalMaxDate = new Date(0);
                    
                    // 2. Normalize and Collect Data
                    results.data.forEach((row: any) => {
                        if (row.length < 3) return; // Min requirement check
                        
                        let region = "Unknown";
                        let prefecture = "Unknown";
                        let block = "Unknown";
                        let name = "";
                        let dateStr = "";
                        let valStr = "";

                        // Handle 6 columns (Region, Pref, Block, Name, Date, Value)
                        // Fallback to legacy formats if needed
                        if (row.length >= 6) {
                            region = String(row[0]).trim();
                            prefecture = String(row[1]).trim();
                            block = String(row[2]).trim();
                            name = String(row[3]).trim();
                            dateStr = String(row[4]).trim();
                            valStr = String(row[5]).trim();
                        } else if (row.length >= 4) {
                            // Legacy: Block, Name, Date, Value
                            block = String(row[0]).trim();
                            name = String(row[1]).trim();
                            dateStr = String(row[2]).trim();
                            valStr = String(row[3]).trim();
                        } else {
                            // Legacy: Name, Date, Value
                            name = String(row[0]).trim();
                            dateStr = String(row[1]).trim();
                            valStr = String(row[2]).trim();
                        }
                        
                        if (!name || !dateStr) return;

                        // Parse Date (Handle YYYY/MM, YYYY-MM, YYYY.MM, YYYYMM)
                        let cleanDateStr = dateStr.replace(/[./]/g, '-');
                        if (cleanDateStr.length === 6 && !cleanDateStr.includes('-')) {
                             // Handle 202301 format
                             cleanDateStr = `${cleanDateStr.substring(0, 4)}-${cleanDateStr.substring(4, 6)}`;
                        }
                        const dateObj = new Date(cleanDateStr);
                        // Normalize to 1st of month to avoid timezone shifts affecting month
                        dateObj.setDate(1);
                        
                        // Parse Value (Remove currency, commas, handle wide chars)
                        // Normalize full-width numbers if any
                        const cleanValStr = valStr
                            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                            .replace(/[¥,"]/g, '');
                        
                        const value = parseFloat(cleanValStr);

                        if (name && !isNaN(dateObj.getTime()) && !isNaN(value)) {
                            rawData.push({ region, prefecture, block, storeName: name, date: dateObj, dateStr: cleanDateStr, value });
                            if (dateObj > globalMaxDate) globalMaxDate = dateObj;
                        }
                    });

                    setGlobalMaxDate(globalMaxDate);
                    setProgress(40);

                    // 3. Group by Store & Sort Chronologically
                    const storeMap = new Map<string, RawDataPoint[]>();
                    rawData.forEach(p => {
                        if (!storeMap.has(p.storeName)) storeMap.set(p.storeName, []);
                        storeMap.get(p.storeName)?.push(p);
                    });

                    const stores: { [name: string]: StoreData } = {};
                    
                    // Classify Stores for Processing Order
                    const anchorNames: string[] = []; // >= 36 months (Mature)
                    const growthNames: string[] = []; // 12-35 months (Growth)
                    const startupNames: string[] = []; // < 12 months (Startup)
                    
                    const storeNames = Array.from(storeMap.keys());
                    const tempStoreData: Record<string, {raw: number[], dates: string[], block: string, region: string, prefecture: string}> = {};

                    // Pre-processing loop: Sort, Fill Gaps, Classify
                    storeNames.forEach(name => {
                        let points = storeMap.get(name) || [];
                        points.sort((a, b) => a.date.getTime() - b.date.getTime());
                        
                        // Capture metadata from the first data point
                        const block = points.length > 0 ? points[0].block : "Unknown";
                        const region = points.length > 0 ? points[0].region : "Unknown";
                        const prefecture = points.length > 0 ? points[0].prefecture : "Unknown";

                        const filledRaw: number[] = [];
                        const filledDates: string[] = [];
                        
                        if (points.length > 0) {
                            let currentDate = new Date(points[0].date); 
                            const lookup = new Map<string, number>();
                            points.forEach(p => {
                                const k = `${p.date.getFullYear()}-${p.date.getMonth()}`;
                                lookup.set(k, p.value);
                            });
                            const lastDate = points[points.length - 1].date;
                            
                            while (currentDate <= lastDate) {
                                const k = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                                const val = lookup.get(k);
                                filledRaw.push(val !== undefined ? val : 0);
                                
                                const y = currentDate.getFullYear();
                                const m = currentDate.getMonth() + 1;
                                filledDates.push(`${y}-${String(m).padStart(2, '0')}`);
                                currentDate.setMonth(currentDate.getMonth() + 1);
                            }
                        }

                        // Save prepared data
                        tempStoreData[name] = { raw: filledRaw, dates: filledDates, block, region, prefecture };

                        // Classify based on valid data length
                        const validLen = filledRaw.filter(v => v > 0).length;
                        if (validLen >= 36) anchorNames.push(name);
                        else if (validLen >= 12) growthNames.push(name);
                        else startupNames.push(name);
                    });

                    // --- STEP 4: Analyze ANCHOR Stores (Mature) ---
                    const matureStores: StoreData[] = [];
                    for (let i = 0; i < anchorNames.length; i++) {
                        const n = anchorNames[i];
                        const d = tempStoreData[n];
                        try {
                            // First pass without global stats (they ARE the stats)
                            const res = analyzeStore(n, d.raw, d.dates, globalMaxDate, undefined, d.block, d.region, d.prefecture);
                            stores[n] = res;
                            if (!res.error && res.isActive) matureStores.push(res);
                        } catch (e) { console.error(e); }
                        
                        if (i % 20 === 0) {
                            setProgress(40 + Math.round((i / anchorNames.length) * 20));
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    // --- STEP 5: Calculate Global Stats ---
                    let globalK = 0.1;
                    const globalSeasonality: number[][] = Array.from({length:12}, () => []);

                    if (matureStores.length > 0) {
                        const ks = matureStores.map(s => s.params.k).sort((a,b) => a-b);
                        const idx50 = Math.floor(ks.length * 0.5); // Median
                        globalK = ks[idx50];
                        
                        matureStores.forEach(s => {
                           s.seasonal.forEach((val, monthIdx) => {
                               globalSeasonality[monthIdx].push(val);
                           });
                        });
                    }

                    let finalGlobalSeasonality = globalSeasonality.map(arr => {
                        if (arr.length === 0) return 1.0;
                        arr.sort((a,b) => a-b);
                        const idx50 = Math.floor(arr.length * 0.5); // Median
                        return arr[idx50];
                    });
                    
                    const seaSum = finalGlobalSeasonality.reduce((a, b) => a + b, 0);
                    if (seaSum > 0) finalGlobalSeasonality = finalGlobalSeasonality.map(v => (v / seaSum) * 12);
                    
                    const globalStats: GlobalStats = {
                        medianK: globalK > 0 ? globalK : 0.1,
                        medianSeasonality: finalGlobalSeasonality
                    };

                    // --- STEP 6: Analyze GROWTH Stores (12-35 mo) with Constraints ---
                    for (let i = 0; i < growthNames.length; i++) {
                        const n = growthNames[i];
                        const d = tempStoreData[n];
                        try {
                            // Pass global stats to enforce tight bounds on K
                            const res = analyzeStore(n, d.raw, d.dates, globalMaxDate, globalStats, d.block, d.region, d.prefecture);
                            stores[n] = res;
                        } catch (e) { console.error(e); }
                        
                        if (i % 10 === 0) {
                            setProgress(60 + Math.round((i / growthNames.length) * 20));
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    // --- STEP 7: Analyze STARTUP Stores (< 12 mo) with Fixed K ---
                    for (let i = 0; i < startupNames.length; i++) {
                        const n = startupNames[i];
                        const d = tempStoreData[n];
                        try {
                            // Pass global stats to fix K
                            const res = analyzeStore(n, d.raw, d.dates, globalMaxDate, globalStats, d.block, d.region, d.prefecture);
                            stores[n] = res;
                        } catch (e) { console.error(e); }
                        
                        if (i % 10 === 0) {
                            setProgress(80 + Math.round((i / startupNames.length) * 20));
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    // 8. Finalize
                    calculateGlobalABC(Object.values(stores));
                    setAllStores(stores);
                    setStats({ rows: results.data.length, stores: Object.keys(stores).length });
                    setProgress(100);
                    setTimeout(onComplete, 500);

                } catch (e) {
                    console.error(e);
                    alert("Error processing CSV: " + e);
                    setIsProcessing(false);
                }
            },
            error: (err) => {
                console.error(err);
                alert("CSV Parsing Error: " + err.message);
                setIsProcessing(false);
            }
        });
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn">
            <div className="max-w-4xl mx-auto space-y-6">
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter border-l-8 border-[#005EB8] pl-4 font-display">1. データ読込 (Enhanced Engine)</h2>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <div 
                        className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer ${dragActive ? 'border-[#005EB8] bg-blue-50' : 'border-gray-300 bg-gray-50'} ${file ? 'border-green-500 bg-green-50' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                        <div className="flex justify-center mb-4">
                            {file ? (
                                <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ) : (
                                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                            )}
                        </div>
                        <p className="text-xl font-bold text-gray-600 mb-2 font-display">
                            {file ? `準備完了: ${fileName}` : 'CSVファイルをここにドロップ、またはクリック'}
                        </p>
                        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold font-display">
                            {file ? (
                                <span className="text-green-600">自動ソート・欠損月補完機能が有効です</span>
                            ) : (
                                '必須カラム(6列): 地方, 都道府県, Block, 店舗名, 年月, 実績'
                            )}
                        </p>
                        
                        {/* Data Type Selector */}
                        <div className="mt-8 flex justify-center gap-4" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white border border-gray-200 rounded-lg p-1 flex shadow-sm">
                                <button
                                    onClick={() => setDataType('sales')}
                                    className={`px-4 py-2 rounded-md text-xs font-black transition-all ${dataType === 'sales' ? 'bg-[#005EB8] text-white shadow' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                    売上データ (円)
                                </button>
                                <button
                                    onClick={() => setDataType('customers')}
                                    className={`px-4 py-2 rounded-md text-xs font-black transition-all ${dataType === 'customers' ? 'bg-[#005EB8] text-white shadow' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                    来店客数データ (人)
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex justify-center gap-8 text-xs text-gray-500 font-bold uppercase" onClick={(e) => e.stopPropagation()}>
                            <label className="flex items-center gap-2 cursor-pointer hover:text-[#005EB8]">
                                <input type="radio" name="encoding" value="UTF-8" checked={encoding === 'UTF-8'} onChange={() => setEncoding('UTF-8')} className="accent-[#005EB8]" /> UTF-8
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:text-[#005EB8]">
                                <input type="radio" name="encoding" value="Shift_JIS" checked={encoding === 'Shift_JIS'} onChange={() => setEncoding('Shift_JIS')} className="accent-[#005EB8]" /> Shift-JIS (Excel版)
                            </label>
                        </div>
                    </div>

                    {previewLines.length > 0 && (
                        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase font-display">File Head (First 5 lines)</p>
                                <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-1 rounded">Raw Preview</span>
                            </div>
                            <div className="text-[11px] font-mono text-gray-600 space-y-1 overflow-x-auto whitespace-nowrap">
                                {previewLines.map((l, i) => <div key={i} className="border-b border-gray-100 pb-1 last:border-0">{l}</div>)}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-6 font-display">2. 分析実行エンジン (v11.1)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase block mb-4 font-display">将来予測期間 (月数)</label>
                            <div className="flex items-center gap-6">
                                <input 
                                    type="range" min="6" max="36" value={forecastMonths} 
                                    onChange={(e) => setForecastMonths(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]"
                                />
                                <span className="text-lg font-black text-[#005EB8] w-20 text-right font-display">{forecastMonths}ヶ月</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                                ※ ロジスティック回帰モデル(Base + Growth)に基づき予測を行います。<br/>
                                <span className="text-green-600 font-bold">New:</span> 3年未満の店舗は全社平均成長率を参照して補正します。
                            </p>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                            <button 
                                onClick={processData}
                                disabled={!file || isProcessing}
                                className="bg-[#005EB8] text-white font-bold py-4 px-12 rounded-xl shadow-xl uppercase tracking-widest text-base hover:bg-[#004a94] disabled:bg-slate-400 disabled:cursor-not-allowed transition-all transform active:scale-95 font-display flex items-center gap-3"
                            >
                                {isProcessing ? (
                                    <><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 解析実行中...</>
                                ) : (
                                    '分析を開始する'
                                )}
                            </button>
                            {isProcessing && (
                                <div className="w-full mt-4">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                        <div className="bg-[#005EB8] h-2.5 rounded-full transition-all duration-300 relative" style={{ width: `${progress}%` }}>
                                            <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/20 animate-pulse"></div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2 font-black uppercase italic text-right">
                                        {progress < 20 ? 'Parsing...' : 
                                         progress < 40 ? 'Preprocessing...' : 
                                         progress < 60 ? 'Anchoring (Mature Stores)...' : 
                                         progress < 80 ? 'Refining (Growth Stores)...' : 
                                         'Finalizing (Startups)...'} {progress}%
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataView;
