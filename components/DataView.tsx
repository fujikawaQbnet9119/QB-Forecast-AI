
import React, { useState, useRef, useCallback } from 'react';
import { analyzeStore, GlobalStats, calculateGlobalABC } from '../services/analysisEngine';
import { StoreData } from '../types';

interface DataViewProps {
    setAllStores: (stores: { [name: string]: StoreData }) => void;
    setGlobalMaxDate: (date: Date) => void;
    forecastMonths: number;
    setForecastMonths: (months: number) => void;
    onComplete: () => void;
}

const DataView: React.FC<DataViewProps> = ({ setAllStores, setGlobalMaxDate, forecastMonths, setForecastMonths, onComplete }) => {
    const [dragActive, setDragActive] = useState(false);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [lineCount, setLineCount] = useState<number>(0);
    const [encoding, setEncoding] = useState<string>('UTF-8');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [previewLines, setPreviewLines] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setFileContent(text);
            setFileName(file.name);
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            setLineCount(lines.length);
            setPreviewLines(lines.slice(0, 5));
        };
        reader.readAsText(file, encoding);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const parseCSVLine = (text: string) => {
        const res = [];
        let cur = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') {
                if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if ((c === ',' || c === '\t') && !inQ) {
                res.push(cur.trim()); cur = '';
            } else cur += c;
        }
        res.push(cur.trim());
        return res;
    };

    const processData = async () => {
        if (!fileContent) return;
        setIsProcessing(true);
        setProgress(0);

        // Small delay to allow UI to update
        await new Promise(r => setTimeout(r, 100));

        try {
            const lines = fileContent.split(/\r?\n/).filter(l => l.trim());
            // BOM removal if UTF-8
            if (fileContent.charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1);

            const temp: { [name: string]: { r: number[], d: string[] } } = {};
            let maxD = new Date(0);

            // First pass: Date parsing and grouping
            lines.forEach(l => {
                const p = parseCSVLine(l);
                if (p.length < 3) return;
                const d = new Date(p[1].replace(/\//g, '-'));
                if (!isNaN(d.getTime()) && d > maxD) maxD = d;
            });
            setGlobalMaxDate(maxD);

            lines.forEach(l => {
                const p = parseCSVLine(l);
                if (p.length < 3) return;
                let v = parseFloat(p[2].replace(/[¥,"]/g, ''));
                if (!isNaN(v)) {
                    if (!temp[p[0]]) temp[p[0]] = { r: [], d: [] };
                    temp[p[0]].r.push(v);
                    temp[p[0]].d.push(p[1]);
                }
            });

            const names = Object.keys(temp);
            const stores: { [name: string]: StoreData } = {};

            // Phase 1: Analyze Mature Stores (N >= 12)
            const matureStores: StoreData[] = [];
            const startupNames: string[] = [];

            for (let i = 0; i < names.length; i += 50) {
                const chunk = names.slice(i, i + 50);
                chunk.forEach(n => {
                    const len = temp[n].r.filter(v => v > 0).length;
                    if (len >= 12) {
                        try {
                            const res = analyzeStore(n, temp[n].r, temp[n].d, maxD);
                            stores[n] = res;
                            if (!res.error && res.isActive) matureStores.push(res);
                        } catch (e) {
                             console.error(e);
                        }
                    } else {
                        startupNames.push(n);
                    }
                });
                setProgress(Math.round(((i + chunk.length) / names.length) * 50)); // First 50%
                await new Promise(r => setTimeout(r, 10));
            }

            // Phase 2: Calculate Global Stats
            let globalK = 0.1;
            const globalSeasonality: number[][] = Array.from({length:12}, () => []);

            if (matureStores.length > 0) {
                // Median K
                const ks = matureStores.map(s => s.params.k).sort((a,b) => a-b);
                globalK = ks[Math.floor(ks.length / 2)];
                
                // Median Seasonality
                matureStores.forEach(s => {
                   s.seasonal.forEach((val, monthIdx) => {
                       globalSeasonality[monthIdx].push(val);
                   });
                });
            }

            const finalGlobalSeasonality = globalSeasonality.map(arr => {
                if (arr.length === 0) return 1.0;
                arr.sort((a,b) => a-b);
                return arr[Math.floor(arr.length/2)];
            });
            
            const globalStats: GlobalStats = {
                medianK: globalK > 0 ? globalK : 0.1,
                medianSeasonality: finalGlobalSeasonality
            };

            // Phase 3: Analyze Startup Stores using Global Stats
            for (let i = 0; i < startupNames.length; i++) {
                const n = startupNames[i];
                try {
                    const res = analyzeStore(n, temp[n].r, temp[n].d, maxD, globalStats);
                    stores[n] = res;
                } catch (e) {
                    console.error(e);
                }
                // Progress from 50% to 100%
                if (i % 10 === 0) {
                    setProgress(50 + Math.round(((i + 1) / startupNames.length) * 50));
                    await new Promise(r => setTimeout(r, 5));
                }
            }

            // Phase 4: Global Aggregations (ABC Analysis)
            calculateGlobalABC(Object.values(stores));

            setAllStores(stores);
            onComplete();
        } catch (e) {
            alert("Error processing data: " + e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn">
            <div className="max-w-4xl mx-auto space-y-6">
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter border-l-8 border-[#005EB8] pl-4 font-display">1. データ読込</h2>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <div 
                        className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer ${dragActive ? 'border-[#005EB8] bg-blue-50' : 'border-gray-300 bg-gray-50'} ${fileContent ? 'border-green-500 bg-green-50' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                        <div className="flex justify-center mb-4">
                            {fileContent ? (
                                <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ) : (
                                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                            )}
                        </div>
                        <p className="text-xl font-bold text-gray-600 mb-2 font-display">
                            {fileContent ? `読込成功: ${fileName}` : 'CSVファイルをここにドロップ、またはクリック'}
                        </p>
                        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold font-display">
                            {fileContent ? `${lineCount} 行のデータを検出しました` : '店舗名, 年月 (YYYY/MM), 客数実績'}
                        </p>
                        <div className="mt-8 flex justify-center gap-8 text-xs text-gray-500 font-bold uppercase" onClick={(e) => e.stopPropagation()}>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="encoding" value="UTF-8" checked={encoding === 'UTF-8'} onChange={() => setEncoding('UTF-8')} /> UTF-8
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="encoding" value="Shift_JIS" checked={encoding === 'Shift_JIS'} onChange={() => setEncoding('Shift_JIS')} /> Shift-JIS (Excel版)
                            </label>
                        </div>
                    </div>

                    {fileContent && (
                        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <p className="text-[10px] font-black text-gray-400 uppercase mb-2 font-display">データプレビュー (最初の5行)</p>
                            <div className="text-[11px] font-mono text-gray-600 space-y-1">
                                {previewLines.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-6 font-display">2. 分析実行エンジン</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase block mb-4 font-display">将来予測期間 (月数)</label>
                            <div className="flex items-center gap-6">
                                <input 
                                    type="range" min="6" max="60" value={forecastMonths} 
                                    onChange={(e) => setForecastMonths(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]"
                                />
                                <span className="text-lg font-black text-[#005EB8] w-20 text-right font-display">{forecastMonths}ヶ月</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                            <button 
                                onClick={processData}
                                disabled={!fileContent || isProcessing}
                                className="bg-[#005EB8] text-white font-bold py-4 px-12 rounded-xl shadow-xl uppercase tracking-widest text-base hover:bg-[#004a94] disabled:bg-slate-400 disabled:cursor-not-allowed transition-all transform active:scale-95 font-display"
                            >
                                {isProcessing ? '処理中...' : '分析を開始する'}
                            </button>
                            {isProcessing && (
                                <div className="w-full mt-4">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div className="bg-[#005EB8] h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2 font-black uppercase italic text-right">処理中... {progress}%</p>
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
