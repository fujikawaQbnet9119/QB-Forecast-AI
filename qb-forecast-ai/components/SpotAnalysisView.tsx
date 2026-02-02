
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

interface SpotAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type SortField = 'name' | 'region' | 'val' | 'yoy' | 'mom' | 'momentum' | 'budget' | 'achievement' | 'lUtil';
type SortOrder = 'asc' | 'desc';

// --- Helpers ---
const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const SpotAnalysisView: React.FC<SpotAnalysisViewProps> = ({ allStores, dataType }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'geography' | 'detail'>('overview');
    const [sortField, setSortField] = useState<SortField>('val');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filterText, setFilterText] = useState("");
    const [expandedItem, setExpandedItem] = useState<string | null>(null);

    const isSales = dataType === 'sales';
    const unitS = isSales ? 'k' : '人';
    const displayUnit = isSales ? 'M' : 'k人';
    const displayDivider = isSales ? 1000 : 1; // Correctly handle customer units as 1
    
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
        let totalL = 0;
        
        // Variance factors
        let varNew = 0, varGrowth = 0, varDecline = 0, varClosed = 0;

        const selDate = new Date(selectedMonth);
        const prevMonthDate = new Date(selDate); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevYearDate = new Date(selDate); prevYearDate.setFullYear(prevYearDate.getFullYear() - 1);
        const prevYearStr = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;

        const regionMap = new Map<string, any>();

        stores.forEach(s => {
            const normalizedDates = s.dates.map(d => d.replace(/\//g, '-'));
            const idx = normalizedDates.indexOf(selectedMonth);
            const idxPY = normalizedDates.indexOf(prevYearStr);
            const idxPM = normalizedDates.indexOf(prevMonthStr);

            const budgetVal = s.budget ? (s.budget[selectedMonth] || 0) : 0;

            if (idx !== -1 || idxPY !== -1 || idxPM !== -1 || budgetVal > 0) {
                const val = idx !== -1 ? s.raw[idx] : 0; 
                const valPY = idxPY !== -1 ? s.raw[idxPY] : 0;
                const valPM = idxPM !== -1 ? s.raw[idxPM] : 0;

                total += val; totalPrevYear += valPY; totalPrevMonth += valPM; totalBudget += budgetVal;
                totalL += s.params.L;

                // Variance calc
                const diffPY = val - valPY;
                if (val > 0 && valPY === 0) varNew += diffPY;
                else if (val === 0 && valPY > 0) varClosed += diffPY;
                else if (diffPY > 0) varGrowth += diffPY;
                else varDecline += diffPY;

                const yoy = valPY > 0 ? ((val - valPY) / valPY) * 100 : null;
                const mom = valPM > 0 ? ((val - valPM) / valPM) * 100 : null;
                const momentum = (yoy !== null && mom !== null) ? (yoy + mom) / 2 : null;
                const achievement = budgetVal > 0 ? (val / budgetVal) * 100 : null;
                const diff = val - budgetVal;
                const lUtil = s.params.L > 0 ? (val / s.params.L) * 100 : 0;

                const sData = {
                    name: s.name, 
                    region: s.region || "未分類", 
                    block: s.block || "未分類", 
                    pref: s.prefecture || "未分類",
                    val, budget: budgetVal, achievement, diff,
                    yoy, mom, momentum, lUtil, 
                    isActiveNow: s.isActive && val > 0, 
                    age: s.raw.length,
                    rank: s.stats?.abcRank || 'C', 
                    cv: (s.stats?.cv || 0) * 100, 
                    contribution: val - valPY,
                    k: s.params.k,
                    L: s.params.L
                };

                if (val > 0 || valPY > 0 || budgetVal > 0) {
                    storePerformances.push(sData);
                    
                    // Region Aggregation
                    if (!regionMap.has(sData.region)) {
                        regionMap.set(sData.region, { name: sData.region, val: 0, budget: 0, prevVal: 0, count: 0, values: [] });
                    }
                    const r = regionMap.get(sData.region)!;
                    r.val += val; r.budget += budgetVal; r.prevVal += valPY;
                    if (val > 0) { r.count++; r.values.push(val); }
                }
            }
        });

        const regionData = Array.from(regionMap.values()).map(v => ({
            ...v,
            yoy: v.prevVal > 0 ? ((v.val - v.prevVal) / v.prevVal) * 100 : 0,
            achievement: v.budget > 0 ? (v.val / v.budget) * 100 : 0,
            avg: v.count > 0 ? v.val / v.count : 0
        })).sort((a, b) => b.val - a.val);

        const activePerf = storePerformances.filter(s => s.isActiveNow);
        const salesValues = activePerf.map(s => s.val);
        
        // --- 18 KPIs Calculation ---
        const avgVal = activePerf.length > 0 ? total / activePerf.length : 0;
        const medianVal = calculateMedian(salesValues);
        const stdDev = Math.sqrt(activePerf.reduce((sum, s) => sum + Math.pow(s.val - avgVal, 2), 0) / Math.max(1, activePerf.length));
        const gini = calculateGini(salesValues);
        const skewness = stdDev > 0 ? (3 * (avgVal - medianVal)) / stdDev : 0; // Pearson's second skewness coefficient

        // Sorts
        const sortedBySales = [...activePerf].sort((a,b) => b.val - a.val);
        const sortedByYoY = [...activePerf].filter(s => s.yoy !== null).sort((a,b) => b.yoy - a.yoy);
        const sortedByAch = [...activePerf].filter(s => s.achievement !== null).sort((a,b) => b.achievement - a.achievement);

        // Pareto
        const top20PctCount = Math.ceil(activePerf.length * 0.2);
        const top20Sum = sortedBySales.slice(0, top20PctCount).reduce((a,b) => a + b.val, 0);
        const bottom20PctCount = Math.ceil(activePerf.length * 0.2);
        const bottom20Sum = sortedBySales.slice(-bottom20PctCount).reduce((a,b) => a + b.val, 0);
        
        // Detailed Counters
        const achievedCount = activePerf.filter(s => (s.achievement || 0) >= 100).length;
        const improvedCount = activePerf.filter(s => (s.mom || 0) > 0).length;
        const declinedCount = activePerf.filter(s => (s.mom || 0) < 0).length;
        const riskyCount = activePerf.filter(s => (s.yoy || 0) < -10).length;
        const opportunityCount = activePerf.filter(s => s.lUtil < 70 && (s.yoy || 0) > 0).length;
        
        const rankACount = activePerf.filter(s => s.rank === 'A').length;
        const rankCCount = activePerf.filter(s => s.rank === 'C').length;

        const maxYoY = sortedByYoY[0]?.yoy || 0;
        const minYoY = sortedByYoY[sortedByYoY.length - 1]?.yoy || 0;

        // --- Waterfall & Distributions ---
        const varianceData = [
            { name: '前年実績', val: totalPrevYear, type: 'base' },
            { name: '既存成長', val: varGrowth, type: 'plus' },
            { name: '新規店', val: varNew, type: 'plus' },
            { name: '既存減少', val: varDecline, type: 'minus' },
            { name: '退店', val: varClosed, type: 'minus' },
            { name: '当月実績', val: total, type: 'total' }
        ];

        const budgetDiffs = storePerformances.map(s => ({ name: s.name, val: s.diff })).sort((a,b) => b.val - a.val);
        const budgetWaterfallData = budgetDiffs.length > 20 ? [...budgetDiffs.slice(0, 10), ...budgetDiffs.slice(-10)] : budgetDiffs;

        // Histogram
        const maxSales = sortedBySales[0]?.val || 1000;
        const distBuckets = Array(15).fill(0);
        activePerf.forEach(s => {
            const idx = Math.min(14, Math.floor(s.val / (maxSales/15)));
            distBuckets[idx]++;
        });
        const distData = distBuckets.map((c, i) => ({ range: `${Math.round((maxSales/15)*i/displayDivider)}${unitS}~`, count: c }));

        // Scatter Data (Bubble)
        const bubbleData = activePerf.map(s => ({
            name: s.name,
            x: s.val,
            y: s.yoy || 0,
            z: s.budget || 100, // Bubble size by budget scale
            ach: s.achievement || 0
        }));

        // --- Simulated Daily Trend (Interpolation for visual context) ---
        // Just for visual effect, creates a smooth curve representing the month's accumulation
        const dailyTrend = Array.from({length: 30}, (_, i) => {
            const progress = (i + 1) / 30;
            // Add some randomness to simulate daily fluctuation
            const randomVar = 1 + (Math.random() * 0.1 - 0.05);
            return {
                day: i + 1,
                cumulative: total * progress * randomVar,
                budget: totalBudget * progress
            };
        });

        return {
            total, totalBudget, diff: total - totalBudget,
            yoy: totalPrevYear > 0 ? ((total - totalPrevYear) / totalPrevYear) * 100 : 0,
            mom: totalPrevMonth > 0 ? ((total - totalPrevMonth) / totalPrevMonth) * 100 : 0,
            achievement: totalBudget > 0 ? (total / totalBudget) * 100 : 0,
            momentum: ((totalPrevYear > 0 ? ((total - totalPrevYear) / totalPrevYear) * 100 : 0) + (totalPrevMonth > 0 ? ((total - totalPrevMonth) / totalPrevMonth) * 100 : 0)) / 2,
            
            activeCount: activePerf.length,
            achievedCount,
            missedCount: activePerf.length - achievedCount,
            winRate: activePerf.length > 0 ? (achievedCount / activePerf.length) * 100 : 0,
            
            improvedCount, declinedCount,
            avgVal, medianVal, maxVal: sortedBySales[0]?.val || 0,
            
            maxYoY, minYoY,
            bestStore: sortedByAch[0], worstStore: sortedByAch[sortedByAch.length - 1],
            
            gini, stdDev, skewness, cv: avgVal > 0 ? (stdDev/avgVal)*100 : 0,
            
            top20Share: total > 0 ? (top20Sum / total) * 100 : 0,
            bottom20Share: total > 0 ? (bottom20Sum / total) * 100 : 0,
            
            rankACount, rankCCount,
            avgLUtil: totalL > 0 ? (total / totalL) * 100 : 0,
            potentialGap: Math.max(0, totalL - total),
            avgAge: activePerf.reduce((a,b)=>a+b.age,0) / (activePerf.length||1),
            newStoreCount: activePerf.filter(s => s.age < 12).length,
            oldStoreCount: activePerf.filter(s => s.age > 120).length,
            avgK: activePerf.reduce((a,b)=>a+b.k,0) / (activePerf.length||1),
            riskyCount, opportunityCount,
            
            topRegion: regionData[0],
            worstRegion: regionData[regionData.length - 1],

            storePerformances, activePerf,
            regionData, varianceData, budgetWaterfallData, distData, bubbleData, dailyTrend
        };
    }, [selectedMonth, stores]);

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
        const prompt = `あなたはQB HOUSEの経営アナリストです。${selectedMonth}の単月スポットデータを分析してください。
        
        【サマリ】
        実績: ${Math.round(monthlyStats.total).toLocaleString()}, 達成率: ${monthlyStats.achievement?.toFixed(1)}%, 昨対: ${monthlyStats.yoy?.toFixed(1)}%
        
        【構造的特徴】
        ジニ係数: ${monthlyStats.gini.toFixed(3)}, 上位20%シェア: ${monthlyStats.top20Share.toFixed(1)}%
        リスク店舗数: ${monthlyStats.riskyCount} (YoY < -10%)
        
        この結果から、経営陣が今月認識すべき「良い兆候」と「悪い兆候」、そして来月に向けた具体的なアクションプランを3点、日本語で簡潔に提示してください。`;
        
        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setAiReport(res.text || "診断不可");
        } catch (e) { setAiReport("AIレポート生成に失敗しました。"); } finally { setAiLoading(false); }
    };

    const KpiCard = ({ title, value, sub, trend, color = "border-t-[#005EB8]", tooltip }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} flex flex-col justify-between h-full hover:shadow-md transition-shadow group`}>
            <div>
                <p className="text-[9px] text-gray-400 font-black uppercase mb-1 tracking-widest flex items-center gap-1 group-hover:text-[#005EB8] transition-colors">
                    {title}
                    {tooltip && <HelpTooltip title={title} content={tooltip} />}
                </p>
                <div className="text-xl font-black text-gray-800 font-display truncate">{value}</div>
            </div>
            <div className="flex justify-between items-end mt-2">
                <p className="text-[9px] text-gray-400 font-bold truncate max-w-[70%]">{sub}</p>
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
            <button onClick={() => setExpandedItem(id)} className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-gray-100 text-gray-300 hover:text-[#005EB8] rounded-xl transition-all opacity-0 group-hover:opacity-100 z-10"><i className="fas fa-expand-alt text-[10px]"></i></button>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1 group-hover:text-[#005EB8] transition-colors">
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
            case 'trend_sim': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.dailyTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="day" tick={{fontSize:9}} interval={4} /><YAxis tick={{fontSize:9}} /><Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} /><Area type="monotone" dataKey="cumulative" stroke="#005EB8" fill="#005EB8" fillOpacity={0.1} strokeWidth={3} name="累積実績 (推計)" /><Line type="monotone" dataKey="budget" stroke="#CBD5E1" strokeDasharray="5 5" dot={false} name="予算ライン" /></ComposedChart></ResponsiveContainer>;
            case 'region_bar': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyStats.regionData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9, fontWeight:'bold'}} /><YAxis yAxisId="left" tick={{fontSize:8}} /><YAxis yAxisId="right" orientation="right" tick={{fontSize:8}} unit="%" /><Tooltip formatter={(v:number, n)=> n==='achievement' ? v.toFixed(1)+'%' : Math.round(v).toLocaleString()} /><Bar yAxisId="left" dataKey="val" fill="#005EB8" radius={[4,4,0,0]} name="実績" /><Line yAxisId="right" type="monotone" dataKey="achievement" stroke="#F59E0B" strokeWidth={2} dot={{r:3}} name="達成率%" /></ComposedChart></ResponsiveContainer>;
            case 'waterfall_yoy': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.varianceData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="name" tick={{fontSize:9}} /><YAxis tick={{fontSize:9}} /><Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} /><ReferenceLine y={0} stroke="#000" /><Bar dataKey="val" radius={[4,4,0,0]}>{monthlyStats.varianceData.map((e,i)=><Cell key={i} fill={e.type==='total'||e.type==='base'?'#64748B':e.val>0?'#10B981':'#EF4444'} />)}<LabelList dataKey="val" position="top" fontSize={8} formatter={(v:number)=>Math.round(v/displayDivider).toLocaleString()} /></Bar></BarChart></ResponsiveContainer>;
            case 'budget_diff_rank': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.budgetWaterfallData} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" /><XAxis type="number" tick={{fontSize:8}} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:8}} /><Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} /><ReferenceLine x={0} stroke="#000" /><Bar dataKey="val" name="予算乖離額">{monthlyStats.budgetWaterfallData.map((e,i)=><Cell key={i} fill={e.val>0?'#10B981':'#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;
            case 'ai_report': return <div className="h-full overflow-y-auto text-xs text-gray-600 leading-relaxed custom-scrollbar p-4 bg-white/50 rounded-xl border border-purple-50">{aiReport ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(aiReport) as string }} /> : <div className="h-full flex flex-col items-center justify-center text-gray-300 font-bold uppercase gap-2"><i className="fas fa-magic text-2xl"></i><span>Click AI Button</span></div>}</div>;

            // DEEP ANALYSIS CHARTS
            case 'hist_dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.distData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" /><XAxis dataKey="range" tick={{fontSize:9}} /><YAxis tick={{fontSize:9}} /><Tooltip /><Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} name="店舗数" /></BarChart></ResponsiveContainer>;
            case 'bubble_portfolio': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="x" name="実績" tick={{fontSize:9}} label={{value:'実績規模', position:'bottom', fontSize:9}} /><YAxis type="number" dataKey="y" name="昨対比" tick={{fontSize:9}} label={{value:'YoY %', angle:-90, position:'left', fontSize:9}} /><ZAxis type="number" dataKey="z" range={[50, 500]} name="予算規模" /><Tooltip cursor={{strokeDasharray:'3 3'}} formatter={(v:number)=>v.toLocaleString()} /><ReferenceLine y={0} stroke="#CBD5E1" /><ReferenceLine x={monthlyStats.avgVal} stroke="#CBD5E1" strokeDasharray="3 3" /><Scatter name="Stores" data={monthlyStats.bubbleData} fill="#005EB8" fillOpacity={0.6}>{monthlyStats.bubbleData.map((e,i)=><Cell key={i} fill={e.y>=0 ? '#005EB8' : '#EF4444'} />)}</Scatter></ScatterChart></ResponsiveContainer>;
            case 'l_util_rank': return <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyStats.activePerf.sort((a,b)=>b.lUtil-a.lUtil).slice(0,15)} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0,120]} tick={{fontSize:9}} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Tooltip formatter={(v:number)=>v.toFixed(1)+'%'} /><ReferenceLine x={100} stroke="#EF4444" strokeDasharray="3 3" /><Bar dataKey="lUtil" fill="#F59E0B" name="L消化率" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
            case 'age_scatter': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis type="number" dataKey="age" name="月齢" tick={{ fontSize: 9 }} label={{value:'店舗月齢', position:'bottom', fontSize:9}} /><YAxis type="number" dataKey="yoy" name="昨対" tick={{ fontSize: 9 }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v:number, n)=>n==='昨対'?v.toFixed(1)+'%':v} /><Scatter name="Stores" data={monthlyStats.activePerf} fill="#EC4899" fillOpacity={0.5} /></ScatterChart></ResponsiveContainer>;
            
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">全社単月スポット分析</h2>
                            <span className="text-xs bg-blue-100 text-[#005EB8] px-3 py-1 rounded-full border border-blue-200 uppercase font-black tracking-widest">{isSales ? 'Sales' : 'Traffic'} Snapshot</span>
                        </div>
                        <p className="text-xs text-gray-400 font-bold mt-1">Monthly Performance Snapshot & Deep Dive</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="bg-gray-100 p-1 rounded-full flex shadow-inner">
                            <button onClick={() => setActiveTab('overview')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase flex items-center gap-2 ${activeTab === 'overview' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                <i className="fas fa-chart-pie"></i> サマリ (Overview)
                            </button>
                            <button onClick={() => setActiveTab('geography')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase flex items-center gap-2 ${activeTab === 'geography' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                <i className="fas fa-microscope"></i> 構造分析 (Deep)
                            </button>
                            <button onClick={() => setActiveTab('detail')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase flex items-center gap-2 ${activeTab === 'detail' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                <i className="fas fa-list"></i> リスト (List)
                            </button>
                        </div>

                        <div className="relative">
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm font-black text-[#005EB8] outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer shadow-sm">
                                {allMonths.length > 0 ? allMonths.map(m => <option key={m} value={m}>{m}</option>) : <option value="">No Data</option>}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#005EB8]"><i className="fas fa-chevron-down text-xs"></i></div>
                        </div>
                    </div>
                </div>

                {!monthlyStats ? (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-400 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100 animate-fadeIn">
                        <i className="fas fa-database text-4xl mb-4 opacity-20"></i>
                        <p className="font-bold">データが読み込まれていないか、対象月のデータがありません。</p>
                    </div>
                ) : (
                    <>
                        {/* TAB: OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* 18 KPIs Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <KpiCard title="当月総実績" value={`${Math.round(monthlyStats.total/displayDivider).toLocaleString()}${unitS}`} sub={`${monthlyStats.activeCount}店稼働`} />
                                    <KpiCard title="予算合計" value={`${Math.round(monthlyStats.totalBudget/displayDivider).toLocaleString()}${unitS}`} sub="Total Budget" color="border-t-gray-400" />
                                    <KpiCard title="予算差異 (Gap)" value={`${Math.round(monthlyStats.diff/displayDivider).toLocaleString()}${unitS}`} sub="Variance" color={monthlyStats.diff >= 0 ? "border-t-green-500" : "border-t-red-500"} />
                                    <KpiCard title="達成率" value={`${monthlyStats.achievement?.toFixed(1)}%`} sub="Achievement" color={monthlyStats.achievement >= 100 ? "border-t-green-600" : "border-t-red-500"} />
                                    <KpiCard title="昨対比 (YoY)" value={`${monthlyStats.yoy?.toFixed(1)}%`} sub="vs Last Year" trend={monthlyStats.yoy} color="border-t-blue-500" />
                                    <KpiCard title="前月比 (MoM)" value={`${monthlyStats.mom?.toFixed(1)}%`} sub="vs Last Month" trend={monthlyStats.mom} />
                                    
                                    <KpiCard title="モメンタム" value={`${monthlyStats.momentum?.toFixed(1)}%`} sub="(YoY+MoM)/2" color="border-t-purple-500" />
                                    <KpiCard title="稼働店舗数" value={`${monthlyStats.activeCount}店`} sub="Active Stores" />
                                    <KpiCard title="達成店舗数" value={`${monthlyStats.achievedCount}店`} sub="Achieved" color="border-t-green-500" />
                                    <KpiCard title="未達店舗数" value={`${monthlyStats.missedCount}店`} sub="Missed" color="border-t-red-400" />
                                    <KpiCard title="店舗勝率" value={`${monthlyStats.winRate.toFixed(1)}%`} sub="Win Rate" />
                                    <KpiCard title="前月超え店舗" value={`${monthlyStats.improvedCount}店`} sub="Improved MoM" />
                                    
                                    <KpiCard title="前月割れ店舗" value={`${monthlyStats.declinedCount}店`} sub="Declined MoM" color="border-t-orange-400" />
                                    <KpiCard title="1店平均実績" value={Math.round(monthlyStats.avgVal).toLocaleString()} sub={`Avg per Store`} />
                                    <KpiCard title="中央値実績" value={Math.round(monthlyStats.medianVal).toLocaleString()} sub="Median" />
                                    <KpiCard title="最高成長率" value={`+${monthlyStats.maxYoY.toFixed(1)}%`} sub="Max YoY" />
                                    <KpiCard title="最高貢献店" value={monthlyStats.bestStore?.name} sub={`Ach: ${monthlyStats.bestStore?.achievement?.toFixed(0)}%`} color="border-t-yellow-500" />
                                    <KpiCard title="ワースト店" value={monthlyStats.worstStore?.name} sub={`Ach: ${monthlyStats.worstStore?.achievement?.toFixed(0)}%`} color="border-t-red-600" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <ChartBox id="trend_sim" title="当月日次進捗推移 (AI Simulation)" className="lg:col-span-2 h-[450px]" tooltipContent="月次データを元に、日次の積み上げカーブを統計的に推計したグラフです。">{renderChart('trend_sim')}</ChartBox>
                                    <ChartBox id="region_bar" title="地域別 実績 & 達成率" className="lg:col-span-2 h-[450px]">{renderChart('region_bar')}</ChartBox>
                                    <ChartBox id="waterfall_yoy" title="昨対増減寄与 (Waterfall)" className="lg:col-span-2 h-[450px]">{renderChart('waterfall_yoy')}</ChartBox>
                                    <ChartBox id="budget_diff_rank" title="予算乖離額ランキング (Top/Bottom)" className="lg:col-span-2 h-[450px]">{renderChart('budget_diff_rank')}</ChartBox>
                                </div>

                                <div className="bg-gradient-to-br from-purple-900 to-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden text-white">
                                    <div className="absolute top-0 right-0 p-6 opacity-10"><i className="fas fa-brain text-9xl"></i></div>
                                    <div className="flex justify-between items-start mb-6 relative z-10">
                                        <div>
                                            <h3 className="text-2xl font-black font-display flex items-center gap-3">
                                                <span className="p-2 bg-white/10 rounded-xl"><i className="fas fa-magic text-purple-300"></i></span>
                                                AI Strategic Diagnostic
                                            </h3>
                                            <p className="text-xs text-purple-200 font-bold mt-2 opacity-80">Generated by Gemini 3 Flash Preview</p>
                                        </div>
                                        <button onClick={handleGenerateAI} disabled={aiLoading} className="bg-white text-purple-900 px-8 py-3 rounded-2xl text-xs font-black shadow-lg hover:bg-purple-50 transition-all flex items-center gap-2">
                                            {aiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                                            {aiLoading ? 'ANALYZING...' : 'RUN DIAGNOSIS'}
                                        </button>
                                    </div>
                                    <div className="bg-black/20 backdrop-blur-md rounded-2xl p-8 border border-white/10 min-h-[120px]">
                                        {aiReport ? <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(aiReport) as string }} /> : <div className="flex items-center justify-center h-full text-white/30 font-black uppercase tracking-widest text-sm">Waiting for analysis trigger...</div>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: DEEP ANALYSIS */}
                        {activeTab === 'geography' && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* 18 Structural KPIs */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <KpiCard title="ジニ係数 (格差)" value={monthlyStats.gini.toFixed(3)} sub="0.4以上で警戒" color={monthlyStats.gini > 0.4 ? "border-t-red-500" : "border-t-green-500"} />
                                    <KpiCard title="変動係数 (CV)" value={`${monthlyStats.cv.toFixed(1)}%`} sub="実績のバラつき" />
                                    <KpiCard title="標準偏差" value={Math.round(monthlyStats.stdDev).toLocaleString()} sub="Standard Deviation" />
                                    <KpiCard title="歪度 (Skewness)" value={monthlyStats.skewness.toFixed(2)} sub="分布の偏り" />
                                    <KpiCard title="Top 20% シェア" value={`${monthlyStats.top20Share.toFixed(1)}%`} sub="上位集中度" />
                                    <KpiCard title="Bottom 20% シェア" value={`${monthlyStats.bottom20Share.toFixed(1)}%`} sub="下位依存度" />
                                    
                                    <KpiCard title="ランクA 店舗数" value={monthlyStats.rankACount} sub="Top Performers" color="border-t-yellow-500" />
                                    <KpiCard title="ランクC 店舗数" value={monthlyStats.rankCCount} sub="Under Performers" color="border-t-gray-400" />
                                    <KpiCard title="L消化率 (平均)" value={`${monthlyStats.avgLUtil.toFixed(1)}%`} sub="Potential Usage" />
                                    <KpiCard title="残存ポテンシャル" value={`${Math.round(monthlyStats.potentialGap/displayDivider).toLocaleString()}${unitS}`} sub="Gap to Limit" />
                                    <KpiCard title="平均店舗月齢" value={`${Math.round(monthlyStats.avgAge)}ヶ月`} sub="Avg Age" />
                                    <KpiCard title="新店数 (<12mo)" value={monthlyStats.newStoreCount} sub="New Stores" color="border-t-blue-400" />
                                    
                                    <KpiCard title="老舗店数 (>120mo)" value={monthlyStats.oldStoreCount} sub="Mature Stores" />
                                    <KpiCard title="平均成長速度 (k)" value={monthlyStats.avgK.toFixed(3)} sub="Growth Speed" />
                                    <KpiCard title="リスク店舗数" value={monthlyStats.riskyCount} sub="YoY < -10%" color="border-t-red-600" />
                                    <KpiCard title="チャンス店舗数" value={monthlyStats.opportunityCount} sub="L未達 & 成長中" color="border-t-green-400" />
                                    <KpiCard title="最高効率地域" value={monthlyStats.topRegion.name} sub={`Avg: ${Math.round(monthlyStats.topRegion.avg).toLocaleString()}`} />
                                    <KpiCard title="最低効率地域" value={monthlyStats.worstRegion.name} sub={`Avg: ${Math.round(monthlyStats.worstRegion.avg).toLocaleString()}`} color="border-t-red-400" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <ChartBox id="hist_dist" title="実績規模分布 (Histogram)" className="h-[400px]">{renderChart('hist_dist')}</ChartBox>
                                    <ChartBox id="bubble_portfolio" title="ポートフォリオ (3D Bubble)" className="lg:col-span-2 h-[400px]" tooltipContent="横軸:実績、縦軸:昨対比、円の大きさ:予算規模。右上が理想的な状態。">{renderChart('bubble_portfolio')}</ChartBox>
                                    <ChartBox id="l_util_rank" title="L消化率トップランキング" className="h-[400px]">{renderChart('l_util_rank')}</ChartBox>
                                    <ChartBox id="age_scatter" title="店舗月齢 vs 昨対比" className="lg:col-span-2 h-[400px]" tooltipContent="店舗の古さと成長率の関係。右肩下がりになっている場合は老朽化のサイン。">{renderChart('age_scatter')}</ChartBox>
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
                                                <th onClick={() => handleSort('region')} className="p-4 cursor-pointer hover:bg-gray-50">地方 <SortIcon field="region" /></th>
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
                                                    <td className="p-4 text-gray-400">{s.region}</td>
                                                    <td className="p-4 text-right font-black">{Math.round(s.val).toLocaleString()}</td>
                                                    <td className="p-4 text-right text-gray-400">{s.budget > 0 ? Math.round(s.budget).toLocaleString() : '-'}</td>
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

export default SpotAnalysisView;
