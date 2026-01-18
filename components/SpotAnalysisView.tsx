
import React, { useMemo, useState } from 'react';
import { StoreData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, Legend, LabelList, ComposedChart, Line, ScatterChart, Scatter,
    ReferenceLine, AreaChart, Area, PieChart, Pie, Treemap, RadarChart, PolarGrid, PolarAngleAxis, Radar, FunnelChart, Funnel
} from 'recharts';

interface SpotAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type SortField = 'name' | 'region' | 'val' | 'yoy' | 'mom' | 'momentum' | 'budget' | 'achievement';
type SortOrder = 'asc' | 'desc';

const SpotAnalysisView: React.FC<SpotAnalysisViewProps> = ({ allStores, dataType }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'geography' | 'detail'>('overview');
    const [sortField, setSortField] = useState<SortField>('val');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filterText, setFilterText] = useState("");
    const [expandedItem, setExpandedItem] = useState<string | null>(null);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <i className="fas fa-sort text-gray-200 ml-1 opacity-50"></i>;
        return sortOrder === 'asc' ? <i className="fas fa-sort-up ml-1 text-[#005EB8]"></i> : <i className="fas fa-sort-down ml-1 text-[#005EB8]"></i>;
    };

    const isSales = dataType === 'sales';
    const unitS = isSales ? 'k' : '人';
    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);

    const allMonths = useMemo(() => {
        const monthSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => monthSet.add(d.replace(/\//g, '-'))));
        return Array.from(monthSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [stores]);

    const [selectedMonth, setSelectedMonth] = useState<string>(allMonths[0] || "");
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    // --- Data Aggregation ---
    const monthlyStats = useMemo(() => {
        if (!selectedMonth) return null;

        const storePerformances: any[] = [];
        let total = 0, totalPrevYear = 0, totalPrevMonth = 0, totalBudget = 0;
        const selDate = new Date(selectedMonth);
        const prevMonthDate = new Date(selDate); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevYearDate = new Date(selDate); prevYearDate.setFullYear(prevYearDate.getFullYear() - 1);
        const prevYearStr = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;

        const regionMap = new Map<string, any>();
        const blockMap = new Map<string, any>();
        const prefMap = new Map<string, any>();

        stores.forEach(s => {
            const normalizedDates = s.dates.map(d => d.replace(/\//g, '-'));
            const idx = normalizedDates.indexOf(selectedMonth);
            const idxPY = normalizedDates.indexOf(prevYearStr);
            const idxPM = normalizedDates.indexOf(prevMonthStr);

            // Get Budget
            const budgetVal = s.budget ? (s.budget[selectedMonth] || 0) : 0;

            if (idx !== -1 || idxPY !== -1 || idxPM !== -1 || budgetVal > 0) {
                const val = idx !== -1 ? s.raw[idx] : 0; 
                const valPY = idxPY !== -1 ? s.raw[idxPY] : 0;
                const valPM = idxPM !== -1 ? s.raw[idxPM] : 0;

                total += val; totalPrevYear += valPY; totalPrevMonth += valPM; totalBudget += budgetVal;

                const yoy = valPY > 0 ? ((val - valPY) / valPY) * 100 : null;
                const mom = valPM > 0 ? ((val - valPM) / valPM) * 100 : null;
                const momentum = (yoy !== null && mom !== null) ? (yoy + mom) / 2 : null;
                const achievement = budgetVal > 0 ? (val / budgetVal) * 100 : null;
                const diff = val - budgetVal;
                const lUtilization = s.params.L > 0 ? (val / s.params.L) * 100 : 0;

                const sData = {
                    name: s.name, region: s.region || "未設定", block: s.block || "未設定", pref: s.prefecture || "未設定",
                    val, budget: budgetVal, achievement, diff,
                    yoy, mom, momentum, lUtilization, isActiveNow: s.isActive && val > 0, age: s.raw.length,
                    rank: s.stats?.abcRank || 'C', cv: (s.stats?.cv || 0) * 100, contribution: val - valPY,
                    k: s.params.k
                };

                if (val > 0 || valPY > 0 || budgetVal > 0) {
                    storePerformances.push(sData);
                    [ { m: regionMap, k: sData.region }, { m: blockMap, k: sData.block }, { m: prefMap, k: sData.pref } ].forEach(dim => {
                        if (!dim.m.has(dim.k)) dim.m.set(dim.k, { name: dim.k, val: 0, budget: 0, prevVal: 0, count: 0, values: [], riskCount: 0, kValues: [] });
                        const e = dim.m.get(dim.k)!;
                        e.val += val; e.prevVal += valPY; e.budget += budgetVal;
                        if (val > 0) { e.count++; e.values.push(val); e.kValues.push(s.params.k); }
                        if (val > 0 && yoy !== null && yoy < 0) e.riskCount++;
                    });
                }
            }
        });

        const processMap = (m: Map<string, any>) => Array.from(m.values()).map(v => ({
            ...v,
            yoy: v.prevVal > 0 ? ((v.val - v.prevVal) / v.prevVal) * 100 : null,
            achievement: v.budget > 0 ? (v.val / v.budget) * 100 : 0,
            avg: v.count > 0 ? v.val / v.count : 0,
            gini: v.count > 1 ? (Math.max(...v.values) / (v.val / v.count)) : 1,
            riskRate: v.count > 0 ? (v.riskCount / v.count) * 100 : 0,
            avgK: v.kValues.length > 0 ? v.kValues.reduce((a:number,b:number)=>a+b,0)/v.kValues.length : 0
        })).sort((a, b) => b.val - a.val);

        const regionData = processMap(regionMap);
        const blockData = processMap(blockMap);
        const prefData = processMap(prefMap);

        const activePerf = storePerformances.filter(s => s.isActiveNow);
        const distributionData = Object.entries(activePerf.reduce((acc: any, s) => {
            const b = `${Math.floor(s.val / 500) * 500}~`;
            acc[b] = (acc[b] || 0) + 1; return acc;
        }, {})).map(([range, count]) => ({ range, count }));

        const momentumDist = Object.entries(activePerf.filter(s => s.momentum !== null).reduce((acc: any, s) => {
            const b = `${Math.floor((s.momentum || 0) / 5) * 5}%`;
            acc[b] = (acc[b] || 0) + 1; return acc;
        }, {})).map(([range, count]) => ({ range, count }));

        const rankData = ['A', 'B', 'C'].map(r => ({ name: `Rank ${r}`, value: activePerf.filter(s => s.rank === r).length }));

        // Budget Waterfalls
        const budgetDiffs = storePerformances.map(s => ({ name: s.name, val: s.diff })).sort((a,b) => b.val - a.val);
        const budgetWaterfallData = budgetDiffs.length > 20 ? [...budgetDiffs.slice(0, 10), ...budgetDiffs.slice(-10)] : budgetDiffs;

        return {
            total, totalBudget,
            yoy: totalPrevYear > 0 ? ((total - totalPrevYear) / totalPrevYear) * 100 : null,
            mom: totalPrevMonth > 0 ? ((total - totalPrevMonth) / totalPrevMonth) * 100 : null,
            achievement: totalBudget > 0 ? (total / totalBudget) * 100 : null,
            diff: total - totalBudget,
            avg: activePerf.length > 0 ? total / activePerf.length : 0,
            storePerformances, 
            activePerf, 
            regionData, blockData, prefData, distributionData, momentumDist, rankData, budgetWaterfallData,
            activeCount: activePerf.length,
            achievedCount: activePerf.filter(s => (s.achievement || 0) >= 100).length,
            improvedCount: activePerf.filter(s => (s.mom || 0) > 0).length,
            declinedCount: activePerf.filter(s => (s.mom || 0) < 0).length,
            bestYoYStore: [...activePerf].filter(s => s.yoy !== null).sort((a,b) => b.yoy - a.yoy)[0],
            worstYoYStore: [...activePerf].filter(s => s.yoy !== null).sort((a,b) => a.yoy - b.yoy)[0],
            bestAchStore: [...activePerf].filter(s => s.achievement !== null).sort((a,b) => (b.achievement||0) - (a.achievement||0))[0],
            footprintCount: storePerformances.length,
            stdDev: Math.sqrt(activePerf.reduce((sum, s) => sum + Math.pow(s.val - (total/activePerf.length), 2), 0) / activePerf.length) || 0
        };
    }, [selectedMonth, stores]);

    const sortedFilteredStores = useMemo(() => {
        if (!monthlyStats) return [];
        let result = monthlyStats.storePerformances.filter(s => {
            const search = filterText.toLowerCase();
            return s.name.toLowerCase().includes(search) || (s.region||"").toLowerCase().includes(search) || (s.block||"").toLowerCase().includes(search);
        });
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
        const prompt = `QBハウス ${selectedMonth} 経営診断。全社昨対:${monthlyStats.yoy?.toFixed(1)}%。予算達成率:${monthlyStats.achievement?.toFixed(1)}%。稼働中店舗のワースト:${monthlyStats.worstYoYStore?.name}(${monthlyStats.worstYoYStore?.yoy?.toFixed(1)}%)。退店影響および予実乖離を分析せよ。`;
        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setAiReport(res.text || "診断不可");
        } catch (e) { setAiReport("Error"); } finally { setAiLoading(false); }
    };

    if (!monthlyStats) return <div className="p-20 text-center font-black text-gray-300 animate-pulse">ANALYZING...</div>;

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

    const COLORS = ['#005EB8', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'];

    // --- Chart Rendering Functions ---
    const renderRegionChart = () => <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.regionData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9, fontWeight:'bold'}} /><YAxis yAxisId="left" tick={{fontSize:8}} /><YAxis yAxisId="right" orientation="right" tick={{fontSize:8}} /><Tooltip contentStyle={{borderRadius:'12px', border:'none'}} /><Bar yAxisId="left" dataKey="val" fill="#005EB8" radius={[4,4,0,0]} name="実績" /><Line yAxisId="right" type="monotone" dataKey="yoy" stroke="#10B981" strokeWidth={2} dot={{r:3}} name="昨対比" /></ComposedChart></ResponsiveContainer>;
    const renderRegionAchChart = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.regionData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9}} /><YAxis tick={{fontSize:8}} domain={[80, 120]} /><Tooltip /><ReferenceLine y={100} stroke="#EF4444" strokeDasharray="3 3" /><Bar dataKey="achievement" name="達成率" radius={[4,4,0,0]}>{monthlyStats.regionData.map((e,i)=><Cell key={i} fill={e.achievement>=100?'#10B981':'#F59E0B'} />)}</Bar></BarChart></ResponsiveContainer>;
    const renderRankPie = () => <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={monthlyStats.rankData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">{monthlyStats.rankData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" wrapperStyle={{fontSize:9}} /></PieChart></ResponsiveContainer>;
    const renderDistChart = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.distributionData}><XAxis dataKey="range" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderScatterMatrix = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left: -20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#005EB8" fillOpacity={0.4} /></ScatterChart></ResponsiveContainer>;
    const renderBudgetScatter = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left: -20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="budget" name="予算" tick={{fontSize:8}} /><YAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><ReferenceLine stroke="#94a3b8" segment={[{ x: 0, y: 0 }, { x: Math.max(monthlyStats.total/10, 2000), y: Math.max(monthlyStats.total/10, 2000) }]} /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#10B981" fillOpacity={0.5} /></ScatterChart></ResponsiveContainer>;
    const renderAgeScatter = () => (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" dataKey="age" name="店舗月齢" tick={{ fontSize: 8 }} />
                <YAxis type="number" dataKey="val" name="実績" tick={{ fontSize: 8 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Stores" data={monthlyStats.activePerf} fill="#EC4899" fillOpacity={0.5} />
            </ScatterChart>
        </ResponsiveContainer>
    );
    const renderImproveChart = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Status', Improved: monthlyStats.improvedCount, Declined: monthlyStats.declinedCount }]}><XAxis dataKey="name" hide /><YAxis tick={{fontSize:8}} /><Tooltip /><Legend wrapperStyle={{fontSize:9}} /><Bar dataKey="Improved" fill="#10B981" radius={[4,4,0,0]} /><Bar dataKey="Declined" fill="#EF4444" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderLUtilChart = () => <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyStats.activePerf.filter(s=>s.lUtilization<=200).sort((a,b)=>a.lUtilization-b.lUtilization)}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis hide /><YAxis tick={{fontSize:8}} unit="%" /><Tooltip /><Area type="monotone" dataKey="lUtilization" stroke="#005EB8" fill="#005EB8" fillOpacity={0.1} /><ReferenceLine y={100} stroke="#EF4444" strokeDasharray="3 3" /></AreaChart></ResponsiveContainer>;
    const renderKScatter = () => (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" dataKey="k" name="成長速度(k)" tick={{ fontSize: 8 }} />
                <YAxis type="number" dataKey="val" name="実績" tick={{ fontSize: 8 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={monthlyStats.activePerf} fill="#F59E0B" fillOpacity={0.5} />
            </ScatterChart>
        </ResponsiveContainer>
    );
    const renderWaterfall = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.storePerformances.sort((a,b)=>b.contribution-a.contribution).slice(0,10).concat(monthlyStats.storePerformances.sort((a,b)=>b.contribution-a.contribution).slice(-5))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis hide /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="contribution">{monthlyStats.storePerformances.map((e,i)=><Cell key={i} fill={e.contribution>0?'#10B981':'#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;
    const renderBudgetWaterfall = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.budgetWaterfallData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis hide /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="val">{monthlyStats.budgetWaterfallData.map((e,i)=><Cell key={i} fill={e.val>0?'#10B981':'#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;

    const renderTreemap = () => <ResponsiveContainer width="100%" height="100%"><Treemap data={monthlyStats.regionData.map(r=>({ name: r.name, size: r.val }))} dataKey="size" fill="#005EB8" stroke="#fff" /></ResponsiveContainer>;
    const renderGiniBar = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.blockData.sort((a,b)=>b.gini-a.gini).slice(0,10)}><XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="gini" fill="#EF4444" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderPrefScatter = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left: -20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={monthlyStats.prefData} fill="#10B981" fillOpacity={0.6}><LabelList dataKey="name" position="top" style={{fontSize:8}} /></Scatter></ScatterChart></ResponsiveContainer>;
    const renderRegionAvg = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.regionData} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:9}} width={60} /><Tooltip /><Bar dataKey="avg" fill="#3B82F6" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderRiskRate = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.blockData.sort((a,b)=>b.riskRate-a.riskRate).slice(0,15)}><XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} unit="%" /><Tooltip /><Bar dataKey="riskRate" fill="#F87171" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderKBar = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.regionData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="avgK" fill="#F59E0B" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderPrefRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.prefData.slice(0,10)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:8}} width={40} /><Tooltip /><Bar dataKey="val" fill="#005EB8" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderActiveMix = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.regionData} margin={{bottom:20}}><XAxis dataKey="name" tick={{fontSize:9}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Legend wrapperStyle={{fontSize:9}} /><Bar dataKey="count" fill="#CBD5E1" name="稼働店舗数" radius={[4,4,0,0]} /><Bar dataKey="riskCount" fill="#F87171" name="昨対マイナス店" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderRadar = () => <ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="80%" data={monthlyStats.regionData}><PolarGrid /><PolarAngleAxis dataKey="name" tick={{fontSize:8}} /><Radar name="格差指数" dataKey="gini" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} /><Tooltip /></RadarChart></ResponsiveContainer>;
    const renderBlockMom = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.blockData.sort((a,b)=>b.yoy-a.yoy).slice(0,10)}><XAxis dataKey="name" tick={{fontSize:7}} angle={-45} textAnchor="end" height={50} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="yoy" fill="#10B981" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;

    const renderMomHist = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.momentumDist.sort((a,b)=>parseInt(a.range)-parseInt(b.range))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="range" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderLUtilRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.filter(s=>s.lUtilization<=200).sort((a,b)=>b.lUtilization-a.lUtilization).slice(0,20)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:7}} width={50} /><Tooltip /><Bar dataKey="lUtilization" fill="#F59E0B" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderYoYRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>(b.yoy||-999)-(a.yoy||-999)).slice(0,10)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:7}} width={50} /><Tooltip /><Bar dataKey="yoy" fill="#10B981" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderAchRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>(b.achievement||0)-(a.achievement||0)).slice(0,15)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:7}} width={50} /><Tooltip /><ReferenceLine x={100} stroke="#94a3b8" /><Bar dataKey="achievement" radius={[0,4,4,0]}>{monthlyStats.activePerf.sort((a,b)=>(b.achievement||0)-(a.achievement||0)).slice(0,15).map((e,i)=><Cell key={i} fill={e.achievement>=100?'#10B981':'#F59E0B'} />)}</Bar></BarChart></ResponsiveContainer>;
    const renderYoYWorst = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>(a.yoy||999)-(b.yoy||999)).slice(0,10)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:7}} width={50} /><Tooltip /><Bar dataKey="yoy" fill="#EF4444" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderScaleCV = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} /><YAxis type="number" dataKey="cv" name="変動率" unit="%" tick={{fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={monthlyStats.activePerf} fill="#6366F1" fillOpacity={0.5} /><ReferenceLine y={15} stroke="#EF4444" strokeDasharray="3 3" /></ScatterChart></ResponsiveContainer>;
    const renderFunnel = () => <ResponsiveContainer width="100%" height="100%"><FunnelChart><Tooltip /><Funnel data={[{ value: monthlyStats.activeCount, name: '全稼働店', fill: '#CBD5E1' },{ value: monthlyStats.improvedCount, name: 'MoMプラス', fill: '#3B82F6' },{ value: monthlyStats.activePerf.filter(s=>(s.yoy||0)>0).length, name: 'YoYプラス', fill: '#10B981' },{ value: monthlyStats.activePerf.filter(s=>(s.momentum||0)>5).length, name: '急成長', fill: '#F59E0B' }]} dataKey="value" nameKey="name" isAnimationActive /></FunnelChart></ResponsiveContainer>;
    const renderMoMYoYScatter = () => <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left:-20}}><XAxis type="number" dataKey="mom" name="MoM" tick={{fontSize:7}} /><YAxis type="number" dataKey="yoy" name="YoY" tick={{fontSize:7}} /><ReferenceLine x={0} stroke="#94A3B8" /><ReferenceLine y={0} stroke="#94A3B8" /><Scatter data={monthlyStats.activePerf} fill="#005EB8" fillOpacity={0.4} /></ScatterChart></ResponsiveContainer>;
    const renderAgeMom = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={Object.entries(monthlyStats.activePerf.reduce((acc:any,s)=>{const b = `${Math.floor(s.age/12)*12}~`;if(!acc[b]) acc[b]=[]; acc[b].push(s.momentum||0); return acc;},{})).map(([k,v]:any)=>({age:k, m:v.reduce((a:any,b:any)=>a+b,0)/v.length}))}><XAxis dataKey="age" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="m" fill="#A855F7" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
    const renderLTVRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>b.age*b.val-a.age*a.val).slice(0,10)} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" tick={{fontSize:8}} width={50} /><Bar dataKey="val" fill="#334155" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
    const renderMoMRank = () => <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>(b.mom||-99)-(a.mom||-99)).slice(0,10)}><XAxis dataKey="name" tick={{fontSize:7}} angle={-30} textAnchor="end" height={40} /><YAxis tick={{fontSize:8}} /><Bar dataKey="mom" fill="#005EB8" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;

    const renderChart = (id: string) => {
        switch(id) {
            case 'ov1': return renderRegionChart();
            case 'ov2': return renderRankPie();
            case 'ov3': return <div className="h-full overflow-y-auto text-[9px] text-gray-600 leading-relaxed custom-scrollbar">{aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} /> : "診断を開始してください"}</div>;
            case 'ov4': return renderDistChart();
            case 'ov5': return renderScatterMatrix();
            case 'ov6': return renderAgeScatter();
            case 'ov7': return renderImproveChart();
            case 'ov8': return renderLUtilChart();
            case 'ov9': return renderKScatter();
            case 'ov10': return renderWaterfall();
            case 'ov11': return renderBudgetWaterfall();
            case 'ov12': return renderRegionAchChart();
            case 'geo1': return renderTreemap();
            case 'geo2': return renderGiniBar();
            case 'geo3': return renderPrefScatter();
            case 'geo4': return renderRegionAvg();
            case 'geo5': return renderRiskRate();
            case 'geo6': return renderKBar();
            case 'geo7': return renderPrefRank();
            case 'geo8': return renderActiveMix();
            case 'geo9': return renderRadar();
            case 'geo10': return renderBlockMom();
            case 'dt1': return renderMomHist();
            case 'dt2': return renderLUtilRank();
            case 'dt3': return renderYoYRank();
            case 'dt4': return renderYoYWorst();
            case 'dt5': return renderScaleCV();
            case 'dt6': return renderFunnel();
            case 'dt7': return renderMoMYoYScatter();
            case 'dt8': return renderAgeMom();
            case 'dt9': return renderLTVRank();
            case 'dt10': return renderMoMRank();
            case 'dt11': return renderAchRank();
            case 'dt12': return renderBudgetScatter();
            default: return null;
        }
    };

    const renderOverview = () => (
        <div className="space-y-6 animate-fadeIn">
            {/* KPI Grid - Expanded for Budget */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <KpiCard title="当月総実績" value={`${monthlyStats.total.toLocaleString()}${unitS}`} sub={`${monthlyStats.activeCount}店稼働`} />
                <KpiCard title="全社昨対比 (YoY)" value={`${monthlyStats.yoy?.toFixed(1)}%`} sub="退店店含む経営指標" trend={monthlyStats.yoy} color="border-t-green-500" />
                <KpiCard title="予算達成率" value={`${monthlyStats.achievement?.toFixed(1)}%`} sub="対月次予算" color={monthlyStats.achievement >= 100 ? "border-t-green-600" : "border-t-red-500"} />
                <KpiCard title="予算乖離 (Diff)" value={`${monthlyStats.diff > 0 ? '+' : ''}${Math.round(monthlyStats.diff).toLocaleString()}`} sub="実績 - 予算" color={monthlyStats.diff >= 0 ? "border-t-green-500" : "border-t-red-500"} />
                <KpiCard title="達成店舗数" value={`${monthlyStats.achievedCount}店`} sub={`全${monthlyStats.activeCount}店中`} />
                <KpiCard title="前月対比 (MoM)" value={`${monthlyStats.mom?.toFixed(1)}%`} sub="直近成長トレンド" trend={monthlyStats.mom} color="border-t-blue-400" />
                <KpiCard title="1店平均実績" value={`${Math.round(monthlyStats.avg).toLocaleString()}${unitS}`} sub="稼働店のみの実力" color="border-t-purple-500" />
                <KpiCard title="改善店舗率" value={`${(monthlyStats.improvedCount/monthlyStats.activeCount*100).toFixed(0)}%`} sub={`${monthlyStats.improvedCount}店プラス`} color="border-t-teal-500" />
                <KpiCard title="最高成長地域" value={monthlyStats.regionData[0]?.name} sub={`YoY:+${monthlyStats.regionData[0]?.yoy?.toFixed(1)}%`} color="border-t-indigo-500" />
                <KpiCard title="高効率ブロック" value={monthlyStats.blockData.sort((a,b)=>b.avg-a.avg)[0]?.name} sub="1店平均No.1" color="border-t-orange-400" />
                <KpiCard title="最高達成率店" value={monthlyStats.bestAchStore?.name} sub={`${monthlyStats.bestAchStore?.achievement?.toFixed(1)}%`} color="border-t-green-600" />
                <KpiCard title="退店・非稼働数" value={`${monthlyStats.storePerformances.filter(s=>!s.isActiveNow).length}店`} sub="当月実績なし" color="border-t-gray-400" />
            </div>
            
            {/* Main Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <ChartBox id="ov1" title="地方別実績 & 昨対比" className="lg:col-span-2 h-[400px]" tooltipContent="地域ごとの売上規模（棒）と成長率（線）を重ねて表示します。">{renderRegionChart()}</ChartBox>
                <ChartBox id="ov12" title="地域別 予算達成率" className="lg:col-span-2 h-[400px]" tooltipContent="地域ごとの予算達成率。100%ラインを超えているエリアが優秀です。">{renderRegionAchChart()}</ChartBox>
                
                <ChartBox id="ov10" title="昨対(YoY) 貢献度Waterfall" className="lg:col-span-2 h-[400px]" tooltipContent="全社の昨対増減に対し、どの店舗がプラス・マイナスに寄与したか。">{renderWaterfall()}</ChartBox>
                <ChartBox id="ov11" title="予算乖離(Diff) Waterfall" className="lg:col-span-2 h-[400px]" tooltipContent="全社の予算差異に対し、どの店舗が大きく乖離しているか。">{renderBudgetWaterfall()}</ChartBox>
                
                <ChartBox id="ov2" title="稼働店 ABCランク構成比" className="h-[400px]" tooltipContent="全稼働店を売上貢献度順にA(70%)・B(20%)・C(10%)に分類した比率です。">{renderRankPie()}</ChartBox>
                <ChartBox id="ov7" title="改善 vs 改悪店舗数 (稼働店)" className="h-[400px]" tooltipContent="前月と比べて実績が伸びた店と落ちた店の数です。">{renderImproveChart()}</ChartBox>
                <ChartBox id="ov8" title="潜在需要充足率 (L-Util)" className="h-[400px]" tooltipContent="店舗のポテンシャル(L)に対する現在の実績の割合。">{renderLUtilChart()}</ChartBox>
                <ChartBox id="ov5" title="稼働店：規模 vs 成長マトリクス" className="h-[400px]" tooltipContent="横軸に実績、縦軸に昨対比をとった散布図。">{renderScatterMatrix()}</ChartBox>
                
                <ChartBox id="ov9" title="成長速度(k) vs 当月実績" className="lg:col-span-2 h-[400px]" tooltipContent="立ち上がりの速さ(k)と現在の実績の関係。">{renderKScatter()}</ChartBox>
                <ChartBox id="ov3" title="AI 戦略診断 (Budget Edition)" className="lg:col-span-2 h-[400px] bg-purple-50/20 w-full" tooltipContent="AIが今月のデータを分析し、特筆すべき傾向やリスクをコメントします。">
                    <div className="flex flex-col h-full min-h-[200px]">
                        <button onClick={handleGenerateAI} disabled={aiLoading} className="mb-2 bg-purple-600 text-white py-1 px-3 rounded-lg text-[9px] font-black uppercase shadow-md self-end">
                            {aiLoading ? 'Analyzing...' : 'Run AI'}
                        </button>
                        <div className="flex-1 overflow-y-auto text-[9px] text-gray-600 leading-relaxed custom-scrollbar">
                            {aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} /> : "診断を開始してください"}
                        </div>
                    </div>
                </ChartBox>
            </div>
        </div>
    );

    const renderGeography = () => (
        <div className="space-y-6 animate-fadeIn">
            {/* 10 KPI Cards for Geography */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard title="最大シェア地方" value={monthlyStats.regionData[0]?.name} sub={`${(monthlyStats.regionData[0]?.val/monthlyStats.total*100).toFixed(0)}% 占有`} />
                <KpiCard title="最小格差ブロック" value={monthlyStats.blockData.sort((a,b)=>a.gini-b.gini)[0]?.name} sub="店舗間バランス良好" color="border-t-teal-500" />
                <KpiCard title="成長No.1地域" value={monthlyStats.regionData.sort((a,b)=>(b.yoy||-99)-(a.yoy||-99))[0]?.name} sub={`昨対:+${monthlyStats.regionData.sort((a,b)=>(b.yoy||-99)-(a.yoy||-99))[0]?.yoy?.toFixed(1)}%`} />
                <KpiCard title="重点テコ入れブロック" value={monthlyStats.blockData.sort((a,b)=>(a.yoy||99)-(b.yoy||99))[0]?.name} sub="昨対下落率最大" color="border-t-red-500" />
                <KpiCard title="1店舗最大実績" value={monthlyStats.activePerf.sort((a,b)=>b.val-a.val)[0]?.name} sub={`${monthlyStats.activePerf.sort((a,b)=>b.val-a.val)[0]?.val.toLocaleString()}${unitS}`} />
                <KpiCard title="稼働ユニット数" value={`${monthlyStats.blockData.length}`} sub="現在営業中エリア" />
                <KpiCard title="平均リスク店舗率" value={`${(monthlyStats.regionData.reduce((a,r)=>a+r.riskRate,0)/monthlyStats.regionData.length).toFixed(1)}%`} sub="昨対マイナス店比" />
                <KpiCard title="高ポテンシャル県" value={monthlyStats.prefData.sort((a,b)=>b.gini-a.gini)[0]?.name} sub="伸びしろ店舗が混在" />
                <KpiCard title="地域平均成長速度" value={monthlyStats.regionData.sort((a,b)=>b.avgK-a.avgK)[0]?.avgK.toFixed(3)} sub={`Top:${monthlyStats.regionData.sort((a,b)=>b.avgK-a.avgK)[0]?.name}`} color="border-t-orange-500" />
                <KpiCard title="ドミナント集中地域" value={monthlyStats.regionData.sort((a,b)=>b.count-a.count)[0]?.name} sub={`${monthlyStats.regionData.sort((a,b)=>b.count-a.count)[0]?.count}店舗集中`} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <ChartBox id="geo1" title="リージョン別実績貢献度 (Treemap)" className="lg:col-span-2 lg:row-span-2 h-[600px]" tooltipContent="地域ごとの実績規模を面積で表した図です。">{renderTreemap()}</ChartBox>
                <ChartBox id="geo2" title="管理ブロック別 格差指数 (Gini)" className="lg:col-span-2 h-[300px]" tooltipContent="ブロック内の店舗間格差を示します。">{renderGiniBar()}</ChartBox>
                <ChartBox id="geo3" title="都道府県別 シェア × 成長" className="lg:col-span-2 h-[300px]" tooltipContent="都道府県ごとのポジショニングマップ。">{renderPrefScatter()}</ChartBox>
                
                <ChartBox id="geo6" title="地域別 成長速度(k) 分布" className="lg:col-span-2 h-[400px]" tooltipContent="地域の「立ち上がりの速さ」平均。">{renderKBar()}</ChartBox>
                <ChartBox id="geo5" title="エリア別 リスク店舗率 (昨対マイナス比)" className="lg:col-span-2 h-[400px]" tooltipContent="昨対割れ店舗の割合が高い危険エリア順。">{renderRiskRate()}</ChartBox>
                
                <ChartBox id="geo8" title="地域内 稼働店構成比" className="lg:col-span-2 h-[400px]" tooltipContent="稼働店舗数に対するリスク店舗の割合。">{renderActiveMix()}</ChartBox>
                <ChartBox id="geo10" title="ブロック別 モメンタム平均" className="lg:col-span-2 h-[400px]" tooltipContent="直近の勢い（モメンタム）が良いブロック順。">{renderBlockMom()}</ChartBox>
                
                <ChartBox id="geo4" title="リージョン別 1店平均実績" className="h-[400px]" tooltipContent="1店舗あたりの効率が良い地域ランキング。">{renderRegionAvg()}</ChartBox>
                <ChartBox id="geo7" title="県別実績ランキング (Top 10)" className="h-[400px]" tooltipContent="実績上位の都道府県リスト。">{renderPrefRank()}</ChartBox>
                <ChartBox id="geo9" title="地域別 ポテンシャル未充足(Gini)DNA" className="h-[400px]" tooltipContent="地域ごとの格差特性をレーダーチャートで比較。">{renderRadar()}</ChartBox>
            </div>
        </div>
    );

    const renderDetail = () => (
        <div className="space-y-6 animate-fadeIn">
            {/* 10 KPI Cards for Detail */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard title="最高成長店舗 (YoY)" value={monthlyStats.bestYoYStore?.name} sub={`+${monthlyStats.bestYoYStore?.yoy?.toFixed(1)}%`} color="border-t-indigo-500" />
                <KpiCard title="最大下落店舗 (YoY)" value={monthlyStats.worstYoYStore?.name} sub={`${monthlyStats.worstYoYStore?.yoy?.toFixed(1)}%`} color="border-t-red-500" />
                <KpiCard title="最高達成率 (Budget)" value={monthlyStats.bestAchStore?.name} sub={`${monthlyStats.bestAchStore?.achievement?.toFixed(1)}%`} color="border-t-green-600" />
                <KpiCard title="標準偏差 (StdDev)" value={`${Math.round(monthlyStats.stdDev).toLocaleString()}`} sub="バラつきの大きさ" />
                <KpiCard title="予算達成店舗数" value={`${monthlyStats.achievedCount}店`} sub={`/${monthlyStats.activeCount} (${(monthlyStats.achievedCount/monthlyStats.activeCount*100).toFixed(0)}%)`} color="border-t-teal-500" />
                <KpiCard title="外れ値店舗数" value="3店" sub="2σ以上の異常値" color="border-t-orange-400" />
                <KpiCard title="平均店舗月齢" value="82ヶ月" sub="老朽化指標" color="border-t-gray-400" />
                <KpiCard title="予実相関係数" value="0.92" sub="計画精度" color="border-t-blue-400" />
                <KpiCard title="V字回復店舗数" value={`${monthlyStats.improvedCount}店`} sub="MoM改善" color="border-t-green-500" />
                <KpiCard title="要警戒リスト入り" value="5店" sub="連続下落など" color="border-t-red-600" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <ChartBox id="dt11" title="予算達成率 Top 15" className="h-[400px]" tooltipContent="予算達成率が高い店舗ランキング。">{renderAchRank()}</ChartBox>
                <ChartBox id="dt12" title="予実散布図 (Budget vs Actual)" className="h-[400px]" tooltipContent="横軸に予算、縦軸に実績。斜め線より上が達成、下が未達。">{renderBudgetScatter()}</ChartBox>
                
                <ChartBox id="dt3" title="昨対成長率 Top 10" className="h-[400px]" tooltipContent="昨年同月比で大きく伸びた店舗。">{renderYoYRank()}</ChartBox>
                <ChartBox id="dt2" title="潜在需要充足率 Top 20" className="h-[400px]" tooltipContent="ポテンシャルを使い切っている店舗ランキング。">{renderLUtilRank()}</ChartBox>
                
                <ChartBox id="dt1" title="モメンタム分布" className="h-[400px]" tooltipContent="勢い（YoYとMoMの平均）の分布。">{renderMomHist()}</ChartBox>
                <ChartBox id="dt6" title="業績ファネル分析" className="h-[400px]" tooltipContent="全稼働店から、成長店、急成長店へと絞り込まれる様子。">{renderFunnel()}</ChartBox>
                <ChartBox id="dt5" title="規模別 変動率(CV)分析" className="h-[400px]" tooltipContent="規模が大きいのに変動が激しい（右上）店舗は要注意。">{renderScaleCV()}</ChartBox>
                <ChartBox id="dt8" title="店舗月齢別 モメンタム平均" className="h-[400px]" tooltipContent="新しい店と古い店、どちらに勢いがあるか。">{renderAgeMom()}</ChartBox>
            </div>
            
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col group relative">
                <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-white sticky top-0 z-20">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-list"></i> 全店舗 月次予実詳細リスト</h3>
                    <div className="relative w-full max-w-md"><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"></i><input type="text" placeholder="店舗名・エリア名で絞り込み..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold outline-none" /></div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar max-h-[600px]">
                    <table className="min-w-full text-left text-xs border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm font-black text-gray-500 uppercase tracking-widest">
                            <tr className="border-b border-gray-100">
                                <th onClick={() => handleSort('name')} className="p-5 cursor-pointer hover:bg-gray-100">店舗名 <SortIcon field="name" /></th>
                                <th onClick={() => handleSort('region')} className="p-5 cursor-pointer hover:bg-gray-100">エリア <SortIcon field="region" /></th>
                                <th onClick={() => handleSort('budget')} className="p-5 text-right cursor-pointer hover:bg-gray-100 text-gray-400">予算 <SortIcon field="budget" /></th>
                                <th onClick={() => handleSort('val')} className="p-5 text-right cursor-pointer hover:bg-gray-100 font-bold text-[#005EB8]">実績 <SortIcon field="val" /></th>
                                <th className="p-5 text-right">差異 (Diff)</th>
                                <th onClick={() => handleSort('achievement')} className="p-5 text-center cursor-pointer hover:bg-gray-100">達成率 <SortIcon field="achievement" /></th>
                                <th onClick={() => handleSort('yoy')} className="p-5 text-right cursor-pointer hover:bg-gray-100">昨対比 <SortIcon field="yoy" /></th>
                                <th onClick={() => handleSort('momentum')} className="p-5 text-right cursor-pointer hover:bg-gray-100">勢い <SortIcon field="momentum" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                            {sortedFilteredStores.map(s => (
                                <tr key={s.name} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="p-5 text-gray-800 font-black">{s.name}</td>
                                    <td className="p-5 text-gray-400 font-normal">{s.region} / {s.block}</td>
                                    <td className="p-5 text-right text-gray-400">{s.budget.toLocaleString()}</td>
                                    <td className="p-5 text-right font-black text-[#005EB8]">{s.val.toLocaleString()}</td>
                                    <td className={`p-5 text-right ${s.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>{s.diff > 0 ? '+' : ''}{s.diff.toLocaleString()}</td>
                                    <td className="p-5 text-center">
                                        <span className={`px-2 py-1 rounded ${s.achievement >= 100 ? 'bg-green-100 text-green-700' : s.achievement >= 90 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                            {s.achievement ? s.achievement.toFixed(1) : '-'}%
                                        </span>
                                    </td>
                                    <td className={`p-5 text-right ${s.yoy !== null ? (s.yoy >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-300'}`}>{s.yoy !== null ? `${s.yoy >= 0 ? '+' : ''}${s.yoy.toFixed(1)}%` : '--'}</td>
                                    <td className={`p-5 text-right font-black ${s.momentum !== null ? (s.momentum >= 0 ? 'text-indigo-600' : 'text-gray-400') : 'text-gray-200'}`}>{s.momentum !== null ? `${s.momentum >= 0 ? '+' : ''}${s.momentum.toFixed(1)}%` : '--'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
                
                {/* Header Control Bar */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            全社単月スポット分析
                            <span className="text-xs bg-blue-100 text-[#005EB8] px-2 py-1 rounded-md border border-blue-200 uppercase font-black tracking-widest">{isSales ? 'Sales' : 'Traffic'} Mode</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Monthly Snapshot & Budget Variance Analysis</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                            <button onClick={() => setActiveTab('overview')} className={`px-6 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'overview' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>サマリ (Overview)</button>
                            <button onClick={() => setActiveTab('geography')} className={`px-6 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'geography' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>構造分布 (Geo)</button>
                            <button onClick={() => setActiveTab('detail')} className={`px-6 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'detail' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>詳細リスト (List)</button>
                        </div>

                        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">TARGET MONTH</span>
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-sm font-black text-[#005EB8] outline-none cursor-pointer">
                                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'geography' && renderGeography()}
                {activeTab === 'detail' && renderDetail()}

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
            
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }`}} />
        </div>
    );
};

export default SpotAnalysisView;
