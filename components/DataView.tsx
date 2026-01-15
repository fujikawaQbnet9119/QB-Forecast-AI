
import React, { useState, useRef, useCallback } from 'react';
import { analyzeStore, GlobalStats, calculateGlobalABC } from '../services/analysisEngine';
import { StoreData } from '../types';
import Papa from 'papaparse';

interface DataViewProps {
    setAllStores: (stores: { [name: string]: StoreData }) => void;
    setGlobalMaxDate: (date: Date) => void;
    forecastMonths: number;
    setForecastMonths: (months: number) => void;
    onComplete: () => void;
}

interface RawDataPoint {
    storeName: string;
    date: Date;
    dateStr: string;
    value: number;
}

const DataView: React.FC<DataViewProps> = ({ setAllStores, setGlobalMaxDate, forecastMonths, setForecastMonths, onComplete }) => {
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
                        // Ensure row has at least 3 columns
                        if (row.length < 3) return;
                        
                        // Flexible column mapping: Assume Name=0, Date=1, Value=2
                        const name = String(row[0]).trim();
                        const dateStr = String(row[1]).trim();
                        const valStr = String(row[2]).trim();
                        
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
                            rawData.push({ storeName: name, date: dateObj, dateStr: cleanDateStr, value });
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
                    const matureStores: StoreData[] = [];
                    const startupNames: string[] = [];
                    
                    const storeNames = Array.from(storeMap.keys());
                    const totalStores = storeNames.length;

                    // Processing loop
                    for (let i = 0; i < totalStores; i++) {
                        const name = storeNames[i];
                        let points = storeMap.get(name) || [];
                        
                        // Critical: SORT by Date
                        points.sort((a, b) => a.date.getTime() - b.date.getTime());

                        // Critical: Fill Time Gaps (Ensure strictly 1 month interval)
                        // If gap > 1 month, insert 0s.
                        const filledRaw: number[] = [];
                        const filledDates: string[] = [];
                        
                        if (points.length > 0) {
                            let currentDate = new Date(points[0].date); // Start from first data point
                            
                            // Map existing data for quick lookup
                            const lookup = new Map<string, number>();
                            points.forEach(p => {
                                const k = `${p.date.getFullYear()}-${p.date.getMonth()}`;
                                lookup.set(k, p.value);
                            });

                            const lastDate = points[points.length - 1].date;
                            
                            // Iterate month by month
                            while (currentDate <= lastDate) {
                                const k = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                                const val = lookup.get(k);
                                
                                if (val !== undefined) {
                                    filledRaw.push(val);
                                } else {
                                    // Missing month -> Fill 0
                                    filledRaw.push(0);
                                }
                                
                                // Format date string for display (YYYY-MM)
                                const y = currentDate.getFullYear();
                                const m = currentDate.getMonth() + 1;
                                filledDates.push(`${y}-${String(m).padStart(2, '0')}`);

                                // Next month
                                currentDate.setMonth(currentDate.getMonth() + 1);
                            }
                        }

                        // Determine if we should analyze now or later (for startups)
                        // Filter 0s for count check (assuming 0 is "no sales" or "closed")
                        const validLen = filledRaw.filter(v => v > 0).length;

                        if (validLen >= 12) {
                            try {
                                const res = analyzeStore(name, filledRaw, filledDates, globalMaxDate);
                                stores[name] = res;
                                if (!res.error && res.isActive) matureStores.push(res);
                            } catch (e) { console.error(e); }
                        } else {
                            // Store potentially sparse/short data for startup analysis
                            // We pass filled data to preserve time axis
                            stores[name] = { 
                                name, raw: filledRaw, dates: filledDates, mask: filledRaw.map(v=>v>0), isActive: false, 
                                nudge:0, nudgeDecay:0, seasonal:[], components:{t:[],s:[],r:[]}, 
                                params:{L:0,k:0,t0:0}, fit:{params:[],mode:'startup',shockIdx:0,aic:0}, 
                                stdDev:0, cv:{logistic:0}, error: true, msg: "Pending Global Stats" 
                            };
                            startupNames.push(name);
                        }

                        // Progress 40% -> 70%
                        if (i % 20 === 0) {
                            setProgress(40 + Math.round((i / totalStores) * 30));
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    // 4. Calculate Global Stats
                    let globalK = 0.1;
                    const globalSeasonality: number[][] = Array.from({length:12}, () => []);

                    if (matureStores.length > 0) {
                        const ks = matureStores.map(s => s.params.k).sort((a,b) => a-b);
                        const idx75 = Math.min(ks.length - 1, Math.floor(ks.length * 0.75));
                        globalK = ks[idx75];
                        
                        matureStores.forEach(s => {
                           s.seasonal.forEach((val, monthIdx) => {
                               globalSeasonality[monthIdx].push(val);
                           });
                        });
                    }

                    let finalGlobalSeasonality = globalSeasonality.map(arr => {
                        if (arr.length === 0) return 1.0;
                        arr.sort((a,b) => a-b);
                        const idx75 = Math.min(arr.length - 1, Math.floor(arr.length * 0.75));
                        return arr[idx75];
                    });
                    
                    const seaSum = finalGlobalSeasonality.reduce((a, b) => a + b, 0);
                    if (seaSum > 0) finalGlobalSeasonality = finalGlobalSeasonality.map(v => (v / seaSum) * 12);
                    
                    const globalStats: GlobalStats = {
                        medianK: globalK > 0 ? globalK : 0.1,
                        medianSeasonality: finalGlobalSeasonality
                    };

                    // 5. Analyze Startups
                    for (let i = 0; i < startupNames.length; i++) {
                        const n = startupNames[i];
                        const placeholder = stores[n];
                        try {
                            const res = analyzeStore(n, placeholder.raw, placeholder.dates, globalMaxDate, globalStats);
                            stores[n] = res;
                        } catch (e) { console.error(e); }
                        
                        if (i % 10 === 0) {
                            setProgress(70 + Math.round((i / startupNames.length) * 30));
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }

                    // 6. Finalize
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
                                '必須カラム: 店舗名, 年月(YYYY/MM), 売上実績'
                            )}
                        </p>
                        <div className="mt-8 flex justify-center gap-8 text-xs text-gray-500 font-bold uppercase" onClick={(e) => e.stopPropagation()}>
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
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-6 font-display">2. 分析実行エンジン (v10.9)</h3>
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
                                ※ ロジスティック回帰モデル(上限5.0倍/初期値1.5倍)に基づき、<br/>
                                店舗ごとの成長ポテンシャルと季節性を考慮した予測を行います。
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
                                    <p className="text-[10px] text-gray-400 mt-2 font-black uppercase italic text-right">Step {progress < 20 ? '1: Parsing' : progress < 40 ? '2: Normalizing' : progress < 70 ? '3: Modeling' : '4: Finalizing'}... {progress}%</p>
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
