
import React, { useMemo, useState, useEffect } from 'react';
import { StoreData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, Legend, LabelList, ComposedChart, Line, ScatterChart, Scatter,
    ReferenceLine, AreaChart, Area, PieChart, Pie, Treemap, RadarChart, PolarGrid, PolarAngleAxis, Radar, FunnelChart, Funnel
} from 'recharts';

interface RegionalSpotAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type ScopeType = 'region' | 'prefecture' | 'block';
type SortField = 'name' | 'val' | 'yoy' | 'mom' | 'momentum';
type SortOrder = 'asc' | 'desc';

// Gini Coefficient Helper
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const RegionalSpotAnalysisView: React.FC<RegionalSpotAnalysisViewProps> = ({ allStores, dataType }) => {
    // --- State ---
    const [scopeType, setScopeType] = useState<ScopeType>('region');
    const [selectedArea, setSelectedArea] = useState<string>("");
    
    const [activeTab, setActiveTab] = useState<'overview' | 'geography' | 'detail'>('overview');
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('val');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filterText, setFilterText] = useState("");

    const isSales = dataType === 'sales';
    const unitS = isSales ? 'k' : '人';
    
    // --- Data Preparation ---
    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);

    const allMonths = useMemo(() => {
        const monthSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => monthSet.add(d.replace(/\//g, '-'))));
        return Array.from(monthSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [stores]);

    const [selectedMonth, setSelectedMonth] = useState<string>(allMonths[0] || "");
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    // Dynamic Lists for Dropdown
    const areaOptions = useMemo(() => {
        const set = new Set<string>();
        stores.forEach(s => {
            if (scopeType === 'region' && s.region) set.add(s.region);
            if (scopeType === 'prefecture' && s.prefecture) set.add(s.prefecture);
            if (scopeType === 'block' && s.block) set.add(s.block);
        });
        return Array.from(set).sort();
    }, [stores, scopeType]);

    // Initial Selection
    useEffect(() => {
        if (areaOptions.length > 0 && !areaOptions.includes(selectedArea)) {
            setSelectedArea(areaOptions[0]);
        }
    }, [areaOptions, selectedArea]);

    // --- Core Filtering & Aggregation ---
    const monthlyStats = useMemo(() => {
        if (!selectedMonth || !selectedArea) return null;

        // 1. Filter Target Stores
        const targetStores = stores.filter(s => {
            if (scopeType === 'region') return s.region === selectedArea;
            if (scopeType === 'prefecture') return s.prefecture === selectedArea;
            if (scopeType === 'block') return s.block === selectedArea;
            return false;
        });

        // 2. Aggregate Stats (Based on SpotAnalysisView logic)
        const storePerformances: any[] = [];
        let total = 0, totalPrevYear = 0, totalPrevMonth = 0;
        
        // Variance Analysis Buckets
        let varianceNewStore = 0;
        let varianceExistingGrowth = 0;
        let varianceExistingDecline = 0;
        let varianceClosed = 0; // If tracking closed stores explicitly (requires closed store data)

        const selDate = new Date(selectedMonth);
        const prevMonthDate = new Date(selDate); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevYearDate = new Date(selDate); prevYearDate.setFullYear(prevYearDate.getFullYear() - 1);
        const prevYearStr = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;

        // Aggregation Containers for Geography
        const breakdownMap = new Map<string, any>(); // Dynamic breakdown based on scope

        targetStores.forEach(s => {
            const normalizedDates = s.dates.map(d => d.replace(/\//g, '-'));
            const idx = normalizedDates.indexOf(selectedMonth);
            const idxPY = normalizedDates.indexOf(prevYearStr);
            const idxPM = normalizedDates.indexOf(prevMonthStr);

            if (idx !== -1 || idxPY !== -1 || idxPM !== -1) {
                const val = idx !== -1 ? s.raw[idx] : 0; 
                const valPY = idxPY !== -1 ? s.raw[idxPY] : 0;
                const valPM = idxPM !== -1 ? s.raw[idxPM] : 0;

                total += val; totalPrevYear += valPY; totalPrevMonth += valPM;

                // Variance Logic
                const diff = val - valPY;
                if (val > 0 && valPY === 0) varianceNewStore += diff;
                else if (val === 0 && valPY > 0) varianceClosed += diff;
                else if (diff > 0) varianceExistingGrowth += diff;
                else varianceExistingDecline += diff;

                const yoy = valPY > 0 ? ((val - valPY) / valPY) * 100 : null;
                const mom = valPM > 0 ? ((val - valPM) / valPM) * 100 : null;
                const momentum = (yoy !== null && mom !== null) ? (yoy + mom) / 2 : null;
                const lUtilization = s.params.L > 0 ? (val / s.params.L) * 100 : 0;

                const sData = {
                    name: s.name, region: s.region, block: s.block, pref: s.prefecture,
                    val, yoy, mom, momentum, lUtilization, isActiveNow: s.isActive && val > 0, age: s.raw.length,
                    rank: s.stats?.abcRank || 'C', cv: (s.stats?.cv || 0) * 100, contribution: val - valPY,
                    k: s.params.k, L: s.params.L
                };

                if (val > 0 || valPY > 0) {
                    storePerformances.push(sData);
                    
                    // Determine Breakdown Key
                    let breakdownKey = sData.name; // Default to store
                    if (scopeType === 'region') breakdownKey = sData.pref || "Unknown";
                    else if (scopeType === 'prefecture') breakdownKey = sData.block || "Unknown";
                    else if (scopeType === 'block') breakdownKey = sData.name;

                    if (!breakdownMap.has(breakdownKey)) {
                        breakdownMap.set(breakdownKey, { name: breakdownKey, val: 0, prevVal: 0, count: 0, values: [], riskCount: 0, kValues: [], lValues: [] });
                    }
                    const e = breakdownMap.get(breakdownKey)!;
                    e.val += val; e.prevVal += valPY;
                    if (val > 0) { 
                        e.count++; 
                        e.values.push(val); 
                        e.kValues.push(s.params.k);
                        e.lValues.push(s.params.L);
                    }
                    if (val > 0 && yoy !== null && yoy < 0) e.riskCount++;
                }
            }
        });

        // Process Breakdown Data
        const breakdownData = Array.from(breakdownMap.values()).map(v => ({
            ...v,
            yoy: v.prevVal > 0 ? ((v.val - v.prevVal) / v.prevVal) * 100 : null,
            avg: v.count > 0 ? v.val / v.count : 0,
            gini: calculateGini(v.values),
            riskRate: v.count > 0 ? (v.riskCount / v.count) * 100 : 0,
            avgK: v.kValues.length > 0 ? v.kValues.reduce((a:number,b:number)=>a+b,0)/v.kValues.length : 0,
            avgL: v.lValues.length > 0 ? v.lValues.reduce((a:number,b:number)=>a+b,0)/v.lValues.length : 0
        })).sort((a, b) => b.val - a.val);

        const activePerf = storePerformances.filter(s => s.isActiveNow);
        const distributionData = Object.entries(activePerf.reduce((acc: any, s) => {
            const b = `${Math.floor(s.val / 500) * 500}~`;
            acc[b] = (acc[b] || 0) + 1; return acc;
        }, {})).map(([range, count]) => ({ range, count }));

        const momentumDist = Object.entries(activePerf.filter(s => s.momentum !== null).reduce((acc: any, s) => {
            const b = `${Math.floor((s.momentum || 0) / 5) * 5}%`;
            acc[b] = (acc[b] || 0) + 1; return acc;
        }, {})).map(([range, count]) => ({ range, count }));

        // Rank Data for Pie
        const rankData = ['A', 'B', 'C'].map(r => ({ name: `Rank ${r}`, value: activePerf.filter(s => s.rank === r).length }));

        // Lorenz Data (for active stores in this scope)
        const sortedSales = activePerf.map(s => s.val).sort((a,b) => a - b);
        const totalSales = sortedSales.reduce((a,b) => a+b, 0);
        const lorenzData = [{p: 0, w: 0, perfect: 0}];
        let cumS = 0;
        sortedSales.forEach((v, i) => {
            cumS += v;
            const p = ((i+1)/sortedSales.length)*100;
            const w = (cumS/totalSales)*100;
            lorenzData.push({ p, w, perfect: p });
        });

        // Variance Waterfall Data
        const varianceData = [
            { name: '昨年度実績', val: totalPrevYear, type: 'base' },
            { name: '既存店成長', val: varianceExistingGrowth, type: 'plus' },
            { name: '新規店効果', val: varianceNewStore, type: 'plus' },
            { name: '既存店減少', val: varianceExistingDecline, type: 'minus' },
            { name: '退店影響', val: varianceClosed, type: 'minus' },
            { name: '今年度実績', val: total, type: 'total' }
        ];

        // Zero-Sum Score (Internal Cannibalization Proxy)
        const totalAbsChange = activePerf.reduce((sum, s) => sum + Math.abs(s.contribution), 0);
        const netChange = Math.abs(total - totalPrevYear);
        const zeroSumScore = totalAbsChange > 0 ? 1 - (netChange / totalAbsChange) : 0;

        return {
            total, yoy: totalPrevYear > 0 ? ((total - totalPrevYear) / totalPrevYear) * 100 : null,
            mom: totalPrevMonth > 0 ? ((total - totalPrevMonth) / totalPrevMonth) * 100 : null,
            avg: activePerf.length > 0 ? total / activePerf.length : 0,
            storePerformances,
            activePerf,
            breakdownData,
            distributionData, momentumDist, rankData, lorenzData, varianceData,
            activeCount: activePerf.length,
            improvedCount: activePerf.filter(s => (s.mom || 0) > 0).length,
            declinedCount: activePerf.filter(s => (s.mom || 0) < 0).length,
            bestYoYStore: [...activePerf].filter(s => s.yoy !== null).sort((a,b) => b.yoy - a.yoy)[0],
            worstYoYStore: [...activePerf].filter(s => s.yoy !== null).sort((a,b) => a.yoy - b.yoy)[0],
            gini: calculateGini(activePerf.map(s => s.val)),
            zeroSumScore,
            medianVal: sortedSales[Math.floor(sortedSales.length/2)] || 0,
            stdDev: Math.sqrt(activePerf.reduce((s, x) => s + Math.pow(x.val - (total/activePerf.length), 2), 0) / activePerf.length) || 0
        };
    }, [selectedMonth, stores, scopeType, selectedArea]);

    const sortedFilteredStores = useMemo(() => {
        if (!monthlyStats) return [];
        let result = monthlyStats.storePerformances.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()));
        result.sort((a, b) => {
            let valA = a[sortField], valB = b[sortField];
            if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            valA = valA ?? -Infinity; valB = valB ?? -Infinity;
            return sortOrder === 'asc' ? valA - valB : valB - valA;
        });
        return result;
    }, [monthlyStats, sortField, sortOrder, filterText]);

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('desc'); }
    };

    const handleGenerateAI = async () => {
        if (!monthlyStats) return;
        setAiLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `QBハウス ${selectedMonth} エリア分析(${selectedArea})。昨対:${monthlyStats.yoy?.toFixed(1)}%。内訳数:${monthlyStats.breakdownData.length}。最大規模:${monthlyStats.breakdownData[0]?.name}。詳細を分析せよ。`;
        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setAiReport(res.text || "診断不可");
        } catch (e) { setAiReport("Error"); } finally { setAiLoading(false); }
    };

    const handleScopeChange = (type: ScopeType) => {
        setScopeType(type);
        setAiReport(null);
        // Reset selection will happen in useEffect based on new options
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <i className="fas fa-sort text-gray-200 ml-1 opacity-50"></i>;
        return sortOrder === 'asc' ? <i className="fas fa-sort-up ml-1 text-[#005EB8]"></i> : <i className="fas fa-sort-down ml-1 text-[#005EB8]"></i>;
    };

    if (!monthlyStats) return <div className="p-20 text-center font-black text-gray-300 animate-pulse">LOADING AREA DATA...</div>;

    const KpiCard = ({ title, value, sub, trend, color = "border-t-[#005EB8]", tooltip }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} animate-fadeIn flex flex-col justify-between h-full hover:shadow-md transition-shadow`}>
            <div>
                <p className="text-[8px] text-gray-400 font-black uppercase mb-1 tracking-widest truncate flex items-center gap-1">
                    {title}
                    {tooltip && <HelpTooltip title={title} content={tooltip} />}
                </p>
                <h3 className="text-xl font-black text-gray-800 truncate">{value}</h3>
            </div>
            <div className="flex justify-between items-end mt-2"><p className="text-[8px] text-gray-400 font-bold truncate">{sub}</p>{trend !== undefined && trend !== null && (<span className={`text-[9px] font-black ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{trend >= 0 ? '▲' : '▼'}{Math.abs(trend).toFixed(1)}%</span>)}</div>
        </div>
    );

    const ChartBox = ({ id, title, children, className = "", tooltipContent }: any) => (
        <div className={`bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 flex flex-col relative group transition-all hover:shadow-md ${className}`}>
            <button onClick={() => setExpandedItem(id)} className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-gray-100 text-gray-300 rounded-xl transition-all opacity-0 group-hover:opacity-100 z-10"><i className="fas fa-expand-alt text-[10px]"></i></button>
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                {title}
                {tooltipContent && <HelpTooltip title={title} content={tooltipContent} />}
            </h3>
            <div className="flex-1 w-full min-h-0">{children}</div>
        </div>
    );

    // --- Chart Renderers ---
    const renderBreakdownChart = () => <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.breakdownData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:8, fontWeight:'bold'}} angle={-30} textAnchor="end" height={40} /><YAxis yAxisId="left" tick={{fontSize:8}} /><YAxis yAxisId="right" orientation="right" tick={{fontSize:8}} /><Tooltip contentStyle={{borderRadius:'12px', border:'none'}} /><Bar yAxisId="left" dataKey="val" fill="#005EB8" radius={[4,4,0,0]} name="実績" /><Line yAxisId="right" type="monotone" dataKey="yoy" stroke="#10B981" strokeWidth={2} dot={{r:3}} name="昨対比" /></ComposedChart></ResponsiveContainer>;
    const renderDistChart = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.distributionData}><XAxis dataKey="range" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderScatterMatrix = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left: -20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><ReferenceLine y={0} stroke="#94a3b8" /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#005EB8" fillOpacity={0.4} /></ScatterChart></ResponsiveContainer>;
    const renderLUtilChart = () => <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyStats.activePerf.filter(s=>s.lUtilization<=200).sort((a,b)=>a.lUtilization-b.lUtilization)}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis hide /><YAxis tick={{fontSize:8}} unit="%" /><Tooltip /><Area type="monotone" dataKey="lUtilization" stroke="#005EB8" fill="#005EB8" fillOpacity={0.1} /><ReferenceLine y={100} stroke="#EF4444" strokeDasharray="3 3" /></AreaChart></ResponsiveContainer>;
    const renderWaterfall = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.varianceData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><ReferenceLine y={0} stroke="#000" /><Bar dataKey="val">{monthlyStats.varianceData.map((e,i)=><Cell key={i} fill={e.type === 'total' || e.type === 'base' ? '#64748B' : e.val > 0 ? '#10B981' : '#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;
    const renderGiniBar = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.breakdownData.sort((a,b)=>b.gini-a.gini).slice(0,10)}><XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="gini" fill="#EF4444" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderLorenz = () => <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyStats.lorenzData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="p" type="number" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Area type="monotone" dataKey="w" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} /><Line type="monotone" dataKey="perfect" stroke="#82ca9d" dot={false} /></AreaChart></ResponsiveContainer>;
    const renderRiskRate = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.breakdownData.sort((a,b)=>b.riskRate-a.riskRate).slice(0,15)}><XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} unit="%" /><Tooltip /><Bar dataKey="riskRate" fill="#F87171" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderAvgBar = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.breakdownData.sort((a,b)=>b.avg-a.avg)}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="avg" fill="#F59E0B" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    
    const renderChart = (id: string) => {
        switch(id) {
            case 'geo1': return renderBreakdownChart();
            case 'geo2': return renderDistChart();
            case 'geo3': return <div className="h-full overflow-y-auto text-[9px] text-gray-600 leading-relaxed custom-scrollbar">{aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} /> : "診断を開始してください"}</div>;
            case 'geo4': return renderScatterMatrix();
            case 'geo5': return renderLUtilChart();
            case 'geo6': return renderWaterfall();
            case 'dt1': return renderGiniBar();
            case 'dt2': return renderRiskRate();
            case 'dt3': return renderAvgBar();
            case 'dt4': return renderLorenz();
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            地域単月スポット分析
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-md border border-orange-200 uppercase font-black tracking-widest">{scopeType} View</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Regional Monthly Performance Snapshot</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SCOPE</span>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {(['region', 'prefecture', 'block'] as ScopeType[]).map(s => (
                                    <button key={s} onClick={() => handleScopeChange(s)} className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${scopeType === s ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>{s}</button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AREA</span>
                            <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} className="bg-transparent border-none text-sm font-black text-[#005EB8] outline-none cursor-pointer w-32">
                                {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>

                        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">MONTH</span>
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-sm font-black text-[#005EB8] outline-none cursor-pointer">
                                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {monthlyStats && (
                    <>
                        {/* KPI Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-fadeIn">
                            <KpiCard title="エリア総実績" value={`${monthlyStats.total.toLocaleString()}${unitS}`} sub={`${monthlyStats.activeCount}店稼働`} />
                            <KpiCard title="エリア昨対比 (YoY)" value={`${monthlyStats.yoy?.toFixed(1)}%`} sub="前年同期比" trend={monthlyStats.yoy} color="border-t-green-500" />
                            <KpiCard title="1店平均実績" value={`${Math.round(monthlyStats.avg).toLocaleString()}${unitS}`} sub="エリア平均" color="border-t-purple-500" />
                            <KpiCard title="MoM改善店舗数" value={`${monthlyStats.improvedCount}店`} sub="前月比プラス" color="border-t-teal-500" />
                            <KpiCard title="最高成長店舗" value={monthlyStats.bestYoYStore?.name} sub={`YoY:+${monthlyStats.bestYoYStore?.yoy?.toFixed(1)}%`} color="border-t-orange-400" />
                            <KpiCard title="昨対成長要因" value={`+${Math.round(monthlyStats.varianceData.find(v=>v.name==='既存店成長')?.val||0).toLocaleString()}`} sub="既存店プラス分" />
                            <KpiCard title="ジニ係数 (格差)" value={monthlyStats.gini.toFixed(3)} sub="店舗間不平等度" color="border-t-gray-400" />
                            <KpiCard title="Zero-Sum Score" value={monthlyStats.zeroSumScore.toFixed(2)} sub="共食いリスク (低=高)" color="border-t-red-400" />
                            <KpiCard title="標準偏差 (バラつき)" value={Math.round(monthlyStats.stdDev).toLocaleString()} sub="平均からの乖離" />
                            <KpiCard title="最下位店舗 (YoY)" value={monthlyStats.worstYoYStore?.name} sub={`YoY:${monthlyStats.worstYoYStore?.yoy?.toFixed(1)}%`} color="border-t-red-600" />
                        </div>

                        {/* Main Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
                            <ChartBox id="geo1" title="内訳別 実績 & 昨対比" className="lg:col-span-2 h-[400px]" tooltipContent="エリア内の内訳（県やブロック）ごとの実績と成長率。">{renderBreakdownChart()}</ChartBox>
                            <ChartBox id="geo6" title="昨対(YoY) 要因分析 Waterfall" className="lg:col-span-2 h-[400px]" tooltipContent="エリア全体の昨対増減に対し、何が（新規、既存、退店）寄与したか。">{renderWaterfall()}</ChartBox>
                            
                            <ChartBox id="geo4" title="店舗別 実績 vs 成長マトリクス" className="h-[400px]" tooltipContent="横軸に実績、縦軸に成長率。右上がエース店舗。">{renderScatterMatrix()}</ChartBox>
                            <ChartBox id="geo2" title="実績規模分布 (Histogram)" className="h-[400px]" tooltipContent="店舗ごとの売上規模の分布。山の位置でエリアの実力がわかる。">{renderDistChart()}</ChartBox>
                            <ChartBox id="dt3" title="内訳別 平均実績比較" className="h-[400px]" tooltipContent="1店舗あたりの平均実績が高い内訳順。">{renderAvgBar()}</ChartBox>
                            <ChartBox id="geo5" title="潜在需要充足率 (L-Util) 分布" className="h-[400px]" tooltipContent="ポテンシャルを使い切っている店舗の分布。">{renderLUtilChart()}</ChartBox>
                            
                            <ChartBox id="geo3" title="AI エリア診断" className="lg:col-span-2 h-[400px] bg-purple-50/20 w-full" tooltipContent="AIがこのエリアの現状を分析し、課題と対策を提案します。">
                                <div className="flex flex-col h-full min-h-[200px]">
                                    <button onClick={handleGenerateAI} disabled={aiLoading} className="mb-2 bg-purple-600 text-white py-1 px-3 rounded-lg text-[9px] font-black uppercase shadow-md self-end">
                                        {aiLoading ? 'Analyzing...' : 'Run AI'}
                                    </button>
                                    <div className="flex-1 overflow-y-auto text-[9px] text-gray-600 leading-relaxed custom-scrollbar">
                                        {aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} /> : "診断を開始してください"}
                                    </div>
                                </div>
                            </ChartBox>
                            
                            <ChartBox id="dt1" title="内訳別 格差指数 (Gini)" className="h-[400px]" tooltipContent="内訳ごとの店舗間格差。高いほど一部の店舗に依存している。">{renderGiniBar()}</ChartBox>
                            <ChartBox id="dt4" title="ローレンツ曲線 (集中度)" className="h-[400px]" tooltipContent="売上の集中度合いを示す曲線。対角線に近いほど平等。">{renderLorenz()}</ChartBox>
                        </div>

                        {/* Detailed Table */}
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col group relative animate-fadeIn">
                            <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-white sticky top-0 z-20">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-list"></i> エリア内店舗詳細リスト</h3>
                                <div className="relative w-full max-w-md"><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"></i><input type="text" placeholder="店舗名で絞り込み..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold outline-none" /></div>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar max-h-[600px]">
                                <table className="min-w-full text-left text-xs border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm font-black text-gray-500 uppercase tracking-widest">
                                        <tr className="border-b border-gray-100">
                                            <th onClick={() => handleSort('name')} className="p-5 cursor-pointer hover:bg-gray-100">店舗名 <SortIcon field="name" /></th>
                                            <th className="p-5 text-gray-400">所属</th>
                                            <th onClick={() => handleSort('val')} className="p-5 text-right cursor-pointer hover:bg-gray-100 font-bold text-[#005EB8]">実績 <SortIcon field="val" /></th>
                                            <th onClick={() => handleSort('yoy')} className="p-5 text-right cursor-pointer hover:bg-gray-100">昨対比 <SortIcon field="yoy" /></th>
                                            <th onClick={() => handleSort('mom')} className="p-5 text-right cursor-pointer hover:bg-gray-100">前月比 <SortIcon field="mom" /></th>
                                            <th onClick={() => handleSort('momentum')} className="p-5 text-right cursor-pointer hover:bg-gray-100">勢い <SortIcon field="momentum" /></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                        {sortedFilteredStores.map(s => (
                                            <tr key={s.name} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-5 text-gray-800 font-black">{s.name}</td>
                                                <td className="p-5 text-gray-400 font-normal">{s.block} / {s.pref}</td>
                                                <td className="p-5 text-right font-black text-[#005EB8]">{s.val.toLocaleString()}</td>
                                                <td className={`p-5 text-right ${s.yoy !== null ? (s.yoy >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-300'}`}>{s.yoy !== null ? `${s.yoy >= 0 ? '+' : ''}${s.yoy.toFixed(1)}%` : '--'}</td>
                                                <td className={`p-5 text-right ${s.mom !== null ? (s.mom >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-300'}`}>{s.mom !== null ? `${s.mom >= 0 ? '+' : ''}${s.mom.toFixed(1)}%` : '--'}</td>
                                                <td className={`p-5 text-right font-black ${s.momentum !== null ? (s.momentum >= 0 ? 'text-indigo-600' : 'text-gray-400') : 'text-gray-200'}`}>{s.momentum !== null ? `${s.momentum >= 0 ? '+' : ''}${s.momentum.toFixed(1)}%` : '--'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Expanded Chart Modal */}
            {expandedItem && (
                <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm animate-fadeIn flex flex-col p-4 md:p-10">
                    <div className="flex justify-between items-center mb-8 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display">拡大表示分析</h2>
                        <button onClick={() => setExpandedItem(null)} className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all">
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div className="flex-1 bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 overflow-auto relative">
                        {renderChart(expandedItem)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegionalSpotAnalysisView;
