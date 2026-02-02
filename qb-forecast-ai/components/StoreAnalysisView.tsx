
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { StoreData, ChartDataPoint } from '../types';
import { logisticModel, calculatePearsonCorrelation } from '../services/analysisEngine';
import { generateStoreReport } from '../services/geminiService';
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Brush, Bar, Legend, ReferenceLine, ScatterChart, Scatter, Cell
} from 'recharts';

interface StoreAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    forecastMonths: number;
    dataType: 'sales' | 'customers';
}

type NudgeReason = 'structural' | 'trend' | 'event';

const StoreAnalysisView: React.FC<StoreAnalysisViewProps> = ({ allStores, forecastMonths, dataType }) => {
    const [selectedStore, setSelectedStore] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterBlock, setFilterBlock] = useState(""); 
    const [showClosed, setShowClosed] = useState(false);
    const [showGrowthOnly, setShowGrowthOnly] = useState(false); 
    
    const [activeTab, setActiveTab] = useState<string>('forecast');
    
    const [confidence, setConfidence] = useState(95);
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    
    // Simulation State
    const [simMode, setSimMode] = useState(false);
    const [simL, setSimL] = useState(1.0); 
    const [simK, setSimK] = useState(1.0); 

    // Adaptive Nudge State
    const [nudgeReason, setNudgeReason] = useState<NudgeReason>('structural');

    // Benchmark State
    const [comparisonTargets, setComparisonTargets] = useState<string[]>([]);
    const [benchmarkMode, setBenchmarkMode] = useState<'calendar' | 'vintage'>('vintage');
    
    // Dropdown State for Benchmark
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const storeNames = Object.keys(allStores).sort();
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';
    const valueFormatter = (val: number) => val.toLocaleString() + (isSales ? '千円' : '人');
    
    const uniqueBlocks = useMemo(() => {
        const blocks = new Set<string>();
        Object.values(allStores).forEach((s: StoreData) => {
            if (s.block) blocks.add(s.block);
        });
        return Array.from(blocks).sort();
    }, [allStores]);

    const filteredStores = useMemo(() => {
        return storeNames.filter(n => {
            const store = allStores[n];
            const matchesSearch = n.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBlock = filterBlock ? store.block === filterBlock : true;
            const matchesStatus = showClosed ? true : store.isActive;
            const matchesGrowth = showGrowthOnly ? store.raw.length < 36 : true; 
            return matchesSearch && matchesBlock && matchesStatus && matchesGrowth;
        });
    }, [storeNames, searchTerm, filterBlock, showClosed, showGrowthOnly, allStores]);

    const currentStore = selectedStore ? allStores[selectedStore] : null;

    useEffect(() => {
        if ((!selectedStore || !filteredStores.includes(selectedStore)) && filteredStores.length > 0) {
            setSelectedStore(filteredStores[0]);
        }
    }, [filteredStores, selectedStore]);

    useEffect(() => {
        setAiReport(null); 
        setSimMode(false); 
        setSimL(1.0);
        setSimK(1.0);
        setNudgeReason('structural');
        setComparisonTargets([]); // Reset comparisons on store change
    }, [selectedStore]);

    // Handle click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // --- Benchmark Logic ---
    const similarStores = useMemo(() => {
        if (!currentStore) return [];
        const baseRaw = currentStore.raw;
        const len = Math.min(24, baseRaw.length);
        if (len < 6) return [];
        
        const baseRecent = baseRaw.slice(-len);

        const scores = storeNames
            .filter(n => n !== currentStore.name && allStores[n].isActive && allStores[n].raw.length >= len)
            .map(n => {
                const targetRaw = allStores[n].raw;
                const targetRecent = targetRaw.slice(-len);
                const corr = calculatePearsonCorrelation(baseRecent, targetRecent);
                return { name: n, score: corr, k: allStores[n].params.k, L: allStores[n].params.L };
            })
            .filter(s => s.score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
            
        return scores;
    }, [currentStore, storeNames, allStores]);

    const toggleComparison = (name: string) => {
        setComparisonTargets(prev => {
            if (prev.includes(name)) return prev.filter(n => n !== name);
            return [...prev, name];
        });
        setIsDropdownOpen(false);
    };

    // --- Revised Benchmark Data Logic ---
    const displayStores = useMemo(() => {
        if (!currentStore) return [];
        // Ensure current store is always first and filter out invalid stores
        const targets = [currentStore.name, ...comparisonTargets];
        return targets.filter(name => allStores[name]);
    }, [currentStore, comparisonTargets, allStores]);

    const benchmarkChartData = useMemo(() => {
        if (displayStores.length === 0) return [];

        if (benchmarkMode === 'calendar') {
            const dateSet = new Set<string>();
            displayStores.forEach(name => {
                const s = allStores[name];
                if(s) s.dates.forEach(d => dateSet.add(d));
            });
            // Sort by date object
            const dates = Array.from(dateSet).sort((a, b) => {
                return new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime();
            });
            
            return dates.map(d => {
                const pt: any = { date: d };
                displayStores.forEach(name => {
                    const s = allStores[name];
                    if (s) {
                        const idx = s.dates.indexOf(d);
                        if (idx !== -1) pt[name] = s.raw[idx];
                    }
                });
                return pt;
            });
        } else {
            // Vintage Mode
            let maxLen = 0;
            displayStores.forEach(name => {
                const s = allStores[name];
                if (s && s.raw.length > maxLen) maxLen = s.raw.length;
            });

            return Array.from({ length: maxLen }, (_, i) => {
                const pt: any = { month: i + 1 };
                displayStores.forEach(name => {
                    const s = allStores[name];
                    if (s && i < s.raw.length) {
                        pt[name] = s.raw[i];
                    }
                });
                return pt;
            });
        }
    }, [displayStores, benchmarkMode, allStores]);

    const chartData = useMemo(() => {
        if (!currentStore) return [];
        const d = currentStore;
        const z = confidence === 99 ? 2.58 : (confidence === 95 ? 1.96 : (confidence === 80 ? 1.28 : 0.67));
        const data: (ChartDataPoint & { simulated?: number | null; outlier?: number | null })[] = [];

        d.dates.forEach((date, i) => {
            data.push({
                date,
                actual: d.raw[i],
                outlier: !d.mask[i] ? d.raw[i] : null,
                forecast: null,
                range: null,
                simulated: null
            });
        });

        const lastDate = new Date(d.dates[d.dates.length - 1].replace(/\//g, '-'));
        const decay = nudgeReason === 'structural' ? 1.0 : (nudgeReason === 'trend' ? 0.9 : 0.0);

        for (let t = 1; t <= forecastMonths; t++) {
            const idx = d.raw.length + t - 1;
            const fd = new Date(lastDate);
            fd.setMonth(lastDate.getMonth() + t);
            const label = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}`;
            
            const tr = logisticModel(idx, d.fit.params, d.fit.mode, d.fit.shockIdx);
            const sea = d.seasonal[fd.getMonth()] || 1.0;
            const nudgeComp = d.nudge * Math.pow(decay, t);
            
            const baseValRaw = (tr + nudgeComp) * sea;
            const unc = d.stdDev * (1 + t * 0.05);
            
            const baseVal = baseValRaw < 0 ? 0 : baseValRaw;
            const upper = Math.max(0, baseVal + z * unc);
            const lower = Math.max(0, baseVal - z * unc);

            let simVal: number | null = null;
            if (simMode) {
                const simParams = { ...d.fit.params };
                if (d.fit.mode === 'shift' || d.fit.mode === 'dual_shift') {
                    simParams.L += (simParams.L * (simL - 1));
                } else {
                    simParams.L *= simL;
                }
                simParams.k *= simK;

                const trSim = logisticModel(idx, simParams, d.fit.mode, d.fit.shockIdx);
                let targetVal = (trSim + nudgeComp) * sea;
                if (targetVal < 0) targetVal = 0;

                const transitionMonths = 24;
                const progress = Math.min(t / transitionMonths, 1.0);
                
                simVal = baseVal + (targetVal - baseVal) * progress;
                if (simVal < 0) simVal = 0;
            }

            data.push({
                date: label,
                actual: null,
                outlier: null,
                forecast: Math.round(baseVal),
                range: [Math.round(lower), Math.round(upper)],
                simulated: simVal ? Math.round(simVal) : null
            });
        }
        return data;
    }, [currentStore, forecastMonths, confidence, simMode, simL, simK, nudgeReason]);

    const stlData = useMemo(() => {
        if (!currentStore) return [];
        return currentStore.dates.map((date, i) => ({
            date,
            trend: Math.round(currentStore.components.t[i]),
            seasonal: Number(currentStore.components.s[i].toFixed(2)),
            residual: Math.round(currentStore.components.r[i])
        }));
    }, [currentStore]);

    const zChartData = useMemo(() => {
        if (!currentStore || !currentStore.stats?.zChart) return [];
        
        const len = currentStore.dates.length;
        if (len < 12) return [];

        const start = len - 12;
        const slicedRaw = currentStore.stats.zChart.slice(start);
        const slicedDates = currentStore.dates.slice(start);

        let runningTotal = 0;
        return slicedRaw.map((d, i) => {
            runningTotal += d.monthly;
            return {
                date: slicedDates[i],
                monthly: d.monthly,
                cumulative: runningTotal,
                mat: d.mat
            };
        });
    }, [currentStore]);

    const handleGenerateAI = async () => {
        if (!currentStore) return;
        setAiLoading(true);
        const report = await generateStoreReport(currentStore);
        setAiReport(report);
        setAiLoading(false);
    };

    const ExpandButton = ({ target }: { target: string }) => (
        <button 
            onClick={() => setExpandedChart(target)}
            className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-gray-400 hover:text-[#005EB8] rounded-md shadow-sm transition-all z-10"
            title="全画面表示"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
        </button>
    );

    const renderMainChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:5, right:10, bottom:0, left:0}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                <XAxis dataKey="date" tick={{fontSize:9}} minTickGap={30} tickMargin={10} />
                <YAxis tick={{fontSize:9}} label={{ value: unitLabel, angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                <Tooltip formatter={valueFormatter} labelStyle={{color:'black'}} contentStyle={{borderRadius:'16px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                {!simMode && <Area type="monotone" dataKey="range" fill="#005EB8" fillOpacity={0.1} stroke="transparent" name={`信頼区間 (${confidence}%)`} />}
                <Line type="monotone" dataKey="forecast" stroke="#005EB8" strokeWidth={3} strokeDasharray={simMode ? "3 3" : "0"} dot={false} name="AI予測 (Base)" strokeOpacity={simMode ? 0.5 : 1} />
                {simMode && <Line type="monotone" dataKey="simulated" stroke="#9333EA" strokeWidth={3} dot={false} name="Simulation (Persistent Nudge)" animationDuration={300} />}
                <Line type="monotone" dataKey="actual" stroke="#1A1A1A" strokeWidth={2} dot={{r:2, fill:'#1A1A1A'}} name="実績" />
                <Scatter dataKey="outlier" fill="#EF4444" name="外れ値 (除外)" shape="cross" />
                <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" />
            </ComposedChart>
        </ResponsiveContainer>
    ), [chartData, simMode, unitLabel, valueFormatter, confidence]);

    const renderBenchmarkChart = useCallback(() => {
        // Guard against empty data
        if (!benchmarkChartData || benchmarkChartData.length === 0) {
            return (
                <div className="flex items-center justify-center h-full text-gray-400 font-bold bg-slate-50 rounded-xl">
                    <p>表示するデータがありません</p>
                </div>
            );
        }

        const colors = ['#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

        // Force re-render with key change when stores or mode changes
        const chartKey = `bench-${benchmarkMode}-${displayStores.length}`;

        return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart key={chartKey} data={benchmarkChartData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                        dataKey={benchmarkMode === 'vintage' ? 'month' : 'date'} 
                        tick={{fontSize: 9}} 
                        label={benchmarkMode === 'vintage' ? { value: '経過月数', position: 'bottom', fontSize: 9 } : undefined}
                        minTickGap={30}
                    />
                    <YAxis tick={{fontSize: 9}} width={30} />
                    <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 'bold' }} />
                    
                    {displayStores.map((storeName, i) => {
                        const isMain = storeName === currentStore?.name;
                        return (
                            <Line 
                                key={storeName}
                                type="monotone" 
                                dataKey={storeName} 
                                name={storeName} 
                                stroke={isMain ? '#005EB8' : colors[(i - 1) % colors.length]} 
                                strokeWidth={isMain ? 3 : 2} 
                                dot={false} 
                                connectNulls 
                                opacity={isMain ? 1 : 0.7} 
                                activeDot={{r: 4}}
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>
        );
    }, [benchmarkChartData, benchmarkMode, displayStores, currentStore]);

    const renderStlTrend = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stlData}>
                <Line type="monotone" dataKey="trend" stroke="#F59E0B" strokeWidth={3} dot={false} />
                <XAxis dataKey="date" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip formatter={valueFormatter} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
            </LineChart>
        </ResponsiveContainer>
    ), [stlData, valueFormatter]);

    const renderStlSeasonal = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stlData}>
                <Line type="monotone" dataKey="seasonal" stroke="#10B981" strokeWidth={3} dot={false} />
                <XAxis dataKey="date" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
            </LineChart>
        </ResponsiveContainer>
    ), [stlData]);

    const renderStlResidual = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stlData}>
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="residual" stroke="#EF4444" strokeWidth={2} dot={{r:2}} />
                <XAxis dataKey="date" hide />
                <YAxis tick={{fontSize:9}} />
                <Tooltip formatter={valueFormatter} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
            </LineChart>
        </ResponsiveContainer>
    ), [stlData, valueFormatter]);

    const renderZChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={zChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{fontSize:9}} />
                <YAxis yAxisId="left" tick={{fontSize:9}} />
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:9}} />
                <Tooltip formatter={valueFormatter} />
                <Legend />
                <Bar yAxisId="left" dataKey="monthly" name={`月次${isSales ? '売上' : '客数'}`} fill="#93C5FD" barSize={20} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="累積" stroke="#F59E0B" strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="mat" name="移動年計 (MAT)" stroke="#005EB8" strokeWidth={3} />
            </ComposedChart>
        </ResponsiveContainer>
    ), [zChartData, valueFormatter, isSales]);

    const tabClass = (tab: string) => `px-6 py-3 rounded-full text-xs font-black transition-all font-display ${activeTab === tab ? 'bg-[#005EB8] text-white shadow-lg shadow-blue-200 transform scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`;

    return (
        <div className="absolute inset-0 flex flex-col lg:flex-row gap-6 p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="p-6 bg-white border-b border-gray-100">
                    <input 
                        type="text" 
                        placeholder="店舗名検索..." 
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl text-xs outline-none focus:ring-2 focus:ring-[#005EB8] font-bold text-gray-600 placeholder-gray-400 transition-all mb-3"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    
                    <div className="relative mb-4">
                        <select 
                            value={filterBlock}
                            onChange={(e) => setFilterBlock(e.target.value)}
                            className="w-full p-3 bg-gray-50 border-none rounded-2xl text-xs outline-none focus:ring-2 focus:ring-[#005EB8] font-bold text-gray-600 appearance-none cursor-pointer"
                        >
                            <option value="">全てのブロック (All Blocks)</option>
                            {uniqueBlocks.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <i className="fas fa-chevron-down text-xs"></i>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none group">
                            <input 
                                type="checkbox" 
                                checked={showClosed} 
                                onChange={(e) => setShowClosed(e.target.checked)}
                                className="w-4 h-4 accent-[#005EB8] rounded border-gray-300 focus:ring-[#005EB8] cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-500 group-hover:text-[#005EB8] transition-colors">閉店・非稼働店舗を含める</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer select-none group">
                            <input 
                                type="checkbox" 
                                checked={showGrowthOnly} 
                                onChange={(e) => setShowGrowthOnly(e.target.checked)}
                                className="w-4 h-4 accent-orange-500 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-500 group-hover:text-orange-500 transition-colors">成長期のみ (36ヶ月未満)</span>
                        </label>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {filteredStores.map(n => (
                        <button
                            key={n}
                            onClick={() => setSelectedStore(n)}
                            className={`w-full text-left padding-3 px-5 py-3 rounded-2xl text-xs font-bold transition-all transform hover:scale-[1.02] ${selectedStore === n ? 'bg-[#005EB8] text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <span>{n}</span>
                                    {allStores[n].block && <span className={`block text-[9px] mt-0.5 ${selectedStore === n ? 'text-blue-100' : 'text-gray-400'}`}>{allStores[n].block}</span>}
                                </div>
                                {!allStores[n].isActive && <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded uppercase backdrop-blur-sm">閉店</span>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="lg:w-3/4 flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-20">
                {currentStore ? (
                    <>
                         <div className="sticky top-0 z-20 bg-[#F8FAFC] pb-4 pt-1 mb-2">
                             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                 <div>
                                     <h2 className="text-3xl font-black text-gray-800 tracking-tighter uppercase font-display">{currentStore.name}</h2>
                                     <div className="flex gap-2 mt-2">
                                         <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${currentStore.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{currentStore.isActive ? 'ACTIVE' : 'CLOSED'}</span>
                                         <span className="bg-blue-50 text-[#005EB8] px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100">Rank: {currentStore.stats?.abcRank}</span>
                                         <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-100">Mode: {currentStore.fit.mode}</span>
                                         {currentStore.block && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200">{currentStore.block}</span>}
                                     </div>
                                 </div>
                                 
                                 <div className="flex bg-white rounded-full p-1 shadow-sm overflow-x-auto max-w-full">
                                    <button onClick={() => setActiveTab('forecast')} className={tabClass('forecast')}>予測</button>
                                    <button onClick={() => setActiveTab('analysis')} className={tabClass('analysis')}>詳細分析</button>
                                    <button onClick={() => setActiveTab('benchmark')} className={tabClass('benchmark')}>類似・比較</button>
                                    <button onClick={() => setActiveTab('ai')} className={tabClass('ai')}>AI診断</button>
                                 </div>
                             </div>
                         </div>

                         {activeTab === 'forecast' && (
                             <>
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col h-[600px] min-h-[600px] relative group animate-fadeIn">
                                    <ExpandButton target="main" />
                                    <div className="flex flex-col gap-4 mb-4">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display flex items-center">
                                            実績 & AI予測 (Logistic Growth)
                                            <HelpTooltip title="AI予測グラフ" content="過去の実績（黒線）とAIによる将来予測（青線）を表示します。" />
                                        </h3>
                                        
                                        <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                            
                                            {/* --- ADAPTIVE NUDGE CONTROL --- */}
                                            <div className="flex items-center gap-2 border-r border-gray-300 pr-4 mr-2">
                                                <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">乖離要因 (Nudge):</span>
                                                <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                                                    <button onClick={() => setNudgeReason('structural')} className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${nudgeReason === 'structural' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="構造変化 (Decay=1.0: 永続)">構造</button>
                                                    <button onClick={() => setNudgeReason('trend')} className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${nudgeReason === 'trend' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="実力変化 (Decay=0.9: 緩やか)">実力</button>
                                                    <button onClick={() => setNudgeReason('event')} className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${nudgeReason === 'event' ? 'bg-orange-100 text-orange-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="一時的 (Decay=0.0: 一過性)">一時</button>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 border-r border-gray-300 pr-4 mr-2">
                                                <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">信頼区間:</span>
                                                <select 
                                                    value={confidence} 
                                                    onChange={(e) => setConfidence(parseInt(e.target.value))}
                                                    className="bg-transparent text-xs font-black text-[#005EB8] outline-none cursor-pointer"
                                                >
                                                    <option value={80}>80%</option>
                                                    <option value={95}>95%</option>
                                                    <option value={99}>99%</option>
                                                </select>
                                            </div>

                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input type="checkbox" checked={simMode} onChange={(e) => setSimMode(e.target.checked)} className="accent-[#005EB8]" />
                                                <span className="text-xs font-bold text-gray-600 whitespace-nowrap">Simulation Mode</span>
                                            </label>

                                            {/* Simulation Sliders - Conditional Display */}
                                            {simMode && (
                                                <div className="flex items-center gap-4 ml-2 border-l border-gray-300 pl-4 animate-fadeIn">
                                                    <div className="flex flex-col w-24">
                                                        <div className="flex justify-between text-[8px] font-black text-purple-600"><span>L倍率 (Scale)</span><span>x{simL.toFixed(1)}</span></div>
                                                        <input type="range" min="0.5" max="1.5" step="0.1" value={simL} onChange={(e) => setSimL(parseFloat(e.target.value))} className="h-1.5 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                                                    </div>
                                                    <div className="flex flex-col w-24">
                                                        <div className="flex justify-between text-[8px] font-black text-purple-600"><span>k倍率 (Speed)</span><span>x{simK.toFixed(1)}</span></div>
                                                        <input type="range" min="0.5" max="1.5" step="0.1" value={simK} onChange={(e) => setSimK(parseFloat(e.target.value))} className="h-1.5 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 w-full">
                                        {renderMainChart()}
                                    </div>
                                </div>

                                {/* Detailed Data Table */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col animate-fadeIn shrink-0 mt-6">
                                    <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
                                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                            <i className="fas fa-table mr-2"></i>詳細データ (Monthly Data)
                                        </h3>
                                        <button className="text-xs text-[#005EB8] font-bold hover:underline">CSV Export</button>
                                    </div>
                                    <div className="overflow-auto max-h-[500px] custom-scrollbar">
                                        <table className="min-w-full text-center text-xs whitespace-nowrap relative">
                                            <thead className="bg-white sticky top-0 z-10 shadow-sm font-black text-gray-500 uppercase tracking-widest">
                                                <tr>
                                                    <th className="p-3 text-left pl-6">年月</th>
                                                    <th className="p-3 text-right">実績</th>
                                                    <th className="p-3 text-right text-blue-600">AI予測 (Base)</th>
                                                    {simMode && <th className="p-3 text-right text-purple-600">Simulated</th>}
                                                    <th className="p-3 text-right">信頼区間 (Range)</th>
                                                    <th className="p-3 text-right">予実差 (Diff)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                                {[...chartData].reverse().map((row, i) => {
                                                    const diff = row.actual !== null && row.forecast !== null ? row.actual - row.forecast : null;
                                                    return (
                                                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                                            <td className="p-3 text-left pl-6 text-[#005EB8]">{row.date}</td>
                                                            <td className="p-3 text-right font-black text-gray-800">
                                                                {row.actual !== null ? row.actual.toLocaleString() : '-'}
                                                            </td>
                                                            <td className="p-3 text-right text-blue-600">
                                                                {row.forecast !== null ? row.forecast.toLocaleString() : '-'}
                                                            </td>
                                                            {simMode && (
                                                                <td className="p-3 text-right text-purple-600 bg-purple-50/50">
                                                                    {row.simulated !== null && row.simulated !== undefined ? Math.round(row.simulated).toLocaleString() : '-'}
                                                                </td>
                                                            )}
                                                            <td className="p-3 text-right text-gray-400 text-[10px]">
                                                                {row.range ? `${row.range[0].toLocaleString()} - ${row.range[1].toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className={`p-3 text-right ${diff !== null && diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                {diff !== null ? (diff > 0 ? '+' : '') + diff.toLocaleString() : '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                             </>
                         )}

                         {activeTab === 'analysis' && (
                             <div className="space-y-8 animate-fadeIn">
                                 <div>
                                     <h3 className="text-lg font-black text-slate-800 border-b pb-2 mb-4 font-display flex items-center gap-2">
                                         1. 要因分解 (Factor Decomposition)
                                     </h3>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-orange-400">トレンド (Trend Component)</h4>
                                             <div className="flex-1">{renderStlTrend()}</div>
                                         </div>
                                         
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="zchart" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-[#005EB8]">Zチャート (移動年計)</h4>
                                             <div className="flex-1">{renderZChart()}</div>
                                         </div>

                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-green-500">季節性 (Seasonality)</h4>
                                             <div className="flex-1">{renderStlSeasonal()}</div>
                                         </div>

                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-red-400">残差 (Residuals / Noise)</h4>
                                             <div className="flex-1">{renderStlResidual()}</div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         )}

                         {activeTab === 'benchmark' && (
                             <div className="space-y-6 animate-fadeIn">
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col relative min-h-[500px]">
                                    <ExpandButton target="benchmark" />
                                    <div className="flex flex-col gap-4 mb-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display flex items-center">
                                                <i className="fas fa-layer-group mr-2"></i>比較チャート (Comparison)
                                            </h3>
                                            <div className="flex bg-gray-100 p-1 rounded-full">
                                                <button onClick={() => setBenchmarkMode('vintage')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${benchmarkMode === 'vintage' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>Vintage</button>
                                                <button onClick={() => setBenchmarkMode('calendar')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${benchmarkMode === 'calendar' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>Calendar</button>
                                            </div>
                                        </div>
                                        {/* Store Selectors */}
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {comparisonTargets.map(target => (
                                                <span key={target} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                                                    {target}
                                                    <button onClick={() => toggleComparison(target)} className="hover:text-red-500"><i className="fas fa-times"></i></button>
                                                </span>
                                            ))}
                                            <div className="relative" ref={dropdownRef}>
                                                <button 
                                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                    className="bg-[#005EB8] text-white px-3 py-1 rounded-full text-xs font-bold hover:bg-[#004a94] flex items-center gap-1"
                                                >
                                                    <i className="fas fa-plus"></i> 追加
                                                </button>
                                                {isDropdownOpen && (
                                                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-20 animate-fadeIn max-h-64 overflow-y-auto custom-scrollbar">
                                                        <div className="text-[10px] font-black text-gray-400 uppercase mb-2 px-2 sticky top-0 bg-white z-10 pb-1">類似店舗 (Recommended)</div>
                                                        {similarStores.length > 0 ? similarStores.map(s => (
                                                            <button 
                                                                key={s.name} 
                                                                onClick={() => { toggleComparison(s.name); }}
                                                                className="w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded text-xs font-bold text-gray-700 flex justify-between"
                                                            >
                                                                <span>{s.name}</span>
                                                                <span className="text-[9px] text-green-500">{(s.score*100).toFixed(0)}% Match</span>
                                                            </button>
                                                        )) : <div className="text-xs text-gray-400 px-2">類似店舗なし</div>}
                                                        <div className="border-t border-gray-100 my-2"></div>
                                                        <div className="sticky bottom-0 bg-white pt-1">
                                                            <input 
                                                                type="text" 
                                                                placeholder="店舗名検索..." 
                                                                className="w-full bg-gray-50 border-none rounded-lg px-2 py-1 text-xs outline-none"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        const val = e.currentTarget.value;
                                                                        const match = storeNames.find(n => n.toLowerCase().includes(val.toLowerCase()));
                                                                        if (match) { toggleComparison(match); e.currentTarget.value = ''; }
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Enforce height on wrapper div for Recharts */}
                                    <div className="w-full h-[400px] min-h-[400px]">
                                        {renderBenchmarkChart()}
                                    </div>
                                </div>

                                {/* Comparison Stats Table */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                    <table className="min-w-full text-center text-xs">
                                        <thead className="bg-gray-50 font-black text-gray-500 uppercase tracking-widest border-b border-gray-100">
                                            <tr>
                                                <th className="p-3 text-left">Metrics</th>
                                                <th className="p-3 text-[#005EB8]">{currentStore.name}</th>
                                                {comparisonTargets.map(t => <th key={t} className="p-3">{t}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                            {[
                                                { label: '潜在需要 (L)', key: 'L', fmt: (v:number)=>Math.round(v).toLocaleString() },
                                                { label: '成長速度 (k)', key: 'k', fmt: (v:number)=>v.toFixed(3) },
                                                { label: '直近昨対比', key: 'yoy', fmt: (v:number)=>((v||0)*100).toFixed(1)+'%', val: (s:StoreData)=>s.stats?.yoy },
                                                { label: '安定性 (CV)', key: 'cv', fmt: (v:number)=>((v||0)*100).toFixed(1)+'%', val: (s:StoreData)=>s.stats?.cv },
                                                { label: '稼働月数', key: 'age', fmt: (v:number)=>v+' mo', val: (s:StoreData)=>s.raw.length },
                                            ].map((row, i) => (
                                                <tr key={i}>
                                                    <td className="p-3 text-left font-black text-gray-400">{row.label}</td>
                                                    <td className="p-3 text-[#005EB8] bg-blue-50/20">
                                                        {row.val ? row.fmt(row.val(currentStore)) : row.fmt(currentStore.params[row.key as keyof typeof currentStore.params])}
                                                    </td>
                                                    {comparisonTargets.map(t => {
                                                        const s = allStores[t];
                                                        // Guard clause for deleted/invalid stores
                                                        if (!s) return <td key={t} className="p-3 text-red-300">-</td>;
                                                        return (
                                                            <td key={t} className="p-3">
                                                                {row.val ? row.fmt(row.val(s)) : row.fmt(s.params[row.key as keyof typeof s.params])}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                             </div>
                         )}

                         {activeTab === 'ai' && (
                             <div className="animate-fadeIn">
                                 <div className="flex justify-between items-center mb-6">
                                     <h3 className="text-xs font-black text-purple-600 uppercase tracking-widest font-display flex items-center gap-2">
                                         <span className="bg-purple-100 p-1.5 rounded-lg text-purple-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg></span>
                                         Gemini Pro AI Diagnosis
                                     </h3>
                                     <button 
                                        onClick={handleGenerateAI}
                                        disabled={aiLoading}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-lg shadow-purple-200 flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        {aiLoading ? '診断中...' : '最新レポートを生成'}
                                    </button>
                                 </div>

                                 {aiReport ? (
                                     <div className="bg-gradient-to-br from-purple-50 to-white rounded-3xl shadow-sm border border-purple-100 p-8 relative overflow-hidden min-h-[400px]">
                                         <div className="prose prose-sm max-w-none text-slate-700 bg-white/80 p-6 rounded-2xl backdrop-blur-md border border-purple-50 shadow-sm" dangerouslySetInnerHTML={{ __html: marked.parse(aiReport) as string }} />
                                     </div>
                                 ) : (
                                     <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl h-[400px] flex flex-col items-center justify-center text-slate-400">
                                         <p className="text-sm font-bold">「レポートを生成」ボタンを押してAI診断を開始してください</p>
                                     </div>
                                 )}
                             </div>
                         )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest h-full">
                        <p>左のリストから店舗を選択してください</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoreAnalysisView;
