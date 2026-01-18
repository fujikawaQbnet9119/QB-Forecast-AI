
import React, { useState, useRef, useCallback } from 'react';
import { analyzeStore, GlobalStats, calculateGlobalABC } from '../services/analysisEngine';
import { StoreData } from '../types';
import * as Papa from 'papaparse';

// --- CONFIGURATION: CLOUD DATA LINKS (OBFUSCATED) ---
const SALES_ID_PARTS = [
    "2PACX-1vShm1Kk78a1TZZESLGgEiwxFr6sAsBMqtAt0G2SOSH4r94SG3QfUAU3yMY79986VBttLIq3e0FH",
    "_Un9"
];
const CUSTOMERS_ID_PARTS = [
    "2PACX-1vT94gSJrPzi8YWt7-p6ftcguBn4YlX4OsbMX-pTI2CzRfoCJ4L-s7pAsLccacrYS5MXHe54aP070qW0"
];
const BUDGET_ID_PARTS = [
    "2PACX-1vQZXwNIXNKoD6F5guKM7wb9WhmD2WVvi3aYf4WNZiBTYTi4BtCDPfPjZymjOdX1ZQ6UOyW2",
    "k6RRJrm8"
];

const CLOUD_PASSWORD = "QB9119";

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

// Helper: Calculate Percentile
const calculatePercentile = (data: number[], percentile: number) => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const DataView: React.FC<DataViewProps> = ({ setAllStores, setGlobalMaxDate, forecastMonths, setForecastMonths, dataType, setDataType, onComplete }) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>("");
    
    // Budget File State
    const [budgetFile, setBudgetFile] = useState<File | null>(null);
    const [budgetFileName, setBudgetFileName] = useState<string>("");

    const [stats, setStats] = useState<{ rows: number; stores: number } | null>(null);
    const [encoding, setEncoding] = useState<string>('UTF-8');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [previewLines, setPreviewLines] = useState<string[]>([]);
    
    // Cloud Load State
    const [showCloudModal, setShowCloudModal] = useState(false);
    const [cloudPassword, setCloudPassword] = useState("");
    const [isCloudUnlocked, setIsCloudUnlocked] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const budgetInputRef = useRef<HTMLInputElement>(null);

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

    const handleBudgetFileSelect = (selectedFile: File) => {
        setBudgetFile(selectedFile);
        setBudgetFileName(selectedFile.name);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleCloudUnlock = () => {
        if (cloudPassword === CLOUD_PASSWORD) {
            setIsCloudUnlocked(true);
        } else {
            alert("パスワードが正しくありません。");
        }
    };

    const handleCloudFetch = async (type: 'sales' | 'customers') => {
        const id = type === 'sales' ? SALES_ID_PARTS.join('') : CUSTOMERS_ID_PARTS.join('');
        const url = `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=0&single=true&output=csv`;
        
        const budgetId = BUDGET_ID_PARTS.join('');
        const budgetUrl = `https://docs.google.com/spreadsheets/d/e/${budgetId}/pub?gid=0&single=true&output=csv`;

        setIsProcessing(true);
        setProgress(1);

        try {
            // 1. Fetch Main Data
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const csvText = await response.text();
            
            const blob = new Blob([csvText], { type: 'text/csv' });
            const dummyFile = new File([blob], type === 'sales' ? "Cloud_Sales_Data.csv" : "Cloud_Customers_Data.csv", { type: "text/csv" });
            
            setFile(dummyFile);
            setFileName(dummyFile.name);
            setDataType(type);
            setEncoding('UTF-8');

            // 2. Fetch Budget Data Automatically
            let dummyBudgetFile: File | undefined = undefined;
            try {
                const budgetRes = await fetch(budgetUrl);
                if (budgetRes.ok) {
                    const budgetCsv = await budgetRes.text();
                    const budgetBlob = new Blob([budgetCsv], { type: 'text/csv' });
                    dummyBudgetFile = new File([budgetBlob], "Cloud_Budget_Auto.csv", { type: "text/csv" });
                    
                    setBudgetFile(dummyBudgetFile);
                    setBudgetFileName("Cloud_Budget_Auto.csv (Auto-fetched)");
                } else {
                    console.warn("Budget fetch failed status:", budgetRes.status);
                }
            } catch (err) {
                console.warn("Failed to auto-fetch budget data", err);
            }

            setShowCloudModal(false);

            await processDataFile(dummyFile, dummyBudgetFile, type);

        } catch (e) {
            console.error(e);
            alert("データの取得に失敗しました。\n" + e);
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const processData = async () => {
        if (!file) return;
        await processDataFile(file, undefined, dataType);
    };

    const processDataFile = async (targetFile: File, overrideBudgetFile?: File, explicitType?: 'sales' | 'customers') => {
        const currentType = explicitType || dataType;
        setIsProcessing(true);
        setProgress(5);

        // 1. Parse Main CSV
        Papa.parse(targetFile, {
            encoding: encoding,
            skipEmptyLines: true,
            complete: async (results) => {
                setProgress(20);
                
                try {
                    const rawData: RawDataPoint[] = [];
                    let globalMaxDate = new Date(0);
                    
                    results.data.forEach((row: any) => {
                        if (row.length < 3) return;
                        
                        let region = "Unknown";
                        let prefecture = "Unknown";
                        let block = "Unknown";
                        let name = "";
                        let dateStr = "";
                        let valStr = "";

                        if (row.length >= 6) {
                            region = String(row[0]).trim();
                            prefecture = String(row[1]).trim();
                            block = String(row[2]).trim();
                            name = String(row[3]).trim();
                            dateStr = String(row[4]).trim();
                            valStr = String(row[5]).trim();
                        } else if (row.length >= 4) {
                            block = String(row[0]).trim();
                            name = String(row[1]).trim();
                            dateStr = String(row[2]).trim();
                            valStr = String(row[3]).trim();
                        } else {
                            name = String(row[0]).trim();
                            dateStr = String(row[1]).trim();
                            valStr = String(row[2]).trim();
                        }
                        
                        if (!name || !dateStr) return;

                        let cleanDateStr = dateStr.replace(/[./]/g, '-');
                        if (cleanDateStr.length === 6 && !cleanDateStr.includes('-')) {
                             cleanDateStr = `${cleanDateStr.substring(0, 4)}-${cleanDateStr.substring(4, 6)}`;
                        }
                        const dateObj = new Date(cleanDateStr);
                        dateObj.setDate(1);
                        
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

                    // Group by Store
                    const storeMap = new Map<string, RawDataPoint[]>();
                    rawData.forEach(p => {
                        if (!storeMap.has(p.storeName)) storeMap.set(p.storeName, []);
                        storeMap.get(p.storeName)?.push(p);
                    });

                    const stores: { [name: string]: StoreData } = {};
                    const anchorNames: string[] = [];
                    const growthNames: string[] = [];
                    const startupNames: string[] = [];
                    const tempStoreData: Record<string, {raw: number[], dates: string[], block: string, region: string, prefecture: string}> = {};

                    storeMap.forEach((points, name) => {
                        points.sort((a, b) => a.date.getTime() - b.date.getTime());
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

                        tempStoreData[name] = { raw: filledRaw, dates: filledDates, block, region, prefecture };
                        const validLen = filledRaw.filter(v => v > 0).length;
                        if (validLen >= 36) anchorNames.push(name);
                        else if (validLen >= 13) growthNames.push(name);
                        else startupNames.push(name);
                    });

                    // --- PROCESS STORES ---
                    const matureStores: StoreData[] = [];
                    
                    const processStoreBatch = async (names: string[], mode: 'anchor'|'growth'|'startup', stats?: GlobalStats) => {
                        for (let i = 0; i < names.length; i++) {
                            const n = names[i];
                            const d = tempStoreData[n];
                            try {
                                const res = analyzeStore(n, d.raw, d.dates, globalMaxDate, stats, d.block, d.region, d.prefecture);
                                stores[n] = res;
                                if(mode === 'anchor' && !res.error && res.isActive && res.fit.mode !== 'startup') matureStores.push(res);
                            } catch (e) { console.error(e); }
                        }
                    };

                    await processStoreBatch(anchorNames, 'anchor');
                    
                    // Calc Global Stats
                    let k65 = 0.1;
                    let standardGrowthL = 3000;
                    const globalSeasonality: number[][] = Array.from({length:12}, () => []);
                    if (matureStores.length > 0) {
                        const ks = matureStores.map(s => s.params.k);
                        k65 = calculatePercentile(ks, 65);
                        const Ls = matureStores.map(s => s.params.L);
                        standardGrowthL = calculatePercentile(Ls, 50);
                        matureStores.forEach(s => {
                           s.seasonal.forEach((val, monthIdx) => globalSeasonality[monthIdx].push(val));
                        });
                    }
                    let finalGlobalSeasonality = globalSeasonality.map(arr => {
                        if (arr.length === 0) return 1.0;
                        arr.sort((a,b) => a-b);
                        return arr[Math.floor(arr.length * 0.5)];
                    });
                    const seaSum = finalGlobalSeasonality.reduce((a, b) => a + b, 0);
                    if (seaSum > 0) finalGlobalSeasonality = finalGlobalSeasonality.map(v => (v / seaSum) * 12);
                    
                    const globalStats: GlobalStats = {
                        medianK: k65 > 0 ? k65 : 0.1,
                        standardGrowthL: standardGrowthL > 0 ? standardGrowthL : 3000,
                        medianSeasonality: finalGlobalSeasonality
                    };

                    await processStoreBatch(growthNames, 'growth', globalStats);
                    await processStoreBatch(startupNames, 'startup', globalStats);

                    setProgress(90);

                    // --- NEW: Budget Data Parsing & Merging (ROBUST & OBFUSCATED URL) ---
                    const targetBudgetFile = overrideBudgetFile || budgetFile;
                    if (targetBudgetFile) {
                        await new Promise<void>((resolve) => {
                            Papa.parse(targetBudgetFile, {
                                header: true,
                                skipEmptyLines: true,
                                transformHeader: (h) => h.trim(), 
                                complete: (budgetResults) => {
                                    try {
                                        const bRows = budgetResults.data as any[];
                                        if (bRows.length > 0) {
                                            const headers = Object.keys(bRows[0]);
                                            
                                            // Enhanced regex to capture dates like "2024/10", "2024-10", "2024年10月", "2024 10"
                                            // \s* allows spaces around separators
                                            const dateColRegex = /^(\d{4})\s*[-/.\u5e74]\s*(\d{1,2})([-/\u6708](\d{1,2})?)?/;
                                            
                                            const dateCols = headers.filter(h => h.match(dateColRegex));
                                            
                                            bRows.forEach(row => {
                                                let sName = row["店舗名"] || row["Store Name"] || row["StoreName"];
                                                if (sName) {
                                                    sName = sName.trim();
                                                    // Try exact match first
                                                    let matchedStore = stores[sName];
                                                    
                                                    // If no exact match, try fuzzy (ignore internal spaces)
                                                    if (!matchedStore) {
                                                        const normalizedSearch = sName.replace(/\s+/g, '');
                                                        const foundKey = Object.keys(stores).find(k => k.replace(/\s+/g, '') === normalizedSearch);
                                                        if (foundKey) matchedStore = stores[foundKey];
                                                    }

                                                    if (matchedStore) {
                                                        const budgetMap: { [key: string]: number } = {};
                                                        dateCols.forEach(d => {
                                                            const rawVal = row[d];
                                                            // Handle thousands separator if present (e.g. "1,200")
                                                            const valStr = typeof rawVal === 'string' ? rawVal.replace(/,/g, '') : String(rawVal);
                                                            let val = parseFloat(valStr);
                                                            
                                                            // Check if val is a valid number (0 is valid, NaN is not)
                                                            if (!isNaN(val)) {
                                                                // Apply conversion if Sales mode (restored as requested)
                                                                if (currentType === 'sales') {
                                                                    val = val * 1.389;
                                                                }

                                                                // Normalize date key to YYYY-MM using the robust regex
                                                                const match = d.match(dateColRegex);
                                                                if (match && match.length >= 3) {
                                                                    const y = match[1];
                                                                    const m = match[2].padStart(2, '0');
                                                                    const normalizedKey = `${y}-${m}`;
                                                                    budgetMap[normalizedKey] = val;
                                                                }
                                                            }
                                                        });
                                                        // Merge instead of overwrite if multiple rows (unlikely but safe)
                                                        matchedStore.budget = { ...(matchedStore.budget || {}), ...budgetMap };
                                                    }
                                                }
                                            });
                                        }
                                    } catch (err) {
                                        console.warn("Budget data processing warning:", err);
                                    }
                                    resolve();
                                },
                                error: (err) => {
                                    console.warn("Budget CSV parse error:", err);
                                    resolve(); // Resolve to prevent hanging
                                }
                            });
                        });
                    }

                    // Finalize
                    calculateGlobalABC(Object.values(stores));
                    setAllStores(stores);
                    setStats({ rows: results.data.length, stores: Object.keys(stores).length });
                    setProgress(100);
                    setTimeout(onComplete, 500);

                } catch (e) {
                    console.error(e);
                    alert("Error processing: " + e);
                    setIsProcessing(false);
                }
            },
            error: (err) => {
                alert("CSV Parsing Error: " + err.message);
                setIsProcessing(false);
            }
        });
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter border-l-8 border-[#005EB8] pl-4 font-display">1. データ統合ロード (Integrated Data Load)</h2>
                    <button 
                        onClick={() => setShowCloudModal(true)}
                        className="opacity-10 hover:opacity-100 transition-opacity p-2 text-gray-400 hover:text-[#005EB8]"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    </button>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-8">
                    
                    {/* Main Data Input */}
                    <div>
                        <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#005EB8] text-white flex items-center justify-center text-xs">1</span>
                            実績データ (必須)
                        </h3>
                        <div 
                            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${dragActive ? 'border-[#005EB8] bg-blue-50' : 'border-gray-300 bg-gray-50'} ${file ? 'border-green-500 bg-green-50' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                            <div className="flex justify-center mb-2">
                                {file ? (
                                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                ) : (
                                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                )}
                            </div>
                            <p className="text-sm font-bold text-gray-600 mb-1 font-display">
                                {file ? file.name : '実績CSV (売上 or 客数) をアップロード'}
                            </p>
                        </div>
                    </div>

                    {/* Budget Data Input */}
                    <div>
                        <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-orange-400 text-white flex items-center justify-center text-xs">2</span>
                            今期予算データ (任意: 客数ベース)
                        </h3>
                        <div 
                            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${budgetFile ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                            onClick={() => budgetInputRef.current?.click()}
                        >
                            <input type="file" ref={budgetInputRef} className="hidden" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && handleBudgetFileSelect(e.target.files[0])} />
                            <div className="flex items-center justify-center gap-3">
                                {budgetFile ? (
                                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                ) : (
                                    <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                )}
                                <p className="text-xs font-bold text-gray-500">
                                    {budgetFile ? `予算データ: ${budgetFileName}` : '予算CSVを選択 (カラム: 店舗名, 2024-07, 2024-08...)'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-gray-100 pt-6">
                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="bg-white border border-gray-200 rounded-lg p-1 flex shadow-sm">
                                    <button
                                        onClick={() => setDataType('sales')}
                                        className={`px-4 py-2 rounded-md text-xs font-black transition-all ${dataType === 'sales' ? 'bg-[#005EB8] text-white shadow' : 'text-gray-400 hover:bg-gray-50'}`}
                                    >
                                        売上 (円)
                                    </button>
                                    <button
                                        onClick={() => setDataType('customers')}
                                        className={`px-4 py-2 rounded-md text-xs font-black transition-all ${dataType === 'customers' ? 'bg-[#005EB8] text-white shadow' : 'text-gray-400 hover:bg-gray-50'}`}
                                    >
                                        客数 (人)
                                    </button>
                                </div>
                                <div className="flex gap-4 text-xs text-gray-500 font-bold uppercase">
                                    <label className="flex items-center gap-2 cursor-pointer hover:text-[#005EB8]">
                                        <input type="radio" name="encoding" value="UTF-8" checked={encoding === 'UTF-8'} onChange={() => setEncoding('UTF-8')} className="accent-[#005EB8]" /> UTF-8
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer hover:text-[#005EB8]">
                                        <input type="radio" name="encoding" value="Shift_JIS" checked={encoding === 'Shift_JIS'} onChange={() => setEncoding('Shift_JIS')} className="accent-[#005EB8]" /> Shift-JIS
                                    </label>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2 font-display">予測期間 (月数)</label>
                                    <div className="flex items-center gap-4">
                                        <input type="range" min="6" max="36" value={forecastMonths} onChange={(e) => setForecastMonths(parseInt(e.target.value))} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]" />
                                        <span className="text-sm font-black text-[#005EB8] w-12 text-right">{forecastMonths}M</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-end justify-end">
                            <button 
                                onClick={processData}
                                disabled={!file || isProcessing}
                                className="w-full bg-[#005EB8] text-white font-bold py-4 rounded-xl shadow-xl uppercase tracking-widest text-sm hover:bg-[#004a94] disabled:bg-slate-300 disabled:cursor-not-allowed transition-all transform active:scale-95 font-display flex items-center justify-center gap-3"
                            >
                                {isProcessing ? (
                                    <><svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 処理実行中...</>
                                ) : (
                                    '分析を開始する'
                                )}
                            </button>
                            {isProcessing && (
                                <div className="w-full mt-4">
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div className="bg-[#005EB8] h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Cloud Modal */}
            {showCloudModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <button onClick={() => { setShowCloudModal(false); setCloudPassword(""); setIsCloudUnlocked(false); }} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-blue-100 text-[#005EB8] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-sm"><i className={`fas ${isCloudUnlocked ? 'fa-unlock' : 'fa-lock'}`}></i></div>
                            <h3 className="text-xl font-black text-gray-800 font-display">Secure Cloud Access</h3>
                        </div>
                        {!isCloudUnlocked ? (
                            <div className="space-y-4">
                                <input type="password" value={cloudPassword} onChange={(e) => setCloudPassword(e.target.value)} placeholder="Enter Password" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-center font-black text-lg focus:ring-2 focus:ring-[#005EB8] outline-none" onKeyDown={(e) => e.key === 'Enter' && handleCloudUnlock()} />
                                <button onClick={handleCloudUnlock} className="w-full py-3 bg-[#005EB8] text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-[#004a94] transition-all shadow-lg shadow-blue-100">Unlock</button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => handleCloudFetch('sales')} className="py-4 bg-white border-2 border-blue-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-blue-50 hover:border-[#005EB8] transition-all group shadow-sm hover:shadow-md"><i className="fas fa-file-invoice-dollar text-2xl text-blue-300 group-hover:text-[#005EB8]"></i><span className="text-xs font-black text-gray-600 group-hover:text-[#005EB8]">売上データ</span></button>
                                    <button onClick={() => handleCloudFetch('customers')} className="py-4 bg-white border-2 border-orange-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-orange-50 hover:border-orange-500 transition-all group shadow-sm hover:shadow-md"><i className="fas fa-users text-2xl text-orange-300 group-hover:text-orange-500"></i><span className="text-xs font-black text-gray-600 group-hover:text-orange-500">客数データ</span></button>
                                </div>
                                <p className="text-xs text-center text-gray-400 font-bold">※選択時に予算データも自動取得されます</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataView;
