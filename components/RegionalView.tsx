
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import { generateRegionalReport } from '../services/geminiService';
import { logisticModel, calculatePearsonCorrelation } from '../services/analysisEngine';
import { marked } from 'marked';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Line, ScatterChart, Scatter, ZAxis, Cell, ReferenceLine, Legend,
    PieChart, Pie, LabelList, LineChart, ErrorBar, AreaChart, Area, Treemap
} from 'recharts';

interface RegionalViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

// Japan Prefecture Grid Layout for Tile Map
// IDs must match the normalized prefecture names (without 県/府/都, except Hokkaido)
const PREF_GRID = [
    { id: '北海道', x: 8, y: 0 },
    { id: '青森', x: 8, y: 2 }, 
    { id: '秋田', x: 7, y: 3 }, { id: '岩手', x: 8, y: 3 },
    { id: '山形', x: 7, y: 4 }, { id: '宮城', x: 8, y: 4 },
    { id: '石川', x: 5, y: 4 }, { id: '新潟', x: 6, y: 4 }, { id: '福島', x: 8, y: 5 },
    { id: '福井', x: 5, y: 5 }, { id: '富山', x: 6, y: 5 }, { id: '栃木', x: 7, y: 5 }, { id: '群馬', x: 6, y: 5 }, { id: '茨城', x: 8, y: 6 },
    { id: '岐阜', x: 5, y: 6 }, { id: '長野', x: 6, y: 6 }, { id: '埼玉', x: 7, y: 6 }, { id: '千葉', x: 8, y: 7 },
    { id: '愛知', x: 5, y: 7 }, { id: '山梨', x: 6, y: 7 }, { id: '東京', x: 7, y: 7 }, { id: '神奈川', x: 7, y: 8 },
    { id: '静岡', x: 6, y: 8 },
    { id: '京都', x: 4, y: 6 }, { id: '滋賀', x: 4, y: 5 },
    { id: '兵庫', x: 3, y: 6 }, { id: '大阪', x: 4, y: 7 }, { id: '奈良', x: 4, y: 8 }, { id: '三重', x: 5, y: 8 },
    { id: '和歌山', x: 3, y: 8 },
    { id: '鳥取', x: 2, y: 6 }, { id: '岡山', x: 2, y: 7 },
    { id: '島根', x: 1, y: 6 }, { id: '広島', x: 1, y: 7 },
    { id: '山口', x: 0, y: 7 },
    { id: '徳島', x: 2, y: 9 }, { id: '香川', x: 2, y: 8 },
    { id: '愛媛', x: 1, y: 9 }, { id: '高知', x: 1, y: 10 },
    { id: '福岡', x: 0, y: 9 }, { id: '大分', x: 1, y: 8 },
    { id: '佐賀', x: -1, y: 9 }, { id: '熊本', x: 0, y: 10 }, { id: '宮崎', x: 1, y: 11 },
    { id: '長崎', x: -1, y: 10 }, { id: '鹿児島', x: 0, y: 11 },
    { id: '沖縄', x: 0, y: 13 }
];

const COLORS = ['#005EB8', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

// Helper: Normalize Prefecture Name (Remove suffixes for matching)
const normalizePrefecture = (name: string): string => {
    if (!name) return "Unknown";
    const trimmed = name.trim();
    if (trimmed === '北海道') return trimmed;
    return trimmed.replace(/[都府県]$/, '');
};

// Helper for Gini Calculation
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) {
        num += (i + 1) * sorted[i];
    }
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

