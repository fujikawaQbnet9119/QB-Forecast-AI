
import React, { useState, useRef, useCallback } from 'react';
import { analyzeStore, GlobalStats, calculateGlobalABC } from '../services/analysisEngine';
import { StoreData, UserMode } from '../types';
import Papa from 'papaparse';

// --- CONFIGURATION: CLOUD DATA LINKS (OBFUSCATED) ---
// ★ FIXED: Swapped IDs - they were pointing to the wrong data sources
const SALES_ID_PARTS = [
    "2PACX-1vT94gSJrPzi8YWt7-p6ftcguBn4YlX4OsbMX-pTI2CzRfoCJ4L-s7pAsLccacrYS5MXHe54aP070qW0"
];
const CUSTOMERS_ID_PARTS = [
    "2PACX-1vShm1Kk78a1TZZESLGgEiwxFr6sAsBMqtAt0G2SOSH4r94SG3QfUAU3yMY79986VBttLIq3e0FH",
    "_Un9"
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
    setUserMode: (mode: UserMode) => void;
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

const DataView: React.FC<DataViewProps> = ({ setAllStores, setGlobalMaxDate, forecastMonths, setForecastMonths, dataType, setDataType, onComplete, setUserMode }) => {
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

    // Cloud Load State
    const [showCloudModal, setShowCloudModal] = useState(false);
    const [cloudPassword, setCloudPassword] = useState("");
    const [isCloudUnlocked, setIsCloudUnlocked] = useState(false);

    // Developer Mode Trigger
    const [devClickCount, setDevClickCount] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const budgetInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (selectedFile: File) => {
        setFile(selectedFile);
        setFileName(selectedFile.name);
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

    const handleDevTrigger = () => {
        const nextCount = devClickCount + 1;
        setDevClickCount(nextCount);
        if (nextCount >= 5) {
            setShowCloudModal(true);
            setDevClickCount(0);
        }
    };

    const handleCloudUnlock = () => {
        if (cloudPassword === CLOUD_PASSWORD) {
            setIsCloudUnlocked(true);
        } else {
            alert("パスワードが正しくありません");
        }
    };

    const handleCloudFetch = async (type: 'sales' | 'customers') => {
        // ★ FIXED: Set data type immediately for UI consistency
        setDataType(type);

        const id = type === 'sales' ? SALES_ID_PARTS.join('') : CUSTOMERS_ID_PARTS.join('');
        const url = `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=0&single=true&output=csv`;
        const budgetId = BUDGET_ID_PARTS.join('');
        const budgetUrl = `https://docs.google.com/spreadsheets/d/e/${budgetId}/pub?gid=0&single=true&output=csv`;

        // ★ DEBUG: Log which data type is being fetched
        console.log('=== CLOUD FETCH DEBUG ===');
        console.log('Selected Type:', type);
        console.log('Data URL:', url);
        console.log('Budget URL:', budgetUrl);

        setIsProcessing(true);
        setProgress(1);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const csvText = await response.text();

            const blob = new Blob([csvText], { type: 'text/csv' });
            const dummyFile = new File([blob], type === 'sales' ? "Cloud_Sales_Data.csv" : "Cloud_Customers_Data.csv", { type: "text/csv" });

            setFile(dummyFile);
            setFileName(dummyFile.name);
            setEncoding('UTF-8');

            let dummyBudgetFile: File | undefined = undefined;
            try {
                const budgetRes = await fetch(budgetUrl);
                if (budgetRes.ok) {
                    const budgetCsv = await budgetRes.text();
                    const budgetBlob = new Blob([budgetCsv], { type: 'text/csv' });
                    dummyBudgetFile = new File([budgetBlob], "Cloud_Budget_Auto.csv", { type: "text/csv" });
                    setBudgetFile(dummyBudgetFile);
                    setBudgetFileName("Cloud_Budget_Auto.csv (Auto-fetched)");
                }
            } catch (err) {
                console.warn("Failed to auto-fetch budget data", err);
            }

            setShowCloudModal(false);
            // ★ CRITICAL FIX: Pass the selected type explicitly to ensure correct data processing
            await processDataFile(dummyFile, 'executive', dummyBudgetFile, type);

        } catch (e) {
            console.error(e);
            alert("Failed to load cloud data: " + e);
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const processData = async () => {
        if (!file) return;
        // Local data -> Manager Mode (default)
        await processDataFile(file, 'manager', undefined, dataType);
    };

    const runAnalysisInChunks = async (items: any[], globalMaxDate: Date, globalStats?: any, onProgress?: (p: number) => void): Promise<StoreData[]> => {
        const results: StoreData[] = [];
        const chunkSize = 20;
        const total = items.length;

        for (let i = 0; i < total; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            const chunkResults = chunk.map(item => {
                try {
                    return analyzeStore(
                        item.name,
                        item.raw,
                        item.dates,
                        globalMaxDate,
                        globalStats,
                        item.block,
                        item.region,
                        item.prefecture
                    );
                } catch (e) {
                    return { name: item.name, error: true, msg: String(e) } as StoreData;
                }
            });
            results.push(...chunkResults);
            if (onProgress) onProgress(i + chunkSize);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return results;
    };

    const processDataFile = async (targetFile: File, targetUserMode: UserMode, overrideBudgetFile?: File, explicitType?: 'sales' | 'customers') => {
        const currentType = explicitType || dataType;

        // ★ DEBUG: Log processing details
        console.log('=== PROCESS DATA FILE DEBUG ===');
        console.log('File Name:', targetFile.name);
        console.log('Explicit Type:', explicitType);
        console.log('Current Type:', currentType);
        console.log('Data Type State:', dataType);

        setIsProcessing(true);
        setProgress(5);

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
                        let region = "Unknown", prefecture = "Unknown", block = "Unknown", name = "", dateStr = "", valStr = "";

                        if (row.length >= 6) {
                            region = String(row[0]).trim(); prefecture = String(row[1]).trim(); block = String(row[2]).trim();
                            name = String(row[3]).trim(); dateStr = String(row[4]).trim(); valStr = String(row[5]).trim();
                        } else if (row.length >= 4) {
                            block = String(row[0]).trim(); name = String(row[1]).trim(); dateStr = String(row[2]).trim(); valStr = String(row[3]).trim();
                        } else {
                            name = String(row[0]).trim(); dateStr = String(row[1]).trim(); valStr = String(row[2]).trim();
                        }

                        if (!name || !dateStr) return;
                        let cleanDateStr = dateStr.replace(/[./]/g, '-');
                        if (cleanDateStr.length === 6 && !cleanDateStr.includes('-')) cleanDateStr = `${cleanDateStr.substring(0, 4)}-${cleanDateStr.substring(4, 6)}`;
                        const dateObj = new Date(cleanDateStr); dateObj.setDate(1);

                        const cleanValStr = valStr.replace(/[０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[¥,"]/g, '');
                        const value = parseFloat(cleanValStr);

                        if (name && !isNaN(dateObj.getTime()) && !isNaN(value)) {
                            rawData.push({ region, prefecture, block, storeName: name, date: dateObj, dateStr: cleanDateStr, value });
                            if (dateObj > globalMaxDate) globalMaxDate = dateObj;
                        }
                    });

                    // ★ DEBUG: Log sample data
                    console.log('Total Data Points:', rawData.length);
                    if (rawData.length > 0) {
                        console.log('Sample Data (first 3):', rawData.slice(0, 3).map(d => ({
                            store: d.storeName,
                            date: d.dateStr,
                            value: d.value
                        })));
                    }

                    setGlobalMaxDate(globalMaxDate);
                    setProgress(30);

                    const storeMap = new Map<string, RawDataPoint[]>();
                    rawData.forEach(p => { if (!storeMap.has(p.storeName)) storeMap.set(p.storeName, []); storeMap.get(p.storeName)?.push(p); });

                    const stores: { [name: string]: StoreData } = {};
                    const anchorNames: string[] = [], growthNames: string[] = [], startupNames: string[] = [];
                    const tempStoreData: Record<string, { raw: number[], dates: string[], block: string, region: string, prefecture: string }> = {};

                    storeMap.forEach((points, name) => {
                        points.sort((a, b) => a.date.getTime() - b.date.getTime());
                        const filledRaw: number[] = [], filledDates: string[] = [];
                        if (points.length > 0) {
                            let currentDate = new Date(points[0].date);
                            const lookup = new Map<string, number>();
                            points.forEach(p => lookup.set(`${p.date.getFullYear()}-${p.date.getMonth()}`, p.value));
                            const lastDate = points[points.length - 1].date;
                            while (currentDate <= lastDate) {
                                filledRaw.push(lookup.get(`${currentDate.getFullYear()}-${currentDate.getMonth()}`) || 0);
                                filledDates.push(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
                                currentDate.setMonth(currentDate.getMonth() + 1);
                            }
                        }
                        tempStoreData[name] = { raw: filledRaw, dates: filledDates, block: points[0]?.block, region: points[0]?.region, prefecture: points[0]?.prefecture };
                        const validLen = filledRaw.filter(v => v > 0).length;
                        if (validLen >= 36) anchorNames.push(name); else if (validLen >= 13) growthNames.push(name); else startupNames.push(name);
                    });

                    const anchorItems = anchorNames.map(n => ({ name: n, ...tempStoreData[n] }));
                    const totalItems = anchorNames.length + growthNames.length + startupNames.length;
                    const anchorResults = await runAnalysisInChunks(anchorItems, globalMaxDate, undefined, (c) => setProgress(30 + Math.round((c / totalItems) * 60)));

                    const matureStores: StoreData[] = [];
                    anchorResults.forEach(res => { if (!res.error) { stores[res.name] = res; if (res.isActive && res.fit.mode !== 'startup') matureStores.push(res); } });

                    // Global Stats calc...
                    let k65 = 0.1, standardGrowthL = 3000;
                    const globalSeasonality: number[][] = Array.from({ length: 12 }, () => []);
                    if (matureStores.length > 0) {
                        const ks = matureStores.map(s => s.params.k); k65 = calculatePercentile(ks, 65);
                        const Ls = matureStores.map(s => s.params.L); standardGrowthL = calculatePercentile(Ls, 50);
                        matureStores.forEach(s => s.seasonal.forEach((val, monthIdx) => globalSeasonality[monthIdx].push(val)));
                    }
                    let finalGlobalSeasonality = globalSeasonality.map(arr => {
                        if (arr.length === 0) return 1.0; arr.sort((a, b) => a - b); return arr[Math.floor(arr.length * 0.5)];
                    });
                    const seaSum = finalGlobalSeasonality.reduce((a, b) => a + b, 0);
                    if (seaSum > 0) finalGlobalSeasonality = finalGlobalSeasonality.map(v => (v / seaSum) * 12);

                    const globalStats: GlobalStats = { medianK: k65 > 0 ? k65 : 0.1, standardGrowthL: standardGrowthL > 0 ? standardGrowthL : 3000, medianSeasonality: finalGlobalSeasonality };

                    const remainingItems = [...growthNames.map(n => ({ name: n, ...tempStoreData[n] })), ...startupNames.map(n => ({ name: n, ...tempStoreData[n] }))];
                    if (remainingItems.length > 0) {
                        const remainingResults = await runAnalysisInChunks(remainingItems, globalMaxDate, globalStats, (c) => setProgress(30 + Math.round((anchorNames.length + c) / totalItems * 60)));
                        remainingResults.forEach(res => { if (!res.error) stores[res.name] = res; });
                    }

                    setProgress(90);

                    // Budget Merge Logic (Enhanced for Data Type Matching)
                    const targetBudgetFile = overrideBudgetFile || budgetFile;
                    if (targetBudgetFile) {
                        await new Promise<void>((resolve) => {
                            Papa.parse(targetBudgetFile, {
                                header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
                                complete: (budgetResults) => {
                                    try {
                                        const bRows = budgetResults.data as any[];
                                        if (bRows.length > 0) {
                                            const headers = Object.keys(bRows[0]);
                                            const dateColRegex = /^(\d{4})\s*[-/.\u5e74]\s*(\d{1,2})([-/\u6708](\d{1,2})?)?/;
                                            const dateCols = headers.filter(h => h.match(dateColRegex));

                                            // Check for type column (e.g., "Account", "Type", "科目")
                                            const typeCol = headers.find(h => ["科目", "Type", "Account", "Data", "種別"].some(k => h.toLowerCase().includes(k.toLowerCase())));

                                            // ★ CHECK: Is this the cloud budget file (which is known to be Customer count based)?
                                            const isCloudBudget = targetBudgetFile.name.includes("Cloud_Budget_Auto");

                                            // ★ DEBUG: Log budget processing details
                                            console.log('=== BUDGET PROCESSING DEBUG ===');
                                            console.log('Budget File:', targetBudgetFile.name);
                                            console.log('Is Cloud Budget:', isCloudBudget);
                                            console.log('Current Type:', currentType);
                                            console.log('Type Column Found:', typeCol);

                                            bRows.forEach(row => {
                                                let sName = row["店舗名"] || row["Store Name"] || row["Store"] || row["Name"] || "";
                                                if (!sName) {
                                                    // Fallback to searching first column if header mismatch
                                                    const vals = Object.values(row);
                                                    if (vals.length > 0) sName = String(vals[0]);
                                                }
                                                sName = sName.trim();

                                                let multiplier = 1.0;

                                                // ★ CRITICAL FIX: Cloud Budget is ALWAYS customer-based
                                                if (isCloudBudget) {
                                                    // Cloud Budget is customer count based
                                                    if (currentType === 'sales') {
                                                        // When in Sales mode, convert Customer count to Sales (k JPY)
                                                        multiplier = 1.389;
                                                        console.log(`Budget Multiplier for ${sName}: 1.389 (Sales mode, converting customer to sales)`);
                                                    } else {
                                                        // When in Customer mode, keep as is (already customer count)
                                                        multiplier = 1.0;
                                                        console.log(`Budget Multiplier for ${sName}: 1.0 (Customer mode, no conversion)`);
                                                    }
                                                } else if (typeCol) {
                                                    // For non-cloud budget files, check the type column
                                                    const rowType = String(row[typeCol]).trim();

                                                    const salesKeywords = ['売上', 'Sales', 'Revenue', '金額', '円'];
                                                    const customerKeywords = ['客数', 'Customers', 'Count', 'Traffic', '人'];

                                                    const isSalesRow = salesKeywords.some(k => rowType.includes(k));
                                                    const isCustomerRow = customerKeywords.some(k => rowType.includes(k));

                                                    if (currentType === 'sales') {
                                                        if (isCustomerRow) {
                                                            // Convert Customer count to Sales (k JPY)
                                                            multiplier = 1.389;
                                                        } else if (!isSalesRow && rowType) {
                                                            // If explicit type exists but matches neither sales nor customers (and not empty), skip.
                                                            return;
                                                        }
                                                    } else {
                                                        // currentType === 'customers'
                                                        if (isSalesRow) {
                                                            // Skip sales data when looking for customers
                                                            return;
                                                        } else if (!isCustomerRow && rowType) {
                                                            return;
                                                        }
                                                    }
                                                }

                                                if (stores[sName]) {
                                                    if (!stores[sName].budget) stores[sName].budget = {};
                                                    dateCols.forEach(col => {
                                                        let valStr = String(row[col]).replace(/,/g, '').trim();
                                                        if (!valStr) return;
                                                        const val = parseFloat(valStr);
                                                        if (!isNaN(val)) {
                                                            // Normalize date key to YYYY-MM
                                                            const match = col.match(dateColRegex);
                                                            if (match) {
                                                                const y = match[1];
                                                                const m = match[2].padStart(2, '0');
                                                                const dKey = `${y}-${m}`;
                                                                stores[sName].budget![dKey] = val * multiplier;
                                                            }
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    } catch (e) {
                                        console.warn("Budget parse error", e);
                                    }
                                    resolve();
                                }
                            });
                        });
                    }

                    if (targetUserMode === 'executive') setUserMode('executive');
                    setAllStores(stores);
                    setProgress(100);
                    setIsProcessing(false);
                    onComplete();

                } catch (e) {
                    console.error("Analysis Error:", e);
                    alert("Analysis Failed: " + e);
                    setIsProcessing(false);
                }
            }
        });
    };

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 animate-fadeIn bg-slate-50">
            <div className={`bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-xl text-center border border-white/50 relative overflow-hidden transition-all duration-500 ${dragActive ? 'scale-105 ring-4 ring-[#005EB8]/20' : ''}`}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={onDrop}
            >
                {/* Background Decoration */}
                <div className="absolute -top-20 -left-20 w-60 h-60 bg-blue-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
                <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>

                <div className="relative z-10">
                    <div className="w-20 h-20 bg-[#0F2540] text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/20">
                        <i className="fas fa-database text-3xl"></i>
                    </div>

                    <h2 className="text-3xl font-black text-slate-800 mb-2 font-display tracking-tight">Data Ingestion</h2>
                    <p className="text-sm text-slate-400 font-bold mb-8">Drop your CSV data or fetch from cloud</p>

                    <div className="flex justify-center gap-4 mb-8">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setDataType('sales')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${dataType === 'sales' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                売上 (Sales)
                            </button>
                            <button onClick={() => setDataType('customers')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${dataType === 'customers' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                客数 (Traffic)
                            </button>
                        </div>
                    </div>

                    {isProcessing ? (
                        <div className="my-8">
                            <div className="w-full bg-slate-100 rounded-full h-3 mb-3 overflow-hidden">
                                <div className="bg-[#005EB8] h-3 rounded-full transition-all duration-300 ease-out relative" style={{ width: `${progress}%` }}>
                                    <div className="absolute inset-0 bg-white/30 animate-[shimmer_1s_infinite]"></div>
                                </div>
                            </div>
                            <p className="text-xs font-black text-[#005EB8] uppercase tracking-widest animate-pulse">Processing... {progress}%</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <label className="block w-full cursor-pointer group">
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 transition-all group-hover:border-[#005EB8] group-hover:bg-blue-50/50">
                                    <p className="text-xs font-bold text-slate-400 group-hover:text-[#005EB8] transition-colors mb-2">
                                        {fileName ? fileName : "Click to upload CSV"}
                                    </p>
                                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">or drag & drop</span>
                                </div>
                                <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} className="hidden" accept=".csv" />
                            </label>

                            {/* Budget File Upload (Optional) */}
                            <label className="block w-full cursor-pointer group">
                                <div className="border-2 border-dashed border-slate-100 rounded-xl p-4 transition-all group-hover:border-purple-300 group-hover:bg-purple-50/30 flex items-center justify-center gap-3">
                                    <i className="fas fa-money-bill-wave text-slate-300 group-hover:text-purple-400"></i>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-purple-500 transition-colors">
                                        {budgetFileName ? budgetFileName : "Upload Budget CSV (Optional)"}
                                    </span>
                                </div>
                                <input type="file" ref={budgetInputRef} onChange={(e) => { if (e.target.files?.[0]) handleBudgetFileSelect(e.target.files[0]); }} className="hidden" accept=".csv" />
                            </label>

                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={processData} disabled={!file} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    Local Load
                                </button>
                                <button onClick={handleDevTrigger} className="w-full py-4 bg-gradient-to-r from-[#005EB8] to-blue-600 hover:to-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-[1.02] transition-all relative overflow-hidden">
                                    <span className="relative z-10">Cloud Fetch</span>
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-8 text-[10px] text-slate-300 font-mono">
                        Supports Shift-JIS / UTF-8 • Auto-detect format
                    </div>
                </div>
            </div>

            {/* Cloud Auth Modal */}
            {showCloudModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center">
                        <div className="w-12 h-12 bg-blue-50 text-[#005EB8] rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
                            <i className="fas fa-lock"></i>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 mb-2 font-display">Developer Access</h3>
                        <p className="text-xs text-gray-400 font-bold mb-6">Enter secure key to access cloud storage</p>

                        {!isCloudUnlocked ? (
                            <div className="space-y-3">
                                <input
                                    type="password"
                                    autoFocus
                                    value={cloudPassword}
                                    onChange={(e) => setCloudPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCloudUnlock()}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center font-bold text-sm outline-none focus:ring-2 focus:ring-[#005EB8]"
                                    placeholder="Enter Access Key"
                                />
                                <button onClick={handleCloudUnlock} className="w-full py-3 bg-[#005EB8] text-white rounded-xl text-xs font-black uppercase hover:bg-[#004a94] transition-all">
                                    Unlock
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-fadeIn">
                                <button onClick={() => handleCloudFetch('sales')} className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2">
                                    <i className="fas fa-yen-sign"></i> Load Sales Data
                                </button>
                                <button onClick={() => handleCloudFetch('customers')} className="w-full py-3 bg-teal-500 text-white rounded-xl text-xs font-black uppercase hover:bg-teal-600 shadow-lg shadow-teal-200 transition-all flex items-center justify-center gap-2">
                                    <i className="fas fa-users"></i> Load Customer Data
                                </button>
                            </div>
                        )}
                        <button onClick={() => setShowCloudModal(false)} className="mt-6 text-xs font-bold text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataView;
