
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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

const StoreAnalysisView: React.FC<StoreAnalysisViewProps> = ({ allStores, forecastMonths, dataType }) => {
    const [selectedStore, setSelectedStore] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterBlock, setFilterBlock] = useState(""); // New Block Filter State
    const [showClosed, setShowClosed] = useState(false);
    const [showGrowthOnly, setShowGrowthOnly] = useState(false); 
    
    const [activeTab, setActiveTab] = useState<string>('forecast');
    
    const [confidence, setConfidence] = useState(95);
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    
    // Simulation State
    const [simMode, setSimMode] = useState(false);
    const [simL, setSimL] = useState(1.0); // Multiplier for L
    const [simK, setSimK] = useState(1.0); // Multiplier for k

    const storeNames = Object.keys(allStores).sort();
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';
    const valueFormatter = (val: number) => val.toLocaleString() + (isSales ? '千円' : '人');
    
    // Extract Unique Blocks
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
        // Only auto-select if current selection is invalid or null, AND we have filtered results
        if ((!selectedStore || !filteredStores.includes(selectedStore)) && filteredStores.length > 0) {
            setSelectedStore(filteredStores[0]);
        }
    }, [filteredStores, selectedStore]);

    useEffect(() => {
        setAiReport(null); // Reset AI report when store changes
        setSimMode(false); // Reset simulation
        setSimL(1.0);
        setSimK(1.0);
    }, [selectedStore]);

    const chartData = useMemo(() => {
        if (!currentStore) return [];
        const d = currentStore;
        const z = confidence === 99 ? 2.58 : (confidence === 95 ? 1.96 : (confidence === 80 ? 1.28 : 0.67));
        const data: (ChartDataPoint & { simulated?: number | null; outlier?: number | null })[] = [];

        // Historical
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

        // Forecast
        const lastDate = new Date(d.dates[d.dates.length - 1].replace(/\//g, '-'));
        const decay = d.nudgeDecay !== undefined ? d.nudgeDecay : 0.7;

        for (let t = 1; t <= forecastMonths; t++) {
            const idx = d.raw.length + t - 1;
            const fd = new Date(lastDate);
            fd.setMonth(lastDate.getMonth() + t);
            const label = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}`;
            
            // Standard Forecast (Base + Growth)
            const tr = logisticModel(idx, d.fit.params, d.fit.mode, d.fit.shockIdx);
            
            // Update: Nudge logic changed to be seasonal-aware
            // Forecast = (Trend + Nudge * Decay) * Seasonality
            const sea = d.seasonal[fd.getMonth()] || 1.0;
            const nudgeComp = d.nudge * Math.pow(decay, t);
            
            const baseValRaw = (tr + nudgeComp) * sea;
            const unc = d.stdDev * (1 + t * 0.05);
            
            const baseVal = baseValRaw < 0 ? 0 : baseValRaw;
            const upper = Math.max(0, baseVal + z * unc);
            const lower = Math.max(0, baseVal - z * unc);

            // Simulation Forecast
            let simVal: number | null = null;
            if (simMode) {
                const simParams = { ...d.fit.params };
                if (d.fit.mode === 'shift' || d.fit.mode === 'recovery') {
                    simParams.L_post *= simL;
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
    }, [currentStore, forecastMonths, confidence, simMode, simL, simK]);

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

    const heatmapData = useMemo(() => {
        if (!currentStore) return { grid: [], maxVal: 0 };
        const grid: { year: number; months: (number | null)[] }[] = [];
        const years = new Set<number>();
        const yearMap = new Map<number, (number | null)[]>();

        let maxVal = 0;

        currentStore.dates.forEach((d, i) => {
            const dateObj = new Date(d.replace(/\//g, '-'));
            if(isNaN(dateObj.getTime())) return;
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            years.add(y);
            
            if(!yearMap.has(y)) yearMap.set(y, Array(12).fill(null));
            const arr = yearMap.get(y)!;
            arr[m] = Math.round(currentStore.raw[i]);
            if(currentStore.raw[i] > maxVal) maxVal = currentStore.raw[i];
        });

        Array.from(years).sort((a,b) => b-a).forEach(y => {
            grid.push({ year: y, months: yearMap.get(y)! });
        });

        return { grid, maxVal };
    }, [currentStore]);

    const similarStores = useMemo(() => {
        if (!currentStore) return [];
        const targetK = currentStore.params.k;
        const targetSea = currentStore.seasonal;

        const candidates = (Object.values(allStores) as StoreData[]).filter(s => s.name !== currentStore.name && s.isActive && s.raw.length >= 12);
        
        const scored = candidates.map(s => {
            const kDiff = Math.abs(s.params.k - targetK);
            const corr = calculatePearsonCorrelation(s.seasonal, targetSea);
            const seaDist = (1 - corr) / 2;
            const normKDiff = kDiff / 0.5; 
            const distance = (normKDiff * 0.4) + (seaDist * 0.6);
            return { store: s, distance, corr, kDiff };
        });

        return scored.sort((a,b) => a.distance - b.distance).slice(0, 3);
    }, [currentStore, allStores]);


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
                {simMode && <Line type="monotone" dataKey="simulated" stroke="#9333EA" strokeWidth={3} dot={false} name="Simulation (24mo Adjust)" animationDuration={300} />}
                <Line type="monotone" dataKey="actual" stroke="#1A1A1A" strokeWidth={2} dot={{r:2, fill:'#1A1A1A'}} name="実績" />
                <Scatter dataKey="outlier" fill="#EF4444" name="外れ値 (除外)" shape="cross" />
                <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" />
            </ComposedChart>
        </ResponsiveContainer>
    ), [chartData, simMode, unitLabel, valueFormatter, confidence]);

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
            {/* Store List Sidebar */}
            <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="p-6 bg-white border-b border-gray-100">
                    <input 
                        type="text" 
                        placeholder="店舗名検索..." 
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl text-xs outline-none focus:ring-2 focus:ring-[#005EB8] font-bold text-gray-600 placeholder-gray-400 transition-all mb-3"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    
                    {/* Block Filter Dropdown */}
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
                    {filteredStores.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400 font-bold">
                            該当する店舗が見つかりません
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="lg:w-3/4 flex flex-col gap-6 h-full overflow-y-auto pr-2 pb-20">
                {currentStore ? (
                    <>
                         {/* Header */}
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
                             
                             {/* Tab Navigation */}
                             <div className="flex bg-white rounded-full p-1 shadow-sm overflow-x-auto max-w-full">
                                <button onClick={() => setActiveTab('forecast')} className={tabClass('forecast')}>予測</button>
                                <button onClick={() => setActiveTab('analysis')} className={tabClass('analysis')}>詳細分析</button>
                                <button onClick={() => setActiveTab('ai')} className={tabClass('ai')}>AI診断</button>
                             </div>
                         </div>

                         {/* --- TAB 1: FORECAST (MAIN) --- */}
                         {activeTab === 'forecast' && (
                             <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col h-[600px] min-h-[600px] relative group animate-fadeIn">
                                 <ExpandButton target="main" />
                                 <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display flex items-center">
                                        実績 & AI予測 (Logistic Growth)
                                        <HelpTooltip title="AI予測グラフ" content="過去の実績（黒線）とAIによる将来予測（青線）を表示します。シミュレーションモードをONにすると、L（規模）やk（成長速度）を変更した場合のシナリオを描画できます。" />
                                    </h3>
                                    <div className="flex items-center gap-4 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                                        {/* Prediction Interval Selector */}
                                        <div className="flex items-center gap-2 border-r border-gray-300 pr-4 mr-1">
                                            <span className="text-[10px] font-bold text-gray-500">信頼区間:</span>
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
                                            <span className="text-xs font-bold text-gray-600">Simulation Mode</span>
                                        </label>
                                    </div>
                                 </div>
                                 
                                 {simMode && (
                                    <div className="absolute top-16 right-6 z-10 bg-white/90 p-4 rounded-xl border border-purple-100 shadow-lg w-64 backdrop-blur-sm">
                                        <h4 className="text-[10px] font-black text-purple-600 uppercase mb-3">Parameter Adjustment</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex justify-between text-[10px] font-bold mb-1">
                                                    <span>Potential (L)</span>
                                                    <span>x{simL.toFixed(2)}</span>
                                                </div>
                                                <input type="range" min="0.5" max="2.0" step="0.05" value={simL} onChange={(e) => setSimL(parseFloat(e.target.value))} className="w-full accent-purple-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-[10px] font-bold mb-1">
                                                    <span>Growth (k)</span>
                                                    <span>x{simK.toFixed(2)}</span>
                                                </div>
                                                <input type="range" min="0.5" max="2.0" step="0.05" value={simK} onChange={(e) => setSimK(parseFloat(e.target.value))} className="w-full accent-purple-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                            </div>
                                        </div>
                                    </div>
                                 )}

                                 <div className="flex-1 w-full">
                                     {renderMainChart()}
                                 </div>
                             </div>
                         )}

                         {/* --- TAB 2: ANALYSIS (Combined) --- */}
                         {activeTab === 'analysis' && (
                             <div className="space-y-8 animate-fadeIn">
                                 {/* Section 1: Decomposition */}
                                 <div>
                                     <h3 className="text-lg font-black text-slate-800 border-b pb-2 mb-4 font-display flex items-center gap-2">
                                         1. 要因分解 (Factor Decomposition)
                                         <HelpTooltip title="要因分解" content="売上の変動要因を「トレンド」「季節性」「ノイズ」に分解し、個別に評価します。" />
                                     </h3>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                         {/* Trend */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-orange-400">トレンド (Trend Component)</h4>
                                             <div className="flex-1">{renderStlTrend()}</div>
                                         </div>
                                         
                                         {/* Z-Chart */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="zchart" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-[#005EB8]">Zチャート (移動年計)</h4>
                                             <div className="flex-1">{renderZChart()}</div>
                                         </div>

                                         {/* Seasonal */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-green-500">季節性 (Seasonality)</h4>
                                             <div className="flex-1">{renderStlSeasonal()}</div>
                                         </div>

                                         {/* Residual */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] flex flex-col relative group">
                                             <ExpandButton target="stl" />
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display text-red-400">残差 (Residuals / Noise)</h4>
                                             <div className="flex-1">{renderStlResidual()}</div>
                                         </div>
                                     </div>
                                 </div>

                                 {/* Section 2: Patterns & Similarity */}
                                 <div>
                                     <h3 className="text-lg font-black text-slate-800 border-b pb-2 mb-4 font-display flex items-center gap-2">
                                         2. 特性・類似分析 (Patterns & Similarity)
                                         <HelpTooltip title="特性・類似分析" content="いつ売れるか（ヒートマップ）や、どの店と似ているか（類似店舗）を分析し、施策の横展開に役立てます。" />
                                     </h3>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                         {/* Heatmap */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 relative group h-[400px] flex flex-col">
                                            <ExpandButton target="heatmap" />
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">月次ヒートマップ</h4>
                                            <div className="flex-1 overflow-auto">
                                                <table className="w-full text-center text-[10px] border-collapse">
                                                    <thead>
                                                        <tr>
                                                            <th className="p-1 text-gray-400">Year</th>
                                                            {[...Array(12)].map((_, i) => <th key={i} className="p-1 text-gray-400">{i + 1}</th>)}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {heatmapData.grid.map(row => (
                                                            <tr key={row.year}>
                                                                <td className="font-bold text-gray-600 border-r border-gray-100 p-1">{row.year}</td>
                                                                {row.months.map((val, i) => {
                                                                    const intensity = val ? val / heatmapData.maxVal : 0;
                                                                    const bg = val ? `rgba(0, 94, 184, ${Math.max(0.1, intensity)})` : '#f8fafc';
                                                                    const text = intensity > 0.6 ? 'white' : 'gray';
                                                                    return (
                                                                        <td key={i} className="p-1">
                                                                            <div style={{ backgroundColor: bg, color: text }} className="rounded w-full h-full py-1 text-[9px] font-bold flex items-center justify-center">
                                                                                {val ? (val/1000).toFixed(1) : '-'}
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                         </div>

                                         {/* Similar Stores */}
                                         <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] overflow-auto">
                                             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">類似特性を持つ店舗 (Similar DNA)</h4>
                                             <div className="space-y-3">
                                                 {similarStores.map((item, i) => (
                                                     <div key={item.store.name} 
                                                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors cursor-pointer group border border-gray-100 hover:border-blue-200"
                                                        onClick={() => setSelectedStore(item.store.name)}
                                                     >
                                                         <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-[#005EB8] shadow-sm text-xs border border-gray-100">
                                                             {i + 1}
                                                         </div>
                                                         <div className="flex-1">
                                                             <div className="flex justify-between items-center mb-1">
                                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-[#005EB8]">{item.store.name}</span>
                                                                 <span className="text-[10px] font-black text-white bg-[#005EB8] px-2 py-0.5 rounded-full">
                                                                     Sim: {Math.round((1 - item.distance)*100)}%
                                                                 </span>
                                                             </div>
                                                             <div className="flex gap-4 text-[10px] text-gray-500 mt-2">
                                                                 <span className="bg-white px-2 py-1 rounded border border-gray-200">成長率差: {item.kDiff.toFixed(3)}</span>
                                                                 <span className="bg-white px-2 py-1 rounded border border-gray-200">季節相関: {item.corr.toFixed(2)}</span>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 ))}
                                                 {similarStores.length === 0 && (
                                                     <div className="text-center text-xs text-gray-400 py-8 italic">類似店舗が見つかりませんでした</div>
                                                 )}
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         )}

                         {/* --- TAB 4: AI REPORT --- */}
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
                                         <div className="absolute top-0 right-0 p-4 opacity-10">
                                             <svg className="w-64 h-64 text-purple-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                                         </div>
                                         <div className="prose prose-sm max-w-none text-slate-700 bg-white/80 p-6 rounded-2xl backdrop-blur-md border border-purple-50 shadow-sm" dangerouslySetInnerHTML={{ __html: marked(aiReport) }} />
                                     </div>
                                 ) : (
                                     <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl h-[400px] flex flex-col items-center justify-center text-slate-400">
                                         <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                         <p className="text-sm font-bold">「レポートを生成」ボタンを押してAI診断を開始してください</p>
                                     </div>
                                 )}
                             </div>
                         )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest h-full">
                        <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        <p>左のリストから店舗を選択してください</p>
                    </div>
                )}
            </div>

            {/* Fullscreen Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">
                            {expandedChart === 'main' && '実績 & AI予測 詳細'}
                            {expandedChart === 'stl' && 'STL分解 (Trend/Season/Residual)'}
                            {expandedChart === 'zchart' && 'Zチャート (移動年計)'}
                            {expandedChart === 'heatmap' && '月次ヒートマップ'}
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4 overflow-auto">
                        {expandedChart === 'main' && renderMainChart()}
                        {expandedChart === 'stl' && (
                            <div className="flex flex-col h-full gap-4">
                                <div className="flex-1">{renderStlTrend()}</div>
                                <div className="flex-1">{renderStlSeasonal()}</div>
                                <div className="flex-1">{renderStlResidual()}</div>
                            </div>
                        )}
                        {expandedChart === 'zchart' && renderZChart()}
                        {expandedChart === 'heatmap' && (
                             <table className="w-full text-center text-xs border-collapse">
                                <thead>
                                    <tr>
                                        <th className="p-2 text-gray-500">Year</th>
                                        {[...Array(12)].map((_, i) => <th key={i} className="p-2 text-gray-500">{i + 1}月</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {heatmapData.grid.map(row => (
                                        <tr key={row.year}>
                                            <td className="font-bold text-gray-700 border p-2">{row.year}</td>
                                            {row.months.map((val, i) => {
                                                const intensity = val ? val / heatmapData.maxVal : 0;
                                                const bg = val ? `rgba(0, 94, 184, ${Math.max(0.1, intensity)})` : '#f8fafc';
                                                const text = intensity > 0.6 ? 'white' : 'black';
                                                return (
                                                    <td key={i} style={{ backgroundColor: bg, color: text }} className="border p-2 font-bold">
                                                        {val ? val.toLocaleString() : '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StoreAnalysisView;