// Helper for Quartiles
const calculateBoxPlotData = (values: number[]) => {
    if (values.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return { min, q1, median, q3, max };
};

type AggregationLevel = 'region' | 'prefecture' | 'block';

const RegionalView: React.FC<RegionalViewProps> = ({ allStores, dataType }) => {
    const [viewMode, setViewMode] = useState<AggregationLevel>('region');
    const [mapMetric, setMapMetric] = useState<'yoy' | 'k'>('yoy');
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';
    const totalUnitLabel = isSales ? '百万円' : '千人';
    const totalValueDivider = isSales ? 1000 : 1000; 

    // --- Core Aggregation Logic ---
    const aggregatedData = useMemo(() => {
        const groupingKey = viewMode; 
        const groupMap = new Map<string, any>();
        const vintageMap = new Map<string, { sums: number[], counts: number[] }>();

        let totalVolume = 0;
        let totalGrowth = 0;
        let activeStores = 0;

        const datesSet = new Set<string>();
        (Object.values(allStores) as StoreData[]).forEach(s => s.dates.forEach(d => datesSet.add(d)));
        const sortedDates = Array.from(datesSet).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
        const lastDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length-1].replace(/\//g,'-')) : new Date();
        
        const historyLength = 24;
        const trendDates = sortedDates.slice(-historyLength);

        (Object.values(allStores) as StoreData[]).forEach(s => {
            if (!s.isActive) return;
            
            let key = "Unknown";
            if (groupingKey === 'region') key = s.region || "Unknown";
            else if (groupingKey === 'prefecture') key = normalizePrefecture(s.prefecture || "Unknown");
            else if (groupingKey === 'block') key = s.block || "Unknown";

            if (!groupMap.has(key)) {
                groupMap.set(key, { 
                    name: key, 
                    sales: 0, 
                    prevSales: 0, 
                    L: 0, 
                    sumK: 0,
                    weightedCagrSum: 0,
                    count: 0, 
                    stores: [],
                    abcCounts: { A: 0, B: 0, C: 0 },
                    salesValues: [] as number[],
                    ageCounts: { young: 0, mid: 0, old: 0 },
                    forecastY1: 0,
                    forecastY2: 0,
                    forecastY3: 0,
                    monthlyTotals: Array(historyLength).fill(0),
                    monthlyStoreCounts: Array(historyLength).fill(0),
                    cannibalDiffSumAbs: 0, 
                    cannibalNetDiffAbs: 0, 
                });
                vintageMap.set(key, { sums: Array(60).fill(0), counts: Array(60).fill(0) });
            }
            
            const g = groupMap.get(key);
            const v = vintageMap.get(key)!;

            const sales = s.stats?.lastYearSales || 0;
            const prev = s.stats?.prevYearSales || 0;
            
            g.sales += sales;
            g.prevSales += prev;
            g.L += s.params.L;
            g.sumK += s.params.k;
            g.count++;
            g.weightedCagrSum += (s.stats?.cagr || 0) * sales;
            g.stores.push(s);
            g.salesValues.push(sales/12);
            
            if (s.stats?.abcRank) g.abcCounts[s.stats.abcRank]++;

            const age = s.raw.length;
            if (age < 60) g.ageCounts.young++;
            else if (age < 120) g.ageCounts.mid++;
            else g.ageCounts.old++;

            s.raw.forEach((val, i) => {
                if (i < 60) {
                    v.sums[i] += val;
                    v.counts[i]++;
                }
            });

            for (let t = 1; t <= 36; t++) {
                const futureIdx = s.raw.length + t - 1;
                const tr = logisticModel(futureIdx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const d = new Date(lastDate);
                d.setMonth(lastDate.getMonth() + t);
                const sea = s.seasonal[d.getMonth()] || 1.0;
                const val = Math.max(0, tr * sea); 
                
                if (t <= 12) g.forecastY1 += val;
                else if (t <= 24) g.forecastY2 += val;
                else g.forecastY3 += val;
            }

            trendDates.forEach((dateStr, idx) => {
                const dataIdx = s.dates.indexOf(dateStr);
                if (dataIdx !== -1) {
                    const val = s.raw[dataIdx];
                    g.monthlyTotals[idx] += val;
                    g.monthlyStoreCounts[idx]++;
                }
            });

            totalVolume += sales;
            totalGrowth += (sales - prev);
            activeStores++;
        });

        const data = Array.from(groupMap.values()).map(g => {
            const yoy = g.prevSales > 0 ? ((g.sales - g.prevSales) / g.prevSales) * 100 : 0;
            const efficiency = g.count > 0 ? (g.sales / g.count) / 12 : 0; 
            const potentialUtilization = (g.L > 0 && g.count > 0) ? (efficiency / (g.L / g.count)) * 100 : 0;
            const gap = Math.max(0, (g.L * 12) - g.sales);
            const weightedCagr = g.sales > 0 ? g.weightedCagrSum / g.sales : 0;
            const avgK = g.count > 0 ? g.sumK / g.count : 0;
            const gini = calculateGini(g.salesValues);
            const boxPlot = calculateBoxPlotData(g.salesValues);

            const topStores = g.stores.sort((a:StoreData,b:StoreData) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0)).slice(0, 5);
            let corrSum = 0;
            let corrCount = 0;
            for(let i=0; i<topStores.length; i++) {
                for(let j=i+1; j<topStores.length; j++) {
                    const corr = calculatePearsonCorrelation(topStores[i].raw.slice(-12), topStores[j].raw.slice(-12));
                    corrSum += corr;
                    corrCount++;
                }
            }
            const avgCorrelation = corrCount > 0 ? corrSum / corrCount : 0;

            const blockAbsChange = Math.abs(g.sales - g.prevSales);
            let sumStoreAbsChanges = 0;
            g.stores.forEach((s: StoreData) => {
               sumStoreAbsChanges += Math.abs((s.stats?.lastYearSales||0) - (s.stats?.prevYearSales||0));
            });
            const zeroSumScore = sumStoreAbsChanges > 0 ? 1 - (blockAbsChange / sumStoreAbsChanges) : 0;

            const vData = vintageMap.get(g.name)!;
            const vintageCurve = vData.sums.map((sum, i) => vData.counts[i] >= 3 ? Math.round(sum / vData.counts[i]) : null);

            const indexTrend = g.monthlyTotals.map((val: number, i: number) => {
                const base = g.monthlyTotals[0] || 1;
                return { 
                    month: i, 
                    val: (val / base) * 100,
                    eff: g.monthlyStoreCounts[i] > 0 ? (val / g.monthlyStoreCounts[i]) : 0
                };
            });

            return { 
                ...g, yoy, efficiency, potentialUtilization, gap, cagr: weightedCagr * 100, avgK, gini, boxPlot, avgCorrelation, zeroSumScore, indexTrend, vintageCurve,
                forecasts: { now: g.sales, y1: g.forecastY1, y2: g.forecastY2, y3: g.forecastY3 },
                ratioA: g.abcCounts.A / (g.count || 1) * 100, ratioB: g.abcCounts.B / (g.count || 1) * 100, ratioC: g.abcCounts.C / (g.count || 1) * 100,
                ratioYoung: g.ageCounts.young / (g.count || 1) * 100, ratioMid: g.ageCounts.mid / (g.count || 1) * 100, ratioOld: g.ageCounts.old / (g.count || 1) * 100,
            };
        });

        data.sort((a, b) => b.sales - a.sales);
        const totalPrev = totalVolume - totalGrowth;
        const totalYoy = totalPrev > 0 ? (totalGrowth / totalPrev) * 100 : 0;

        return { data, kpis: { totalVolume, activeStores, totalYoy }, trendDates };
    }, [allStores, viewMode]);

    // --- Chart Data Helpers ---
    const portfolioData = useMemo(() => aggregatedData.data.map(d => ({ name: d.name, x: Math.round(d.efficiency), y: Number(d.yoy.toFixed(1)), z: Math.round(d.sales / totalValueDivider), count: d.count })), [aggregatedData, totalValueDivider]);
    const lUtilizationData = useMemo(() => aggregatedData.data.map(d => ({ name: d.name, x: Math.min(120, Math.round(d.potentialUtilization)), y: Number(d.yoy.toFixed(1)), z: Math.round(d.sales / totalValueDivider), realX: Math.round(d.potentialUtilization) })), [aggregatedData, totalValueDivider]);
    const cagrRankingData = useMemo(() => [...aggregatedData.data].sort((a, b) => b.cagr - a.cagr).slice(0, 15), [aggregatedData]);
    const regionalVintageData = useMemo(() => {
        const topGroups = [...aggregatedData.data].sort((a, b) => b.sales - a.sales).slice(0, 5);
        return Array.from({ length: 36 }, (_, i) => {
            const p: any = { month: i + 1 };
            topGroups.forEach(g => { if (g.vintageCurve[i] !== null) p[g.name] = g.vintageCurve[i]; });
            return p;
        });
    }, [aggregatedData]);
    const dominantDensityData = useMemo(() => aggregatedData.data.map(d => ({ name: d.name, x: d.count, y: Math.round(d.efficiency), size: d.sales })), [aggregatedData]);
    const rankingData = useMemo(() => [...aggregatedData.data].sort((a, b) => b.efficiency - a.efficiency).slice(0, 20), [aggregatedData]);
    const waterfallData = useMemo(() => {
        const diffs = aggregatedData.data.map(d => ({ name: d.name, val: d.sales - d.prevSales })).sort((a,b) => b.val - a.val);
        return diffs.length > 20 ? [...diffs.slice(0, 10), ...diffs.slice(-10)] : diffs;
    }, [aggregatedData]);
    const forecastRaceData = useMemo(() => {
        const periods = ['now', 'y1', 'y2', 'y3'];
        const topRegions = [...aggregatedData.data].sort((a, b) => b.sales - a.sales).slice(0, 10);
        return { 
            data: periods.map(p => {
                const pt: any = { period: {now:'現在',y1:'1年後',y2:'2年後',y3:'3年後'}[p] };
                [...topRegions].sort((a, b) => b.forecasts[p as keyof typeof b.forecasts] - a.forecasts[p as keyof typeof a.forecasts]).forEach((r, i) => pt[r.name] = i + 1);
                return pt;
            }), 
            regions: topRegions.map(r => r.name) 
        };
    }, [aggregatedData]);
    const giniMonitorData = useMemo(() => [...aggregatedData.data].sort((a,b) => b.gini - a.gini).slice(0, 15), [aggregatedData]);
    const agePyramidData = useMemo(() => [...aggregatedData.data].sort((a,b) => b.sales - a.sales).slice(0, 15), [aggregatedData]);
    const boxPlotChartData = useMemo(() => [...aggregatedData.data].sort((a,b) => b.boxPlot.median - a.boxPlot.median).slice(0, 15).map(d => ({ name: d.name, min: d.boxPlot.min, q1: d.boxPlot.q1, median: d.boxPlot.median, q3: d.boxPlot.q3, max: d.boxPlot.max, iqr: [d.boxPlot.q1, d.boxPlot.q3] })), [aggregatedData]);
    const indexRaceData = useMemo(() => {
        const topBlocks = [...aggregatedData.data].sort((a,b) => b.sales - a.sales).slice(0, 8);
        return { data: Array.from({length: topBlocks[0]?.indexTrend.length || 0}, (_, i) => {
            const p: any = { month: i };
            topBlocks.forEach(b => { if(b.indexTrend[i]) p[b.name] = b.indexTrend[i].val; });
            return p;
        }), lines: topBlocks.map(b => b.name) };
    }, [aggregatedData]);
    const efficiencyTrendData = useMemo(() => {
        const topBlocks = [...aggregatedData.data].sort((a,b) => b.efficiency - a.efficiency).slice(0, 8);
        return { data: Array.from({length: topBlocks[0]?.indexTrend.length || 0}, (_, i) => {
            const p: any = { month: i };
            topBlocks.forEach(b => { if(b.indexTrend[i]) p[b.name] = Math.round(b.indexTrend[i].eff); });
            return p;
        }), lines: topBlocks.map(b => b.name) };
    }, [aggregatedData]);
    const cohesionData = useMemo(() => [...aggregatedData.data].sort((a,b) => b.zeroSumScore - a.zeroSumScore).slice(0, 15).map(d => ({ name: d.name, zeroSum: d.zeroSumScore, correlation: d.avgCorrelation })), [aggregatedData]);
    const bubbleScaleEffData = useMemo(() => aggregatedData.data.map(d => ({ name: d.name, x: d.count, y: d.yoy, z: Math.round(d.sales / totalValueDivider), eff: d.efficiency })), [aggregatedData, totalValueDivider]);

    const handleGenerateAI = async () => {
        setAiLoading(true);
        const aiInput = aggregatedData.data.slice(0, 30).map(d => ({ name: d.name, sales: d.sales, yoy: d.yoy, count: d.count, efficiency: d.efficiency, gap: d.gap }));
        const report = await generateRegionalReport(aiInput, isSales);
        setAiReport(report);
        setAiLoading(false);
    };

    const getHeatmapColor = (val: number, type: 'yoy' | 'k') => {
        if (type === 'yoy') return val >= 10 ? '#15803d' : val >= 5 ? '#22c55e' : val >= 0 ? '#86efac' : val >= -5 ? '#fca5a5' : '#ef4444';
        return val >= 0.15 ? '#a855f7' : val >= 0.12 ? '#d8b4fe' : val >= 0.08 ? '#e9d5ff' : val >= 0.05 ? '#f3e8ff' : '#f5f5f5';
    };

    const ExpandButton = ({ target }: { target: string }) => (
        <button onClick={() => setExpandedChart(target)} className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-gray-400 hover:text-[#005EB8] rounded-md shadow-sm transition-all z-10"><i className="fas fa-expand-alt text-[10px]"></i></button>
    );

    const KpiCard = ({ title, value, sub, color = "border-t-[#005EB8]" }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} animate-fadeIn flex flex-col justify-between h-full hover:shadow-md transition-shadow`}>
            <div><p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">{title}</p><h3 className="text-xl font-black text-gray-800 font-display truncate">{value}</h3></div>
            {sub && <p className="text-[9px] text-gray-400 font-bold mt-1">{sub}</p>}
        </div>
    );

    const ChartBox = ({ id, title, children, className = "", tooltipContent }: any) => (
        <div className={`bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6 flex flex-col relative group transition-all hover:shadow-md ${className}`}>
            <ExpandButton target={id} />
            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                {title}
                {tooltipContent && <HelpTooltip title={title} content={tooltipContent} />}
            </h3>
            <div className="flex-1 w-full min-h-0">{children}</div>
        </div>
    );

    const renderChart = (chartId: string) => {
        switch(chartId) {
            case 'cagr': return <ResponsiveContainer width="100%" height="100%"><BarChart data={cagrRankingData} layout="horizontal"><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 'bold'}} interval={0} height={40} angle={-30} textAnchor="end" /><YAxis tick={{fontSize: 9}} unit="%" /><Tooltip formatter={(v:number)=>v.toFixed(2)+'%'} /><Bar dataKey="cagr" radius={[4, 4, 0, 0]}>{cagrRankingData.map((e, i) => <Cell key={i} fill={e.cagr > 0 ? '#10B981' : '#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;
            case 'l_util': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis type="number" dataKey="x" name="消化率" unit="%" tick={{fontSize: 9}} label={{ value: '消化率', position: 'bottom', fontSize: 9 }} /><YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: 'YoY', angle: -90, position: 'left', fontSize: 9 }} /><ZAxis type="number" dataKey="z" range={[200, 2000]} /><Tooltip /><ReferenceLine x={80} stroke="#cbd5e1" strokeDasharray="3 3" /><ReferenceLine y={0} stroke="#cbd5e1" /><Scatter data={lUtilizationData} fill="#005EB8"><LabelList dataKey="name" position="top" style={{fontSize: '9px', fontWeight: 'bold'}} /></Scatter></ScatterChart></ResponsiveContainer>;
            case 'regional_vintage': return <ResponsiveContainer width="100%" height="100%"><LineChart data={regionalVintageData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="month" tick={{fontSize: 9}} /><YAxis tick={{fontSize: 9}} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px' }} />{Object.keys(regionalVintageData[0] || {}).filter(k => k !== 'month').map((region, i) => <Line key={region} type="monotone" dataKey={region} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />)}</LineChart></ResponsiveContainer>;
            case 'eff_ranking': return <ResponsiveContainer width="100%" height="100%"><BarChart data={rankingData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip formatter={(v:number)=>v.toLocaleString()} /><Bar dataKey="efficiency" radius={[0, 4, 4, 0]} barSize={16}>{rankingData.map((e, i) => <Cell key={i} fill={i < 3 ? '#005EB8' : '#CBD5E1'} />)}<LabelList dataKey="efficiency" position="right" fontSize={9} formatter={(v:number)=>Math.round(v).toLocaleString()} /></Bar></BarChart></ResponsiveContainer>;
            case 'portfolio': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis type="number" dataKey="x" name="効率" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '店舗効率', position: 'bottom', fontSize: 9 }} /><YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: 'YoY', angle: -90, position: 'left', fontSize: 9 }} /><ZAxis type="number" dataKey="z" range={[200, 2000]} /><Tooltip /><ReferenceLine y={0} stroke="#cbd5e1" /><Scatter data={portfolioData} fill="#005EB8">{portfolioData.map((e, i) => <Cell key={i} fill={e.y >= 0 ? '#005EB8' : '#F59E0B'} fillOpacity={0.7} />)}<LabelList dataKey="name" position="top" style={{fontSize: '10px', fontWeight: 'bold'}} /></Scatter></ScatterChart></ResponsiveContainer>;
            case 'waterfall': return <ResponsiveContainer width="100%" height="100%"><BarChart data={waterfallData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip formatter={(v:number)=>v.toLocaleString()} /><ReferenceLine x={0} stroke="#000" /><Bar dataKey="val" radius={[0, 4, 4, 0]}>{waterfallData.map((e, i) => <Cell key={i} fill={e.val > 0 ? '#10B981' : '#EF4444'} />)}</Bar></BarChart></ResponsiveContainer>;
            case 'map': return <div className="relative w-full h-full transform scale-90 origin-top-left md:scale-100 md:origin-center">{PREF_GRID.map(p => { const d = aggregatedData.data.find(d => d.name === p.id); const val = mapMetric === 'yoy' ? (d?.yoy || 0) : (d?.avgK || 0); const color = d ? getHeatmapColor(val, mapMetric) : '#F1F5F9'; return <div key={p.id} className="absolute w-10 h-10 md:w-12 md:h-12 flex flex-col items-center justify-center rounded-lg shadow-sm border border-white text-white transition-transform hover:scale-110 hover:z-10 cursor-pointer" style={{ left: `${p.x * 44 + 40}px`, top: `${p.y * 44 + 20}px`, backgroundColor: color, color: mapMetric === 'k' && !d ? '#ccc' : (mapMetric === 'k' && (val || 0) < 0.1 ? '#999' : 'white') }} title={`${p.id}: ${val.toFixed(mapMetric === 'yoy' ? 1 : 3)}`}><span className="text-[10px] font-black">{p.id}</span><span className="text-[8px] font-mono">{mapMetric === 'yoy' ? `${val > 0 ? '+' : ''}${val.toFixed(0)}%` : val.toFixed(3)}</span></div> })}</div>;
            case 'density': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis type="number" dataKey="x" name="店舗数" unit="店" tick={{fontSize: 9}} label={{ value: '店舗数', position: 'bottom', fontSize: 9 }} /><YAxis type="number" dataKey="y" name="平均売上" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '平均実績', angle: -90, position: 'left', fontSize: 9 }} /><ZAxis type="number" dataKey="size" range={[100, 1000]} /><Tooltip /><Scatter data={dominantDensityData} fill="#005EB8"><LabelList dataKey="name" position="top" style={{fontSize: '9px', fontWeight: 'bold'}} /></Scatter></ScatterChart></ResponsiveContainer>;
            case 'forecast_race': return <ResponsiveContainer width="100%" height="100%"><LineChart data={forecastRaceData.data} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="period" tick={{fontSize: 10, fontWeight: 'bold'}} /><YAxis reversed={true} width={30} tick={{fontSize: 9}} domain={[1, 'auto']} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px' }} />{forecastRaceData.regions.map((r, i) => <Line key={r} type="monotone" dataKey={r} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />)}</LineChart></ResponsiveContainer>;
            case 'gini': return <ResponsiveContainer width="100%" height="100%"><BarChart data={giniMonitorData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" domain={[0, 0.6]} tick={{fontSize: 9}} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip formatter={(v:number)=>v.toFixed(3)} /><ReferenceLine x={0.4} stroke="#EF4444" strokeDasharray="3 3" /><Bar dataKey="gini" radius={[0, 4, 4, 0]} barSize={20}>{giniMonitorData.map((e, i) => <Cell key={i} fill={e.gini > 0.4 ? '#EF4444' : '#10B981'} />)}<LabelList dataKey="gini" position="right" fontSize={9} formatter={(v:number)=>v.toFixed(3)} /></Bar></BarChart></ResponsiveContainer>;
            case 'age_pyramid': return <ResponsiveContainer width="100%" height="100%"><BarChart data={agePyramidData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip formatter={(v:number)=>v.toFixed(1)+'%'} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="ratioYoung" stackId="a" fill="#3B82F6" name="< 5年" /><Bar dataKey="ratioMid" stackId="a" fill="#A855F7" name="5-10年" /><Bar dataKey="ratioOld" stackId="a" fill="#64748B" name="> 10年" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
            case 'block_scale': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis type="number" dataKey="x" name="店舗数" unit="店" tick={{fontSize: 9}} label={{ value: '管理店舗数', position: 'bottom', fontSize: 9 }} /><YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: 'YoY', angle: -90, position: 'left', fontSize: 9 }} /><ZAxis type="number" dataKey="z" range={[100, 2000]} /><Tooltip /><ReferenceLine y={0} stroke="#cbd5e1" /><Scatter data={bubbleScaleEffData} fill="#005EB8">{bubbleScaleEffData.map((e, i) => <Cell key={i} fill={e.eff > aggregatedData.kpis.totalVolume/aggregatedData.kpis.activeStores/12 ? '#005EB8' : '#F59E0B'} fillOpacity={0.7} />)}<LabelList dataKey="name" position="top" style={{fontSize: '9px', fontWeight: 'bold'}} /></Scatter></ScatterChart></ResponsiveContainer>;
            case 'index_race': return <ResponsiveContainer width="100%" height="100%"><LineChart data={indexRaceData.data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="month" tick={{fontSize: 9}} label={{ value: '経過月数', position: 'bottom', fontSize: 9 }} /><YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px' }} />{indexRaceData.lines.map((line, i) => <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer>;
            case 'efficiency_trend': return <ResponsiveContainer width="100%" height="100%"><LineChart data={efficiencyTrendData.data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="month" tick={{fontSize: 9}} label={{ value: '経過月数', position: 'bottom', fontSize: 9 }} /><YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} /><Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} /><Legend wrapperStyle={{ fontSize: '10px' }} />{efficiencyTrendData.lines.map((line, i) => <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer>;
            case 'box_plot': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={boxPlotChartData} layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" tick={{fontSize: 9}} domain={['auto', 'auto']} /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip cursor={{fill: 'transparent'}} /><Bar dataKey="iqr" barSize={12} fill="#93C5FD" radius={[2,2,2,2]} /><Scatter dataKey="median" fill="#005EB8" shape="square" /><Scatter dataKey="min" fill="#CBD5E1" shape="cross" /><Scatter dataKey="max" fill="#CBD5E1" shape="cross" /></ComposedChart></ResponsiveContainer>;
            case 'cohesion': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={cohesionData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="name" tick={{fontSize: 9, fontWeight:'bold'}} angle={-30} textAnchor="end" height={60} /><YAxis yAxisId="left" tick={{fontSize: 9}} label={{ value: 'Zero-Sum', angle: -90, position: 'left', fontSize: 9 }} /><YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} label={{ value: 'Correlation', angle: -90, position: 'right', fontSize: 9 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar yAxisId="left" dataKey="zeroSum" name="Zero-Sum (Risk)" barSize={20} fill="#EF4444" fillOpacity={0.7} radius={[4,4,0,0]} /><Line yAxisId="right" type="monotone" dataKey="correlation" name="Avg Correlation" stroke="#005EB8" strokeWidth={2} dot={{r:3}} /></ComposedChart></ResponsiveContainer>;
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            地域エリア比較分析
                            <span className="text-xs bg-blue-100 text-[#005EB8] px-2 py-1 rounded-md border border-blue-200">{isSales ? 'Sales' : 'Traffic'} View</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Geographical Strategy & Performance Map</p>
                    </div>
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                        <button onClick={() => setViewMode('region')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'region' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>地方 (Region)</button>
                        <button onClick={() => setViewMode('prefecture')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'prefecture' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>都道府県 (Pref)</button>
                        <button onClick={() => setViewMode('block')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'block' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>ブロック (Block)</button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
                    <KpiCard title="総実績 (Total)" value={`${Math.round(aggregatedData.kpis.totalVolume / totalValueDivider).toLocaleString()}${totalUnitLabel}`} />
                    <KpiCard title="全社成長率 (Total YoY)" value={`${aggregatedData.kpis.totalYoy >= 0 ? '+' : ''}${aggregatedData.kpis.totalYoy.toFixed(1)}%`} color={aggregatedData.kpis.totalYoy >= 0 ? 'border-t-green-500' : 'border-t-red-500'} />
                    <KpiCard title="最高効率エリア" value={aggregatedData.data.length > 0 ? [...aggregatedData.data].sort((a,b) => b.efficiency - a.efficiency)[0]?.name : '-'} color="border-t-purple-500" />
                    <KpiCard title="最高成長エリア" value={aggregatedData.data.length > 0 ? [...aggregatedData.data].sort((a,b) => b.yoy - a.yoy)[0]?.name : '-'} color="border-t-orange-500" />
                </div>

                <ChartBox id="cagr" title="中期成長トレンド予測 (3-Year CAGR Forecast)" className="h-[350px]" tooltipContent="各エリアのAI予測モデルに基づき、今後3年間の年平均成長率（CAGR）を算出・ランキング化しました。">{renderChart('cagr')}</ChartBox>

                {viewMode === 'region' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="l_util" title="ポテンシャル消化率マップ" className="lg:col-span-2 h-[500px]" tooltipContent="横軸に消化率、縦軸に成長率。左上（未消化・高成長）は攻め、右下（高消化・低成長）は守り。">{renderChart('l_util')}</ChartBox>
                            <ChartBox id="regional_vintage" title="地域別 Vintage 分析" className="lg:col-span-2 h-[500px]" tooltipContent="地域ごとの「オープン後の成長カーブ」を比較します。">{renderChart('regional_vintage')}</ChartBox>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="portfolio" title="地域ポートフォリオ" className="lg:col-span-2 h-[500px]" tooltipContent="縦軸に成長率、横軸に効率。右上が最強エリア。">{renderChart('portfolio')}</ChartBox>
                            <ChartBox id="waterfall" title="増減寄与度分析" className="lg:col-span-2 h-[500px]" tooltipContent="全社の成長に対してどの地域が寄与したか。">{renderChart('waterfall')}</ChartBox>
                        </div>
                        <ChartBox id="eff_ranking" title="エリア別 効率性ランキング" className="h-[600px]" tooltipContent="1店舗あたりの平均月商ランキング。">{renderChart('eff_ranking')}</ChartBox>
                        
                        <div className="bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><span className="p-1 bg-purple-100 text-purple-600 rounded"><i className="fas fa-magic"></i></span> AI Regional Strategic Insight</h3>
                                <button onClick={handleGenerateAI} disabled={aiLoading} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all">{aiLoading ? '分析中...' : 'AI分析を実行'}</button>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed">{aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} /> : <p className="text-xs text-gray-400">各エリアのデータをAIが解析し、リソース配分の提案やリスク警告を行います。</p>}</div>
                        </div>
                    </div>
                )}

                {viewMode === 'prefecture' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="map" title="JAPAN Tile Map" className="lg:col-span-2 h-[600px]" tooltipContent="日本地図上のヒートマップ。">
                                <div className="flex justify-end mb-4"><div className="flex bg-gray-100 p-1 rounded-full"><button onClick={() => setMapMetric('yoy')} className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${mapMetric === 'yoy' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>成長率 (YoY)</button><button onClick={() => setMapMetric('k')} className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${mapMetric === 'k' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400'}`}>成長速度 (k)</button></div></div>
                                {renderChart('map')}
                            </ChartBox>
                            <ChartBox id="density" title="ドミナント密度 vs 効率散布図" className="lg:col-span-2 h-[500px]" tooltipContent="店舗数が多いのに効率が高いエリア（右上）はドミナント成功例。">{renderChart('density')}</ChartBox>
                        </div>
                        <ChartBox id="forecast_race" title="中期エリア予測レース" className="h-[500px]" tooltipContent="今後3年間の予測順位変動。">{renderChart('forecast_race')}</ChartBox>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="gini" title="県内格差（ジニ係数）モニター" className="lg:col-span-2 h-[500px]" tooltipContent="県内の店舗間格差。">{renderChart('gini')}</ChartBox>
                            <ChartBox id="age_pyramid" title="店舗年齢構成ピラミッド" className="lg:col-span-2 h-[500px]" tooltipContent="各県の店舗の老朽化具合。">{renderChart('age_pyramid')}</ChartBox>
                        </div>
                    </div>
                )}

                {viewMode === 'block' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="block_scale" title="ブロック規模 vs 効率" className="lg:col-span-2 h-[500px]" tooltipContent="管理店舗数と効率の関係。">{renderChart('block_scale')}</ChartBox>
                            <ChartBox id="index_race" title="インデックス成長レース" className="lg:col-span-2 h-[500px]" tooltipContent="24ヶ月前を100とした成長比較。">{renderChart('index_race')}</ChartBox>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="efficiency_trend" title="1店舗あたり平均売上推移" className="lg:col-span-2 h-[500px]" tooltipContent="効率の時系列推移。">{renderChart('efficiency_trend')}</ChartBox>
                            <ChartBox id="waterfall" title="ブロック別 ウォーターフォール" className="lg:col-span-2 h-[500px]" tooltipContent="YoY増減への寄与。">{renderChart('waterfall')}</ChartBox>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartBox id="box_plot" title="ブロック内偏差値 (Box Plot)" className="lg:col-span-2 h-[500px]" tooltipContent="ブロック内の店舗実績のバラつき。">{renderChart('box_plot')}</ChartBox>
                            <ChartBox id="cohesion" title="統制力 & カニバリゼーション検知" className="lg:col-span-2 h-[500px]" tooltipContent="店舗間の連動性と食い合いのリスク。">{renderChart('cohesion')}</ChartBox>
                        </div>
                    </div>
                )}
            </div>
            {expandedChart && (
                <div className="fixed inset-0 z-[100] bg-white backdrop-blur-sm animate-fadeIn flex flex-col p-4 md:p-10">
                    <div className="flex justify-between items-center mb-8 border-b pb-4"><h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display">拡大表示分析</h2><button onClick={() => setExpandedChart(null)} className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all"><i className="fas fa-times text-xl"></i></button></div>
                    <div className="flex-1 bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 overflow-auto">{renderChart(expandedChart)}</div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }`}} />
        </div>
    );
};

export default RegionalView;
