
import React, { useMemo, useState, useEffect } from 'react';
import { StoreData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, Legend, LabelList, ComposedChart, Line, ScatterChart, Scatter,
    ReferenceLine, AreaChart, Area, PieChart, Pie, Treemap, RadarChart, PolarGrid, PolarAngleAxis, Radar, ZAxis
} from 'recharts';

interface RegionalSpotAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type ScopeType = 'region' | 'prefecture' | 'block';
type SortField = 'name' | 'val' | 'yoy' | 'mom' | 'momentum' | 'budget' | 'achievement' | 'lUtil';
type SortOrder = 'asc' | 'desc';

// --- Statistical Helpers ---
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculateBoxPlot = (values: number[]) => {
    if (values.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = calculateMedian(sorted);
    const lowerHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const upperHalf = sorted.slice(Math.ceil(sorted.length / 2));
    const q1 = calculateMedian(lowerHalf);
    const q3 = calculateMedian(upperHalf);
    return { min, q1, median, q3, max };
};

const RegionalSpotAnalysisView: React.FC<RegionalSpotAnalysisViewProps> = ({ allStores, dataType }) => {
    const [scopeType, setScopeType] = useState<ScopeType>('region');
    const [selectedArea, setSelectedArea] = useState<string>("");
    const [activeTab, setActiveTab] = useState<'overview' | 'deep' | 'detail'>('overview');
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('val');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filterText, setFilterText] = useState("");

    const isSales = dataType === 'sales';
    const unitS = isSales ? 'k' : '人';
    const displayDivider = isSales ? 1000 : 1;
    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);

    const allMonths = useMemo(() => {
        const monthSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => monthSet.add(d.replace(/\//g, '-'))));
        return Array.from(monthSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [stores]);

    const [selectedMonth, setSelectedMonth] = useState<string>(allMonths[0] || "");
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const areaOptions = useMemo(() => {
        const set = new Set<string>();
        stores.forEach(s => {
            if (scopeType === 'region' && s.region) set.add(s.region);
            if (scopeType === 'prefecture' && s.prefecture) set.add(s.prefecture);
            if (scopeType === 'block' && s.block) set.add(s.block);
        });
        return Array.from(set).sort();
    }, [stores, scopeType]);

    useEffect(() => {
        if (areaOptions.length > 0 && !areaOptions.includes(selectedArea)) {
            setSelectedArea(areaOptions[0]);
        }
    }, [areaOptions, selectedArea]);

    const monthlyStats = useMemo(() => {
        if (!selectedMonth || !selectedArea) return null;

        const targetStores = stores.filter(s => {
            if (scopeType === 'region') return s.region === selectedArea;
            if (scopeType === 'prefecture') return s.prefecture === selectedArea;
            if (scopeType === 'block') return s.block === selectedArea;
            return false;
        });

        const storePerformances: any[] = [];
        let total = 0, totalPrevYear = 0, totalPrevMonth = 0, totalBudget = 0;
        let varNew = 0, varGrowth = 0, varDecline = 0, varClosed = 0;

        const selDate = new Date(selectedMonth);
        const prevMonthDate = new Date(selDate); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevYearDate = new Date(selDate); prevYearDate.setFullYear(prevYearDate.getFullYear() - 1);
        const prevYearStr = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;

        const breakdownMap = new Map<string, any>();
        
        // For Trend Chart (Aggregated history of this area)
        const trendHistoryMap: Record<string, { total: number, count: number, budget: number }> = {};
        const trendDates = allMonths.slice(0, 24).reverse(); // Last 24 months

        targetStores.forEach(s => {
            const normalizedDates = s.dates.map(d => d.replace(/\//g, '-'));
            const idx = normalizedDates.indexOf(selectedMonth);
            const idxPY = normalizedDates.indexOf(prevYearStr);
            const idxPM = normalizedDates.indexOf(prevMonthStr);

            const val = idx !== -1 ? s.raw[idx] : 0; 
            const valPY = idxPY !== -1 ? s.raw[idxPY] : 0;
            const valPM = idxPM !== -1 ? s.raw[idxPM] : 0;
            const budgetVal = s.budget ? (s.budget[selectedMonth] || 0) : 0;

            total += val; totalPrevYear += valPY; totalPrevMonth += valPM; totalBudget += budgetVal;
            
            const diff = val - valPY;
            if (val > 0 && valPY === 0) varNew += diff;
            else if (val === 0 && valPY > 0) varClosed += diff;
            else if (diff > 0) varGrowth += diff;
            else varDecline += diff;

            const yoy = valPY > 0 ? ((val - valPY) / valPY) * 100 : null;
            const mom = valPM > 0 ? ((val - valPM) / valPM) * 100 : null;
            const momentum = (yoy !== null && mom !== null) ? (yoy + mom) / 2 : null;
            const lUtil = s.params.L > 0 ? (val / s.params.L) * 100 : 0; // Correct property name
            const achievement = budgetVal > 0 ? (val / budgetVal) * 100 : null;

            const sData = {
                name: s.name, region: s.region, block: s.block, pref: s.prefecture,
                val, budget: budgetVal, achievement, diff: val - budgetVal,
                yoy, mom, momentum, lUtil, // Consistently named lUtil
                isActiveNow: s.isActive && val > 0, age: s.raw.length,
                rank: s.stats?.abcRank || 'C', contribution: val - valPY,
                k: s.params.k, L: s.params.L
            };

            if (val > 0 || valPY > 0 || budgetVal > 0) {
                storePerformances.push(sData);
                
                // Determine breakdown key based on scope
                let bKey = sData.name;
                if (scopeType === 'region') bKey = sData.pref || "Unknown";
                else if (scopeType === 'prefecture') bKey = sData.block || "Unknown";

                if (!breakdownMap.has(bKey)) {
                    breakdownMap.set(bKey, { name: bKey, val: 0, prevVal: 0, budget: 0, count: 0, values: [] });
                }
                const e = breakdownMap.get(bKey)!;
                e.val += val; e.prevVal += valPY; e.budget += budgetVal;
                if (val > 0) { e.count++; e.values.push(val); }
            }

            // Trend History Calculation
            trendDates.forEach(dStr => {
                const hIdx = normalizedDates.indexOf(dStr);
                const hBudget = s.budget ? (s.budget[dStr] || 0) : 0;
                if (!trendHistoryMap[dStr]) trendHistoryMap[dStr] = { total: 0, count: 0, budget: 0 };
                
                if (hIdx !== -1) {
                    trendHistoryMap[dStr].total += s.raw[hIdx];
                    trendHistoryMap[dStr].count++;
                }
                trendHistoryMap[dStr].budget += hBudget;
            });
        });

        const breakdownData = Array.from(breakdownMap.values()).map(v => ({
            ...v,
            yoy: v.prevVal > 0 ? ((v.val - v.prevVal) / v.prevVal) * 100 : null,
            achievement: v.budget > 0 ? (v.val / v.budget) * 100 : 0,
            avg: v.count > 0 ? v.val / v.count : 0,
            gini: calculateGini(v.values)
        })).sort((a, b) => b.val - a.val);

        const activePerf = storePerformances.filter(s => s.isActiveNow);
        
        // Distribution & Stats
        const salesValues = activePerf.map(s => s.val);
        const maxVal = Math.max(...salesValues, 1000);
        
        // 1. Sales Distribution
        const distBuckets = Array(10).fill(0);
        activePerf.forEach(s => {
            const idx = Math.min(9, Math.floor(s.val / (maxVal/10)));
            distBuckets[idx]++;
        });
        const distData = distBuckets.map((c,i) => ({ range: `${Math.round((maxVal/10)*i/displayDivider)}${unitS}~`, count: c }));

        // 2. Budget Achievement Distribution
        const achBuckets = Array(10).fill(0); // <80, 80-85, ... >120
        activePerf.forEach(s => {
            const ach = s.achievement || 0;
            if (ach < 80) achBuckets[0]++;
            else if (ach >= 120) achBuckets[9]++;
            else achBuckets[Math.floor((ach - 80) / 5) + 1]++;
        });
        const achDistData = achBuckets.map((c, i) => ({ range: i===0?'<80%':i===9?'>120%':`${80+(i-1)*5}-${80+i*5}%`, count: c }));

        // 3. Rank Data
        const rankData = ['A', 'B', 'C'].map(r => ({ name: `Rank ${r}`, value: activePerf.filter(s => s.rank === r).length }));
        
        // 4. Variance Waterfall
        const varianceData = [
            { name: '前年実績', val: totalPrevYear, type: 'base' },
            { name: '既存成長', val: varGrowth, type: 'plus' },
            { name: '新規店', val: varNew, type: 'plus' },
            { name: '既存減少', val: varDecline, type: 'minus' },
            { name: '退店', val: varClosed, type: 'minus' },
            { name: '当月実績', val: total, type: 'total' }
        ];

        // 5. Trend Graph
        const trendData = trendDates.map(dStr => {
            const d = trendHistoryMap[dStr];
            const dObj = new Date(dStr); dObj.setFullYear(dObj.getFullYear() - 1);
            const prevDStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}`;
            const prevD = trendHistoryMap[prevDStr];
            return {
                date: dStr,
                val: d ? d.total : 0,
                budget: d ? d.budget : 0,
                yoy: (d && prevD && prevD.total > 0) ? ((d.total - prevD.total) / prevD.total) * 100 : null
            };
        });

        // 6. Growth Rankings
        const growthRanking = [...activePerf].sort((a,b) => (b.yoy||-999) - (a.yoy||-999)).slice(0, 5);
        const declineRanking = [...activePerf].sort((a,b) => (a.yoy||999) - (b.yoy||999)).slice(0, 5);

        // --- Deep Analysis Stats ---
        const avgVal = activePerf.length > 0 ? total / activePerf.length : 0;
        const medianVal = calculateMedian(salesValues);
        const stdDev = Math.sqrt(activePerf.reduce((sum, s) => sum + Math.pow(s.val - avgVal, 2), 0) / Math.max(1, activePerf.length)) || 0;
        const gini = calculateGini(salesValues);
        const boxPlot = calculateBoxPlot(salesValues);
        const sortedBySales = [...activePerf].sort((a,b) => b.val - a.val);
        const top5Share = sortedBySales.slice(0, 5).reduce((a, b) => a + b.val, 0) / (total || 1) * 100;
        const bottom5Share = sortedBySales.slice(-5).reduce((a, b) => a + b.val, 0) / (total || 1) * 100;

        // Best Achieved Store
        const sortedByAch = [...activePerf].filter(s => s.achievement !== null).sort((a,b) => (b.achievement||0) - (a.achievement||0));
        const bestAchStore = sortedByAch[0];

        return {
            total, totalBudget,
            yoy: totalPrevYear > 0 ? ((total - totalPrevYear) / totalPrevYear) * 100 : null,
            mom: totalPrevMonth > 0 ? ((total - totalPrevMonth) / totalPrevMonth) * 100 : null,
            achievement: totalBudget > 0 ? (total / totalBudget) * 100 : null,
            diff: total - totalBudget,
            avg: avgVal,
            storePerformances, activePerf, breakdownData, rankData, varianceData, trendData, distData, achDistData, growthRanking, declineRanking,
            activeCount: activePerf.length,
            achievedCount: activePerf.filter(s => (s.achievement || 0) >= 100).length,
            gini, medianVal, stdDev, boxPlot, top5Share, bottom5Share,
            avgLUtil: activePerf.reduce((a,b)=>a+b.lUtil,0)/activePerf.length,
            improvedCount: activePerf.filter(s => (s.mom || 0) > 0).length,
            declinedCount: activePerf.filter(s => (s.mom || 0) < 0).length,
            riskyCount: activePerf.filter(s => (s.yoy || 0) < -5).length,
            bestYoYStore: growthRanking[0],
            worstYoYStore: declineRanking[0],
            bestAchStore,
            maxGrowth: growthRanking[0]?.yoy || 0,
            minGrowth: declineRanking[0]?.yoy || 0
        };
    }, [selectedMonth, selectedArea, scopeType, stores]);

    const sortedStores = useMemo(() => {
        if (!monthlyStats) return [];
        let result = monthlyStats.storePerformances.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()));
        result.sort((a, b) => {
            let valA = a[sortField as keyof typeof a], valB = b[sortField as keyof typeof b];
            if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
            valA = (valA as number) ?? -Infinity; valB = (valB as number) ?? -Infinity;
            return sortOrder === 'asc' ? valA - valB : valB - valA;
        });
        return result;
    }, [monthlyStats, sortField, sortOrder, filterText]);

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('desc'); }
    };

    const SortIcon = ({ field }: { field: SortField }) => (
        <span className={`ml-1 text-[8px] ${sortField === field ? 'text-[#005EB8]' : 'text-gray-300'}`}>
            {sortField === field && sortOrder === 'asc' ? '▲' : '▼'}
        </span>
    );

    const handleGenerateAI = async () => {
        if (!monthlyStats) return;
        setAiLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `あなたはQB HOUSEのエリアマネージャーです。${selectedArea}エリアの${selectedMonth}のデータを分析してください。
        
        【サマリ】
        実績: ${Math.round(monthlyStats.total).toLocaleString()}、昨対比: ${monthlyStats.yoy?.toFixed(1)}%、稼働店舗: ${monthlyStats.activeCount}
        予算達成率: ${monthlyStats.achievement?.toFixed(1)}%、ジニ係数: ${monthlyStats.gini.toFixed(3)}
        
        このエリアの現状の強み、弱み、および来月の重点施策を3点、日本語で簡潔に回答してください。`;
        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setAiReport(res.text || "診断不可");
        } catch (e) { setAiReport("AIレポート生成に失敗しました。"); } finally { setAiLoading(false); }
    };

    const KpiCard = ({ title, value, sub, trend, color = "border-t-[#005EB8]", tooltip }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} flex flex-col justify-between h-full hover:shadow-md transition-shadow`}>
            <div>
                <p className="text-[9px] text-gray-400 font-black uppercase mb-1 tracking-widest flex items-center gap-1">
                    {title}
                    {tooltip && <HelpTooltip title={title} content={tooltip} />}
                </p>
                <h3 className="text-xl font-black text-gray-800 font-display truncate">{value}</h3>
            </div>
            <div className="flex justify-between items-end mt-2">
                <p className="text-[9px] text-gray-400 font-bold truncate">{sub}</p>
                {trend !== undefined && trend !== null && (
                    <span className={`text-[9px] font-black ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trend >= 0 ? '▲' : '▼'}{Math.abs(trend).toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );

    const ChartBox = ({ id, title, children, className = "", tooltipContent }: any) => (
        <div className={`bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 flex flex-col relative group transition-all hover:shadow-md ${className}`}>
            <button onClick={() => setExpandedItem(id)} className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-gray-100 text-gray-300 rounded-xl transition-all opacity-0 group-hover:opacity-100 z-10"><i className="fas fa-expand-alt text-[10px]"></i></button>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                {title}
                {tooltipContent && <HelpTooltip title={title} content={tooltipContent} />}
            </h3>
            <div className="flex-1 w-full min-h-0">{children}</div>
        </div>
    );

    const renderChart = (id: string) => {
        if (!monthlyStats) return null;
        switch(id) {
            // OVERVIEW CHARTS
            case 'breakdown': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.breakdownData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9, fontWeight:'bold'}} /><YAxis yAxisId="left" tick={{fontSize:8}} /><YAxis yAxisId="right" orientation="right" tick={{fontSize:8}} /><Tooltip /><Legend wrapperStyle={{fontSize:9}} /><Bar yAxisId="left" dataKey="val" fill="#005EB8" radius={[4,4,0,0]} name="実績" /><Line yAxisId="right" type="monotone" dataKey="yoy" stroke="#10B981" strokeWidth={2} dot={{r:3}} name="昨対比%" /></ComposedChart></ResponsiveContainer>;
            case 'trend': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.trendData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="date" tick={{fontSize:8}} interval={2} /><YAxis yAxisId="left" tick={{fontSize:8}} /><YAxis yAxisId="right" orientation="right" tick={{fontSize:8}} unit="%" /><Tooltip /><Legend wrapperStyle={{fontSize:9}} /><Bar yAxisId="left" dataKey="val" fill="#CBD5E1" radius={[2,2,0,0]} name="実績推移" /><Line yAxisId="right" type="monotone" dataKey="yoy" stroke="#005EB8" strokeWidth={2} dot={false} name="昨対比%" /></ComposedChart></ResponsiveContainer>;
            case 'variance': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.varianceData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><ReferenceLine y={0} stroke="#000" /><Bar dataKey="val" radius={[4,4,0,0]}>{monthlyStats.varianceData.map((e,i)=><Cell key={i} fill={e.type==='total'||e.type==='base'?'#64748B':e.val>0?'#10B981':'#EF4444'} />)}<LabelList dataKey="val" position="top" fontSize={8} formatter={(v:number)=>Math.round(v/displayDivider).toLocaleString()} /></Bar></BarChart></ResponsiveContainer>;
            case 'ach_dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.achDistData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="range" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} name="店舗数" /></BarChart></ResponsiveContainer>;
            case 'abc_pie': return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={monthlyStats.rankData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">{monthlyStats.rankData.map((e, i) => <Cell key={i} fill={['#005EB8','#3B82F6','#93C5FD'][i]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" wrapperStyle={{fontSize:9}} /></PieChart></ResponsiveContainer>;
            case 'growth_rank': return <ResponsiveContainer width="100%" height="100%"><BarChart data={[...monthlyStats.growthRanking, ...monthlyStats.declineRanking]} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" /><XAxis type="number" tick={{fontSize:8}} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:8}} /><Tooltip /><ReferenceLine x={0} stroke="#000" /><Bar dataKey="yoy" barSize={10} name="昨対成長率">{[...monthlyStats.growthRanking, ...monthlyStats.declineRanking].map((e,i)=><Cell key={i} fill={e.yoy>0?'#10B981':'#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;

            // DEEP CHARTS
            case 'dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.distData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="range" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#3B82F6" radius={[4,4,0,0]} name="店舗数" /></BarChart></ResponsiveContainer>;
            case 'lutil': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.storePerformances.sort((a:any,b:any)=>b.lUtil-a.lUtil).slice(0,15)} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0,120]} tick={{fontSize:8}} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:8}} /><Tooltip formatter={(v:number)=>v.toFixed(1)+'%'} /><ReferenceLine x={100} stroke="#EF4444" strokeDasharray="3 3" /><Bar dataKey="lUtil" fill="#F59E0B" name="L消化率%" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
            case 'scatter_yoy': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left: -20}}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="val" name="実績" tick={{fontSize:8}} label={{value:'規模', position:'bottom', fontSize:8}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{fontSize:8}} label={{value:'昨対%', angle:-90, position:'left', fontSize:8}} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#005EB8" fillOpacity={0.4} /></ScatterChart></ResponsiveContainer>;
            case 'scatter_age': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="age" name="月齢" tick={{ fontSize: 8 }} label={{value:'月齢', position:'bottom', fontSize:8}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{ fontSize: 8 }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#EC4899" fillOpacity={0.5} /></ScatterChart></ResponsiveContainer>;
            case 'scatter_k': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="k" name="成長速度(k)" tick={{ fontSize: 8 }} label={{value:'k-Factor', position:'bottom', fontSize:8}} /><YAxis type="number" dataKey="val" name="実績" tick={{ fontSize: 8 }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={monthlyStats.activePerf} fill="#10B981" fillOpacity={0.5} /></ScatterChart></ResponsiveContainer>;
            case 'boxplot': 
                const bp = monthlyStats.boxPlot;
                const bpData = [{
                    name: 'Stats',
                    min: bp.min,
                    max: bp.max,
                    median: bp.median,
                    iqr: [bp.q1, bp.q3],
                    whiskers: [bp.min, bp.max]
                }];
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart layout="vertical" data={bpData} margin={{left:20}}>
                            <XAxis type="number" domain={['auto', 'auto']} tick={{fontSize:8}} />
                            <YAxis type="category" dataKey="name" hide />
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="whiskers" barSize={2} fill="#000" />
                            <Bar dataKey="iqr" barSize={20} fill="#93C5FD" radius={[2,2,2,2]} />
                            <Scatter dataKey="median" fill="#005EB8" shape="square" />
                        </ComposedChart>
                    </ResponsiveContainer>
                );
            
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-32">
                {/* Header with Filters */}
                <div className="flex flex-col xl:flex-row justify-between items-end gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">地域単月スポット分析</h2>
                        <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <i className="fas fa-map-marker-alt text-blue-500"></i> {selectedArea || 'エリア未選択'} / {selectedMonth || '月未選択'}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <select value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)} className="bg-gray-50 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#005EB8]">
                            <option value="region">地方単位</option><option value="prefecture">都道府県単位</option><option value="block">ブロック単位</option>
                        </select>
                        <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} className="bg-blue-50 text-[#005EB8] border-none rounded-xl px-4 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-[#005EB8]">
                            {areaOptions.length > 0 ? areaOptions.map(r => <option key={r} value={r}>{r}</option>) : <option value="">選択肢なし</option>}
                        </select>
                        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-gray-50 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none">
                            {allMonths.length > 0 ? allMonths.map(m => <option key={m} value={m}>{m}</option>) : <option value="">No Data</option>}
                        </select>
                        <div className="flex bg-gray-100 rounded-full p-1 ml-2">
                            <button onClick={() => setActiveTab('overview')} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${activeTab === 'overview' ? 'bg-[#005EB8] text-white' : 'text-gray-400'}`}>Overview</button>
                            <button onClick={() => setActiveTab('deep')} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${activeTab === 'deep' ? 'bg-[#005EB8] text-white' : 'text-gray-400'}`}>Deep Analysis</button>
                            <button onClick={() => setActiveTab('detail')} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${activeTab === 'detail' ? 'bg-[#005EB8] text-white' : 'text-gray-400'}`}>List</button>
                        </div>
                    </div>
                </div>

                {!monthlyStats ? (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-400 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100 animate-fadeIn">
                        <i className="fas fa-map-marked-alt text-4xl mb-4 opacity-20"></i>
                        <p className="font-bold text-center">分析対象のエリアと月を選択してください。<br/>データが存在しない場合は表示されません。</p>
                        <p className="text-xs mt-2 font-medium uppercase tracking-widest">Select Area & Month to proceed</p>
                    </div>
                ) : (
                    <>
                        {/* TAB: OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* 10 High-Level KPIs */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <KpiCard title="当月総実績" value={`${Math.round(monthlyStats.total/displayDivider).toLocaleString()}${unitS}`} sub={`${monthlyStats.activeCount}店稼働`} />
                                    <KpiCard title="全社昨対比 (YoY)" value={`${monthlyStats.yoy?.toFixed(1)}%`} sub="前年同月比" trend={monthlyStats.yoy} color="border-t-green-500" />
                                    <KpiCard title="前月比 (MoM)" value={`${monthlyStats.mom?.toFixed(1)}%`} sub="直近の勢い" trend={monthlyStats.mom} color="border-t-blue-400" />
                                    <KpiCard title="予算達成率" value={`${monthlyStats.achievement?.toFixed(1)}%`} sub={`差異: ${Math.round(monthlyStats.diff/displayDivider).toLocaleString()}`} color={monthlyStats.achievement && monthlyStats.achievement >= 100 ? "border-t-green-600" : "border-t-red-500"} />
                                    <KpiCard title="1店平均実績" value={Math.round(monthlyStats.avg/displayDivider).toLocaleString()} sub={`/${unitS}`} />
                                    <KpiCard title="達成店舗数" value={`${monthlyStats.achievedCount} / ${monthlyStats.activeCount}`} sub={`Win Rate: ${(monthlyStats.achievedCount/monthlyStats.activeCount*100).toFixed(0)}%`} />
                                    <KpiCard title="改善店舗数" value={`${monthlyStats.improvedCount} / ${monthlyStats.activeCount}`} sub="MoMプラス店舗" color="border-t-purple-500" />
                                    <KpiCard title="最高成長店" value={monthlyStats.bestYoYStore?.name} sub={`YoY: +${monthlyStats.bestYoYStore?.yoy?.toFixed(1)}%`} color="border-t-yellow-500" />
                                    <KpiCard title="ワースト成長店" value={monthlyStats.worstYoYStore?.name} sub={`YoY: ${monthlyStats.worstYoYStore?.yoy?.toFixed(1)}%`} color="border-t-red-400" />
                                    <KpiCard title="最高達成店" value={monthlyStats.bestAchStore?.name} sub={`Ach: ${monthlyStats.bestAchStore?.achievement?.toFixed(1)}%`} color="border-t-indigo-500" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <ChartBox id="breakdown" title="構成要素別 実績 & 昨対トレンド" className="lg:col-span-2 h-[400px]">{renderChart('breakdown')}</ChartBox>
                                    <ChartBox id="trend" title="エリア過去24ヶ月トレンド" className="lg:col-span-2 h-[400px]">{renderChart('trend')}</ChartBox>
                                    <ChartBox id="variance" title="昨対増減寄与度 (Waterfall)" className="lg:col-span-2 h-[400px]">{renderChart('variance')}</ChartBox>
                                    <ChartBox id="ach_dist" title="予算達成率分布 (Histogram)" className="h-[400px]">{renderChart('ach_dist')}</ChartBox>
                                    <ChartBox id="growth_rank" title="成長率ランキング Top/Bottom" className="h-[400px]">{renderChart('growth_rank')}</ChartBox>
                                    <ChartBox id="abc_pie" title="ABCランク構成 (Active)" className="lg:col-span-2 h-[400px]">{renderChart('abc_pie')}</ChartBox>
                                </div>

                                <div className="bg-gradient-to-r from-purple-50 to-white p-8 rounded-[2.5rem] border border-purple-100 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-robot text-9xl text-purple-900"></i></div>
                                    <div className="flex justify-between items-center mb-6 relative z-10">
                                        <div>
                                            <h3 className="text-xl font-black text-purple-800 font-display flex items-center gap-2">
                                                <span className="p-2 bg-purple-200 text-purple-800 rounded-xl"><i className="fas fa-magic"></i></span>
                                                AI Spot Diagnostic
                                            </h3>
                                            <p className="text-xs text-purple-400 font-bold mt-1">当月の全社パフォーマンスをAIが診断・分析します</p>
                                        </div>
                                        <button onClick={handleGenerateAI} disabled={aiLoading} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-2xl text-xs font-black shadow-xl shadow-purple-200 transition-all active:scale-95">
                                            {aiLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-brain mr-2"></i>}
                                            {aiLoading ? '診断中...' : '診断レポートを生成'}
                                        </button>
                                    </div>
                                    <div className="min-h-[150px] bg-white/60 backdrop-blur-md rounded-2xl p-6 border border-purple-50">
                                        {aiReport ? <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: marked.parse(aiReport) as string }} /> : <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase">Click AI button below</div>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: DEEP ANALYSIS */}
                        {activeTab === 'deep' && (
                            <div className="space-y-6 animate-fadeIn">
                                 {/* Structural KPI Cards (10 Cards) */}
                                 <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <KpiCard title="不平等度 (Gini)" value={monthlyStats.gini.toFixed(3)} sub="0.4以上で警戒" color={monthlyStats.gini > 0.4 ? "border-t-red-500" : "border-t-green-500"} />
                                    <KpiCard title="L消化率 (平均)" value={`${monthlyStats.avgLUtil.toFixed(1)}%`} sub="ポテンシャル充足度" />
                                    <KpiCard title="変動係数 (CV)" value={`${(monthlyStats.stdDev / monthlyStats.avg * 100).toFixed(1)}%`} sub="バラつき具合" />
                                    <KpiCard title="中央値 (Median)" value={Math.round(monthlyStats.medianVal).toLocaleString()} sub={`Avg: ${Math.round(monthlyStats.avg).toLocaleString()}`} />
                                    <KpiCard title="Top 5 シェア" value={`${monthlyStats.top5Share.toFixed(1)}%`} sub="上位5店の占有率" />
                                    <KpiCard title="Bottom 5 シェア" value={`${monthlyStats.bottom5Share.toFixed(1)}%`} sub="下位5店の占有率" />
                                    <KpiCard title="最大成長率" value={`+${(monthlyStats.maxGrowth||0).toFixed(1)}%`} sub="Top Performer" />
                                    <KpiCard title="最大衰退率" value={`${(monthlyStats.minGrowth||0).toFixed(1)}%`} sub="Worst Performer" color="border-t-red-500" />
                                    <KpiCard title="平均店舗月齢" value={Math.round(monthlyStats.activePerf.reduce((a,b)=>a+b.age,0)/monthlyStats.activeCount)} sub="months" />
                                    <KpiCard title="リスク店舗率" value={`${(monthlyStats.riskyCount / monthlyStats.activeCount * 100).toFixed(1)}%`} sub="YoY < -5%" color="border-t-orange-500" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <ChartBox id="dist" title="実績規模分布 (Histogram)" className="h-[350px]">{renderChart('dist')}</ChartBox>
                                    <ChartBox id="lutil" title="ポテンシャル消化率 (L-Util) Top 15" className="h-[350px]">{renderChart('lutil')}</ChartBox>
                                    <ChartBox id="scatter_yoy" title="実績規模 vs 昨対比 散布図" className="lg:col-span-2 h-[400px]" tooltipContent="横軸:実績、縦軸:昨対比。右上が理想的な『高収益・高成長』ゾーン。">{renderChart('scatter_yoy')}</ChartBox>
                                    <ChartBox id="scatter_age" title="店舗月齢 vs 昨対比 ライフサイクル" className="h-[400px]" tooltipContent="横軸:月齢、縦軸:昨対比。右に行くほど古い店。右下がりなら老朽化のサイン。">{renderChart('scatter_age')}</ChartBox>
                                    <ChartBox id="scatter_k" title="成長ポテンシャル(k) vs 実績" className="h-[350px]" tooltipContent="横軸:成長速度k、縦軸:実績。kが高いのに実績が低い店は、初期販促の失敗か立地ミスマッチの可能性。">{renderChart('scatter_k')}</ChartBox>
                                    <ChartBox id="boxplot" title="実績ばらつき統計 (Box Plot Sim)" className="h-[350px]" tooltipContent="中央値、四分位範囲を表示。分布の偏りを確認します。">{renderChart('boxplot')}</ChartBox>
                                </div>
                            </div>
                        )}

                        {/* TAB: DETAIL LIST */}
                        {activeTab === 'detail' && (
                            <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col animate-fadeIn">
                                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/30">
                                    <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                                        <i className="fas fa-list-ul"></i> 店舗別パフォーマンス明細
                                    </h3>
                                    <div className="relative">
                                        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Search stores..." className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#005EB8] transition-all w-64" />
                                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]"></i>
                                    </div>
                                </div>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="min-w-full text-left text-[11px] whitespace-nowrap">
                                        <thead className="bg-white text-gray-400 font-black uppercase border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th onClick={() => handleSort('name')} className="p-4 cursor-pointer hover:bg-gray-50">店舗名 <SortIcon field="name" /></th>
                                                <th onClick={() => handleSort('val')} className="p-4 text-right cursor-pointer hover:bg-gray-50">実績 <SortIcon field="val" /></th>
                                                <th onClick={() => handleSort('budget')} className="p-4 text-right cursor-pointer hover:bg-gray-50">予算 <SortIcon field="budget" /></th>
                                                <th onClick={() => handleSort('achievement')} className="p-4 text-center cursor-pointer hover:bg-gray-50">達成率 <SortIcon field="achievement" /></th>
                                                <th onClick={() => handleSort('yoy')} className="p-4 text-center cursor-pointer hover:bg-gray-50">昨対比 <SortIcon field="yoy" /></th>
                                                <th onClick={() => handleSort('mom')} className="p-4 text-center cursor-pointer hover:bg-gray-50">前月比 <SortIcon field="mom" /></th>
                                                <th onClick={() => handleSort('lUtil')} className="p-4 text-center cursor-pointer hover:bg-gray-50">L消化率 <SortIcon field="lUtil" /></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                            {sortedStores.map(s => (
                                                <tr key={s.name} className="hover:bg-blue-50/40 transition-colors group">
                                                    <td className="p-4 group-hover:text-[#005EB8] transition-colors">{s.name}</td>
                                                    <td className="p-4 text-right font-black">{Math.round(s.val).toLocaleString()}</td>
                                                    <td className="p-4 text-right text-gray-400">{Math.round(s.budget).toLocaleString()}</td>
                                                    <td className="p-4 text-center"><span className={`px-2 py-1 rounded-lg ${s.achievement && s.achievement >= 100 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>{s.achievement ? s.achievement.toFixed(1)+'%' : '-'}</span></td>
                                                    <td className={`p-4 text-center ${s.yoy && s.yoy >= 0 ? 'text-green-500' : 'text-red-400'}`}>{s.yoy ? `${s.yoy > 0 ? '+' : ''}${s.yoy.toFixed(1)}%` : '-'}</td>
                                                    <td className={`p-4 text-center ${s.mom && s.mom >= 0 ? 'text-green-500' : 'text-red-400'}`}>{s.mom ? `${s.mom > 0 ? '+' : ''}${s.mom.toFixed(1)}%` : '-'}</td>
                                                    <td className="p-4 text-center"><span className="text-purple-500 font-mono">{s.lUtil.toFixed(1)}%</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Expanded Modal */}
            {expandedItem && (
                <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm animate-fadeIn flex flex-col p-4 md:p-10">
                    <div className="flex justify-between items-center mb-8 border-b pb-4"><h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display">拡大表示分析</h2><button onClick={() => setExpandedItem(null)} className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all shadow-sm"><i className="fas fa-times text-xl"></i></button></div>
                    <div className="flex-1 bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 overflow-auto relative">{renderChart(expandedItem)}</div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }`}} />
        </div>
    );
};

export default RegionalSpotAnalysisView;
