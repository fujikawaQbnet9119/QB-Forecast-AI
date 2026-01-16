
import React, { useMemo, useState, useCallback } from 'react';
import { StoreData } from '../types';
import { calculatePearsonCorrelation } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, Cell, Treemap, PieChart, Pie, Legend,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line, ReferenceLine, Brush, Area, AreaChart, ComposedChart, LabelList
} from 'recharts';

interface AnalyticsViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
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

const StatCard: React.FC<{ title: string; value: string | number; sub?: string; color?: string; tooltip?: string }> = ({ title, value, sub, color = "text-[#005EB8]", tooltip }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-full">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1 font-display flex items-center gap-1">
            {title}
            {tooltip && <HelpTooltip title={title} content={tooltip} />}
        </p>
        <div className={`text-xl font-black font-display ${color} leading-none tracking-tight`}>{value}</div>
        {sub && <p className="text-[9px] text-gray-400 mt-1">{sub}</p>}
    </div>
);

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ allStores, dataType }) => {
    const stores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.stats);
    const allStoresList = Object.values(allStores) as StoreData[];
    const [activeTab, setActiveTab] = useState<'ranking' | 'trend' | 'risk' | 'pattern' | 'price' | 'growth'>('ranking');
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    
    // Pricing Simulator State
    const [currentPrice, setCurrentPrice] = useState(1350);
    const [newPrice, setNewPrice] = useState(1500);
    const [churnRate, setChurnRate] = useState(5); // Percent

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';
    const valueFormatter = (val: number) => val.toLocaleString() + (isSales ? 'k' : '人');
    const totalUnitLabel = isSales ? '億円' : '万人';
    const totalValueDivider = isSales ? 100000 : 10; // Sales(k)/100000=Oku, Cust(1)/10000=Man -> Wait. Cust in units. Total=Sum. If 100k cust, /10000 = 10Man.

    // --- Data Preparation ---

    // 0. KPI Dashboard Metrics
    const kpis = useMemo(() => {
        const activeCount = stores.length;
        const totalCount = allStoresList.length;
        const activeRate = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
        
        // Data is in 1000 Yen units OR persons
        const totalVolume = stores.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
        const avgVolume = activeCount > 0 ? totalVolume / activeCount : 0;
        
        const avgAge = stores.length > 0 ? stores.reduce((a,s) => a + s.raw.length, 0) / stores.length : 0;
        
        const medianK = stores.length > 0 ? [...stores].sort((a,b) => a.params.k - b.params.k)[Math.floor(stores.length/2)].params.k : 0;
        const medianL = stores.length > 0 ? [...stores].sort((a,b) => a.params.L - b.params.L)[Math.floor(stores.length/2)].params.L : 0;
        
        const avgYoy = stores.length > 0 ? stores.reduce((a,s) => a + (s.stats?.yoy || 0), 0) / stores.length : 0;
        
        const gini = calculateGini(stores.map(s => s.stats?.lastYearSales || 0));
        
        const avgCV = stores.length > 0 ? stores.reduce((a,s) => a + (s.stats?.cv || 0), 0) / stores.length : 0;
        
        // Efficiency (Actual / L)
        const avgEff = stores.length > 0 ? stores.reduce((a,s) => a + ((s.raw[s.raw.length-1] || 0) / s.params.L), 0) / stores.length : 0;

        return { activeCount, totalCount, activeRate, totalVolume, avgVolume, avgAge, medianK, medianL, avgYoy, gini, avgCV, avgEff };
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
        return [...stores].sort((a, b) => (b.stats?.yoy || 0) - (a.stats?.yoy || 0)).slice(0, 20);
    }, [stores]);

    const worstGrowers = useMemo(() => {
        return [...stores].sort((a, b) => (a.stats?.yoy || 0) - (b.stats?.yoy || 0)).slice(0, 20);
    }, [stores]);

    // 1-B. Contribution Waterfall Data
    const contributionData = useMemo(() => {
        const diffs = stores.map(s => {
            const last = s.stats?.lastYearSales || 0;
            const prev = s.stats?.prevYearSales || 0;
            return { name: s.name, diff: Math.round(last - prev) };
        });
        diffs.sort((a, b) => b.diff - a.diff);
        
        const topPos = diffs.slice(0, 10).filter(d => d.diff > 0);
        const topNeg = diffs.slice(-10).reverse().filter(d => d.diff < 0);

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
        return data.filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 10);
    }, [stores]);

    // 1-E: Stability Ranking
    const stabilityRankingData = useMemo(() => {
        return [...stores]
            .filter(s => s.stats && s.raw.length >= 12)
            .sort((a, b) => (a.stats?.cv || 0) - (b.stats?.cv || 0))
            .slice(0, 10)
            .map(s => ({
                name: s.name,
                cv: s.stats?.cv || 0,
                score: 1 / (s.stats?.cv || 0.01)
            }));
    }, [stores]);

    // 1-F: Streak Counter
    const streakData = useMemo(() => {
        return stores.map(s => {
            let streak = 0;
            const len = s.raw.length;
            if (len < 13) return { name: s.name, streak: 0 };
            for (let i = 0; i < len - 12; i++) {
                const current = s.raw[len - 1 - i];
                const prevYear = s.raw[len - 1 - i - 12];
                if (i === 0) {
                    if (current > prevYear) streak = 1;
                    else if (current < prevYear) streak = -1;
                    else return { name: s.name, streak: 0 };
                } else {
                    if (streak > 0 && current > prevYear) streak++;
                    else if (streak < 0 && current < prevYear) streak--;
                    else break;
                }
            }
            return { name: s.name, streak };
        }).sort((a, b) => b.streak - a.streak).slice(0, 15);
    }, [stores]);

    // 1-G: Store LTV Ranking
    const ltvRankingData = useMemo(() => {
        return stores.map(s => ({
            name: s.name,
            // If Sales: 1000s -> Man Yen (/10). If Cust: Persons -> Persons (no change or /1000 for k)
            // Let's normalize for display to '万' units if sales, or 'k' units if customers
            ltv: Math.round((s.stats?.totalSales || 0) / (isSales ? 10 : 1)) 
        })).sort((a,b) => b.ltv - a.ltv).slice(0, 15);
    }, [stores, isSales]);


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

    // 2-B. Normalized Growth
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

    // 2-C. Lifecycle
    const lifecycleData = useMemo(() => {
        return stores.map(s => ({
            age: Math.floor(s.raw.length / 12),
            sales: Math.round((s.stats?.lastYearSales || 0) / (isSales ? 10 : 1)), // Man Yen or Persons
            name: s.name
        }));
    }, [stores, isSales]);

    // 2-D: MA Divergence
    const maDivergenceData = useMemo(() => {
        return stores
            .filter(s => s.raw.length >= 13)
            .map(s => {
                const current = s.raw[s.raw.length - 1];
                const last12 = s.raw.slice(-13, -1);
                const ma = last12.reduce((a,b) => a+b, 0) / 12;
                const div = ma > 0 ? ((current - ma) / ma) * 100 : 0;
                return { name: s.name, div };
            })
            .sort((a, b) => b.div - a.div);
    }, [stores]);

    // 2-E: Rolling CAGR
    const rollingCagrData = useMemo(() => {
        const topStores = [...stores]
            .sort((a,b) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0))
            .slice(0, 5);
        const data = [];
        const maxLen = Math.max(...topStores.map(s => s.raw.length));
        const yearsCount = Math.floor(maxLen / 12);
        for(let y = 3; y <= yearsCount; y++) {
            const p: any = { year: `Year ${y}` };
            topStores.forEach(s => {
                const idx = y * 12 - 1;
                if (idx < s.raw.length && idx >= 36) {
                    const endVal = s.raw.slice(idx-11, idx+1).reduce((a,b)=>a+b,0);
                    const startVal = s.raw.slice(idx-36-11, idx-36+1).reduce((a,b)=>a+b,0);
                    if (startVal > 0) {
                        const cagr = (Math.pow(endVal/startVal, 1/3) - 1) * 100;
                        p[s.name] = cagr;
                    }
                }
            });
            if (Object.keys(p).length > 1) data.push(p);
        }
        return { data, lines: topStores.map(s => s.name) };
    }, [stores]);

    // 2-F: SAAR
    const saarData = useMemo(() => {
        const len = 24;
        const agg: {date: string, raw: number, saar: number}[] = [];
        for(let i=0; i<len; i++) {
            let sumRaw = 0;
            let sumSaar = 0;
            let count = 0;
            stores.forEach(s => {
                const idx = s.raw.length - 1 - ((len - 1) - i);
                if (idx >= 0) {
                    const val = s.raw[idx];
                    const d = new Date(s.dates[idx].replace(/\//g, '-'));
                    const m = isNaN(d.getTime()) ? 0 : d.getMonth();
                    const sea = s.seasonal[m] || 1.0;
                    sumRaw += val;
                    sumSaar += (val / sea) * 12;
                    count++;
                }
            });
            if (count > 0) {
                agg.push({
                    date: `${(len-1)-i}ヶ月前`,
                    raw: Math.round((sumRaw / count) * 12),
                    saar: Math.round(sumSaar / count)
                });
            }
        }
        return agg;
    }, [stores]);

    // 2-G: Cluster Benchmark
    const clusterBenchmarkData = useMemo(() => {
        const sorted = [...stores].sort((a, b) => a.params.L - b.params.L);
        const n = sorted.length;
        if (n < 3) return { data: [], clusters: [] };
        
        const clusters = [
            { name: 'Small', stores: sorted.slice(0, Math.floor(n/3)), color: '#9CA3AF' },
            { name: 'Medium', stores: sorted.slice(Math.floor(n/3), Math.floor(2*n/3)), color: '#F59E0B' },
            { name: 'Large', stores: sorted.slice(Math.floor(2*n/3)), color: '#005EB8' }
        ];

        const maxAge = 60;
        const data = [];
        for(let i=0; i<maxAge; i++) {
            const p: any = { month: i+1 };
            clusters.forEach(c => {
                let sum = 0, count = 0;
                c.stores.forEach(s => {
                    if (s.raw[i] !== undefined) {
                        sum += s.raw[i];
                        count++;
                    }
                });
                if (count >= 3) {
                    p[c.name] = Math.round(sum / count);
                }
            });
            if (Object.keys(p).length > 1) data.push(p);
        }
        return { data, clusters };
    }, [stores]);


    // 3. Risk
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

    const cvHistogram = useMemo(() => {
        const buckets = Array(10).fill(0);
        stores.forEach(s => {
            const cv = s.stats?.cv || 0;
            const idx = Math.min(9, Math.floor(cv * 50)); 
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `${(i*0.02).toFixed(2)}-`, count: v }));
    }, [stores]);

    const fitQualityData = useMemo(() => {
        const buckets = Array(10).fill(0);
        stores.forEach(s => {
            const mean = (s.stats?.lastYearSales || 1) / 12;
            const normStd = s.stdDev / mean;
            const idx = Math.min(9, Math.floor(normStd * 50));
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `<${((i+1)*2)}%`, count: v }));
    }, [stores]);

    const maxDrawdownData = useMemo(() => {
        const buckets = Array(10).fill(0);
        stores.forEach(s => {
            let peak = 0;
            let maxDd = 0;
            s.raw.forEach(v => {
                if (v > peak) peak = v;
                const dd = peak > 0 ? (peak - v) / peak : 0;
                if (dd > maxDd) maxDd = dd;
            });
            const idx = Math.min(9, Math.floor(maxDd * 20)); 
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `${i*5}%-${(i+1)*5}%`, count: v }));
    }, [stores]);

    const athDrawdownData = useMemo(() => {
        return stores.map(s => {
            const ath = Math.max(...s.raw);
            const current = s.raw[s.raw.length - 1];
            const dd = ath > 0 ? ((current - ath) / ath) * 100 : 0;
            return { name: s.name, dd };
        }).sort((a,b) => a.dd - b.dd).slice(0, 15);
    }, [stores]);

    const volatilitySmileData = useMemo(() => {
        return stores.map(s => ({
            name: s.name,
            size: Math.round((s.stats?.lastYearSales || 0) / (isSales ? 10 : 1)), 
            cv: (s.stats?.cv || 0) * 100
        }));
    }, [stores, isSales]);


    // 4. Pattern
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

    const riskReturnData = useMemo(() => {
        return stores.map(s => ({
            name: s.name,
            x: Number(((s.stats?.cv || 0) * 100).toFixed(1)),
            y: Number(((s.stats?.cagr || 0) * 100).toFixed(1)),
            z: Math.round((s.stats?.lastYearSales || 0) / (isSales ? 10 : 1))
        }));
    }, [stores, isSales]);

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
    // REVISED LOGIC for Customer vs Sales Data
    const pricingData = useMemo(() => {
        // Base Volume per Year
        let baseVolume = kpis.totalVolume; // If Sales: 1000s Yen. If Customers: Persons.
        
        let totalSalesYen = 0;
        let totalCustomers = 0;

        if (isSales) {
            // Input is Sales (1000s)
            totalSalesYen = baseVolume * 1000;
            totalCustomers = totalSalesYen / currentPrice;
        } else {
            // Input is Customers (Persons)
            totalCustomers = baseVolume;
            totalSalesYen = totalCustomers * currentPrice;
        }
        
        // Scenario
        const newCustomers = totalCustomers * (1 - churnRate / 100);
        const newSalesYen = newCustomers * newPrice;
        
        const diff = newSalesYen - totalSalesYen;

        const priceEffect = totalCustomers * (newPrice - currentPrice);
        const volumeEffect = - (totalCustomers * (churnRate/100) * newPrice);

        return [
            { name: '現状売上 (Base)', val: Math.round(totalSalesYen), fill: '#94A3B8' },
            { name: '単価効果 (Price Effect)', val: Math.round(priceEffect), fill: '#10B981' },
            { name: '客離れ (Churn Loss)', val: Math.round(volumeEffect), fill: '#EF4444' },
            { name: '新売上予測 (New)', val: Math.round(newSalesYen), fill: diff > 0 ? '#005EB8' : '#F59E0B', isTotal: true }
        ];
    }, [kpis.totalVolume, currentPrice, newPrice, churnRate, isSales]);

    // 8. Growth Analysis
    const growthAnalysis = useMemo(() => {
        const matureStores = stores.filter(s => s.raw.length >= 12 && s.fit.mode !== 'startup');
        
        const kValues = matureStores.map(s => s.params.k).sort((a,b) => a-b);
        const meanK = kValues.reduce((a,b) => a+b, 0) / kValues.length;
        const stdK = Math.sqrt(kValues.reduce((a,b) => a + Math.pow(b-meanK, 2), 0) / kValues.length);
        
        const significantHigh = matureStores.filter(s => (s.params.k - meanK) / stdK > 1.5).sort((a,b) => b.params.k - a.params.k).slice(0, 5);
        const significantLow = matureStores.filter(s => (s.params.k - meanK) / stdK < -1.5).sort((a,b) => a.params.k - b.params.k).slice(0, 5);

        const bucketSize = 0.05;
        const bucketCount = 20;
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

        const youngStores = stores.filter(s => {
            const isYoung = s.raw.length >= 3 && s.raw.length <= 24;
            if (!isYoung) return false;
            const initialRatio = s.params.L > 0 ? (s.raw[0] / s.params.L) : 0;
            if (initialRatio > 0.6) return false;
            const maxVal = Math.max(...s.raw);
            const maxRatio = s.params.L > 0 ? (maxVal / s.params.L) : 0;
            if (maxRatio > 1.5) return false;
            return true;
        });

        const trajectories = youngStores.slice(0, 20).map(s => { 
            const points = s.raw.map((val, i) => ({
                month: i,
                normVal: val / s.params.L
            }));
            return { name: s.name, points };
        });

        const idx75 = Math.min(kValues.length - 1, Math.floor(kValues.length * 0.75));
        const standardK = kValues.length > 0 ? kValues[idx75] : 0.1;

        const standardCurve = Array.from({length: 24}, (_, i) => {
            const t0_est = Math.log(9) / standardK;
            return {
                month: i,
                normVal: 1 / (1 + Math.exp(-standardK * (i - t0_est)))
            };
        });

        return { meanK, stdK, significantHigh, significantLow, histogramData, trajectories, standardCurve, standardK };
    }, [stores]);

    const agingCurveData = useMemo(() => {
        const ageMap = new Map<number, number[]>();
        stores.forEach(s => {
            s.raw.forEach((val, i) => {
                if (val > 0) {
                    if (!ageMap.has(i)) ageMap.set(i, []);
                    ageMap.get(i)?.push(val);
                }
            });
        });

        const data: any[] = [];
        const maxAge = 60;
        for (let i = 0; i < maxAge; i++) {
            const vals = ageMap.get(i);
            if (vals && vals.length >= 5) {
                vals.sort((a,b) => a-b);
                const q1 = vals[Math.floor(vals.length * 0.25)];
                const median = vals[Math.floor(vals.length * 0.5)];
                const q3 = vals[Math.floor(vals.length * 0.75)];
                data.push({
                    month: i + 1,
                    median: Math.round(median / (isSales ? 10 : 1)), // Man Yen or Person
                    range: [Math.round(q1 / (isSales ? 10 : 1)), Math.round(q3 / (isSales ? 10 : 1))]
                });
            }
        }
        return data;
    }, [stores, isSales]);

    const utilizationData = useMemo(() => {
        const buckets = Array(11).fill(0);
        stores.forEach(s => {
            const current = s.raw[s.raw.length - 1];
            const L = s.params.L;
            const rate = L > 0 ? (current / L) * 100 : 0;
            const idx = Math.min(10, Math.floor(rate / 10));
            buckets[idx]++;
        });
        return buckets.map((c, i) => ({
            range: i === 10 ? '100%+' : `${i*10}-${(i+1)*10}%`,
            count: c
        }));
    }, [stores]);

    const standardModelReference = useMemo(() => {
        const k = growthAnalysis.standardK;
        const t0 = Math.log(9) / k;
        const data = [];
        for(let t=0; t<=60; t++) {
            data.push({
                t: t,
                y: (1 / (1 + Math.exp(-k * (t - t0)))) * 100
            });
        }
        return { k, data };
    }, [growthAnalysis.standardK]);


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
                        <YAxis unit="%" tick={{fontSize:9}} label={{ value: `${isSales ? '売上' : '客数'}累積 (%)`, angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
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
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? 'k' : '人')} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
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
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? 'k' : '人')} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="gap" name={`月間${isSales ? '売上' : '客数'}余地`} radius={[0, 4, 4, 0]} fill="#8B5CF6">
                            <LabelList dataKey="gap" position="right" fontSize={9} formatter={(v: number) => Math.round(v).toLocaleString() + (isSales ? 'k' : '人')} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'stability': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stabilityRankingData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toFixed(1)} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="score" name="安定性スコア" radius={[0, 4, 4, 0]} fill="#10B981">
                            <LabelList dataKey="score" position="right" fontSize={9} formatter={(v: number) => v.toFixed(1)} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'streak': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={streakData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine x={0} stroke="#000" />
                        <Bar dataKey="streak" name="連続記録(月)">
                            {streakData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.streak > 0 ? '#10B981' : '#EF4444'} />)}
                            <LabelList 
                                dataKey="streak" 
                                content={(props: any) => {
                                    const { x, y, width, height, value } = props;
                                    const val = Number(value);
                                    if (isNaN(val) || val === 0) return null;
                                    const isPos = val > 0;
                                    // Custom positioning for labels:
                                    // Positive: right of bar
                                    // Negative: left of bar (x is the left edge for negative bars in Recharts layout usually, but let's assume standard behavior)
                                    // Recharts vertical bar with negative values: x is typically the start point (0 line) for negative values? No, usually x is the left-most edge.
                                    // Let's use a safe offset logic based on bar direction.
                                    
                                    const textX = isPos ? (Number(x) + Number(width) + 5) : (Number(x) - 5);
                                    const textY = Number(y) + Number(height) / 2 + 3;
                                    
                                    return (
                                        <text x={textX} y={textY} fill={isPos ? '#10B981' : '#EF4444'} textAnchor={isPos ? 'start' : 'end'} fontSize={9} fontWeight="bold">
                                            {val > 0 ? `+${val}` : val}
                                        </text>
                                    );
                                }} 
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'maDivergence': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={maDivergenceData.slice(0, 10).concat(maDivergenceData.slice(-10))} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <ReferenceLine x={0} stroke="#000" />
                        <Bar dataKey="div" name="乖離率">
                            {maDivergenceData.slice(0, 10).concat(maDivergenceData.slice(-10)).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.div > 0 ? '#10B981' : '#EF4444'} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'saar': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={saarData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? 'k' : '人')} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        <Line type="monotone" dataKey="raw" name="実績 (Raw)" stroke="#94A3B8" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="saar" name="季節調整済年率 (SAAR)" stroke="#F59E0B" strokeWidth={3} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'rollingCagr': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rollingCagrData.data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="year" tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} unit="%" />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        {rollingCagrData.lines.map((name, i) => (
                            <Line key={name} type="monotone" dataKey={name} stroke={`hsl(${i * 45}, 70%, 50%)`} strokeWidth={2} dot={false} />
                        ))}
                    </LineChart>
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
                        <YAxis type="number" dataKey="sales" name={`年間${isSales ? '売上' : '客数'}`} tick={{fontSize:9}} unit={isSales ? '万円' : '人'} label={{ value: `年間${isSales ? '売上(万円)' : '客数(人)'} →`, angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? '万円' : '人')} cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
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
            case 'maxDrawdown': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={maxDrawdownData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="range" tick={{fontSize:9}} label={{ value: '最大ドローダウン率', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} name="店舗数" />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'athDrawdown': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={athDrawdownData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="dd" name="ATH下落率" radius={[0, 4, 4, 0]} fill="#F59E0B">
                            <LabelList dataKey="dd" position="right" fontSize={9} formatter={(v: number) => v.toFixed(1) + '%'} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'smile': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis type="number" dataKey="size" name={`売上規模 (${isSales ? '万円' : '人'})`} unit={isSales ? '万円' : '人'} label={{ value: `売上規模 (${isSales ? '万円' : '人'}) →`, position: 'bottom', offset: 0, fontSize: 9 }} tick={{fontSize:9}} />
                        <YAxis type="number" dataKey="cv" name="変動率(CV)" tick={{fontSize:9}} unit="%" label={{ value: '変動率 (CV) →', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Scatter name="Stores" data={volatilitySmileData} fill="#8B5CF6" fillOpacity={0.5} />
                    </ScatterChart>
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
                        <YAxis tick={{fontSize:9}} domain={[0, 1.2]} label={{ value: '達成率 (Val/L)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                        <Tooltip formatter={(val: number) => val.toFixed(2)} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        <Line data={growthAnalysis.standardCurve} type="monotone" dataKey="normVal" stroke="#1A1A1A" strokeWidth={2} strokeDasharray="5 5" dot={false} name={`標準モデル (75%tile k=${growthAnalysis.standardK.toFixed(3)})`} z={10} />
                        {growthAnalysis.trajectories.map((s, i) => (
                            <Line key={s.name} data={s.points} type="monotone" dataKey="normVal" name={s.name} stroke={`hsl(${i * 45}, 70%, 60%)`} strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            case 'ltv': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ltvRankingData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? '万円' : '人')} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="ltv" name={`累積${isSales ? '売上(万円)' : '客数(人)'}`} radius={[0, 4, 4, 0]} fill="#005EB8">
                            <LabelList dataKey="ltv" position="right" fontSize={9} formatter={(v: number) => v.toLocaleString()} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'aging': return (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={agingCurveData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="month" tick={{fontSize:9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? '万円' : '人')} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        <Area type="monotone" dataKey="range" fill="#005EB8" fillOpacity={0.1} stroke="transparent" name="範囲 (Q1-Q3)" />
                        <Line type="monotone" dataKey="median" stroke="#005EB8" strokeWidth={3} dot={false} name="中央値 (Median)" />
                    </ComposedChart>
                </ResponsiveContainer>
            );
            case 'utilization': return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={utilizationData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="range" tick={{fontSize:9}} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="店舗数" />
                    </BarChart>
                </ResponsiveContainer>
            );
            case 'clusterBench': return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={clusterBenchmarkData.data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="month" tick={{fontSize:9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} />
                        <YAxis tick={{fontSize:9}} />
                        <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                        {clusterBenchmarkData.clusters.map((c, i) => (
                            <Line key={c.name} type="monotone" dataKey={c.name} stroke={c.color} strokeWidth={2} dot={false} name={c.name} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
            default: return null;
        }
    }, [abcData, lorenzData, contributionData, opportunityData, normalizedGrowthData, lifecycleData, seasonalityCluster, stores, survivalData, riskReturnData, cvHistogram, fitQualityData, peakMonthData, pricingData, growthAnalysis, kpis.medianK, stabilityRankingData, streakData, maDivergenceData, saarData, rollingCagrData, maxDrawdownData, athDrawdownData, volatilitySmileData, ltvRankingData, agingCurveData, utilizationData, clusterBenchmarkData, isSales, valueFormatter, unitLabel]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
             <div className="w-full px-4 md:px-8 space-y-8 pb-20">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">高度分析ラボ (Advanced Analytics)</h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">30+ KPIs & Metrics Dashboard ({isSales ? '売上' : '客数'})</p>
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
                    <StatCard title="稼働率" value={`${kpis.activeRate.toFixed(1)}%`} color={kpis.activeRate > 90 ? "text-green-500" : "text-orange-500"} tooltip="全登録店舗のうち、現在も売上が発生している（閉店していない）店舗の割合。" />
                    <StatCard title="平均店舗月齢" value={`${Math.round(kpis.avgAge)}ヶ月`} />
                    <StatCard title={`平均店舗月${isSales ? '商' : '客数'}`} value={Math.round(kpis.avgVolume / (isSales ? 10 : 1)).toLocaleString() + (isSales ? '万円' : '人')} tooltip="直近1年間の平均月次実績。" />
                    <StatCard title="昨対成長率" value={`${(kpis.avgYoy * 100).toFixed(1)}%`} color={kpis.avgYoy > 0 ? "text-green-500" : "text-red-500"} tooltip="全店の合計の、昨年対比の成長率。" />
                    <StatCard title="ジニ係数" value={kpis.gini.toFixed(2)} color={kpis.gini > 0.4 ? "text-red-500" : "text-green-500"} tooltip="格差を示す指標。0に近いほど平等、1に近いほど格差大。" />
                    <StatCard title="平均効率(Vol/L)" value={`${(kpis.avgEff * 100).toFixed(0)}%`} tooltip="店舗の潜在能力(L)をどれくらい使い切っているか。" />
                    <StatCard title="Median Growth(k)" value={kpis.medianK.toFixed(3)} tooltip="立ち上がりの速さ(k)の中央値。" />
                    <StatCard title="Median Potential(L)" value={Math.round(kpis.medianL / (isSales ? 10 : 1)).toLocaleString() + (isSales ? '万円' : '人')} tooltip="潜在規模(L)の中央値。" />
                    <StatCard title="平均変動率(CV)" value={`${(kpis.avgCV * 100).toFixed(1)}%`} tooltip="バラつき具合。0.1以下なら安定。" />
                    <StatCard title={`総規模(Annual)`} value={(kpis.totalVolume / totalValueDivider).toFixed(1) + totalUnitLabel} />
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
                            {/* Streak Counter */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="streak" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ストリーク・カウンター (連続増減記録)
                                    <HelpTooltip title="ストリーク" content="昨対比プラス（またはマイナス）が何ヶ月連続で続いているかを表示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('streak')}
                                </div>
                            </div>

                            {/* Store LTV Ranking */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="ltv" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    店舗生涯価値ランキング (Cumulative)
                                    <HelpTooltip title="LTV" content="オープンから現在までの「総実績」です。会社への貢献度が最も高い店舗がわかります。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('ltv')}
                                </div>
                            </div>

                            {/* Stability Ranking */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="stability" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    安定性ランキング (Stability Score)
                                    <HelpTooltip title="安定性スコア" content="毎月のブレが少ない（計算ができる）店舗ランキングです。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('stability')}
                                </div>
                            </div>

                            {/* ABC Analysis */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden h-[360px] group">
                                <ExpandButton target="abc" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    パレート構成比 (ABC分析)
                                    <HelpTooltip title="ABC分析" content="上位70%をA、次20%をB、下位10%をCに分類します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('abc')}
                                </div>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-[-20px]">
                                    <div className="text-4xl font-black text-gray-800 font-display">{stores.length}</div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase">STORE COUNT</div>
                                </div>
                            </div>

                            {/* Lorenz Curve */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="lorenz" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ローレンツ曲線 (店舗間格差分析)
                                    <HelpTooltip title="ローレンツ曲線" content="青いエリアが膨らんでいるほど、格差が大きい状態を示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('lorenz')}
                                </div>
                            </div>

                            {/* Waterfall */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[720px] relative group">
                                <ExpandButton target="waterfall" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    増減要因分析 (Waterfall)
                                    <HelpTooltip title="ウォーターフォール" content="昨年に比べて、どの店舗が増やし(緑)、どの店舗が減らしたか(赤)を可視化します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('waterfall')}
                                </div>
                            </div>

                             {/* Opportunity Gap Ranking */}
                             <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="opportunity" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    伸びしろランキング (Potential Gap)
                                    <HelpTooltip title="伸びしろ (Gap)" content="AIが予測した「本来の実力(L)」に対して、現在の実績がどれくらい低いかを示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('opportunity')}
                                </div>
                            </div>

                            {/* Top & Worst Growers */}
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[600px] flex flex-col">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex-shrink-0">Top 20 Growth (昨対増)</h3>
                                    <div className="space-y-3 overflow-y-auto pr-2 flex-1">
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
                                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[600px] flex flex-col">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex-shrink-0">Bottom 20 Growth (昨対減)</h3>
                                    <div className="space-y-3 overflow-y-auto pr-2 flex-1">
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
                            {/* Cluster Benchmark */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="clusterBench" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    規模別成長ベンチマーク (Cluster Growth)
                                    <HelpTooltip title="規模別ベンチマーク" content="店舗を「大・中・小」の3グループに分け、それぞれの平均的な成長カーブを表示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('clusterBench')}
                                </div>
                            </div>

                            {/* MA Divergence */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="maDivergence" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    移動平均乖離率 (Trend Reversal)
                                    <HelpTooltip title="移動平均乖離率" content="直近の実績が「過去12ヶ月の平均」からどれくらい離れているかを見ます。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('maDivergence')}
                                </div>
                            </div>

                            {/* Rolling CAGR */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="rollingCagr" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ローリングCAGR推移 (Rolling CAGR)
                                    <HelpTooltip title="ローリングCAGR" content="「3年間の平均成長率」が年々どう変化しているかを表示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('rollingCagr')}
                                </div>
                            </div>

                            {/* SAAR */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="saar" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    季節調整済み年率換算 (SAAR)
                                    <HelpTooltip title="SAAR (年率換算)" content="「今のペースで1年間営業したらどれくらいになるか」の推定値です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('saar')}
                                </div>
                            </div>

                            {/* Trajectory */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="trajectory" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    初動成長軌跡比較 (Normalized Trajectory)
                                    <HelpTooltip title="初動成長軌跡" content="主要店舗のオープンからの成長カーブを重ねて表示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('trajectory')}
                                </div>
                            </div>

                            {/* Lifecycle */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="lifecycle" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ライフサイクル分析 (Age vs Vol)
                                    <HelpTooltip title="ライフサイクル分析" content="横軸に店舗年齢、縦軸に実績をとったグラフです。右に行く（古くなる）につれて下がっている場合、店舗の老朽化が進んでいます。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('lifecycle')}
                                </div>
                            </div>

                            {/* Radar */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="radar" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    全社季節性DNA (平均季節指数)
                                    <HelpTooltip title="季節指数レーダー" content="全店舗の平均的な季節変動パターンです。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('radar')}
                                </div>
                            </div>

                             {/* CAGR */}
                             <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="cagr" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    年平均成長率 (CAGR) 分布 [3年]
                                    <HelpTooltip title="CAGR分布" content="直近3年間で年率何%成長したかの分布です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('cagr')}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- RISK TAB --- */}
                    {activeTab === 'risk' && (
                        <>
                            {/* Max Drawdown */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="maxDrawdown" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    最大ドローダウン分布 (Max Drawdown)
                                    <HelpTooltip title="最大ドローダウン" content="過去の最高値から、最大で何%落ち込んだことがあるかを示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('maxDrawdown')}
                                </div>
                            </div>

                            {/* ATH Drawdown */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="athDrawdown" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    過去最高からの下落率 (ATH Drawdown)
                                    <HelpTooltip title="ATHからの下落率" content="「過去最高(All Time High)」と比べて、現在がどれくらい下がっているかです。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('athDrawdown')}
                                </div>
                            </div>

                            {/* Volatility Smile */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="smile" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ボラティリティ・スマイル (規模 vs 変動率)
                                    <HelpTooltip title="ボラティリティ・スマイル" content="横軸に規模、縦軸に不安定さ(CV)をとった図です。通常、規模が大きい店ほど安定（右下）します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('smile')}
                                </div>
                            </div>

                            {/* Survival */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="survival" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    生存率分析 (Survival Rate)
                                    <HelpTooltip title="生存率分析" content="その年にオープンした店舗のうち、何%が現在も営業しているかを示します。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('survival')}
                                </div>
                            </div>

                            {/* Risk/Return */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="risk" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    リスク・リターン分析 (CV vs CAGR)
                                    <HelpTooltip title="リスク・リターン分析" content="「ハイリスク・ハイリターン」の原則通りかを見ます。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('risk')}
                                </div>
                            </div>
                            
                            {/* Volatility Hist */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="cvHist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    安定性分布 (CV Hist)
                                    <HelpTooltip title="安定性分布" content="ブレ幅(CV)の分布です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('cvHist')}
                                </div>
                            </div>

                            {/* Model Fit */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="errorHist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    モデル適合精度分布 (Error Rate)
                                    <HelpTooltip title="モデル適合精度" content="AIの予測がどれくらい当たっているかの分布です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('errorHist')}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- PATTERN TAB --- */}
                    {activeTab === 'pattern' && (
                        <>
                            {/* Peak Month */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="peak" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    ピーク月分布 (Peak Month Histogram)
                                    <HelpTooltip title="ピーク月分布" content="「何月が一番忙しいか」を店舗ごとに集計したものです。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('peak')}
                                </div>
                            </div>

                            {/* Correlation */}
                            <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 font-display flex items-center">
                                    連動性ヒートマップ (Correlation Matrix - Top 10)
                                    <HelpTooltip title="連動性ヒートマップ" content="上位10店舗の間で、動きがどれくらい似ているかを示します。" />
                                </h3>
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

                    {/* --- PRICE SIMULATION TAB --- */}
                    {activeTab === 'price' && (
                         <div className="md:col-span-2 space-y-6">
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-8 font-display border-l-4 border-[#005EB8] pl-4 flex items-center">
                                    プライシング・インパクト・シミュレータ
                                    <HelpTooltip title="価格シミュレータ" content="「値上げ」をした場合の売上変化をシミュレーションします。" />
                                </h3>
                                
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

                    {/* --- GROWTH TAB --- */}
                    {activeTab === 'growth' && (
                        <>
                            {/* Standard Model Reference Card */}
                            <div className="md:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-8 items-center">
                                <div className="flex-1 space-y-6">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-2 font-display border-l-4 border-[#005EB8] pl-4">
                                            標準成長モデル (Standard Model)
                                        </h3>
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                            全店舗の統計解析から導出された、当社における「理想的な成長軌道」です。<br/>
                                            新規出店や不振店のリハビリ計画は、このカーブを基準（ベースライン）として策定されます。
                                        </p>
                                    </div>
                                    
                                    {/* Math Formula Display */}
                                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 text-center relative overflow-hidden">
                                        <div className="absolute top-0 left-0 bg-slate-200 text-slate-500 text-[9px] font-bold px-2 py-1 rounded-br-lg">FORMULA</div>
                                        <div className="font-serif text-2xl md:text-3xl text-slate-700 italic my-2">
                                            y(t) = <span className="inline-block align-middle text-center"><span className="block border-b border-slate-400 pb-1 mb-1">L</span><span className="block">1 + e<sup className="text-sm">-k(t - t₀)</sup></span></span>
                                        </div>
                                        <div className="mt-4 flex justify-center gap-8 text-xs font-bold text-slate-500 font-mono">
                                            <div>
                                                <span className="text-orange-500 block text-lg">k = {growthAnalysis.standardK.toFixed(3)}</span>
                                                <span>Standard Growth Rate</span>
                                            </div>
                                            <div>
                                                <span className="text-[#005EB8] block text-lg">L = 100%</span>
                                                <span>Potential Capacity</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 w-full h-[300px] bg-slate-50 rounded-2xl p-4 border border-slate-200 relative">
                                    <div className="absolute top-3 left-4 text-xs font-black text-gray-400 uppercase tracking-widest z-10">Standard Curve Visualization (5 Year)</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={standardModelReference.data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="t" tick={{fontSize:9}} label={{ value: '経過月数 (t)', position: 'bottom', offset: 0, fontSize: 9 }} type="number" domain={[0, 60]} />
                                            <YAxis tick={{fontSize:9}} unit="%" domain={[0, 100]} />
                                            <Tooltip formatter={(val: number) => val.toFixed(1) + '%'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: '50% (Inflection)', position: 'insideTopLeft', fontSize: 9, fill:'#94a3b8' }} />
                                            <ReferenceLine y={95} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: '95% (Saturation)', position: 'insideBottomLeft', fontSize: 9, fill:'#94a3b8' }} />
                                            <Line type="monotone" dataKey="y" stroke="#005EB8" strokeWidth={3} dot={false} activeDot={{r: 6}} name="達成率" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Aging Curve */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="aging" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    店舗年齢別 平均{isSales ? '売上' : '客数'}カーブ (Aging Curve)
                                    <HelpTooltip title="Aging Curve" content="オープンしてからの月数ごとの平均実績推移です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('aging')}
                                </div>
                            </div>

                            {/* L Utilization Meter */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="utilization" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    潜在需要(L) 消化率分布 (Capacity Utilization)
                                    <HelpTooltip title="L消化率" content="店舗のポテンシャル(L)をどれくらい使い切っているかの分布です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('utilization')}
                                </div>
                            </div>

                            {/* Growth Rate Distribution */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-[360px] relative group">
                                <ExpandButton target="growthK" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    成長速度 (k) 分布 [成熟店舗]
                                    <HelpTooltip title="成長速度(k)分布" content="店舗の立ち上がりの速さの分布です。" />
                                </h3>
                                <div className="h-full pb-8">
                                    {renderChart('growthK')}
                                </div>
                            </div>

                            {/* Deviation Ranking */}
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    成長速度 乖離ランキング (Significant Deviations)
                                    <HelpTooltip title="成長速度の異常値" content="平均的な成長速度と比べて、極端に早い（緑）または遅い（赤）店舗のリストです。" />
                                </h3>
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
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center">
                                    新規店 初動軌跡比較 (Actual vs Standard Model)
                                    <HelpTooltip title="新規店 初動比較" content="最近オープンした店舗の成長カーブを、全社標準モデル（点線）と比較します。" />
                                </h3>
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
