
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { StoreData, ChartDataPoint } from '../types';
import { logisticModel, calculatePearsonCorrelation } from '../services/analysisEngine';
import { generateStoreReport } from '../services/geminiService';
import { marked } from 'marked';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Brush, Bar, Legend, ReferenceLine, ScatterChart, Scatter, Cell
} from 'recharts';

interface StoreAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    forecastMonths: number;
}

const StoreAnalysisView: React.FC<StoreAnalysisViewProps> = ({ allStores, forecastMonths }) => {
    const [selectedStore, setSelectedStore] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'main' | 'stl' | 'zchart' | 'heatmap' | 'model'>('main');
    const [confidence, setConfidence] = useState(95);
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    
    // Simulation State
    const [simMode, setSimMode] = useState(false);
    const [simL, setSimL] = useState(1.0); // Multiplier for L
    const [simK, setSimK] = useState(1.0); // Multiplier for k

    const storeNames = Object.keys(allStores).sort();
    const filteredStores = storeNames.filter(n => n.toLowerCase().includes(searchTerm.toLowerCase()));

    const currentStore = selectedStore ? allStores[selectedStore] : null;

    useEffect(() => {
        if (!selectedStore && storeNames.length > 0) {
            setSelectedStore(storeNames[0]);
        }
    }, [allStores, storeNames, selectedStore]);

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
        const data: (ChartDataPoint & { simulated?: number | null })[] = [];

        // Historical
        d.dates.forEach((date, i) => {
            data.push({
                date,
                actual: d.mask[i] ? d.raw[i] : null,
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
            
            // Standard Forecast (Base)
            const tr = logisticModel(idx, d.fit.params, d.fit.mode, d.fit.shockIdx);
            const baseValRaw = (tr * (d.seasonal[fd.getMonth()] || 1.0)) + (d.nudge * Math.pow(decay, t));
            const unc = d.stdDev * (1 + t * 0.05);
            
            const baseVal = baseValRaw < 0 ? 0 : baseValRaw;
            const upper = Math.max(0, baseVal + z * unc);
            const lower = Math.max(0, baseVal - z * unc);

            // Simulation Forecast (Gradual Transition)
            let simVal: number | null = null;
            if (simMode) {
                // 1. Calculate Target Value with Modified Params
                const simParams = { ...d.fit.params };
                if (d.fit.mode === 'shift' || d.fit.mode === 'recovery') {
                    simParams.L_post *= simL;
                } else {
                    simParams.L *= simL;
                }
                simParams.k *= simK;

                const trSim = logisticModel(idx, simParams, d.fit.mode, d.fit.shockIdx);
                let targetVal = (trSim * (d.seasonal[fd.getMonth()] || 1.0)) + (d.nudge * Math.pow(decay, t));
                if (targetVal < 0) targetVal = 0;

                // 2. Interpolate from Base to Target over 24 months
                const transitionMonths = 24;
                const progress = Math.min(t / transitionMonths, 1.0);
                
                // Linear interpolation:
                // t=0 (current) -> 0% change
                // t=24 (2 years) -> 100% change (Full Target)
                simVal = baseVal + (targetVal - baseVal) * progress;
                
                if (simVal < 0) simVal = 0;
            }

            data.push({
                date: label,
                actual: null,
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
        
        // Z-Chart must show exactly the last 12 months to form the 'Z' shape
        const len = currentStore.dates.length;
        if (len < 12) return []; // Not enough data for Z-Chart

        const start = len - 12;
        const slicedRaw = currentStore.stats.zChart.slice(start);
        const slicedDates = currentStore.dates.slice(start);

        // Calculate Cumulative Sales STARTING from the first month of this 12-month window
        // This is crucial for the diagonal line of the Z-chart
        let runningTotal = 0;
        
        return slicedRaw.map((d, i) => {
            runningTotal += d.monthly;
            return {
                date: slicedDates[i],
                monthly: d.monthly,
                cumulative: runningTotal, // Starts at month 1 value, ends at MAT value
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
            if(!currentStore.mask[i]) return;
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

    // --- Similar Store Logic ---
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

    // --- Chart Renderers ---
    const renderMainChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:5, right:10, bottom:0, left:0}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                <XAxis dataKey="date" tick={{fontSize:9}} minTickGap={30} tickMargin={10} />
                <YAxis tick={{fontSize:9}} label={{ value: '売上 (千円)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                <Tooltip formatter={(val: number) => val.toLocaleString() + '千円'} labelStyle={{color:'black'}} contentStyle={{borderRadius:'16px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                {!simMode && <Area type="monotone" dataKey="range" fill="#005EB8" fillOpacity={0.1} stroke="transparent" name="信頼区間" />}
                <Line type="monotone" dataKey="forecast" stroke="#005EB8" strokeWidth={3} strokeDasharray={simMode ? "3 3" : "0"} dot={false} name="AI予測 (Base)" strokeOpacity={simMode ? 0.5 : 1} />
                {simMode && <Line type="monotone" dataKey="simulated" stroke="#9333EA" strokeWidth={3} dot={false} name="Simulation (24mo Adjust)" animationDuration={300} />}
                <Line type="monotone" dataKey="actual" stroke="#1A1A1A" strokeWidth={2} dot={{r:2, fill:'#1A1A1A'}} name="実績" />
                <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" />
            </ComposedChart>
        </ResponsiveContainer>
    ), [chartData, simMode]);

    const renderStlTrend = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stlData}>
                <Line type="monotone" dataKey="trend" stroke="#F59E0B" strokeWidth={3} dot={false} />
                <XAxis dataKey="date" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip formatter={(val: number) => val.toLocaleString() + '千円'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
            </LineChart>
        </ResponsiveContainer>
    ), [stlData]);

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
                <Tooltip formatter={(val: number) => val.toLocaleString() + '千円'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
            </LineChart>
        </ResponsiveContainer>
    ), [stlData]);

    const renderZChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={zChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{fontSize:9}} />
                <YAxis yAxisId="left" tick={{fontSize:9}} />
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:9}} />
                <Tooltip formatter={(val: number) => val.toLocaleString() + '千円'} />
                <Legend />
                <Bar yAxisId="left" dataKey="monthly" name="月次売上" fill="#93C5FD" barSize={20} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="累積売上" stroke="#F59E0B" strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="mat" name="移動年計 (MAT)" stroke="#005EB8" strokeWidth={3} />
            </ComposedChart>
        </ResponsiveContainer>
    ), [zChartData]);


    return (
        <div className="absolute inset-0 flex flex-col lg:flex-row gap-6 p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            {/* Store List Sidebar */}
            <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="p-6 bg-white border-b border-gray-100">
                    <input 
                        type="text" 
                        placeholder="店舗名検索..." 
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl text-xs outline-none focus:ring-2 focus:ring-[#005EB8] font-bold text-gray-600 placeholder-gray-400 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {filteredStores.map(n => (
                        <button
                            key={n}
                            onClick={() => setSelectedStore(n)}
                            className={`w-full text-left padding-3 px-5 py-3 rounded-2xl text-xs font-bold transition-all transform hover:scale-[1.02] ${selectedStore === n ? 'bg-[#005EB8] text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <div className="flex justify-between items-center">
                                <span>{n}</span>
                                {!allStores[n].isActive && <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded uppercase backdrop-blur-sm">閉店</span>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="lg:w-3/4 flex flex-col gap-6 h-full overflow-y-auto pr-2">
                {currentStore ? (
                    <>
                        {/* Header */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 flex justify-between items-center flex-shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tight font-display">{currentStore.name}</h2>
                                <div className="flex gap-2 mt-2">
                                    {!currentStore.isActive && <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-[10px] font-black uppercase">非稼働 (Inactive)</span>}
                                    {currentStore.fit.mode === 'shift' && <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">構造変化 (Shift)</span>}
                                    {currentStore.fit.mode === 'recovery' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">回復期 (Recovery)</span>}
                                    {currentStore.fit.mode === 'startup' && <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">新規店 (Startup)</span>}
                                </div>
                            </div>
                            <div className="flex gap-8 text-right font-black font-display">
                                <div><p className="text-[9px] text-gray-400 uppercase mb-1">直近適合精度 (StdDev)</p><p className="text-4xl text-[#005EB8] leading-none tracking-tighter">{Math.round(currentStore.stdDev).toLocaleString()}<span className="text-xs ml-1 text-gray-400">千円</span></p></div>
                                <div><p className="text-[9px] text-gray-400 uppercase mb-1">ABC Rank</p><p className={`text-4xl leading-none tracking-tighter ${currentStore.stats?.abcRank === 'A' ? 'text-yellow-400' : 'text-gray-400'}`}>{currentStore.stats?.abcRank || '-'}</p></div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="w-full overflow-x-auto pb-2 flex-shrink-0 relative z-10">
                            <div className="flex bg-gray-100/50 p-1 rounded-full w-max mx-auto lg:mx-0 whitespace-nowrap">
                                {['main', 'stl', 'zchart', 'heatmap', 'model'].map(t => (
                                    <button 
                                        key={t}
                                        className={`uppercase text-[10px] font-black py-2 px-6 rounded-full transition-all font-display ${activeTab === t ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        onClick={() => setActiveTab(t as any)}
                                    >
                                        {t === 'main' ? '予測詳細 (FORECAST)' : t === 'stl' ? '要因分解 (DECOMP)' : t === 'zchart' ? 'Zチャート' : t === 'heatmap' ? 'ヒートマップ' : 'モデル診断'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-6">
                            {activeTab === 'main' && (
                                <div className="animate-fadeIn">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                        <div className="flex items-center gap-4">
                                            <h3 className="font-black text-gray-700 text-[11px] uppercase tracking-[0.2em] font-display">予測分布 (Prediction Distribution)</h3>
                                            <button 
                                                onClick={() => setSimMode(!simMode)} 
                                                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 border ${simMode ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                                What-If シミュレーション
                                            </button>
                                        </div>

                                        {simMode ? (
                                            <div className="flex flex-wrap items-center gap-4 bg-purple-50 px-4 py-2 rounded-xl border border-purple-100 w-full md:w-auto animate-fadeIn">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-purple-700 uppercase">潜在需要 (L)</span>
                                                    <input 
                                                        type="range" min="0.8" max="1.5" step="0.05" 
                                                        value={simL} onChange={(e) => setSimL(parseFloat(e.target.value))} 
                                                        className="w-24 accent-purple-600" 
                                                    />
                                                    <span className="text-xs font-black text-purple-600 w-12 text-right">{Math.round(simL * 100)}%</span>
                                                </div>
                                                <div className="w-px h-4 bg-purple-200 hidden md:block"></div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-purple-700 uppercase">成長速度 (k)</span>
                                                    <input 
                                                        type="range" min="0.5" max="2.0" step="0.1" 
                                                        value={simK} onChange={(e) => setSimK(parseFloat(e.target.value))} 
                                                        className="w-24 accent-purple-600" 
                                                    />
                                                    <span className="text-xs font-black text-purple-600 w-12 text-right">{Math.round(simK * 100)}%</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 bg-gray-50 px-5 py-2 rounded-full border border-gray-200">
                                                <span className="text-[10px] font-black text-gray-500 uppercase font-display">信頼区間:</span>
                                                <input type="range" min="50" max="99" value={confidence} onChange={(e) => setConfidence(parseInt(e.target.value))} className="w-24 accent-[#005EB8]" />
                                                <span className="text-sm font-black text-[#005EB8] w-10 text-right font-display">{confidence}%</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="h-[320px] w-full relative group">
                                        <ExpandButton target="mainForecast" />
                                        {renderMainChart()}
                                        {simMode && <div className="absolute top-2 right-14 bg-purple-100 text-purple-800 text-[9px] font-black px-2 py-1 rounded border border-purple-200 animate-pulse">Simulation Active</div>}
                                    </div>
                                    <div className="grid grid-cols-4 gap-4 pt-8 border-t border-dashed border-gray-100 mt-4 text-center font-black font-display">
                                        <div><p className="text-[9px] font-black text-gray-400 uppercase mb-1">成長速度 (k)</p><p className="text-xl text-orange-500">{currentStore.params.k.toFixed(3)}</p></div>
                                        <div><p className="text-[9px] font-black text-gray-400 uppercase mb-1">潜在需要 (L)</p><p className="text-xl text-[#005EB8]">{Math.round(currentStore.params.L).toLocaleString()}<span className="text-xs text-gray-400 ml-1">千円</span></p></div>
                                        <div><p className="text-[9px] font-black text-gray-400 uppercase mb-1">残差標準偏差</p><p className="text-xl font-black text-gray-600">{Math.round(currentStore.stdDev).toLocaleString()}<span className="text-xs text-gray-400 ml-1">千円</span></p></div>
                                        <div><p className="text-[9px] font-black text-gray-400 uppercase mb-1">年平均成長率</p><p className="text-xl font-black text-green-500">{(currentStore.stats?.cagr ? currentStore.stats.cagr * 100 : 0).toFixed(1)}%</p></div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'stl' && (
                                <div className="space-y-6 animate-fadeIn">
                                    <div className="bg-gray-50 rounded-2xl p-4 h-[200px] relative group">
                                        <ExpandButton target="stlTrend" />
                                        <h3 className="font-black text-gray-700 text-[10px] uppercase mb-2 font-display">トレンド要因 (Trend Component)</h3>
                                        {renderStlTrend()}
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 h-[200px] relative group">
                                        <ExpandButton target="stlSeasonal" />
                                        <h3 className="font-black text-gray-700 text-[10px] uppercase mb-2 font-display">季節要因 (Seasonal Component)</h3>
                                        {renderStlSeasonal()}
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl p-4 h-[200px] relative group">
                                        <ExpandButton target="stlResidual" />
                                        <h3 className="font-black text-gray-700 text-[10px] uppercase mb-2 font-display">不規則変動・残差 (Residual / Irregular)</h3>
                                        {renderStlResidual()}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'zchart' && (
                                <div className="animate-fadeIn">
                                    <h3 className="font-black text-gray-700 text-[11px] uppercase tracking-[0.2em] font-display mb-6">Zチャート (直近12ヶ月トレンド分析)</h3>
                                    <div className="h-[400px] w-full relative group">
                                        <ExpandButton target="zchart" />
                                        {renderZChart()}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-4 text-center">※ 移動年計(MAT)が右肩上がりであれば、季節変動を除いても成長トレンドにあると判断できます。</p>
                                </div>
                            )}

                            {activeTab === 'heatmap' && (
                                <div className="animate-fadeIn">
                                    <h3 className="font-black text-gray-700 text-[11px] uppercase tracking-[0.2em] font-display mb-6">月次売上ヒートマップ</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-center border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="p-2 text-xs font-black text-gray-400">Year</th>
                                                    {[...Array(12)].map((_, i) => <th key={i} className="p-2 text-xs font-black text-gray-600">{i + 1}月</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {heatmapData.grid.map(row => (
                                                    <tr key={row.year}>
                                                        <td className="p-2 text-xs font-bold text-gray-500">{row.year}</td>
                                                        {row.months.map((val, i) => {
                                                            const ratio = val ? val / heatmapData.maxVal : 0;
                                                            const bg = val ? `rgba(0, 94, 184, ${ratio})` : '#f8fafc';
                                                            const color = ratio > 0.6 ? 'white' : 'black';
                                                            return (
                                                                <td key={i} className="p-1 border border-white">
                                                                    <div style={{ backgroundColor: bg, color }} className="w-full h-10 flex items-center justify-center text-[10px] font-bold rounded">
                                                                        {val ? val.toLocaleString() : '-'}
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
                            )}

                            {activeTab === 'model' && (
                                <div className="animate-fadeIn space-y-8">
                                    {/* Similar Stores */}
                                    <div>
                                        <h3 className="font-black text-gray-700 text-[11px] uppercase tracking-[0.2em] font-display mb-4">類似店舗 (Nearest Neighbors)</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {similarStores.map((s, i) => (
                                                <div key={i} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedStore(s.store.name)}>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="font-black text-[#005EB8]">{s.store.name}</span>
                                                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Sim: {((1 - s.distance)*100).toFixed(0)}%</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 space-y-1">
                                                        <p>成長率(k): {s.store.params.k.toFixed(3)} (Diff: {s.kDiff.toFixed(3)})</p>
                                                        <p>季節相関: {s.corr.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Gemini AI Report */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-black text-slate-700 text-[11px] uppercase tracking-[0.2em] font-display">AI 戦略コンサルタント (Gemini 2.5)</h3>
                                            <button 
                                                onClick={handleGenerateAI} 
                                                disabled={aiLoading}
                                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {aiLoading ? (
                                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                                )}
                                                分析レポート生成
                                            </button>
                                        </div>
                                        
                                        {aiReport ? (
                                            <div className="prose prose-sm max-w-none text-slate-700 bg-white p-6 rounded-xl shadow-inner border border-slate-100" dangerouslySetInnerHTML={{ __html: marked(aiReport) }} />
                                        ) : (
                                            <div className="text-center py-8 text-slate-400 text-sm">
                                                「分析レポート生成」ボタンを押すと、AIが店舗データを分析し、<br/>具体的な戦略アドバイスを提供します。
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest bg-white rounded-3xl border border-dashed border-gray-200 m-8">
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
                            {expandedChart === 'mainForecast' && '予測詳細 (Prediction Distribution)'}
                            {expandedChart === 'stlTrend' && 'トレンド要因 (Trend)'}
                            {expandedChart === 'stlSeasonal' && '季節要因 (Seasonal)'}
                            {expandedChart === 'stlResidual' && '残差 (Residual)'}
                            {expandedChart === 'zchart' && 'Zチャート (Z-Chart)'}
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                        {expandedChart === 'mainForecast' && renderMainChart()}
                        {expandedChart === 'stlTrend' && renderStlTrend()}
                        {expandedChart === 'stlSeasonal' && renderStlSeasonal()}
                        {expandedChart === 'stlResidual' && renderStlResidual()}
                        {expandedChart === 'zchart' && renderZChart()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StoreAnalysisView;
