
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import { generateRegionalReport } from '../services/geminiService';
import { logisticModel, calculatePearsonCorrelation } from '../services/analysisEngine';
import { marked } from 'marked';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Line, ScatterChart, Scatter, ZAxis, Cell, ReferenceLine, Legend,
    PieChart, Pie, LabelList, LineChart, ErrorBar
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

        // Date logic for forecast and trends
        const datesSet = new Set<string>();
        Object.values(allStores).forEach(s => s.dates.forEach(d => datesSet.add(d)));
        const sortedDates = Array.from(datesSet).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
        const lastDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length-1].replace(/\//g,'-')) : new Date();
        
        // Rolling history for Index Race (last 24 months)
        const historyLength = 24;
        const trendDates = sortedDates.slice(-historyLength);

        Object.values(allStores).forEach(s => {
            // STRICT FILTER: Exclude closed stores
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
                    // New Metrics
                    salesValues: [] as number[], // For Box Plot & Gini
                    ageCounts: { young: 0, mid: 0, old: 0 },
                    forecastY1: 0,
                    forecastY2: 0,
                    forecastY3: 0,
                    // Time Series Aggregates
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
            g.salesValues.push(sales/12); // Monthly avg for box plot
            
            if (s.stats?.abcRank) g.abcCounts[s.stats.abcRank]++;

            // Age Composition (Months)
            const age = s.raw.length;
            if (age < 60) g.ageCounts.young++;
            else if (age < 120) g.ageCounts.mid++;
            else g.ageCounts.old++;

            // Vintage Aggregation
            s.raw.forEach((val, i) => {
                if (i < 60) {
                    v.sums[i] += val;
                    v.counts[i]++;
                }
            });

            // Forecast Calculation (Simple)
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

            // Time Series for Index Race & Zero-Sum
            // Align store data to global trendDates
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
            
            // Gini
            const gini = calculateGini(g.salesValues);

            // Box Plot Data (Monthly Avg Sales)
            const boxPlot = calculateBoxPlotData(g.salesValues);

            // Correlation (Average Inter-Store Correlation)
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

            // Zero-Sum Score
            const blockAbsChange = Math.abs(g.sales - g.prevSales);
            let sumStoreAbsChanges = 0;
            g.stores.forEach((s: StoreData) => {
               sumStoreAbsChanges += Math.abs((s.stats?.lastYearSales||0) - (s.stats?.prevYearSales||0));
            });
            const zeroSumScore = sumStoreAbsChanges > 0 ? 1 - (blockAbsChange / sumStoreAbsChanges) : 0;

            // Process Vintage
            const vData = vintageMap.get(g.name)!;
            const vintageCurve = vData.sums.map((sum, i) => vData.counts[i] >= 3 ? Math.round(sum / vData.counts[i]) : null);

            // Index Race Data
            const indexTrend = g.monthlyTotals.map((val: number, i: number) => {
                const base = g.monthlyTotals[0] || 1;
                return { 
                    month: i, 
                    val: (val / base) * 100,
                    eff: g.monthlyStoreCounts[i] > 0 ? (val / g.monthlyStoreCounts[i]) : 0
                };
            });

            return { 
                ...g, 
                yoy, 
                efficiency, 
                potentialUtilization,
                gap,
                cagr: weightedCagr * 100,
                avgK,
                gini,
                boxPlot,
                avgCorrelation,
                zeroSumScore,
                indexTrend,
                vintageCurve,
                forecasts: {
                    now: g.sales,
                    y1: g.forecastY1,
                    y2: g.forecastY2,
                    y3: g.forecastY3
                },
                ratioA: g.abcCounts.A / (g.count || 1) * 100,
                ratioB: g.abcCounts.B / (g.count || 1) * 100,
                ratioC: g.abcCounts.C / (g.count || 1) * 100,
                ratioYoung: g.ageCounts.young / (g.count || 1) * 100,
                ratioMid: g.ageCounts.mid / (g.count || 1) * 100,
                ratioOld: g.ageCounts.old / (g.count || 1) * 100,
            };
        });

        // Default sort
        data.sort((a, b) => b.sales - a.sales);

        const totalPrev = totalVolume - totalGrowth;
        const totalYoy = totalPrev > 0 ? (totalGrowth / totalPrev) * 100 : 0;

        const kpis = {
            totalVolume,
            activeStores,
            totalYoy
        };

        return { data, kpis, trendDates };
    }, [allStores, viewMode]);

    // --- Chart Data Helpers ---

    const portfolioData = useMemo(() => {
        return aggregatedData.data.map(d => ({
            name: d.name,
            x: Math.round(d.efficiency),
            y: Number(d.yoy.toFixed(1)),
            z: Math.round(d.sales / totalValueDivider), // Size bubble
            count: d.count
        }));
    }, [aggregatedData, totalValueDivider]);

    const lUtilizationData = useMemo(() => {
        return aggregatedData.data.map(d => ({
            name: d.name,
            x: Math.min(120, Math.round(d.potentialUtilization)), // Cap at 120% for visuals
            y: Number(d.yoy.toFixed(1)),
            z: Math.round(d.sales / totalValueDivider),
            realX: Math.round(d.potentialUtilization)
        }));
    }, [aggregatedData, totalValueDivider]);

    const cagrRankingData = useMemo(() => {
        return [...aggregatedData.data].sort((a, b) => b.cagr - a.cagr).slice(0, 15);
    }, [aggregatedData]);

    const regionalVintageData = useMemo(() => {
        const topGroups = [...aggregatedData.data].sort((a, b) => b.sales - a.sales).slice(0, 5);
        const maxLength = 36;
        return Array.from({ length: maxLength }, (_, i) => {
            const p: any = { month: i + 1 };
            topGroups.forEach(g => {
                if (g.vintageCurve[i] !== null) {
                    p[g.name] = g.vintageCurve[i];
                }
            });
            return p;
        });
    }, [aggregatedData]);

    // Enhanced for "Dominant Density vs Efficiency"
    const dominantDensityData = useMemo(() => {
        return aggregatedData.data.map(d => ({
            name: d.name,
            x: d.count, // Store Count
            y: Math.round(d.efficiency), // Avg Sales
            size: d.sales
        }));
    }, [aggregatedData]);

    const rankingData = useMemo(() => {
        return [...aggregatedData.data].sort((a, b) => b.efficiency - a.efficiency).slice(0, 20);
    }, [aggregatedData]);

    const waterfallData = useMemo(() => {
        const diffs = aggregatedData.data.map(d => ({
            name: d.name,
            val: d.sales - d.prevSales
        })).sort((a,b) => b.val - a.val);
        if (diffs.length > 20) {
            return [...diffs.slice(0, 10), ...diffs.slice(-10)];
        }
        return diffs;
    }, [aggregatedData]);

    const forecastRaceData = useMemo(() => {
        const periods = ['now', 'y1', 'y2', 'y3'];
        const periodLabels = { now: '現在', y1: '1年後', y2: '2年後', y3: '3年後' };
        const topRegions = [...aggregatedData.data].sort((a, b) => b.sales - a.sales).slice(0, 10);
        const regionNames = topRegions.map(r => r.name);

        const chartData = periods.map(period => {
            const sorted = [...topRegions].sort((a, b) => b.forecasts[period as keyof typeof b.forecasts] - a.forecasts[period as keyof typeof a.forecasts]);
            const point: any = { period: periodLabels[period as keyof typeof periodLabels] };
            sorted.forEach((r, rank) => {
                point[r.name] = rank + 1;
            });
            return point;
        });
        return { data: chartData, regions: regionNames };
    }, [aggregatedData]);

    const giniMonitorData = useMemo(() => {
        return [...aggregatedData.data].sort((a,b) => b.gini - a.gini).slice(0, 15);
    }, [aggregatedData]);

    const agePyramidData = useMemo(() => {
        return [...aggregatedData.data].sort((a,b) => b.sales - a.sales).slice(0, 15);
    }, [aggregatedData]);

    // --- Block Analytics Helpers ---
    const boxPlotChartData = useMemo(() => {
        return [...aggregatedData.data].sort((a,b) => b.boxPlot.median - a.boxPlot.median).slice(0, 15).map(d => ({
            name: d.name,
            min: d.boxPlot.min,
            q1: d.boxPlot.q1,
            median: d.boxPlot.median,
            q3: d.boxPlot.q3,
            max: d.boxPlot.max,
            iqr: [d.boxPlot.q1, d.boxPlot.q3]
        }));
    }, [aggregatedData]);

    const indexRaceData = useMemo(() => {
        const topBlocks = [...aggregatedData.data].sort((a,b) => b.sales - a.sales).slice(0, 8);
        const len = topBlocks[0]?.indexTrend.length || 0;
        const data = [];
        for(let i=0; i<len; i++) {
            const p: any = { month: i };
            topBlocks.forEach(b => {
                if(b.indexTrend[i]) p[b.name] = b.indexTrend[i].val;
            });
            data.push(p);
        }
        return { data, lines: topBlocks.map(b => b.name) };
    }, [aggregatedData]);

    const efficiencyTrendData = useMemo(() => {
        const topBlocks = [...aggregatedData.data].sort((a,b) => b.efficiency - a.efficiency).slice(0, 8);
        const len = topBlocks[0]?.indexTrend.length || 0;
        const data = [];
        for(let i=0; i<len; i++) {
            const p: any = { month: i };
            topBlocks.forEach(b => {
                if(b.indexTrend[i]) p[b.name] = Math.round(b.indexTrend[i].eff);
            });
            data.push(p);
        }
        return { data, lines: topBlocks.map(b => b.name) };
    }, [aggregatedData]);

    const cohesionData = useMemo(() => {
        return [...aggregatedData.data].sort((a,b) => b.zeroSumScore - a.zeroSumScore).slice(0, 15).map(d => ({
            name: d.name,
            zeroSum: d.zeroSumScore,
            correlation: d.avgCorrelation
        }));
    }, [aggregatedData]);

    const bubbleScaleEffData = useMemo(() => {
        return aggregatedData.data.map(d => ({
            name: d.name,
            x: d.count,
            y: d.yoy,
            z: Math.round(d.sales / totalValueDivider),
            eff: d.efficiency
        }));
    }, [aggregatedData, totalValueDivider]);


    // --- Interaction ---
    const handleGenerateAI = async () => {
        setAiLoading(true);
        const aiInput = aggregatedData.data.slice(0, 30).map(d => ({
            name: d.name,
            sales: d.sales,
            yoy: d.yoy,
            count: d.count,
            efficiency: d.efficiency,
            gap: d.gap
        }));
        const report = await generateRegionalReport(aiInput, isSales);
        setAiReport(report);
        setAiLoading(false);
    };

    const getHeatmapColor = (val: number, type: 'yoy' | 'k') => {
        if (type === 'yoy') {
            if (val >= 10) return '#15803d';
            if (val >= 5) return '#22c55e';
            if (val >= 0) return '#86efac';
            if (val >= -5) return '#fca5a5';
            return '#ef4444';
        } else {
            if (val >= 0.15) return '#a855f7';
            if (val >= 0.12) return '#d8b4fe';
            if (val >= 0.08) return '#e9d5ff';
            if (val >= 0.05) return '#f3e8ff';
            return '#f5f5f5';
        }
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

    const renderChart = useCallback((chartId: string) => {
        switch(chartId) {
            case 'cagr': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cagrRankingData} layout="horizontal" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 'bold'}} interval={0} height={40} angle={-30} textAnchor="end" />
                        <YAxis tick={{fontSize: 9}} unit="%" />
                        <Tooltip formatter={(val: number) => val.toFixed(2) + '%'} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
                            {cagrRankingData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.cagr > 0 ? '#10B981' : '#EF4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'l_util': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" dataKey="x" name="消化率" unit="%" tick={{fontSize: 9}} label={{ value: 'ポテンシャル消化率 (Sales / L)', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: '成長率 (YoY)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <ZAxis type="number" dataKey="z" range={[200, 2000]} name="総規模" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                        <ReferenceLine x={80} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Saturation(80%)', position: 'insideTopRight', fontSize: 9, fill:'#94a3b8' }} />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <Scatter name="Regions" data={lUtilizationData} fill="#005EB8">
                            {lUtilizationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.realX > 80 ? '#F59E0B' : '#005EB8'} fillOpacity={0.7} />
                            ))}
                            <LabelList dataKey="name" position="top" style={{fontSize: '10px', fontWeight: 'bold'}} />
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'regional_vintage': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={regionalVintageData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{fontSize: 9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize: 9}} label={{ value: `平均${isSales ? '売上' : '客数'}`, angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(val: number) => Math.round(val).toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        {Object.keys(regionalVintageData[0] || {}).filter(k => k !== 'month').map((region, i) => (
                            <Line key={region} type="monotone" dataKey={region} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'eff_ranking': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankingData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} interval={0} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="efficiency" radius={[0, 4, 4, 0]} barSize={16}>
                            {rankingData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index < 3 ? '#005EB8' : '#CBD5E1'} />
                            ))}
                            <LabelList dataKey="efficiency" position="right" fontSize={9} formatter={(v: number) => Math.round(v).toLocaleString()} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'portfolio': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" dataKey="x" name="効率" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '店舗効率 (Avg/Store)', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: '成長率 (YoY)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <ZAxis type="number" dataKey="z" range={[200, 2000]} name="総規模" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <Scatter name="Regions" data={portfolioData} fill="#005EB8">
                            {portfolioData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.y >= 0 ? '#005EB8' : '#F59E0B'} fillOpacity={0.7} />
                            ))}
                            <LabelList dataKey="name" position="top" style={{fontSize: '10px', fontWeight: 'bold'}} />
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'waterfall': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterfallData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine x={0} stroke="#000" />
                        <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                            {waterfallData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.val > 0 ? '#10B981' : '#EF4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'map': return (
                <div className="relative w-full h-full transform scale-90 origin-top-left md:scale-100 md:origin-center">
                    {PREF_GRID.map(p => {
                        const data = aggregatedData.data.find(d => d.name === p.id);
                        const val = mapMetric === 'yoy' ? (data?.yoy || 0) : (data?.avgK || 0);
                        const color = data ? getHeatmapColor(val, mapMetric) : '#F1F5F9';
                        return (
                            <div key={p.id} className="absolute w-10 h-10 md:w-12 md:h-12 flex flex-col items-center justify-center rounded-lg shadow-sm border border-white text-white transition-transform hover:scale-110 hover:z-10 cursor-pointer" style={{ left: `${p.x * 44 + 40}px`, top: `${p.y * 44 + 20}px`, backgroundColor: color, color: mapMetric === 'k' && !data ? '#ccc' : (mapMetric === 'k' && (val || 0) < 0.1 ? '#999' : 'white') }} title={`${p.id}: ${val.toFixed(mapMetric === 'yoy' ? 1 : 3)}`}>
                                <span className="text-[10px] font-black">{p.id}</span>
                                <span className="text-[8px] font-mono">{mapMetric === 'yoy' ? `${val > 0 ? '+' : ''}${val.toFixed(0)}%` : val.toFixed(3)}</span>
                            </div>
                        )
                    })}
                </div>
            );
            case 'density': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" dataKey="x" name="店舗数" unit="店" tick={{fontSize: 9}} label={{ value: 'エリア内 店舗数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis type="number" dataKey="y" name="平均売上" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '1店舗あたり平均実績', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <ZAxis type="number" dataKey="size" range={[100, 1000]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter name="Prefectures" data={dominantDensityData} fill="#005EB8">
                            {dominantDensityData.map((entry, index) => <Cell key={`cell-${index}`} fill="#005EB8" fillOpacity={0.6} />)}
                            <LabelList dataKey="name" position="top" style={{fontSize: '9px', fontWeight: 'bold'}} />
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'forecast_race': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastRaceData.data} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="period" tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <YAxis reversed={true} hide={false} width={30} tick={{fontSize: 9}} domain={[1, 'auto']} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconSize={8} />
                        {forecastRaceData.regions.map((region, i) => (
                            <Line key={region} type="monotone" dataKey={region} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'gini': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={giniMonitorData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 0.6]} tick={{fontSize: 9}} />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toFixed(3)} />
                        <ReferenceLine x={0.4} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'Warning', position: 'top', fontSize: 9, fill: '#EF4444' }} />
                        <Bar dataKey="gini" radius={[0, 4, 4, 0]} barSize={20}>
                            {giniMonitorData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.gini > 0.4 ? '#EF4444' : '#10B981'} />)}
                            <LabelList dataKey="gini" position="right" fontSize={9} formatter={(v: number) => v.toFixed(3)} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'age_pyramid': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agePyramidData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="ratioYoung" stackId="a" fill="#3B82F6" name="< 5年" />
                        <Bar dataKey="ratioMid" stackId="a" fill="#A855F7" name="5-10年" />
                        <Bar dataKey="ratioOld" stackId="a" fill="#64748B" name="> 10年" radius={[0,4,4,0]} />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'block_scale': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" dataKey="x" name="店舗数" unit="店" tick={{fontSize: 9}} label={{ value: '管理店舗数 (Scale)', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis type="number" dataKey="y" name="成長率" unit="%" tick={{fontSize: 9}} label={{ value: '成長率 (YoY)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <ZAxis type="number" dataKey="z" range={[100, 2000]} name="総規模" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <Scatter name="Blocks" data={bubbleScaleEffData} fill="#005EB8">
                            {bubbleScaleEffData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.eff > aggregatedData.kpis.totalVolume/aggregatedData.kpis.activeStores/12 ? '#005EB8' : '#F59E0B'} fillOpacity={0.7} />
                            ))}
                            <LabelList dataKey="name" position="top" style={{fontSize: '9px', fontWeight: 'bold'}} />
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'index_race': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={indexRaceData.data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{fontSize: 9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
                        {indexRaceData.lines.map((line, i) => (
                            <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'efficiency_trend': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={efficiencyTrendData.data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{fontSize: 9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} label={{ value: '平均売上/店', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
                        {efficiencyTrendData.lines.map((line, i) => (
                            <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'box_plot': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={boxPlotChartData} layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" tick={{fontSize: 9}} domain={['auto', 'auto']} />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                    <div className="bg-white p-3 border rounded shadow-lg text-xs z-50">
                                        <p className="font-black text-[#005EB8] mb-1">{d.name}</p>
                                        <div className="mt-1 border-t pt-1">
                                            <p>Max: {Math.round(d.max).toLocaleString()}</p>
                                            <p>Q3: {Math.round(d.q3).toLocaleString()}</p>
                                            <p className="font-bold">Median: {Math.round(d.median).toLocaleString()}</p>
                                            <p>Q1: {Math.round(d.q1).toLocaleString()}</p>
                                            <p>Min: {Math.round(d.min).toLocaleString()}</p>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }} cursor={{fill: 'transparent'}} />
                        {/* Range Bar for IQR (Q1 to Q3) */}
                        <Bar dataKey="iqr" barSize={12} fill="#93C5FD" radius={[2,2,2,2]} />
                        {/* Median Line */}
                        <Scatter dataKey="median" fill="#005EB8" shape="square" />
                        {/* Min/Max Dots (Simplified Whiskers) */}
                        <Scatter dataKey="min" fill="#CBD5E1" shape="cross" />
                        <Scatter dataKey="max" fill="#CBD5E1" shape="cross" />
                    </ComposedChart>
                </ResponsiveContainer>
            );
            case 'cohesion': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cohesionData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{fontSize: 9, fontWeight:'bold'}} angle={-30} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" tick={{fontSize: 9}} label={{ value: 'Zero-Sum Score (食い合い)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} label={{ value: 'Correlation (連動性)', angle: -90, position: 'right', offset: 0, fontSize: 9 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar yAxisId="left" dataKey="zeroSum" name="Zero-Sum (Risk)" barSize={20} fill="#EF4444" fillOpacity={0.7} radius={[4,4,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="correlation" name="Avg Correlation (Synergy)" stroke="#005EB8" strokeWidth={2} dot={{r:3}} />
                    </ComposedChart>
                </ResponsiveContainer>
            );
            default: return null;
        }
    }, [cagrRankingData, lUtilizationData, regionalVintageData, rankingData, portfolioData, waterfallData, PREF_GRID, aggregatedData, mapMetric, dominantDensityData, forecastRaceData, giniMonitorData, agePyramidData, bubbleScaleEffData, indexRaceData, efficiencyTrendData, boxPlotChartData, cohesionData, COLORS, isSales, totalValueDivider, getHeatmapColor]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="w-full px-4 md:px-8 space-y-6 pb-20">
                
                {/* Header & View Switcher */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            エリア別 構造分析ボード
                            <span className="text-xs bg-blue-100 text-[#005EB8] px-2 py-1 rounded-md border border-blue-200">
                                {isSales ? 'Sales' : 'Traffic'} View
                            </span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">
                            Geographical Strategy & Performance Map
                        </p>
                    </div>
                    
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                        <button onClick={() => setViewMode('region')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'region' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            地方 (Region)
                        </button>
                        <button onClick={() => setViewMode('prefecture')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'prefecture' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            都道府県 (Pref)
                        </button>
                        <button onClick={() => setViewMode('block')} className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-2 ${viewMode === 'block' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                            ブロック (Block)
                        </button>
                    </div>
                </div>

                {/* Common KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fadeIn">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">総実績 (Total)</p>
                        <p className="text-2xl font-black text-[#005EB8] font-display">
                            {Math.round(aggregatedData.kpis.totalVolume / totalValueDivider).toLocaleString()}{totalUnitLabel}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">全社成長率 (Total YoY)</p>
                        <p className={`text-2xl font-black font-display ${aggregatedData.kpis.totalYoy >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {aggregatedData.kpis.totalYoy >= 0 ? '+' : ''}{aggregatedData.kpis.totalYoy.toFixed(1)}%
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">最高効率エリア</p>
                        <p className="text-xl font-black text-gray-800 font-display truncate">
                            {aggregatedData.data.length > 0 ? [...aggregatedData.data].sort((a,b) => b.efficiency - a.efficiency)[0]?.name : '-'}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">最高成長エリア</p>
                        <p className="text-xl font-black text-gray-800 font-display truncate">
                            {aggregatedData.data.length > 0 ? [...aggregatedData.data].sort((a,b) => b.yoy - a.yoy)[0]?.name : '-'}
                        </p>
                    </div>
                </div>

                {/* --- COMMON: 3-Year CAGR Forecast --- */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[320px] animate-fadeIn relative group">
                    <ExpandButton target="cagr" />
                    <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                        中期成長トレンド予測 (3-Year CAGR Forecast)
                        <HelpTooltip title="3年CAGR予測" content="各エリアのAI予測モデルに基づき、今後3年間の年平均成長率（CAGR）を算出・ランキング化しました。将来性の高いエリアが一目でわかります。" />
                    </h3>
                    <div className="w-full h-full pb-6">
                        {renderChart('cagr')}
                    </div>
                </div>

                {/* --- VIEW 1: REGION (Macro Strategy) --- */}
                {viewMode === 'region' && (
                    <div className="space-y-6 animate-fadeIn">
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* L Utilization Heatmap */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="l_util" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ポテンシャル消化率マップ (Potential Map)
                                    <HelpTooltip title="消化率マップ" content="横軸に「ポテンシャル消化率（売上/L）」、縦軸に「成長率」をとった図です。左上（未消化・高成長）は攻めるべきエリア、右下（高消化・低成長）は飽和・成熟エリアです。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('l_util')}
                                </div>
                            </div>

                            {/* Regional Vintage */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="regional_vintage" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    地域別 Vintage 分析 (上位5地域)
                                    <HelpTooltip title="地域Vintage" content="地域ごとの「オープン後の成長カーブ」を比較します。立ち上がりが早い地域や、長期的に伸び続ける地域など、エリアの「DNA」を可視化します。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('regional_vintage')}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Portfolio Chart (Original) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="portfolio" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    地域ポートフォリオ (Growth vs Efficiency)
                                    <HelpTooltip title="ポートフォリオ" content="縦軸に「成長率」、横軸に「1店舗あたり売上」をとった図です。右上のエリアは「稼ぐ力があり、かつ伸びている」理想的な状態です。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('portfolio')}
                                </div>
                            </div>

                            {/* Waterfall Contribution */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="waterfall" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    増減寄与度分析 (Contribution Waterfall)
                                    <HelpTooltip title="Waterfall" content="全社の成長（または後退）に対して、どの地域がどれだけ寄与したかを示します。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('waterfall')}
                                </div>
                            </div>
                        </div>

                        {/* Efficiency Ranking */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] flex flex-col relative group">
                            <ExpandButton target="eff_ranking" />
                            <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                エリア別 効率性ランキング (Sales / Store)
                                <HelpTooltip title="効率性ランキング" content="1店舗あたりの平均月商が高いエリア順です。効率の良いエリアへの出店は、管理コスト比率を下げる効果があります。" />
                            </h3>
                            <div className="flex-1 w-full">
                                {renderChart('eff_ranking')}
                            </div>
                        </div>

                        {/* AI Report Section */}
                        <div className="bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <span className="p-1 bg-purple-100 text-purple-600 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></span>
                                    AI Regional Strategic Insight
                                </h3>
                                <button 
                                    onClick={handleGenerateAI}
                                    disabled={aiLoading}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-2"
                                >
                                    {aiLoading ? '分析中...' : 'AI分析を実行'}
                                </button>
                            </div>
                            {aiReport ? (
                                <div className="prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: marked(aiReport) }} />
                            ) : (
                                <p className="text-xs text-gray-400">各エリアのデータをAIが解析し、リソース配分の提案やリスク警告を行います。</p>
                            )}
                        </div>
                    </div>
                )}

                {/* --- VIEW 2: PREFECTURE (Geography & Saturation) --- */}
                {viewMode === 'prefecture' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[600px] relative group overflow-hidden">
                                <ExpandButton target="map" />
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest font-display flex items-center">JAPAN Tile Map</h3>
                                    <div className="flex bg-gray-100 p-1 rounded-full">
                                        <button onClick={() => setMapMetric('yoy')} className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${mapMetric === 'yoy' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>成長率 (YoY)</button>
                                        <button onClick={() => setMapMetric('k')} className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${mapMetric === 'k' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400'}`}>成長速度 (k-Map)</button>
                                    </div>
                                </div>
                                <div className="w-full h-full pb-10">
                                    {renderChart('map')}
                                </div>
                            </div>
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[600px] flex flex-col relative group">
                                <ExpandButton target="density" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">ドミナント密度 vs 効率散布図 (Efficiency Matrix)</h3>
                                <div className="flex-1">
                                    {renderChart('density')}
                                </div>
                            </div>
                        </div>
                        {/* Forecast Race & Other Pref Charts */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                            <ExpandButton target="forecast_race" />
                            <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">中期エリア予測レース (3-Year Forecast Rank)</h3>
                            <div className="w-full h-full">
                                {renderChart('forecast_race')}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="gini" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">県内格差（ジニ係数）モニター</h3>
                                <div className="w-full h-full">
                                    {renderChart('gini')}
                                </div>
                            </div>
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="age_pyramid" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">店舗年齢構成ピラミッド</h3>
                                <div className="w-full h-full">
                                    {renderChart('age_pyramid')}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VIEW 3: BLOCK (Management & Operations) --- */}
                {viewMode === 'block' && (
                    <div className="space-y-6 animate-fadeIn">
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 1. Block Scale vs Efficiency Bubble Chart */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] flex flex-col relative group">
                                <ExpandButton target="block_scale" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ブロック規模 vs 効率 バブルチャート
                                    <HelpTooltip title="規模 vs 効率" content="横軸に「管理店舗数」、縦軸に「成長率(YoY)」、円の大きさに「総売上」をとったチャートです。マネジメントの限界（店舗数が多すぎて効率が落ちていないか）を確認します。" />
                                </h3>
                                <div className="flex-1">
                                    {renderChart('block_scale')}
                                </div>
                            </div>

                            {/* 2. Index Growth Race (100 Start) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="index_race" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    インデックス成長レース (過去24ヶ月)
                                    <HelpTooltip title="Index Race" content="24ヶ月前を「100」とした場合の成長軌道です。規模の大小に関係なく、純粋な「伸び率」で各ブロックを競争させます。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('index_race')}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 3. Per Store Efficiency Trend */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="efficiency_trend" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    1店舗あたり平均売上推移 (Efficiency Trend)
                                    <HelpTooltip title="効率推移" content="「ブロック総売上 ÷ 店舗数」の推移です。店舗数を増やしても、このラインが下がっていなければ健全な成長と言えます。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('efficiency_trend')}
                                </div>
                            </div>

                            {/* 4. Waterfall (YoY) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="waterfall" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ブロック別 ウォーターフォール (YoY寄与度)
                                    <HelpTooltip title="Waterfall" content="全社の昨対増減に対して、どのブロックがプラスに貢献し、どのブロックが足を引っ張ったかを表示します。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('waterfall')}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 5. Box & Whisker Plot (Variance) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="box_plot" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ブロック内偏差値 (Box & Whisker Plot)
                                    <HelpTooltip title="箱ひげ図" content="ブロックごとの店舗実績の「バラつき」を示します。箱が小さいほど、全店舗が均質に管理されています。箱が長い場合、優秀店と不振店の格差が大きいことを意味します。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('box_plot')}
                                </div>
                            </div>

                            {/* 6. Cohesion & Cannibalization */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] relative group">
                                <ExpandButton target="cohesion" />
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display flex items-center">
                                    統制力 & カニバリゼーション検知
                                    <HelpTooltip title="Cohesion & Zero-Sum" content="左軸(棒): ゼロサム・カニバリ発生スコア。高いほど「全体の売上は変わらないのに、店同士で食い合っている」状態です。右軸(線): 連動性スコア。高いほど全店が同じ動き（統制が取れている）をしています。" />
                                </h3>
                                <div className="w-full h-full">
                                    {renderChart('cohesion')}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Fullscreen Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">
                            {expandedChart === 'cagr' && '中期成長トレンド予測 詳細'}
                            {expandedChart === 'l_util' && 'ポテンシャル消化率マップ 詳細'}
                            {expandedChart === 'regional_vintage' && '地域別 Vintage 分析 詳細'}
                            {expandedChart === 'portfolio' && '地域ポートフォリオ 詳細'}
                            {expandedChart === 'waterfall' && '増減寄与度分析 詳細'}
                            {expandedChart === 'eff_ranking' && 'エリア別 効率性ランキング 詳細'}
                            {expandedChart === 'map' && 'JAPAN Tile Map 詳細'}
                            {expandedChart === 'density' && 'ドミナント密度 vs 効率散布図 詳細'}
                            {expandedChart === 'forecast_race' && '中期エリア予測レース 詳細'}
                            {expandedChart === 'gini' && '県内格差（ジニ係数）モニター 詳細'}
                            {expandedChart === 'age_pyramid' && '店舗年齢構成ピラミッド 詳細'}
                            {expandedChart === 'block_scale' && 'ブロック規模 vs 効率 バブルチャート 詳細'}
                            {expandedChart === 'index_race' && 'インデックス成長レース 詳細'}
                            {expandedChart === 'efficiency_trend' && '1店舗あたり平均売上推移 詳細'}
                            {expandedChart === 'box_plot' && 'ブロック内偏差値 (Box Plot) 詳細'}
                            {expandedChart === 'cohesion' && '統制力 & カニバリゼーション検知 詳細'}
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4 overflow-hidden">
                        {renderChart(expandedChart)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegionalView;
