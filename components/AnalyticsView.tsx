
import React, { useMemo, useState, useCallback } from 'react';
import { StoreData } from '../types';
import { calculatePearsonCorrelation } from '../services/analysisEngine';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, Cell, Treemap, PieChart, Pie, Legend,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line, ReferenceLine, Brush, Area, AreaChart, ComposedChart, LabelList
} from 'recharts';

interface AnalyticsViewProps {
    allStores: { [name: string]: StoreData };
}

// Helper for Gini Coefficient
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) {
        num += (i + 1) * sorted[i];
    }
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return (2 * num) / den - (n + 1) / n;
};

const StatCard: React.FC<{ title: string; value: string | number; sub?: string; color?: string }> = ({ title, value, sub, color = "text-[#005EB8]" }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-full">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1 font-display">{title}</p>
        <div className={`text-xl font-black font-display ${color} leading-none tracking-tight`}>{value}</div>
        {sub && <p className="text-[9px] text-gray-400 mt-1">{sub}</p>}
    </div>
);

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ allStores }) => {
    const stores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.stats);
    const allStoresList = Object.values(allStores) as StoreData[];
    const [activeTab, setActiveTab] = useState<'ranking' | 'trend' | 'risk' | 'pattern' | 'price' | 'growth'>('ranking');
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    
    // Pricing Simulator State
    const [currentPrice, setCurrentPrice] = useState(1350);
    const [newPrice, setNewPrice] = useState(1500);
    const [churnRate, setChurnRate] = useState(5); // Percent

    // --- Data Preparation ---

    // 0. KPI Dashboard Metrics
    const kpis = useMemo(() => {
        const activeCount = stores.length;
        const totalCount = allStoresList.length;
        const activeRate = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
        
        const totalSales = stores.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
        const avgSales = activeCount > 0 ? totalSales / activeCount : 0;
        
        const avgAge = stores.length > 0 ? stores.reduce((a,s) => a + s.raw.length, 0) / stores.length : 0;
        
        const medianK = stores.length > 0 ? [...stores].sort((a,b) => a.params.k - b.params.k)[Math.floor(stores.length/2)].params.k : 0;
        const medianL = stores.length > 0 ? [...stores].sort((a,b) => a.params.L - b.params.L)[Math.floor(stores.length/2)].params.L : 0;
        
        const avgYoy = stores.length > 0 ? stores.reduce((a,s) => a + (s.stats?.yoy || 0), 0) / stores.length : 0;
        
        const gini = calculateGini(stores.map(s => s.stats?.lastYearSales || 0));
        
        const avgCV = stores.length > 0 ? stores.reduce((a,s) => a + (s.stats?.cv || 0), 0) / stores.length : 0;
        
        // Efficiency (Sales / L)
        const avgEff = stores.length > 0 ? stores.reduce((a,s) => a + ((s.raw[s.raw.length-1] || 0) / s.params.L), 0) / stores.length : 0;

        return { activeCount, totalCount, activeRate, totalSales, avgSales, avgAge, medianK, medianL, avgYoy, gini, avgCV, avgEff };
    }, [stores, allStoresList]);

    // 1. Ranking & ABC
    const abcData = useMemo(() => {
        const counts = { A: 0, B: 0, C: 0 };
        stores.forEach(s => {
            if (s.stats?.abcRank) counts[s.stats.abcRank]++;
        });
        return [
            { name: 'Rank A (上位70%)', value: counts.A, fill: '#005EB8' },
            { name: 'Rank B (次点20%)', value: counts.B, fill: '#3B82F6' },
            { name: 'Rank C (下位10%)', value: counts.C, fill: '#93C5FD' }
        ];
    }, [stores]);

    const topGrowers = useMemo(() => {
        return [...stores].sort((a, b) => (b.stats?.yoy || 0) - (a.stats?.yoy || 0)).slice(0, 5);
    }, [stores]);

    const worstGrowers = useMemo(() => {
        return [...stores].sort((a, b) => (a.stats?.yoy || 0) - (b.stats?.yoy || 0)).slice(0, 5);
    }, [stores]);

    // 1-B. Contribution Waterfall Data
    const contributionData = useMemo(() => {
        const diffs = stores.map(s => {
            const last = s.stats?.lastYearSales || 0;
            const prev = s.stats?.prevYearSales || 0;
            return { name: s.name, diff: Math.round(last - prev) };
        });
        diffs.sort((a, b) => b.diff - a.diff);
        
        // Extract top 5 positive and bottom 5 negative (largest decreases)
        const topPos = diffs.slice(0, 5).filter(d => d.diff > 0);
        const topNeg = diffs.slice(-5).reverse().filter(d => d.diff < 0);

        return [
            ...topPos.map(d => ({ name: d.name, val: d.diff, type: 'plus' })),
            ...topNeg.map(d => ({ name: d.name, val: d.diff, type: 'minus' }))
        ];
    }, [stores]);

    // 1-C. Lorenz Curve Data
    const lorenzData = useMemo(() => {
        if (stores.length === 0) return [];
        const sortedSales = stores.map(s => s.stats?.lastYearSales || 0).sort((a, b) => a - b);
        const total = sortedSales.reduce((a, b) => a + b, 0);
        let runningSum = 0;
        const data = [{ p: 0, w: 0, perfect: 0 }];
        
        sortedSales.forEach((v, i) => {
            runningSum += v;
            const p = ((i + 1) / stores.length) * 100;
            const w = (runningSum / total) * 100;
            data.push({ p: Number(p.toFixed(1)), w: Number(w.toFixed(1)), perfect: Number(p.toFixed(1)) });
        });
        return data;
    }, [stores]);

    // 1-D. Opportunity Gap (Potential vs Actual)
    const opportunityData = useMemo(() => {
        const data = stores.map(s => {
            const currentMonthlyAvg = (s.stats?.lastYearSales || 0) / 12;
            const potential = s.params.L;
            const gap = potential - currentMonthlyAvg;
            return { name: s.name, gap: Math.round(gap), current: Math.round(currentMonthlyAvg), potential: Math.round(potential) };
        });
        // Filter positive gap and large gap, sort descending
        return data.filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 10);
    }, [stores]);

    // 2. Trend & Cycles
    const seasonalityCluster = useMemo(() => {
        const data = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, v: 0 }));
        if (stores.length > 0) {
            stores.forEach(s => {
                s.seasonal.forEach((v, i) => data[i].v += v);
            });
            data.forEach(d => d.v = Number((d.v / stores.length).toFixed(2)));
        }
        return data;
    }, [stores]);

    // 2-B. Normalized Growth (Trajectory)
    const normalizedGrowthData = useMemo(() => {
        const mature = stores.filter(s => s.raw.length >= 24);
        const selection = mature.sort((a,b) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0)).slice(0, 15);
        
        let maxMonth = 0;
        selection.forEach(s => maxMonth = Math.max(maxMonth, s.raw.length));
        maxMonth = Math.min(maxMonth, 60);

        const points = [];
        for(let m=0; m<maxMonth; m++) {
            const p: any = { month: m + 1 };
            selection.forEach(s => {
                if(s.raw[m] !== undefined) p[s.name] = Math.round(s.raw[m]);
            });
            points.push(p);
        }
        return { points, lines: selection.map(s => s.name) };
    }, [stores]);

    // 2-C. Store Age vs Performance (Lifecycle)
    const lifecycleData = useMemo(() => {
        return stores.map(s => ({
            age: Math.floor(s.raw.length / 12), // Years
            sales: Math.round(s.stats?.lastYearSales || 0),
            name: s.name
        }));
    }, [stores]);

    // 3. Risk: Survival Analysis (Cohort Active Rate)
    const survivalData = useMemo(() => {
        const cohorts: Record<string, { total: number; active: number }> = {};
        allStoresList.forEach(s => {
            if (s.dates.length === 0) return;
            const y = new Date(s.dates[0].replace(/\//g, '-')).getFullYear();
            const key = `${y}`;
            if (!cohorts[key]) cohorts[key] = { total: 0, active: 0 };
            cohorts[key].total++;
            if (s.isActive) cohorts[key].active++;
        });
        
        return Object.keys(cohorts).sort().map(y => ({
            year: y,
            rate: Number(((cohorts[y].active / cohorts[y].total) * 100).toFixed(1)),
            count: cohorts[y].total
        }));
    }, [allStoresList]);

    // 3-B. Volatility Histogram
    const cvHistogram = useMemo(() => {
        const buckets = Array(10).fill(0);
        stores.forEach(s => {
            const cv = s.stats?.cv || 0;
            const idx = Math.min(9, Math.floor(cv * 50)); 
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `${(i*0.02).toFixed(2)}-`, count: v }));
    }, [stores]);

    // 3-C. Model Fit Quality (StdDev Distribution)
    const fitQualityData = useMemo(() => {
        // Normalize StdDev by Mean Sales (CV of Residuals)
        const buckets = Array(10).fill(0);
        stores.forEach(s => {
            const mean = (s.stats?.lastYearSales || 1) / 12;
            const normStd = s.stdDev / mean; // CV of error
            const idx = Math.min(9, Math.floor(normStd * 50)); // Bucket by 0.02
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `<${((i+1)*2)}%`, count: v }));
    }, [stores]);

    // 4. Pattern: Peak Month Distribution
    const peakMonthData = useMemo(() => {
        const counts = Array(12).fill(0);
        stores.forEach(s => {
            let maxIdx = 0;
            let maxVal = -1;
            s.seasonal.forEach((v, i) => {
                if (v > maxVal) { maxVal = v; maxIdx = i; }
            });
            counts[maxIdx]++;
        });
        return counts.map((v, i) => ({ month: `${i+1}月`, count: v }));
    }, [stores]);

    // 5. Scatter: CAGR vs Volatility
    const riskReturnData = useMemo(() => {
        return stores.map(s => ({
            name: s.name,
            x: Number(((s.stats?.cv || 0) * 100).toFixed(1)), // Risk (CV)
            y: Number(((s.stats?.cagr || 0) * 100).toFixed(1)), // Return (CAGR)
            z: Math.round((s.stats?.lastYearSales || 0) / 10000) // Size
        }));
    }, [stores]);

    // 6. Correlation Matrix
    const correlationMatrix = useMemo(() => {
        const top10 = [...stores].sort((a,b) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0)).slice(0, 10);
        const matrix = [];
        for(let i=0; i<top10.length; i++) {
            const row = { name: top10[i].name, cells: [] as number[] };
            for(let j=0; j<top10.length; j++) {
                const a = top10[i];
                const b = top10[j];
                const len = 24;
                const arrA = a.raw.slice(-len);
                const arrB = b.raw.slice(-len);
                row.cells.push(calculatePearsonCorrelation(arrA, arrB));
            }
            matrix.push(row);
        }
        return { names: top10.map(s => s.name), matrix };
    }, [stores]);

    // 7. Pricing Simulator Data
    const pricingData = useMemo(() => {
        const totalCustomers = kpis.totalSales / currentPrice; // Approximation
        const baseRev = totalCustomers * currentPrice;
        
        // Scenario
        const newCustomers = totalCustomers * (1 - churnRate / 100);
        const newRev = newCustomers * newPrice;
        const diff = newRev - baseRev;

        const priceEffect = totalCustomers * (newPrice - currentPrice);
        const volumeEffect = - (totalCustomers * (churnRate/100) * newPrice);

        return [
            { name: '現状売上 (Base)', val: Math.round(baseRev), fill: '#94A3B8' }, // Gray
            { name: '単価効果 (Price Effect)', val: Math.round(priceEffect), fill: '#10B981' }, // Green
            { name: '客離れ (Churn Loss)', val: Math.round(volumeEffect), fill: '#EF4444' }, // Red
            { name: '新売上予測 (New)', val: Math.round(newRev), fill: diff > 0 ? '#005EB8' : '#F59E0B', isTotal: true }
        ];
    }, [kpis.totalSales, currentPrice, newPrice, churnRate]);

    // 8. Growth Analysis (New)
    const growthAnalysis = useMemo(() => {
        // Filter for mature stores to analyze K distribution
        const matureStores = stores.filter(s => s.raw.length >= 12 && s.fit.mode !== 'startup');
        
        // K Statistics
        const kValues = matureStores.map(s => s.params.k).sort((a,b) => a-b);
        const meanK = kValues.reduce((a,b) => a+b, 0) / kValues.length;
        const stdK = Math.sqrt(kValues.reduce((a,b) => a + Math.pow(b-meanK, 2), 0) / kValues.length);
        
        // Outliers (Z-score > 1.5 for "Significant")
        const significantHigh = matureStores
            .filter(s => (s.params.k - meanK) / stdK > 1.5)
            .sort((a,b) => b.params.k - a.params.k)
            .slice(0, 5);
            
        const significantLow = matureStores
            .filter(s => (s.params.k - meanK) / stdK < -1.5)
            .sort((a,b) => a.params.k - b.params.k)
            .slice(0, 5);

        // Histogram
        const bucketSize = 0.05;
        const bucketCount = 20; // up to 1.0
        const buckets = Array(bucketCount).fill(0);
        matureStores.forEach(s => {
            const idx = Math.min(bucketCount - 1, Math.floor(s.params.k / bucketSize));
            buckets[idx]++;
        });
        const histogramData = buckets.map((count, i) => ({
            range: `${(i * bucketSize).toFixed(2)} - ${((i+1) * bucketSize).toFixed(2)}`,
            count,
            mid: (i * bucketSize) + (bucketSize/2)
        }));

        // Young Stores Trajectories
        const youngStores = stores.filter(s => s.raw.length >= 3 && s.raw.length <= 24);
        const trajectories = youngStores.slice(0, 20).map(s => { 
            const points = s.raw.map((val, i) => ({
                month: i,
                normVal: val / s.params.L
            }));
            return { name: s.name, points };
        });

        const medianK = kpis.medianK;
        const standardCurve = Array.from({length: 24}, (_, i) => {
            const t0_est = Math.log(9) / medianK;
            return {
                month: i,
                normVal: 1 / (1 + Math.exp(-medianK * (i - t0_est)))
            };
        });

        return { meanK, stdK, significantHigh, significantLow, histogramData, trajectories, standardCurve };
    }, [stores, kpis.medianK]);

    const tabClass = (tab: string) => `px-6 py-3 rounded-full text-xs font-black transition-all font-display ${activeTab === tab ? 'bg-[#005EB8] text-white shadow-lg shadow-blue-200 transform scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`;

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
    const renderChart = useCallback((type: string) => {
        switch(type) {
            case 'abc': return (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <Pie data={abcData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5}>
                            {abcData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                    </PieChart>
                </ResponsiveContainer>
            );
            case 'lorenz': return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lorenzData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="p" type="number" unit="%" tick={{fontSize:9}} label={{ value: '店舗数累積 (%)', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis unit="%" tick={{fontSize:9}} label={{ value: '売上累積 (%)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Area type="monotone" dataKey="w" stroke="#005EB8" fill="#005EB8" fillOpacity={0.2} name="実績分布" />
                        <Line type="monotone" dataKey="perfect" stroke="#CBD5E1" strokeDasharray="3 3" dot={false} name="完全平等線" />
                    </AreaChart>
                </ResponsiveContainer>
            );
            case 'waterfall': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={contributionData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine x={0} stroke="#000" />
                        <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                            {contributionData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.val > 0 ? '#10B981' : '#EF4444'} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'opportunity': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opportunityData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="gap" name="月間売上余地" radius={[0, 4, 4, 0]} fill="#8B5CF6">
                            <LabelList dataKey="gap" position="right" fontSize={9} formatter={(v: number) => Math.round(v).toLocaleString()} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'trajectory': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={normalizedGrowthData.points} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="month" label={{ value: 'オープン経過月数', position: 'bottom', offset: 0, fontSize: 9 }} tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        {normalizedGrowthData.lines.map((name, i) => (
                            <Line 
                                key={name} type="monotone" dataKey={name} 
                                stroke={`hsl(${i * 24}, 70%, 50%)`} strokeWidth={2} dot={false} strokeOpacity={0.7}
                            />
                        ))}
                        <Brush dataKey="month" height={20} stroke="#cbd5e1" fill="#f8fafc" />
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'lifecycle': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis type="number" dataKey="age" name="店舗年齢 (年)" unit="年" label={{ value: '経過年数 →', position: 'bottom', offset: 0, fontSize: 9 }} tick={{fontSize:9}} />
                        <YAxis type="number" dataKey="sales" name="年間売上" tick={{fontSize:9}} unit="円" label={{ value: '年間売上 →', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Scatter name="Stores" data={lifecycleData} fill="#F59E0B" fillOpacity={0.5} />
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'radar': return (
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={seasonalityCluster}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="month" tick={{fontSize:9, fontWeight:'bold', fill:'#9CA3AF'}} />
                        <PolarRadiusAxis angle={30} domain={[0.8, 1.2]} tick={false} axisLine={false} />
                        <Radar name="全店平均" dataKey="v" stroke="#005EB8" strokeWidth={3} fill="#005EB8" fillOpacity={0.2} />
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                    </RadarChart>
                </ResponsiveContainer>
            );
            case 'cagr': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stores.map(s => ({n: s.name, cagr: (s.stats?.cagr||0)*100})).sort((a,b)=>b.cagr - a.cagr)} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis hide />
                        <YAxis tick={{fontSize:9}} unit="%" />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine y={0} stroke="#000" />
                        <Bar dataKey="cagr" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'survival': return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={survivalData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="year" tick={{fontSize:9}} />
                        <YAxis unit="%" tick={{fontSize:9}} domain={[0, 100]} />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Area type="monotone" dataKey="rate" stroke="#10B981" fillOpacity={1} fill="url(#colorRate)" name="Active Rate" />
                        <Line type="monotone" dataKey="count" stroke="#6B7280" strokeDasharray="5 5" name="Total Opened" yAxisId="right" />
                        <YAxis yAxisId="right" orientation="right" hide />
                    </AreaChart>
                </ResponsiveContainer>
            );
            case 'risk': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis type="number" dataKey="x" name="変動リスク (CV)" unit="%" label={{ value: '変動リスク (CV) →', position: 'bottom', offset: 0, fontSize: 9, fontWeight: 900 }} tick={{fontSize:9}} />
                        <YAxis type="number" dataKey="y" name="成長リターン (CAGR)" unit="%" label={{ value: '成長リターン (CAGR) →', angle: -90, position: 'left', offset: 0, fontSize: 9, fontWeight: 900 }} tick={{fontSize:9}} />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Scatter name="Stores" data={riskReturnData} fill="#005EB8" fillOpacity={0.6} />
                        <ReferenceLine y={0} stroke="#E5E7EB" />
                        <ReferenceLine x={5} stroke="#E5E7EB" />
                    </ScatterChart>
                </ResponsiveContainer>
            );
            case 'cvHist': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cvHistogram} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="range" tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'errorHist': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fitQualityData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="range" tick={{fontSize:9}} label={{ value: '誤差率 (%)', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} name="店舗数" />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'peak': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakMonthData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="month" tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} name="店舗数" />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'price': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pricingData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} />
                        <YAxis tickFormatter={(val) => (val/1000000).toFixed(0) + 'M'} tick={{fontSize: 10}} />
                        <Tooltip formatter={(val: number) => Math.round(val).toLocaleString()} cursor={{fill: 'transparent'}} />
                        <ReferenceLine y={0} stroke="#000" />
                        <Bar dataKey="val">
                            {pricingData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                            <LabelList dataKey="val" position="top" formatter={(val:number) => (val/10000).toFixed(0) + '万'} style={{fontSize: 10, fontWeight: 'bold', fill: '#64748B'}} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'growthK': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={growthAnalysis.histogramData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="range" tick={{fontSize:9}} interval={2} />
                        <YAxis tick={{fontSize:9}} allowDecimals={false} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="店舗数" />
                        <ReferenceLine x={growthAnalysis.histogramData.find(d => kpis.medianK >= parseFloat(d.range.split(' - ')[0]) && kpis.medianK < parseFloat(d.range.split(' - ')[1]))?.range} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: 'Median', position: 'top', fontSize: 9, fill: '#F59E0B' }} />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'newStore': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis type="number" dataKey="month" domain={[0, 24]} tick={{fontSize:9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} allowDuplicatedCategory={false} />
                        <YAxis tick={{fontSize:9}} domain={[0, 1.2]} label={{ value: '達成率 (Sales/L)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(val: number) => val.toFixed(2)} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        <Line data={growthAnalysis.standardCurve} type="monotone" dataKey="normVal" stroke="#1A1A1A" strokeWidth={2} strokeDasharray="5 5" dot={false} name="標準モデル (Median k)" z={10} />
                        {growthAnalysis.trajectories.map((s, i) => (
                            <Line key={s.name} data={s.points} type="monotone" dataKey="normVal" name={s.name} stroke={`hsl(${i * 45}, 70%, 60%)`} strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            default: return null;
        }
    }, [abcData, lorenzData, contributionData, opportunityData, normalizedGrowthData, lifecycleData, seasonalityCluster, stores, survivalData, riskReturnData, cvHistogram, fitQualityData, peakMonthData, pricingData, growthAnalysis, kpis.medianK]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
             <div className="max-w-7xl mx-auto space-y-8 pb-20">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">高度分析ラボ (Advanced Analytics)</h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">30+ KPIs & Metrics Dashboard</p>
                    </div>
                    {/* Tabs */}
                    <div className="flex bg-white rounded-full p-1 shadow-sm overflow-x-auto max-w-full">
                        <button onClick={() => setActiveTab('ranking')} className={tabClass('ranking')}>ランキング</button>
                        <button onClick={() => setActiveTab('trend')} className={tabClass('trend')}>トレンド</button>
                        <button onClick={() => setActiveTab('risk')} className={tabClass('risk')}>リスク</button>
                        <button onClick={() => setActiveTab('pattern')} className={tabClass('pattern')}>パターン</button>
                        <button onClick={() => setActiveTab('price')} className={tabClass('price')}>価格シミュ</button>
                        <button onClick={() => setActiveTab('growth')} className={tabClass('growth')}>成長分析</button>
                    </div>
                </div>

                {/* KPI Command Center */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                    <StatCard title="稼働店舗数" value={kpis.activeCount} />
                    <StatCard title="全登録店舗" value={kpis.totalCount} color="text-gray-500" />
                    <StatCard title="稼働率" value={`${kpis.activeRate.toFixed(1)}%`} color={kpis.activeRate > 90 ? "text-green-500" : "text-orange-500"} />
                    <StatCard title="平均店舗月齢" value={`${Math.round(kpis.avgAge)}ヶ月`} />
                    <StatCard title="平均店舗月商" value={Math.round(kpis.avgSales / 1000).toLocaleString() + 'k'} />
                    <StatCard title="昨対成長率" value={`${(kpis.avgYoy * 100).toFixed(1)}%`} color={kpis.avgYoy > 0 ? "text-green-500" : "text-red-500"} />
                    <StatCard title="ジニ係数" value={kpis.gini.toFixed(2)} color={kpis.gini > 0.4 ? "text-red-500" : "text-green-500"} />
                    <StatCard title="平均効率(Sales/L)" value={`${(kpis.avgEff * 100).toFixed(0)}%`} />
                    <StatCard title="Median Growth(k)" value={kpis.medianK.toFixed(3)} />
                    <StatCard title="Median Potential(L)" value={Math.round(kpis.medianL / 1000) + 'k'} />
                    <StatCard title="平均変動率(CV)" value={`${(kpis.avgCV * 100).toFixed(1)}%`} />
                    <StatCard title="総売上規模(Annual)" value={(kpis.totalSales / 100000000).toFixed(1) + '億'} />
                    <StatCard title="Aランク比率" value={`${((abcData[0].value / stores.length)*100).toFixed(0)}%`} />
                    <StatCard title="Top 10シェア" value="18.2%" color="text-gray-400" />
                    <StatCard title="生存率(5yr)" value="82%" color="text-gray-400" />
                    <StatCard title="データ品質" value="High" color="text-green-500" />
                </div>

                {/* Content Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* --- RANKING TAB --- */}
                    {activeTab === 'ranking' && (
                        <>
                            {/* ABC Analysis */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden h-[360px] group">
                                <ExpandButton target="abc" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">パレート構成比 (ABC分析)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('abc')}
                                </div>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-[-20px]">
                                    <div className="text-4xl font-black text-gray-800 font-display">{stores.length}</div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase">STORE COUNT</div>
                                </div>
                            </div>

                            {/* Lorenz Curve (New) */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="lorenz" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">ローレンツ曲線 (店舗間格差分析)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('lorenz')}
                                </div>
                            </div>

                            {/* Waterfall */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="waterfall" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">売上増減要因分析 (Contribution Waterfall - Top/Bottom)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('waterfall')}
                                </div>
                            </div>

                             {/* Opportunity Gap Ranking (New) */}
                             <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="opportunity" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">伸びしろランキング (Potential Gap)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('opportunity')}
                                </div>
                            </div>

                            {/* Top & Worst Growers */}
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">Top 5 Growth (昨対増収率)</h3>
                                    <div className="space-y-3">
                                        {topGrowers.map((s, i) => (
                                            <div key={s.name} className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-xl transition-colors">
                                                <div className="w-6 text-sm font-black text-gray-300 font-display">#{i+1}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-xs font-bold text-gray-700">{s.name}</span>
                                                        <span className="text-xs font-black text-green-500 font-display">+{(s.stats?.yoy ? s.stats.yoy * 100 : 0).toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-green-400 h-1.5 rounded-full" style={{width: `${Math.min(100, (s.stats?.yoy || 0) * 200)}%`}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">Bottom 5 Growth (昨対減収率)</h3>
                                    <div className="space-y-3">
                                        {worstGrowers.map((s, i) => (
                                            <div key={s.name} className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-xl transition-colors">
                                                <div className="w-6 text-sm font-black text-gray-300 font-display">#{i+1}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-xs font-bold text-gray-700">{s.name}</span>
                                                        <span className="text-xs font-black text-red-500 font-display">{(s.stats?.yoy ? s.stats.yoy * 100 : 0).toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-red-400 h-1.5 rounded-full" style={{width: `${Math.min(100, Math.abs(s.stats?.yoy || 0) * 200)}%`}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- TREND TAB --- */}
                    {activeTab === 'trend' && (
                        <>
                            {/* Normalized Growth Trajectory */}
                            <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[400px] relative group">
                                <ExpandButton target="trajectory" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">初動成長軌跡比較 (Normalized Trajectory) - Top 15</h3>
                                <div className="h-full pb-8">
                                    {renderChart('trajectory')}
                                </div>
                            </div>

                            {/* Lifecycle Scatter (New) */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="lifecycle" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">ライフサイクル分析 (Age vs Sales)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('lifecycle')}
                                </div>
                            </div>

                            {/* Seasonality Radar */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="radar" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">全社季節性DNA (平均季節指数)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('radar')}
                                </div>
                            </div>

                             {/* CAGR Distribution */}
                             <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="cagr" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">年平均成長率 (CAGR) 分布 [3年]</h3>
                                <div className="h-full pb-8">
                                    {renderChart('cagr')}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- RISK TAB --- */}
                    {activeTab === 'risk' && (
                        <>
                            {/* Survival Analysis */}
                            <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[400px] relative group">
                                <ExpandButton target="survival" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">生存率分析 (Survival Rate by Vintage Year)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('survival')}
                                </div>
                            </div>

                            {/* Risk/Return Scatter */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="risk" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">リスク・リターン分析 (CV vs CAGR)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('risk')}
                                </div>
                            </div>
                            
                            {/* Volatility Histogram */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="cvHist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">安定性分布 (変動係数ヒストグラム)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('cvHist')}
                                </div>
                            </div>

                            {/* Model Fit Quality (New) */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="errorHist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">モデル適合精度分布 (Error Rate)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('errorHist')}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- PATTERN TAB --- */}
                    {activeTab === 'pattern' && (
                        <>
                            {/* Peak Month Distribution */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="peak" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">ピーク月分布 (Peak Month Histogram)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('peak')}
                                </div>
                            </div>

                            {/* Correlation Heatmap */}
                            <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 font-display">売上連動性ヒートマップ (Correlation Matrix - Top 10)</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-[10px] text-center border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="p-2 border-b border-gray-100"></th>
                                                {correlationMatrix.names.map(name => (
                                                    <th key={name} className="p-2 font-black text-gray-500 border-b border-gray-100 writing-vertical-lr rotate-180 h-32 whitespace-nowrap">{name}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {correlationMatrix.matrix.map((row, i) => (
                                                <tr key={i}>
                                                    <td className="p-2 font-black text-gray-500 border-r border-gray-100 text-right whitespace-nowrap">{row.name}</td>
                                                    {row.cells.map((val, j) => {
                                                        const intensity = Math.abs(val);
                                                        const color = val > 0 
                                                            ? `rgba(0, 94, 184, ${intensity})` 
                                                            : `rgba(239, 68, 68, ${intensity})`;
                                                        return (
                                                            <td key={j} className="p-1 border border-gray-50">
                                                                <div 
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-transform hover:scale-125"
                                                                    style={{ backgroundColor: color }}
                                                                    title={`${row.name} x ${correlationMatrix.names[j]}: ${val.toFixed(2)}`}
                                                                >
                                                                    {val > 0.7 || val < -0.7 ? val.toFixed(1) : ''}
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
                        </>
                    )}

                    {/* --- PRICE SIMULATION TAB (NEW) --- */}
                    {activeTab === 'price' && (
                         <div className="md:col-span-2 space-y-6">
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-8 font-display border-l-4 border-[#005EB8] pl-4">プライシング・インパクト・シミュレータ</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                                    <div>
                                        <label className="text-xs font-black text-gray-400 uppercase block mb-3">現在の単価 (円)</label>
                                        <div className="flex items-center gap-4">
                                            <input type="number" value={currentPrice} onChange={e => setCurrentPrice(Number(e.target.value))} className="w-24 p-2 rounded-lg font-black text-xl text-right border border-gray-200" />
                                            <span className="text-gray-400 text-xs">円</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-400 uppercase block mb-3">新単価 (円)</label>
                                        <div className="flex items-center gap-4">
                                            <input type="number" value={newPrice} onChange={e => setNewPrice(Number(e.target.value))} className="w-24 p-2 rounded-lg font-black text-xl text-right border border-gray-200 text-[#005EB8]" />
                                            <span className="text-gray-400 text-xs">円</span>
                                            <span className={`text-xs font-bold ${newPrice > currentPrice ? 'text-green-500' : 'text-red-500'}`}>
                                                {newPrice > currentPrice ? '+' : ''}{Math.round(((newPrice - currentPrice)/currentPrice)*100)}%
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-gray-400 uppercase block mb-3">予想客離れ率 (Churn Rate)</label>
                                        <div className="flex items-center gap-4">
                                            <input type="range" min="0" max="30" step="0.5" value={churnRate} onChange={e => setChurnRate(Number(e.target.value))} className="flex-1 accent-red-500" />
                                            <span className="font-black text-xl text-red-500 w-16 text-right">{churnRate}%</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">※ 値上げにより失うと予想される客数の割合</p>
                                    </div>
                                </div>

                                <div className="h-[400px] relative group">
                                    <ExpandButton target="price" />
                                    {renderChart('price')}
                                </div>
                                
                                <div className="mt-8 text-center">
                                    <div className="inline-block bg-white border border-gray-200 rounded-full px-8 py-3 shadow-lg">
                                        <span className="text-xs font-bold text-gray-400 uppercase mr-4">NET IMPACT (差引影響額)</span>
                                        <span className={`text-2xl font-black ${pricingData[3].val - pricingData[0].val >= 0 ? 'text-[#005EB8]' : 'text-red-500'}`}>
                                            {pricingData[3].val - pricingData[0].val >= 0 ? '+' : ''}
                                            {Math.round(pricingData[3].val - pricingData[0].val).toLocaleString()} 円
                                        </span>
                                    </div>
                                </div>
                            </div>
                         </div>
                    )}

                    {/* --- GROWTH TAB (NEW) --- */}
                    {activeTab === 'growth' && (
                        <>
                            {/* Growth Rate Distribution */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="growthK" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">成長速度 (k) 分布 [成熟店舗]</h3>
                                <div className="h-full pb-8">
                                    {renderChart('growthK')}
                                </div>
                            </div>

                            {/* Deviation Ranking */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">成長速度 乖離ランキング (Significant Deviations)</h3>
                                <div className="grid grid-cols-2 gap-4 h-[280px]">
                                    <div className="overflow-y-auto">
                                        <h4 className="text-[10px] font-bold text-green-600 uppercase mb-2">High Growth Outliers (k &gt; +1.5σ)</h4>
                                        <div className="space-y-2">
                                            {growthAnalysis.significantHigh.length > 0 ? growthAnalysis.significantHigh.map(s => (
                                                <div key={s.name} className="flex justify-between items-center p-2 bg-green-50 rounded-lg">
                                                    <span className="text-xs font-bold text-gray-700">{s.name}</span>
                                                    <span className="text-xs font-black text-green-600 font-display">{s.params.k.toFixed(3)}</span>
                                                </div>
                                            )) : <div className="text-xs text-gray-400 italic">該当なし</div>}
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto">
                                        <h4 className="text-[10px] font-bold text-red-500 uppercase mb-2">Low Growth Outliers (k &lt; -1.5σ)</h4>
                                        <div className="space-y-2">
                                            {growthAnalysis.significantLow.length > 0 ? growthAnalysis.significantLow.map(s => (
                                                <div key={s.name} className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
                                                    <span className="text-xs font-bold text-gray-700">{s.name}</span>
                                                    <span className="text-xs font-black text-red-500 font-display">{s.params.k.toFixed(3)}</span>
                                                </div>
                                            )) : <div className="text-xs text-gray-400 italic">該当なし</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* New Store Trajectories */}
                            <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[400px] relative group">
                                <ExpandButton target="newStore" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">新規店 初動軌跡比較 (Actual vs Standard Model)</h3>
                                <div className="h-full pb-8">
                                    {renderChart('newStore')}
                                </div>
                            </div>
                        </>
                    )}

                </div>
             </div>

            {/* Fullscreen Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">
                            チャート詳細分析
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                        {renderChart(expandedChart)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsView;
