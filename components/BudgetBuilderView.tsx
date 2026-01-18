
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
    ComposedChart, Line, Area, Brush, LabelList, Legend
} from 'recharts';

interface BudgetBuilderViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type SortKey = 'name' | 'block' | 'lastYearTotal' | 'forecastTotal' | 'stretch' | 'budgetTotal' | 'yoy';

// --- Simulation Logic Helpers ---
interface SimulationResult {
    monthlyData: {
        month: string;
        forecastMedian: number;
        forecastUpper50: number;
        forecastLower50: number;
        forecastUpper95: number;
        forecastLower95: number;
        budget: number | null;
        actual: number | null;
    }[];
    landingDistribution: { bin: string; count: number; value: number }[];
    summary: {
        landingMedian: number;
        landingLower95: number;
        landingUpper95: number;
        winProbability: number;
        targetTotal: number;
    };
}

const BudgetBuilderView: React.FC<BudgetBuilderViewProps> = ({ allStores, dataType }) => {
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    const displayUnit = isSales ? 'k' : '人';
    const valueDivider = isSales ? 1000 : 1;

    // --- State ---
    const [activeTab, setActiveTab] = useState<'global' | 'individual' | 'risk'>('global');
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [globalStretch, setGlobalStretch] = useState<number>(105); 
    const [individualStretch, setIndividualStretch] = useState<Record<string, number>>({});
    const [manualOverrides, setManualOverrides] = useState<Record<string, Record<string, number>>>({}); // Store -> Month -> Value
    const [searchTerm, setSearchTerm] = useState("");
    
    // Conflict Resolution Modal State
    const [conflictModal, setConflictModal] = useState<{ isOpen: boolean; storeName: string; targetValue: number } | null>(null);

    // Block Filter
    const [selectedBlock, setSelectedBlock] = useState<string>("");

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'budgetTotal', direction: 'desc' });

    // Risk Simulation Params
    const [simParams, setSimParams] = useState({
        volatilityMult: 1.0,
        trials: 1000
    });

    // Fiscal Year Selection State
    const [targetYear, setTargetYear] = useState<number>(() => {
        const today = new Date();
        // If current month is July(6) or later, current FY ends next year.
        // We typically want to plan for the *next* FY, or the current one.
        // Default to the FY ending next year relative to today.
        return today.getMonth() >= 6 ? today.getFullYear() + 2 : today.getFullYear() + 1;
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Fiscal Year Calculation (July to June) ---
    const fiscalYearInfo = useMemo(() => {
        const endYear = targetYear;
        const startYear = endYear - 1;
        
        const dates: string[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(startYear, 6 + i, 1);
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        return {
            label: `${endYear}年6月期`,
            dates,
            startYear,
            endYear
        };
    }, [targetYear]);

    // Generate options for dropdown (Current year -2 to +3)
    const yearOptions = useMemo(() => {
        const current = new Date().getFullYear();
        const opts = [];
        for (let i = -2; i <= 3; i++) {
            opts.push(current + i);
        }
        return opts;
    }, []);

    // --- Core Calculation ---
    const budgetData = useMemo(() => {
        const activeStores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && !s.error);
        
        return activeStores.map(s => {
            const forecastMonthly: number[] = [];
            const lastRawIdx = s.raw.length - 1;
            const decay = s.nudgeDecay || 0.7;
            const lastDateObj = new Date(s.dates[lastRawIdx].replace(/\//g, '-'));
            
            fiscalYearInfo.dates.forEach(fyDate => {
                const targetDate = new Date(fyDate + '-01');
                const diffMonths = (targetDate.getFullYear() - lastDateObj.getFullYear()) * 12 + (targetDate.getMonth() - lastDateObj.getMonth());
                
                const futureIdx = lastRawIdx + diffMonths;
                const tr = logisticModel(futureIdx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const sIdx = targetDate.getMonth();
                const sea = s.seasonal[sIdx] || 1.0;
                
                // Nudge applied only if we are projecting from the end of actual data
                const nudgeEffect = diffMonths > 0 ? s.nudge * Math.pow(decay, diffMonths) : 0;
                
                const val = Math.max(0, (tr + nudgeEffect) * sea);
                forecastMonthly.push(Math.round(val));
            });

            // Determine stretch: Individual override > Global
            const hasIndividual = individualStretch.hasOwnProperty(s.name);
            const storeStretch = hasIndividual ? individualStretch[s.name] : globalStretch;
            
            const budgetMonthly = forecastMonthly.map((forecastVal, idx) => {
                const monthKey = fiscalYearInfo.dates[idx];
                if (manualOverrides[s.name] && manualOverrides[s.name][monthKey] !== undefined) {
                    return manualOverrides[s.name][monthKey];
                }
                // Guard against NaN forecastVal just in case
                const safeForecast = isNaN(forecastVal) ? 0 : forecastVal;
                return Math.round(safeForecast * (storeStretch / 100));
            });

            let lastYearTotal = 0;
            const lastYearMonthly: (number | null)[] = [];
            
            fiscalYearInfo.dates.forEach(fyDate => {
                const targetDate = new Date(fyDate + '-01');
                targetDate.setFullYear(targetDate.getFullYear() - 1);
                const lyStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
                
                const rawIdx = s.dates.findIndex(d => d.replace(/\//g, '-') === lyStr);
                if (rawIdx !== -1) {
                    const val = s.raw[rawIdx];
                    lastYearTotal += val;
                    lastYearMonthly.push(val);
                } else {
                    lastYearMonthly.push(null);
                }
            });

            const forecastTotal = forecastMonthly.reduce((a, b) => a + b, 0);
            const budgetTotal = budgetMonthly.reduce((a, b) => a + b, 0);

            return {
                name: s.name,
                region: s.region,
                block: s.block, // Added block
                lastYearTotal,
                lastYearMonthly,
                forecastTotal,
                budgetTotal,
                forecastMonthly,
                budgetMonthly,
                stretch: storeStretch,
                yoy: lastYearTotal > 0 ? ((budgetTotal - lastYearTotal) / lastYearTotal) * 100 : 0,
                gap: budgetTotal - forecastTotal,
                hasManualOverrides: manualOverrides[s.name] && Object.keys(manualOverrides[s.name]).length > 0
            };
        });
    }, [allStores, globalStretch, individualStretch, manualOverrides, fiscalYearInfo]);

    // --- Filtering & Sorting ---
    const uniqueBlocks = useMemo(() => {
        const blocks = new Set<string>();
        budgetData.forEach(d => { if (d.block) blocks.add(d.block); });
        return Array.from(blocks).sort();
    }, [budgetData]);

    const filteredData = useMemo(() => {
        let data = budgetData.filter(d => {
            const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBlock = selectedBlock ? d.block === selectedBlock : true;
            return matchesSearch && matchesBlock;
        });

        if (sortConfig.key) {
            data.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                
                // Handle potential undefined/null values safely
                const vA = (valA === undefined || valA === null || isNaN(valA as number)) ? -Infinity : valA;
                const vB = (valB === undefined || valB === null || isNaN(valB as number)) ? -Infinity : valB;

                if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [budgetData, searchTerm, selectedBlock, sortConfig]);

    const summary = useMemo(() => {
        // Summary based on FILTERED data
        const targetData = filteredData;
        const totalLastYear = targetData.reduce((a, b) => a + b.lastYearTotal, 0);
        const totalForecast = targetData.reduce((a, b) => a + b.forecastTotal, 0);
        const totalBudget = targetData.reduce((a, b) => a + b.budgetTotal, 0);
        
        return {
            count: targetData.length,
            totalLastYear,
            totalForecast,
            totalBudget,
            totalYoY: totalLastYear > 0 ? ((totalBudget - totalLastYear) / totalLastYear) * 100 : 0,
            vsForecast: totalForecast > 0 ? ((totalBudget - totalForecast) / totalForecast) * 100 : 0
        };
    }, [filteredData]);

    const currentStoreData = useMemo(() => {
        return budgetData.find(d => d.name === selectedStoreId);
    }, [budgetData, selectedStoreId]);

    // --- Risk Simulation Logic ---
    const simulationResult = useMemo((): SimulationResult | null => {
        if (!currentStoreData || activeTab !== 'risk') return null;
        
        const store = allStores[currentStoreData.name];
        if (!store) return null;

        const trials = simParams.trials;
        const volatility = store.stdDev * simParams.volatilityMult;
        const monthlyOutcomes: number[][] = Array.from({ length: 12 }, () => []);
        
        // Run Simulation for 12 Fiscal Months
        for (let i = 0; i < 12; i++) {
            const fyDateStr = fiscalYearInfo.dates[i];
            const targetDate = new Date(fyDateStr + '-01');
            const lastDateObj = new Date(store.dates[store.dates.length - 1].replace(/\//g, '-'));
            
            // Calculate forecast basis (same as budget builder logic but without stretch)
            const diffMonths = (targetDate.getFullYear() - lastDateObj.getFullYear()) * 12 + (targetDate.getMonth() - lastDateObj.getMonth());
            const futureIdx = store.raw.length - 1 + diffMonths;
            const tr = logisticModel(futureIdx, store.fit.params, store.fit.mode, store.fit.shockIdx);
            const sIdx = targetDate.getMonth();
            const sea = store.seasonal[sIdx] || 1.0;
            const decay = store.nudgeDecay || 0.7;
            const nudgeEffect = diffMonths > 0 ? store.nudge * Math.pow(decay, diffMonths) : 0;
            const meanVal = Math.max(0, (tr + nudgeEffect) * sea);

            for (let t = 0; t < trials; t++) {
                // Box-Muller
                const u = 1 - Math.random();
                const v = Math.random();
                const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                const val = Math.max(0, meanVal + z * volatility);
                monthlyOutcomes[i].push(val);
            }
        }

        // Aggregate Results
        const monthlyStats = monthlyOutcomes.map((vals, idx) => {
            vals.sort((a,b) => a-b);
            return {
                month: fiscalYearInfo.dates[idx],
                forecastMedian: vals[Math.floor(trials * 0.5)],
                forecastLower50: vals[Math.floor(trials * 0.25)],
                forecastUpper50: vals[Math.floor(trials * 0.75)],
                forecastLower95: vals[Math.floor(trials * 0.05)],
                forecastUpper95: vals[Math.floor(trials * 0.95)],
                budget: currentStoreData.budgetMonthly[idx],
                actual: null
            };
        });

        const cumulativeTotals = new Array(trials).fill(0);
        for(let m=0; m<12; m++) {
            for(let t=0; t<trials; t++) {
                cumulativeTotals[t] += monthlyOutcomes[m][t];
            }
        }
        cumulativeTotals.sort((a,b) => a-b);

        const landingMedian = cumulativeTotals[Math.floor(trials * 0.5)];
        const landingLower95 = cumulativeTotals[Math.floor(trials * 0.05)];
        const landingUpper95 = cumulativeTotals[Math.floor(trials * 0.95)];
        const winProbability = (cumulativeTotals.filter(v => v >= currentStoreData.budgetTotal).length / trials) * 100;

        // Histogram
        const minVal = cumulativeTotals[0];
        const maxVal = cumulativeTotals[trials - 1];
        const binCount = 20;
        const binSize = (maxVal - minVal) / binCount;
        const landingDistribution = Array.from({length: binCount}, (_, i) => {
            const start = minVal + i * binSize;
            const end = start + binSize;
            const count = cumulativeTotals.filter(v => v >= start && v < end).length;
            return {
                bin: `${Math.round(start / valueDivider)}`,
                value: start + binSize/2,
                count
            };
        });

        return {
            monthlyData: monthlyStats,
            landingDistribution,
            summary: {
                landingMedian,
                landingLower95,
                landingUpper95,
                winProbability,
                targetTotal: currentStoreData.budgetTotal
            }
        };

    }, [currentStoreData, activeTab, simParams, allStores, fiscalYearInfo, valueDivider]);


    // Initialize selection
    useEffect(() => {
        if ((!selectedStoreId || !filteredData.find(d => d.name === selectedStoreId)) && filteredData.length > 0) {
            setSelectedStoreId(filteredData[0].name);
        }
    }, [filteredData, selectedStoreId]);

    // --- Handlers ---
    const handleStoreStretchChange = (name: string, val: number) => {
        const safeVal = isNaN(val) ? 0 : val;
        setIndividualStretch(prev => ({ ...prev, [name]: safeVal }));
    };

    // REQUEST Change (Checks for conflict)
    const requestStoreStretchChange = (name: string, val: number) => {
        const hasOverrides = manualOverrides[name] && Object.keys(manualOverrides[name]).length > 0;
        if (hasOverrides) {
            setConflictModal({ isOpen: true, storeName: name, targetValue: val });
        } else {
            handleStoreStretchChange(name, val);
        }
    };

    // RESOLVE Conflict
    const resolveConflict = (mode: 'overwrite' | 'keep') => {
        if (!conflictModal) return;
        
        const { storeName, targetValue } = conflictModal;
        if (mode === 'overwrite') {
            // Clear overrides for this store
            setManualOverrides(prev => {
                const next = { ...prev };
                delete next[storeName];
                return next;
            });
        }
        // Apply stretch
        handleStoreStretchChange(storeName, targetValue);
        setConflictModal(null);
    };

    const handleBudgetTotalChange = (name: string, newTotal: number, forecastTotal: number) => {
        const safeTotal = isNaN(newTotal) ? 0 : newTotal;
        
        // Safety for closed stores where forecast is 0
        if (forecastTotal <= 0) {
            // Allow setting stretch to 0 if total input is 0 (basically disable store)
            if (safeTotal === 0) {
                setIndividualStretch(prev => ({ ...prev, [name]: 0 }));
            }
            return;
        }
        
        const newStretch = (safeTotal / forecastTotal) * 100;
        setIndividualStretch(prev => ({ ...prev, [name]: parseFloat(newStretch.toFixed(2)) }));
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const handleManualOverride = (name: string, monthIdx: number, val: number) => {
        const safeVal = isNaN(val) ? 0 : val;
        const monthKey = fiscalYearInfo.dates[monthIdx];
        setManualOverrides(prev => ({
            ...prev,
            [name]: {
                ...(prev[name] || {}),
                [monthKey]: safeVal
            }
        }));
    };

    // --- Import / Export ---
    const handleExportJson = () => {
        const exportData = {
            version: "1.0",
            fiscalYearLabel: fiscalYearInfo.label,
            settings: {
                globalStretch,
                individualStretch,
                manualOverrides
            },
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `budget_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.settings) {
                    if (data.settings.globalStretch) setGlobalStretch(data.settings.globalStretch);
                    if (data.settings.individualStretch) setIndividualStretch(data.settings.individualStretch);
                    if (data.settings.manualOverrides) setManualOverrides(data.settings.manualOverrides);
                    alert("予算データを読み込みました。");
                } else {
                    alert("無効なファイル形式です。");
                }
            } catch (err) {
                console.error(err);
                alert("ファイルの読み込みに失敗しました。");
            }
        };
        reader.readAsText(file);
    };

    const handleDownloadCSV = () => {
        // DataViewでの読み込みに最適化された形式（店舗名 + 年月カラムのみ）
        // ヘッダーを YYYY/MM/01 形式に変換
        const dateHeaders = fiscalYearInfo.dates.map(d => `${d.replace('-', '/')}/01`);
        const headers = ["店舗名", ...dateHeaders];
        let csv = headers.join(",") + "\n";

        filteredData.forEach(d => {
            const row = [
                `"${d.name}"`,
                ...d.budgetMonthly
            ];
            csv += row.join(",") + "\n";
        });

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `budget_plan_${fiscalYearInfo.label}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Individual View Chart Data ---
    const individualChartData = useMemo(() => {
        if (!currentStoreData) return [];
        const rawStore = allStores[currentStoreData.name];
        if (!rawStore) return [];

        const dataPoints = [];
        
        // 1. Past 24 Months (2 Years)
        const lastRawDate = new Date(rawStore.dates[rawStore.dates.length - 1].replace(/\//g, '-'));
        for (let i = 23; i >= 0; i--) {
            const idx = rawStore.raw.length - 1 - i;
            if (idx >= 0) {
                dataPoints.push({
                    date: rawStore.dates[idx],
                    actual: rawStore.raw[idx],
                    budget: null,
                    forecast: null,
                    isFuture: false
                });
            }
        }

        // 2. Future FY
        fiscalYearInfo.dates.forEach((d, i) => {
            dataPoints.push({
                date: d,
                actual: null,
                budget: currentStoreData.budgetMonthly[i],
                forecast: currentStoreData.forecastMonthly[i],
                isFuture: true
            });
        });

        return dataPoints;
    }, [currentStoreData, allStores, fiscalYearInfo]);

    const SortIcon = ({ colKey }: { colKey: SortKey }) => (
        <span className={`ml-1 text-[8px] ${sortConfig.key === colKey ? 'text-[#005EB8]' : 'text-gray-300'}`}>
            {sortConfig.key === colKey && sortConfig.direction === 'asc' ? '▲' : '▼'}
        </span>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1400px] mx-auto space-y-6 pb-32">
                
                {/* Header Area */}
                <div className="flex flex-col xl:flex-row justify-between items-end gap-6 mb-2">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">予算策定シミュレーター</h2>
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">TARGET:</span>
                                <select 
                                    value={targetYear} 
                                    onChange={(e) => setTargetYear(Number(e.target.value))}
                                    className="bg-transparent text-xs font-black text-[#005EB8] outline-none cursor-pointer"
                                >
                                    {yearOptions.map(y => (
                                        <option key={y} value={y}>{y}年6月期</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 font-bold">
                            Period: {fiscalYearInfo.dates[0]} 〜 {fiscalYearInfo.dates[11]} (12 Months)
                        </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Import/Export Buttons */}
                        <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-gray-200 text-gray-500 hover:text-[#005EB8] px-3 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                            読込 (JSON)
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJson} />
                        
                        <button onClick={handleExportJson} className="bg-white border border-gray-200 text-gray-500 hover:text-[#005EB8] px-3 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                            保存 (JSON)
                        </button>

                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                            <button onClick={() => setActiveTab('global')} className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'global' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>全社一括</button>
                            <button onClick={() => setActiveTab('individual')} className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'individual' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>店舗個別</button>
                            <button onClick={() => setActiveTab('risk')} className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'risk' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}><i className="fas fa-exclamation-triangle"></i> リスク検証</button>
                        </div>
                        <button onClick={handleDownloadCSV} className="bg-[#005EB8] hover:bg-[#004a94] text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-blue-100 flex items-center gap-2 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path></svg>
                            CSV出力
                        </button>
                    </div>
                </div>

                {/* Common Filters & Stats */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        {/* Filters & Control */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <input 
                                        type="text" 
                                        placeholder="店舗名検索..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8]"
                                    />
                                    <svg className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                </div>
                                <div className="flex-1 relative">
                                    <select 
                                        value={selectedBlock} 
                                        onChange={(e) => setSelectedBlock(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8] appearance-none"
                                    >
                                        <option value="">全ブロック</option>
                                        {uniqueBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <svg className="w-4 h-4 absolute right-3 top-2.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                            
                            {/* Global Slider */}
                            {activeTab === 'global' && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">全社一律ストレッチ率</label>
                                        <span className="bg-[#005EB8] text-white px-2 py-0.5 rounded text-[10px] font-bold">{globalStretch}%</span>
                                    </div>
                                    <input 
                                        type="range" min="90" max="130" step="1" 
                                        value={globalStretch} 
                                        onChange={(e) => setGlobalStretch(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]" 
                                    />
                                </div>
                            )}
                        </div>

                        {/* Metrics */}
                        <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">対象店舗数</p>
                                <p className="text-lg font-black text-gray-600">{summary.count}</p>
                            </div>
                            <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">昨年度実績 (Ref)</p>
                                <p className="text-lg font-black text-gray-400">{Math.round(summary.totalLastYear).toLocaleString()}</p>
                            </div>
                            <div className="bg-[#005EB8] text-white p-4 rounded-xl shadow-lg shadow-blue-200 transform scale-105">
                                <p className="text-[9px] text-blue-200 font-black uppercase mb-1">策定予算総額</p>
                                <p className="text-2xl font-black">{Math.round(summary.totalBudget).toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-white/80 mt-1">vs AI予測: +{Math.round(summary.totalBudget - summary.totalForecast).toLocaleString()}</p>
                            </div>
                            <div className={`p-4 rounded-xl border shadow-sm ${summary.totalYoY >= 0 ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                                <p className="text-[9px] font-black uppercase mb-1 opacity-70">昨対成長率</p>
                                <p className="text-2xl font-black">{summary.totalYoY > 0 ? '+' : ''}{summary.totalYoY.toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* === GLOBAL LIST TAB === */}
                {activeTab === 'global' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden h-[600px] animate-fadeIn">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">予算一覧リスト</h3>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10 shadow-sm text-[10px] font-black text-gray-400 uppercase tracking-wider select-none">
                                    <tr>
                                        <th onClick={() => handleSort('name')} className="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50">店舗名 <SortIcon colKey="name" /></th>
                                        <th onClick={() => handleSort('block')} className="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50">ブロック <SortIcon colKey="block" /></th>
                                        <th onClick={() => handleSort('lastYearTotal')} className="p-4 border-b border-gray-100 text-right cursor-pointer hover:bg-gray-50">昨年度実績 <SortIcon colKey="lastYearTotal" /></th>
                                        <th onClick={() => handleSort('forecastTotal')} className="p-4 border-b border-gray-100 text-right bg-blue-50/30 text-blue-400 cursor-pointer hover:bg-blue-50/50">AI予測(100%) <SortIcon colKey="forecastTotal" /></th>
                                        <th onClick={() => handleSort('stretch')} className="p-4 border-b border-gray-100 text-center w-32 cursor-pointer hover:bg-gray-50">目標率(%) <SortIcon colKey="stretch" /></th>
                                        <th onClick={() => handleSort('budgetTotal')} className="p-4 border-b border-gray-100 text-right font-bold text-gray-700 cursor-pointer hover:bg-gray-50 bg-yellow-50/30 w-40">策定予算 (Input) <SortIcon colKey="budgetTotal" /></th>
                                        <th onClick={() => handleSort('yoy')} className="p-4 border-b border-gray-100 text-right cursor-pointer hover:bg-gray-50">昨対比 <SortIcon colKey="yoy" /></th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-bold text-gray-600 divide-y divide-gray-50">
                                    {filteredData.map(d => (
                                        <tr key={d.name} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="p-4 text-gray-800">{d.name}</td>
                                            <td className="p-4 text-gray-400">{d.block}</td>
                                            <td className="p-4 text-right text-gray-400">{d.lastYearTotal.toLocaleString()}</td>
                                            <td className="p-4 text-right text-blue-400 bg-blue-50/30">{d.forecastTotal.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <input 
                                                    type="number" 
                                                    value={d.stretch} 
                                                    onChange={(e) => handleStoreStretchChange(d.name, parseInt(e.target.value))}
                                                    className={`w-16 text-center border rounded py-1 outline-none focus:ring-2 focus:ring-[#005EB8] ${d.stretch !== globalStretch ? 'bg-yellow-50 border-yellow-200 text-yellow-700 font-black' : 'border-gray-200'}`}
                                                />
                                            </td>
                                            <td className="p-4 text-right font-black text-[#005EB8] bg-yellow-50/30">
                                                <input 
                                                    type="number" 
                                                    value={d.budgetTotal} 
                                                    onChange={(e) => handleBudgetTotalChange(d.name, parseInt(e.target.value), d.forecastTotal)}
                                                    className="w-full text-right bg-transparent border-b border-gray-300 focus:border-[#005EB8] outline-none font-black text-[#005EB8]"
                                                />
                                            </td>
                                            <td className={`p-4 text-right ${(d.yoy || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{(d.yoy || 0) > 0 ? '+' : ''}{(d.yoy || 0).toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* === INDIVIDUAL TAB === */}
                {activeTab === 'individual' && currentStoreData && (
                    <div className="flex flex-col lg:flex-row gap-6 h-[800px] animate-fadeIn">
                        {/* Sidebar: Store List */}
                        <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">対象店舗リスト</h4>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                {filteredData.map(s => (
                                    <button 
                                        key={s.name}
                                        onClick={() => setSelectedStoreId(s.name)}
                                        className={`w-full text-left px-4 py-3 border-b border-gray-50 flex justify-between items-center transition-colors ${selectedStoreId === s.name ? 'bg-blue-50 border-l-4 border-l-[#005EB8]' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                                    >
                                        <div>
                                            <span className={`text-xs font-bold block ${selectedStoreId === s.name ? 'text-[#005EB8]' : 'text-gray-700'}`}>{s.name}</span>
                                            <span className="text-[9px] text-gray-400">{s.block}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            {s.hasManualOverrides && <span className="text-[8px] text-orange-500 bg-orange-50 px-1 rounded font-black mb-0.5">固定値あり</span>}
                                            <span className={`text-[10px] font-black ${(s.yoy || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{(s.yoy || 0) > 0 ? '+' : ''}{(s.yoy || 0).toFixed(0)}%</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Detail Area */}
                        <div className="lg:w-3/4 flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
                            
                            {/* --- Store Strategy Control --- */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <i className="fas fa-calculator text-8xl text-blue-900"></i>
                                </div>
                                <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-800 font-display flex items-center gap-2">
                                            <span className="bg-[#005EB8] text-white text-[10px] px-2 py-1 rounded">STORE</span>
                                            {currentStoreData.name}
                                        </h3>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs text-gray-400 font-bold">{currentStoreData.block}</span>
                                            {currentStoreData.hasManualOverrides && (
                                                <span className="text-[10px] bg-orange-100 text-orange-600 px-2 rounded-full font-black border border-orange-200">
                                                    <i className="fas fa-exclamation-circle mr-1"></i>手入力固定中
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Strategy Slider */}
                                    <div className="flex-1 max-w-md bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] font-black text-[#005EB8] uppercase tracking-widest">目標ストレッチ率 (vs AI Forecast)</label>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" 
                                                    value={currentStoreData.stretch}
                                                    onChange={(e) => requestStoreStretchChange(currentStoreData.name, parseInt(e.target.value))}
                                                    className="w-16 text-center font-black text-lg bg-white border border-blue-200 rounded-lg text-[#005EB8] outline-none focus:ring-2 focus:ring-blue-300"
                                                />
                                                <span className="text-xs font-bold text-blue-400">%</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" min="80" max="150" step="1"
                                            value={currentStoreData.stretch}
                                            onChange={(e) => requestStoreStretchChange(currentStoreData.name, parseInt(e.target.value))}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]"
                                        />
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-gray-400 font-bold">80% (Conservative)</span>
                                            <span className="text-[9px] text-gray-400 font-bold">150% (Aggressive)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top KPI Cards */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Target Budget</p>
                                    <p className="text-2xl font-black text-[#005EB8]">{currentStoreData.budgetTotal.toLocaleString()}</p>
                                    <p className="text-[9px] text-gray-400 mt-1">vs Last Year: <span className={currentStoreData.yoy >= 0 ? 'text-green-500' : 'text-red-500'}>{currentStoreData.yoy > 0 ? '+' : ''}{currentStoreData.yoy.toFixed(1)}%</span></p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1">AI Forecast</p>
                                    <p className="text-xl font-black text-blue-400">{currentStoreData.forecastTotal.toLocaleString()}</p>
                                    <p className="text-[9px] text-gray-400 mt-1">Base Ratio: 100%</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Gap (Budget - AI)</p>
                                    <p className="text-xl font-black text-orange-500">+{currentStoreData.gap.toLocaleString()}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Efficiency (Sales/L)</p>
                                    <p className="text-xl font-black text-gray-600">-</p>
                                </div>
                            </div>

                            {/* Trend Chart (2 Years) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[350px]">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Trend & Forecast (過去2年 + 予測1年)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={individualChartData} margin={{top: 20, right: 20, bottom: 5, left: 0}}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={30} />
                                        <YAxis tick={{fontSize: 9}} />
                                        <Tooltip formatter={(v:number)=>v.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Legend wrapperStyle={{fontSize: '10px'}} />
                                        
                                        <Line type="monotone" dataKey="actual" stroke="#94A3B8" strokeWidth={2} dot={false} name="実績" />
                                        
                                        {/* Forecast Line (Dashed) */}
                                        <Line type="monotone" dataKey="forecast" stroke="#93C5FD" strokeWidth={2} strokeDasharray="5 5" dot={false} name="AI予測" />
                                        
                                        {/* Budget Line (Solid, Bold, with Labels) */}
                                        <Line type="monotone" dataKey="budget" stroke="#005EB8" strokeWidth={3} dot={{r:4, fill: "#005EB8"}} activeDot={{r:6}} name="策定予算" connectNulls>
                                            <LabelList dataKey="budget" position="top" fontSize={8} formatter={(v:number) => v > 0 ? v.toLocaleString() : ''} fill="#005EB8" fontWeight="bold" />
                                        </Line>
                                        
                                        <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" startIndex={Math.max(0, individualChartData.length - 24)} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Detailed Editing Table */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest">月次予算調整テーブル</h3>
                                        <div className="text-[10px] text-gray-400">※ 数値を直接入力して上書き可能</div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-center text-xs">
                                        <thead className="bg-white text-gray-400 font-black uppercase tracking-wider border-b border-gray-100">
                                            <tr>
                                                <th className="p-3 text-left">Month</th>
                                                <th className="p-3">前年実績</th>
                                                <th className="p-3 text-blue-400">AI予測</th>
                                                <th className="p-3 text-[#005EB8] bg-blue-50 w-32">予算 (Input)</th>
                                                <th className="p-3">昨対比</th>
                                                <th className="p-3">vs AI</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                            {fiscalYearInfo.dates.map((date, idx) => {
                                                const ly = currentStoreData.lastYearMonthly[idx];
                                                const fc = currentStoreData.forecastMonthly[idx];
                                                const bg = currentStoreData.budgetMonthly[idx];
                                                const yoy = ly && ly > 0 ? ((bg - ly)/ly)*100 : 0;
                                                const vsFc = fc > 0 ? ((bg - fc)/fc)*100 : 0;
                                                
                                                return (
                                                    <tr key={date} className="hover:bg-gray-50">
                                                        <td className="p-3 text-left font-black">{date}</td>
                                                        <td className="p-3 text-gray-400">{ly ? ly.toLocaleString() : '-'}</td>
                                                        <td className="p-3 text-blue-400">{fc.toLocaleString()}</td>
                                                        <td className="p-3 bg-blue-50/30">
                                                            <input 
                                                                type="number" 
                                                                value={bg}
                                                                onChange={(e) => handleManualOverride(currentStoreData.name, idx, parseInt(e.target.value))}
                                                                className="w-full text-center bg-white border border-blue-200 rounded py-1.5 text-[#005EB8] font-black focus:ring-2 focus:ring-[#005EB8] outline-none"
                                                            />
                                                        </td>
                                                        <td className={`p-3 ${(yoy || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{(yoy || 0) > 0 ? '+' : ''}{(yoy || 0).toFixed(1)}%</td>
                                                        <td className="p-3 text-gray-400">{(vsFc || 0) > 0 ? '+' : ''}{(vsFc || 0).toFixed(1)}%</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-gray-100 border-t-2 border-gray-200">
                                                <td className="p-3 text-left font-black text-gray-800">TOTAL</td>
                                                <td className="p-3 text-gray-500">{currentStoreData.lastYearTotal.toLocaleString()}</td>
                                                <td className="p-3 text-blue-500">{currentStoreData.forecastTotal.toLocaleString()}</td>
                                                <td className="p-3 text-[#005EB8] font-black text-lg">{currentStoreData.budgetTotal.toLocaleString()}</td>
                                                <td className={`p-3 font-black ${currentStoreData.yoy >= 0 ? 'text-green-600' : 'text-red-600'}`}>{currentStoreData.yoy > 0 ? '+' : ''}{currentStoreData.yoy.toFixed(1)}%</td>
                                                <td className="p-3">-</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* === RISK TAB === */}
                {activeTab === 'risk' && currentStoreData && simulationResult && (
                    <div className="flex flex-col gap-6 animate-fadeIn">
                        
                        {/* Simulation Controls */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-center">
                            <div className="flex-1">
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                                    <i className="fas fa-microscope text-purple-600"></i> リスク検証シミュレーター
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    現在の策定予算（{currentStoreData.budgetTotal.toLocaleString()}）が、統計的にどれくらいの確率で達成可能かを検証します。
                                </p>
                            </div>
                            <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                                <label className="text-[10px] font-black text-gray-500 uppercase">不確実性係数</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="range" min="0.5" max="2.0" step="0.1" 
                                        value={simParams.volatilityMult} 
                                        onChange={(e) => setSimParams({...simParams, volatilityMult: parseFloat(e.target.value)})}
                                        className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <span className="text-xs font-bold text-purple-600">x{simParams.volatilityMult.toFixed(1)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Risk KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${simulationResult.summary.winProbability >= 50 ? 'border-t-green-500' : 'border-t-red-500'}`}>
                                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Win Probability</p>
                                <p className={`text-3xl font-black ${simulationResult.summary.winProbability >= 50 ? 'text-green-600' : 'text-red-500'}`}>{simulationResult.summary.winProbability.toFixed(1)}%</p>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold">予算達成確率</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-blue-500">
                                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Expected Landing</p>
                                <p className="text-3xl font-black text-gray-800">{Math.round(simulationResult.summary.landingMedian / valueDivider).toLocaleString()}<span className="text-sm ml-1">{displayUnit}</span></p>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold">中央値予測 (50%)</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-red-400">
                                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Downside Risk (95%)</p>
                                <p className="text-3xl font-black text-red-600">{Math.round(simulationResult.summary.landingLower95 / valueDivider).toLocaleString()}<span className="text-sm ml-1">{displayUnit}</span></p>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold">最悪ケース</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-green-400">
                                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Upside Potential (5%)</p>
                                <p className="text-3xl font-black text-green-600">{Math.round(simulationResult.summary.landingUpper95 / valueDivider).toLocaleString()}<span className="text-sm ml-1">{displayUnit}</span></p>
                                <p className="text-[10px] text-gray-400 mt-2 font-bold">最高ケース</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Fan Chart */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[450px] flex flex-col">
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest font-display flex items-center gap-2 mb-4">
                                    <i className="fas fa-wave-square text-purple-500"></i> 確率的予測ファンチャート
                                </h3>
                                <div className="flex-1 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={simulationResult.monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="month" tick={{fontSize: 9}} minTickGap={30} />
                                            <YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} />
                                            <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            
                                            {/* Confidence Intervals */}
                                            <Area type="monotone" dataKey="forecastUpper95" stroke="none" fill="#E0F2FE" fillOpacity={0.6} stackId="2" />
                                            <Area type="monotone" dataKey="forecastLower95" stroke="none" fill="#fff" fillOpacity={1} stackId="2" />
                                            
                                            <Area type="monotone" dataKey="forecastUpper50" stroke="none" fill="#93C5FD" fillOpacity={0.6} stackId="1" />
                                            <Area type="monotone" dataKey="forecastLower50" stroke="none" fill="#fff" fillOpacity={1} stackId="1" />

                                            {/* Lines */}
                                            <Line type="monotone" dataKey="forecastMedian" stroke="#2563EB" strokeWidth={2} dot={false} name="Median Forecast" />
                                            <Line type="step" dataKey="budget" stroke="#10B981" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Budget Target" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Histogram */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[450px] flex flex-col">
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    <i className="fas fa-chart-bar text-teal-500"></i> 着地見込分布 (Outcome Distribution)
                                </h3>
                                <div className="flex-1 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={simulationResult.landingDistribution} barCategoryGap={1}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="bin" tick={{fontSize:9}} label={{value: `着地予測 (${unitLabel})`, position: 'bottom', offset: 0, fontSize: 9}} />
                                            <YAxis tick={{fontSize:9}} />
                                            <Tooltip />
                                            <Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} name="頻度">
                                                {simulationResult.landingDistribution.map((entry, index) => (
                                                    <Cell key={index} fill={entry.value >= simulationResult.summary.targetTotal ? '#10B981' : '#EF4444'} fillOpacity={0.7} />
                                                ))}
                                            </Bar>
                                            <ReferenceLine x={simulationResult.landingDistribution.find(d => d.value >= simulationResult.summary.targetTotal)?.bin} stroke="#10B981" strokeWidth={2} label={{ value: 'Target', position: 'top', fill: '#10B981', fontSize: 10 }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'risk' && !currentStoreData && (
                    <div className="flex flex-col items-center justify-center h-[400px] bg-white rounded-3xl border-2 border-dashed border-gray-200">
                        <i className="fas fa-search text-4xl text-gray-200 mb-4"></i>
                        <p className="text-gray-400 font-bold">左のリストから店舗を選択してシミュレーションを開始してください</p>
                    </div>
                )}

            </div>

            {/* Conflict Resolution Modal */}
            {conflictModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-100 transform scale-100">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-xl shrink-0">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-800 mb-2">手入力データの競合</h3>
                                <p className="text-xs text-gray-600 font-bold leading-relaxed">
                                    「{conflictModal.storeName}」には、手入力で固定された月次予算が存在します。
                                    一括比率調整を適用する際、これらの手入力値をどう扱いますか？
                                </p>
                            </div>
                        </div>
                        
                        <div className="space-y-3">
                            <button 
                                onClick={() => resolveConflict('overwrite')}
                                className="w-full p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-left group transition-all"
                            >
                                <div className="text-xs font-black text-[#005EB8] mb-1 group-hover:underline">上書きして再計算する (推奨)</div>
                                <div className="text-[10px] text-blue-400">手入力値をすべて破棄し、新しい比率で全月を計算し直します。</div>
                            </button>

                            <button 
                                onClick={() => resolveConflict('keep')}
                                className="w-full p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-left group transition-all"
                            >
                                <div className="text-xs font-black text-gray-700 mb-1 group-hover:underline">手入力値を維持する</div>
                                <div className="text-[10px] text-gray-400">手入力した月は変更せず、それ以外の月のみ比率を適用します。</div>
                            </button>
                        </div>

                        <div className="mt-6 text-center">
                            <button onClick={() => setConflictModal(null)} className="text-xs font-bold text-gray-400 hover:text-gray-600 underline">
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetBuilderView;
