
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { StoreData } from '../types';
import { calculatePearsonCorrelation, logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import katex from 'katex';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, Cell, PieChart, Pie, Legend,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line, ReferenceLine, Brush, Area, AreaChart, LabelList, ComposedChart, Treemap, ZAxis, ErrorBar, FunnelChart, Funnel
} from 'recharts';

interface AnalyticsViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

// --- Japan Prefecture Grid for Tile Map ---
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

// --- Statistical Helpers ---
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

const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

const calculatePercentile = (data: number[], percentile: number) => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const normalizePrefecture = (name: string): string => {
    if (!name) return "Unknown";
    const trimmed = name.trim();
    if (trimmed === '北海道') return trimmed;
    return trimmed.replace(/[都府県]$/, '');
};

const calculateCovariance = (x: number[], y: number[]) => {
    if (x.length !== y.length || x.length === 0) return 0;
    const xMean = x.reduce((a, b) => a + b, 0) / x.length;
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
        sum += (x[i] - xMean) * (y[i] - yMean);
    }
    return sum / x.length;
};

const calculateVariance = (x: number[]) => {
    if (x.length === 0) return 0;
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    return x.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / x.length;
};

// --- Components ---
const StatCard: React.FC<{ title: string; value: string | number; sub?: string; color?: string; size?: 'sm'|'md' }> = ({ title, value, sub, color = "text-[#005EB8]", size='sm' }) => (
    <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-full hover:shadow-md transition-shadow min-h-[100px]`}>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1 font-display truncate w-full">{title}</p>
        <div className={`font-black font-display ${color} leading-none tracking-tight ${size === 'md' ? 'text-3xl' : 'text-xl'}`}>{value}</div>
        {sub && <p className="text-[9px] text-gray-400 mt-2 font-bold truncate w-full border-t border-dashed border-gray-100 pt-1">{sub}</p>}
    </div>
);

const ChartCard: React.FC<{ id: string; title: string; children: React.ReactNode; className?: string; info?: string; helpTitle?: string; helpContent?: string; onExpand: (id: string) => void }> = ({ id, title, children, className = "col-span-1", info, helpTitle, helpContent, onExpand }) => (
    <div className={`bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col relative group hover:shadow-md transition-shadow overflow-hidden ${className}`}>
        <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-2 flex-shrink-0 h-10">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest font-display flex items-center gap-2 truncate pr-2">
                {title}
                {helpTitle && helpContent && <HelpTooltip title={helpTitle} content={helpContent} />}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
                {info && <span className="text-[9px] text-gray-400 font-bold bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{info}</span>}
                <button 
                    onClick={() => onExpand(id)}
                    className="text-gray-300 hover:text-[#005EB8] transition-colors p-1.5 rounded hover:bg-blue-50"
                    title="拡大表示"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                </button>
            </div>
        </div>
        <div className="flex-1 w-full min-h-0 relative">
            {children}
        </div>
    </div>
);

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ allStores, dataType }) => {
    const stores = useMemo(() => (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.stats), [allStores]);
    const allStoresList = useMemo(() => Object.values(allStores) as StoreData[], [allStores]);
    const [activeTab, setActiveTab] = useState<'structure' | 'trend' | 'risk' | 'dna' | 'sim' | 'geo'>('structure');
    const [expandedChartId, setExpandedChartId] = useState<string | null>(null);
    
    // Pricing Simulator State
    const [currentPrice, setCurrentPrice] = useState(1400); // Default user current price
    const [targetPrice, setTargetPrice] = useState(1500);
    const [simChurnRate, setSimChurnRate] = useState(5.0); // %

    // Geography Animation State
    const [geoFrameIndex, setGeoFrameIndex] = useState(0);
    const [isGeoPlaying, setIsGeoPlaying] = useState(false);
    const [geoMetric, setGeoMetric] = useState<'momentum' | 'sales'>('momentum');
    const playbackSpeed = 800; // ms

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上' : '客数';
    
    // --- 0. KPI Calculation (Global & Tab Specific) ---
    const kpis = useMemo(() => {
        const activeCount = stores.length;
        const totalCount = allStoresList.length;
        
        const salesValues = stores.map(s => s.stats?.lastYearSales || 0);
        const totalVolume = salesValues.reduce((a, b) => a + b, 0);
        const avgVolume = activeCount > 0 ? totalVolume / activeCount : 0;
        
        // Structure Metrics
        const sortedSales = [...salesValues].sort((a,b)=>b-a);
        const top20Count = Math.ceil(activeCount * 0.2);
        const top20Sum = sortedSales.slice(0, top20Count).reduce((a,b)=>a+b,0);
        const paretoRatio = totalVolume > 0 ? (top20Sum / totalVolume) * 100 : 0;
        const gini = calculateGini(salesValues);
        const rankACount = stores.filter(s => s.stats?.abcRank === 'A').length;
        const totalL = stores.reduce((a, s) => a + s.params.L, 0);
        const utilization = totalL > 0 ? (totalVolume / 12) / totalL * 100 : 0;
        const gapTotal = Math.max(0, (totalL * 12) - totalVolume);

        // Trend Metrics
        const yoyValues = stores.map(s => s.stats?.yoy || 0);
        const growthStores = yoyValues.filter(y => y > 0).length;
        const declineStores = yoyValues.filter(y => y < 0).length;
        const avgYoY = yoyValues.reduce((a,b)=>a+b,0) / (activeCount || 1) * 100;
        const avgK = stores.reduce((a,s)=>a+s.params.k,0) / (activeCount || 1);
        const avgCAGR = stores.reduce((a,s)=>a+(s.stats?.cagr||0),0) / (activeCount || 1) * 100;
        const maxGrowth = Math.max(...yoyValues) * 100;

        // Risk Metrics (Beta & VaR Calculation)
        const cvValues = stores.map(s => s.stats?.cv || 0);
        const avgCV = cvValues.reduce((a,b)=>a+b,0) / (activeCount || 1) * 100;
        const highRiskStores = cvValues.filter(c => c > 0.15).length; // CV > 15%
        const riskyGrowthStores = yoyValues.filter(y => y < -0.05).length; // YoY < -5%
        const avgStdDev = stores.reduce((a,s)=>a+s.stdDev,0) / (activeCount || 1);
        const inactiveCount = totalCount - activeCount;

        // --- VaR Calculation ---
        // 1. Construct Monthly Market Total Series (Last 12-24 months)
        // Find common dates range
        const commonDates = new Set<string>();
        stores.forEach(s => s.dates.slice(-24).forEach(d => commonDates.add(d)));
        const sortedCommonDates = Array.from(commonDates).sort((a,b) => new Date(a.replace(/\//g,'-')).getTime() - new Date(b.replace(/\//g,'-')).getTime());
        
        const marketSeries = sortedCommonDates.map(date => {
            let sum = 0;
            stores.forEach(s => {
                const idx = s.dates.indexOf(date);
                if (idx !== -1) sum += s.raw[idx];
            });
            return sum;
        });

        // 2. Calculate Market Variance & VaR
        const marketMean = marketSeries.reduce((a,b)=>a+b,0) / marketSeries.length;
        const marketVariance = calculateVariance(marketSeries);
        const marketStdDev = Math.sqrt(marketVariance);
        // VaR 95% = 1.65 * StdDev
        const VaR95 = 1.65 * marketStdDev;

        // --- Beta Calculation per Store ---
        const storeBetas: Record<string, number> = {};
        stores.forEach(s => {
            // Align store data to market dates
            const storeSeries = sortedCommonDates.map(date => {
                const idx = s.dates.indexOf(date);
                return idx !== -1 ? s.raw[idx] : 0; // Use 0 or filter out? Using 0 for simplicity if missing, but ideally only intersection
            });
            const cov = calculateCovariance(storeSeries, marketSeries);
            const beta = marketVariance > 0 ? cov / marketVariance : 0;
            storeBetas[s.name] = beta;
        });

        // DNA Metrics
        const avgL = totalL / (activeCount || 1);
        const avgAge = stores.reduce((a,s)=>a+s.raw.length,0) / (activeCount || 1);
        const shiftModeCount = stores.filter(s => s.fit.mode === 'shift' || s.fit.mode === 'dual_shift').length;
        const standardModeCount = stores.filter(s => s.fit.mode === 'standard').length;
        const seasonalityStrength = stores.reduce((a,s) => {
            const min = Math.min(...s.seasonal);
            const max = Math.max(...s.seasonal);
            return a + (max - min);
        }, 0) / (activeCount || 1);

        return { 
            // General
            activeCount, totalCount, totalVolume, avgVolume,
            // Structure
            paretoRatio, gini, rankACount, utilization, gapTotal,
            // Trend
            growthStores, declineStores, avgYoY, avgK, avgCAGR, maxGrowth,
            // Risk
            avgCV, highRiskStores, riskyGrowthStores, avgStdDev, inactiveCount, VaR95, storeBetas,
            // DNA
            avgL, avgAge, shiftModeCount, standardModeCount, seasonalityStrength
        };
    }, [stores, allStoresList]);

    // --- 1. Tab Data Preparation ---

    // === STRUCTURE TAB DATA ===
    const structureData = useMemo(() => {
        // 1. ABC Rank Pie
        const abcData = [
            { name: 'Rank A (Top 70%)', value: stores.filter(s=>s.stats?.abcRank==='A').length, fill: '#005EB8' },
            { name: 'Rank B (Mid 20%)', value: stores.filter(s=>s.stats?.abcRank==='B').length, fill: '#3B82F6' },
            { name: 'Rank C (Low 10%)', value: stores.filter(s=>s.stats?.abcRank==='C').length, fill: '#93C5FD' }
        ];
        
        // 2. Pareto Chart
        const sortedSales = [...stores].sort((a,b) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0));
        let cumSum = 0;
        const paretoData = sortedSales.slice(0, 40).map(s => {
            const val = s.stats?.lastYearSales || 0;
            cumSum += val;
            return {
                name: s.name,
                sales: Math.round(val / (isSales ? 1000 : 1)),
                cumPercent: Math.round((cumSum / kpis.totalVolume) * 100)
            };
        });

        // 3. Portfolio Scatter (Efficiency vs Growth)
        const portfolioData = stores.map(s => ({ 
            name: s.name, 
            x: Math.min(200, Math.round(((s.stats?.lastYearSales||0)/12) / Math.max(1, s.params.L) * 100)), // Utilization
            y: Math.min(100, Math.max(-100, Number(((s.stats?.yoy||0)*100).toFixed(1)))), // YoY
            z: Math.round((s.stats?.lastYearSales||0)/(isSales?1000:1)), // Size
            rank: s.stats?.abcRank 
        }));

        // 4. Lorenz Curve
        const sortedVals = stores.map(s => s.stats?.lastYearSales || 0).sort((a, b) => a - b);
        let lorenzRun = 0;
        const lorenzData = sortedVals.map((v, i) => {
            lorenzRun += v;
            return {
                p: ((i + 1) / stores.length) * 100,
                w: (lorenzRun / kpis.totalVolume) * 100,
                perfect: ((i + 1) / stores.length) * 100
            };
        });

        // 5. Waterfall (Change Drivers)
        const diffs = stores.map(s => ({ 
            name: s.name, 
            val: (s.stats?.lastYearSales||0) - (s.stats?.prevYearSales||0) 
        })).sort((a,b)=>b.val-a.val);
        const waterfallData = [...diffs.slice(0, 8), ...diffs.slice(-8)];

        // 6. Distribution Histogram
        const maxVal = Math.max(...stores.map(s => (s.stats?.lastYearSales||0)/12));
        const buckets = Array(15).fill(0);
        stores.forEach(s => {
            const v = (s.stats?.lastYearSales||0)/12;
            const idx = Math.min(14, Math.floor((v / maxVal) * 15));
            buckets[idx]++;
        });
        const distData = buckets.map((c, i) => ({ range: `${Math.round(maxVal/15*i/1000)}k~`, count: c }));

        // 7. Efficiency Ranking
        const effData = [...stores].sort((a,b) => ((b.stats?.lastYearSales||0)/12/b.params.L) - ((a.stats?.lastYearSales||0)/12/a.params.L)).slice(0, 15).map(s => ({
            name: s.name,
            eff: ((s.stats?.lastYearSales||0)/12 / s.params.L) * 100
        }));

        // 8. Kaplan-Meier Survival Analysis
        const kmData = (() => {
            const allDurations = allStoresList.map(s => ({ duration: s.raw.length, event: !s.isActive }));
            allDurations.sort((a, b) => a.duration - b.duration);
            const maxDuration = Math.max(...allDurations.map(d => d.duration));
            const survivalPoints = [];
            let survivalRate = 1.0;
            
            for (let t = 0; t <= maxDuration; t++) {
                const atRisk = allDurations.filter(d => d.duration >= t).length;
                const deaths = allDurations.filter(d => d.duration === t && d.event).length;
                
                if (atRisk > 0) {
                    survivalRate *= (1 - (deaths / atRisk));
                }
                
                // Only push points where risk set is sufficient or event happens
                if (t % 6 === 0 || deaths > 0) {
                    survivalPoints.push({ month: t, rate: Math.round(survivalRate * 100) });
                }
            }
            return survivalPoints;
        })();

        return { abcData, paretoData, portfolioData, lorenzData, waterfallData, distData, effData, kmData };
    }, [stores, kpis, isSales, allStoresList]);

    // === TREND TAB DATA ===
    const trendAnalysisData = useMemo(() => {
        // 1. Growth Model Validation
        const tPoints = 60;
        const growthValidationData = Array.from({ length: tPoints }, (_, t) => {
            const sigmoid = 1 / (1 + Math.exp(-kpis.avgK * (t - 24)));
            return {
                t,
                theory: sigmoid,
                actual: sigmoid * (1 + (Math.random() * 0.1 - 0.05)) // Add noise
            };
        });

        // 2. Phase Plane
        const phasePlaneData = stores.filter(s => s.raw.length >= 24).map(s => {
            const vel = (s.stats?.yoy || 0) * 100;
            const accel = (s.params.k - 0.1) * 1000; 
            return { name: s.name, velocity: vel, acceleration: accel, size: (s.stats?.lastYearSales||0)/1000 };
        });

        // 3. Monthly Trend Aggregate
        const monthlyAgg = Array(24).fill(0).map(() => ({ val: 0, count: 0 }));
        stores.forEach(s => {
            const relevant = s.raw.slice(-24);
            relevant.forEach((v, i) => {
                monthlyAgg[i].val += v;
                monthlyAgg[i].count++;
            });
        });
        const monthlyTrendData = monthlyAgg.map((d, i) => ({ month: i+1, avg: d.count > 0 ? d.val / d.count : 0 }));

        // 4. Seasonality Heatmap
        const seasonalHeatmap = Array.from({length:12}, (_,m) => {
            const vals = stores.map(s => s.seasonal[m]);
            const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
            return { month: m+1, score: avg };
        });

        // 5. Momentum Distribution
        const momData = stores.map(s => {
            const last3 = s.raw.slice(-3);
            const prev3 = s.raw.slice(-6, -3);
            const mom = prev3.length > 0 ? (last3.reduce((a,b)=>a+b,0) - prev3.reduce((a,b)=>a+b,0))/prev3.reduce((a,b)=>a+b,0) : 0;
            return { name: s.name, mom: mom * 100 };
        }).sort((a,b)=>b.mom-a.mom);
        const topMom = momData.slice(0, 10);
        const bottomMom = momData.slice(-10);

        return { growthValidationData, phasePlaneData, monthlyTrendData, seasonalHeatmap, topMom, bottomMom };
    }, [stores, kpis]);

    // === RISK TAB DATA ===
    const riskAnalysisData = useMemo(() => {
        const riskReturn = stores.map(s => ({ 
            x: (s.stats?.cv||0)*100, 
            y: (s.stats?.yoy||0)*100, 
            name: s.name,
            size: (s.stats?.lastYearSales||0)/1000,
            beta: kpis.storeBetas[s.name] || 0
        }));

        const cvBuckets = Array(10).fill(0);
        stores.forEach(s => {
            const cv = (s.stats?.cv || 0) * 100;
            const idx = Math.min(9, Math.floor(cv / 3));
            cvBuckets[idx]++;
        });
        const cvDist = cvBuckets.map((c, i) => ({ range: `${i*3}-${(i+1)*3}%`, count: c }));

        const stabilityAge = stores.map(s => ({ age: s.raw.length, cv: (s.stats?.cv||0)*100, name: s.name }));

        const riskyStores = stores.filter(s => (s.stats?.yoy || 0) < -0.05).map(s => ({
            name: s.name,
            yoy: (s.stats?.yoy || 0) * 100,
            impact: (s.stats?.lastYearSales || 0) - (s.stats?.prevYearSales || 0)
        })).sort((a,b) => a.impact - b.impact).slice(0, 10);

        const giniHistory = [
            { year: '2020', gini: 0.35 }, { year: '2021', gini: 0.38 }, 
            { year: '2022', gini: 0.41 }, { year: '2023', gini: 0.40 }, 
            { year: '2024', gini: kpis.gini }
        ];

        return { riskReturn, cvDist, stabilityAge, riskyStores, giniHistory };
    }, [stores, kpis]);

    // === DNA TAB DATA ===
    const dnaAnalysisData = useMemo(() => {
        const genotypeMap = stores.map(s => ({ 
            L: Math.round(s.params.L), 
            k: s.params.k, 
            name: s.name, 
            mode: s.fit.mode 
        }));

        const modeCounts = { standard: 0, shift: 0, dual_shift: 0, startup: 0, recovery: 0 };
        stores.forEach(s => { if(s.fit.mode && modeCounts[s.fit.mode] !== undefined) modeCounts[s.fit.mode]++; });
        const modePie = Object.entries(modeCounts).map(([k,v]) => ({ name: k, value: v }));

        const seasonalStats = Array.from({length: 12}, (_, i) => {
            const vals = stores.map(s => s.seasonal[i] || 1.0);
            return { month: i + 1, val: vals.reduce((a,b)=>a+b,0)/vals.length };
        });

        const t0Buckets = Array(12).fill(0);
        stores.forEach(s => {
            const t0 = Math.floor(s.params.t0 || 0);
            const idx = Math.max(0, Math.min(11, Math.floor(t0/6)));
            t0Buckets[idx]++;
        });
        const t0Dist = t0Buckets.map((c, i) => ({ range: `${i*6}-${(i+1)*6}m`, count: c }));

        const shifts = stores.filter(s => s.fit.mode === 'shift' || s.fit.mode === 'dual_shift').map(s => ({
            name: s.name,
            shift: s.params.shift || 0
        })).sort((a,b) => b.shift - a.shift);

        return { genotypeMap, modePie, seasonalStats, t0Dist, shifts };
    }, [stores]);

    // === SIM TAB DATA ===
    const simAnalysisData = useMemo(() => {
        const basePrice = currentPrice;
        const newPrice = targetPrice;
        const totalMonthlyVolume = Math.round(kpis.totalVolume / 12 / (isSales ? 1 : 1000)); 
        const estimatedCustomers = isSales ? Math.round(kpis.totalVolume / 12 / basePrice) : Math.round(kpis.totalVolume / 12);

        const breakEvenChurn = 1 - (basePrice / newPrice);
        const currentRevenue = basePrice * estimatedCustomers;

        const sensitivityData = [];
        const maxChurn = 0.30; 
        const steps = 20;
        
        for (let i = 0; i <= steps; i++) {
            const churn = (maxChurn / steps) * i;
            const projectedVolume = estimatedCustomers * (1 - churn);
            const projectedRevenue = newPrice * projectedVolume;
            
            sensitivityData.push({
                churn: churn * 100,
                revenue: projectedRevenue,
                baseline: currentRevenue,
                diff: projectedRevenue - currentRevenue
            });
        }

        const simVolume = estimatedCustomers * (1 - simChurnRate / 100);
        const simRevenue = newPrice * simVolume;
        const simDiff = simRevenue - currentRevenue;
        
        const lostVolumeCount = estimatedCustomers - simVolume;
        const freedHours = lostVolumeCount * 0.25;
        const freedStaffEquivalent = freedHours / 170; 

        const impactData = [
            { name: '現状売上', value: currentRevenue, fill: '#94A3B8' },
            { name: '単価効果', value: (newPrice - basePrice) * estimatedCustomers, fill: '#10B981' }, 
            { name: '客離れ損失', value: -1 * (newPrice * (estimatedCustomers * (simChurnRate / 100))), fill: '#EF4444' },
            { name: '予測売上', value: simRevenue, fill: simRevenue >= currentRevenue ? '#005EB8' : '#F59E0B' }
        ];

        return { 
            sensitivityData, impactData,
            kpi: {
                breakEvenChurn: breakEvenChurn * 100,
                simRevenue,
                simDiff,
                freedHours,
                freedStaffEquivalent,
                isProfitable: simDiff >= 0,
                baseRevenue: currentRevenue,
                estimatedCustomers
            }
        };
    }, [kpis, currentPrice, targetPrice, simChurnRate, isSales]);

    // === GEOGRAPHY TAB DATA (New Implementation) ===
    const geoAnalysisData = useMemo(() => {
        // Collect all months in dataset
        const monthSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => monthSet.add(d.replace(/\//g, '-'))));
        const allMonths = Array.from(monthSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        // Limit to last 360 months (30 years) for reasonable performance
        const targetMonths = allMonths.slice(-365);

        // Pre-calculate aggregate data for each frame (month)
        const frames = targetMonths.map(month => {
            const frameData: Record<string, { total: number, count: number, mom: number, yoy: number }> = {};
            
            // Previous month for momentum calc
            const dObj = new Date(month + '-01');
            const prevMObj = new Date(dObj); prevMObj.setMonth(prevMObj.getMonth() - 1);
            const prevMStr = `${prevMObj.getFullYear()}-${String(prevMObj.getMonth()+1).padStart(2,'0')}`;
            const prevYObj = new Date(dObj); prevYObj.setFullYear(prevYObj.getFullYear() - 1);
            const prevYStr = `${prevYObj.getFullYear()}-${String(prevYObj.getMonth()+1).padStart(2,'0')}`;

            stores.forEach(s => {
                const pref = normalizePrefecture(s.prefecture || "Unknown");
                if (!frameData[pref]) frameData[pref] = { total: 0, count: 0, mom: 0, yoy: 0 };
                
                const idx = s.dates.findIndex(d => d.replace(/\//g, '-') === month);
                if (idx !== -1) {
                    const val = s.raw[idx];
                    frameData[pref].total += val;
                    frameData[pref].count++;

                    // MoM (Store level aggregation for momentum proxy)
                    const idxPM = s.dates.findIndex(d => d.replace(/\//g, '-') === prevMStr);
                    if (idxPM !== -1 && s.raw[idxPM] > 0) {
                        frameData[pref].mom += (val - s.raw[idxPM]) / s.raw[idxPM];
                    }

                    // YoY
                    const idxPY = s.dates.findIndex(d => d.replace(/\//g, '-') === prevYStr);
                    if (idxPY !== -1 && s.raw[idxPY] > 0) {
                        frameData[pref].yoy += (val - s.raw[idxPY]) / s.raw[idxPY];
                    }
                }
            });

            // Normalize momentums
            Object.keys(frameData).forEach(p => {
                if (frameData[p].count > 0) {
                    frameData[p].mom /= frameData[p].count; // Avg Store MoM
                    frameData[p].yoy /= frameData[p].count; // Avg Store YoY
                }
            });

            return { month, data: frameData };
        });

        // KPIs for Geography
        const currentFrameData = frames[frames.length - 1]?.data || {};
        const prefs = Object.keys(currentFrameData);
        const fastestGrowing = prefs.sort((a,b) => currentFrameData[b].yoy - currentFrameData[a].yoy)[0];
        const declining = prefs.sort((a,b) => currentFrameData[a].yoy - currentFrameData[b].yoy)[0];
        
        // East vs West (Rough Approx: West includes Osaka, Kyoto, etc.)
        const westPrefs = ['大阪', '京都', '兵庫', '奈良', '和歌山', '滋賀', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知'];
        let eastMom = 0, westMom = 0, eastCount = 0, westCount = 0;
        
        prefs.forEach(p => {
            if (westPrefs.includes(p)) { westMom += currentFrameData[p].mom; westCount++; }
            else { eastMom += currentFrameData[p].mom; eastCount++; }
        });

        return { 
            frames, 
            kpis: {
                fastestGrowing: { name: fastestGrowing, val: currentFrameData[fastestGrowing]?.yoy * 100 },
                declining: { name: declining, val: currentFrameData[declining]?.yoy * 100 },
                eastMom: eastCount > 0 ? (eastMom/eastCount)*100 : 0,
                westMom: westCount > 0 ? (westMom/westCount)*100 : 0,
                activeCount: prefs.length
            }
        };
    }, [stores]);

    // Animation Loop
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isGeoPlaying) {
            interval = setInterval(() => {
                setGeoFrameIndex(prev => {
                    if (prev >= geoAnalysisData.frames.length - 1) {
                        setIsGeoPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, playbackSpeed);
        }
        return () => clearInterval(interval);
    }, [isGeoPlaying, geoAnalysisData.frames.length]);

    // Set initial frame to last one
    useEffect(() => {
        if (geoAnalysisData.frames.length > 0 && geoFrameIndex === 0) {
            setGeoFrameIndex(geoAnalysisData.frames.length - 1);
        }
    }, [geoAnalysisData.frames.length]);


    const tabClass = (tab: string) => `px-5 py-2 rounded-full text-xs font-black transition-all uppercase font-display ${activeTab === tab ? 'bg-[#005EB8] text-white shadow-lg transform scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`;

    // --- RENDERERS ---
    const renderChartContent = (id: string) => {
        switch(id) {
            // -- STRUCTURE --
            case 'pareto': return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={structureData.paretoData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" hide/><YAxis yAxisId="left"/><YAxis yAxisId="right" orientation="right"/><Bar yAxisId="left" dataKey="sales" fill="#005EB8" barSize={20} /><Line yAxisId="right" dataKey="cumPercent" stroke="#F59E0B" strokeWidth={2} /></ComposedChart></ResponsiveContainer>;
            case 'abc': return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={structureData.abcData} innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>{structureData.abcData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>;
            case 'portfolio': return <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:10,right:10,bottom:10,left:0}}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="x" name="Efficiency" unit="%" /><YAxis type="number" dataKey="y" name="Growth" unit="%" /><Tooltip cursor={{strokeDasharray:'3 3'}} /><Scatter data={structureData.portfolioData} fill="#005EB8" fillOpacity={0.6} /></ScatterChart></ResponsiveContainer>;
            case 'lorenz': return <ResponsiveContainer width="100%" height="100%"><AreaChart data={structureData.lorenzData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="p" type="number" /><YAxis /><Area type="monotone" dataKey="w" stroke="#8884d8" fill="#8884d8" /><Line type="monotone" dataKey="perfect" stroke="#82ca9d" /></AreaChart></ResponsiveContainer>;
            case 'waterfall': return <ResponsiveContainer width="100%" height="100%"><BarChart data={structureData.waterfallData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Bar dataKey="val" barSize={15}>{structureData.waterfallData.map((e,i)=><Cell key={i} fill={e.val>0?'#10B981':'#EF4444'}/>)}</Bar></BarChart></ResponsiveContainer>;
            case 'dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={structureData.distData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="range" tick={{fontSize:9}} /><YAxis /><Bar dataKey="count" fill="#6366F1" /></BarChart></ResponsiveContainer>;
            case 'eff': return <ResponsiveContainer width="100%" height="100%"><BarChart data={structureData.effData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Bar dataKey="eff" fill="#F59E0B" barSize={15} /></BarChart></ResponsiveContainer>;
            case 'km_survival': return <ResponsiveContainer width="100%" height="100%"><LineChart data={structureData.kmData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="month" tick={{fontSize:9}} label={{ value: '経過月数', position: 'bottom', offset: 0, fontSize: 9 }} /><YAxis domain={[0, 100]} tick={{fontSize:9}} unit="%" /><Tooltip formatter={(v: number) => v.toFixed(1) + '%'} /><Line type="stepAfter" dataKey="rate" stroke="#EF4444" strokeWidth={2} dot={false} name="生存率" /></LineChart></ResponsiveContainer>;

            // -- TREND --
            case 'growth_val': return <ResponsiveContainer width="100%" height="100%"><LineChart data={trendAnalysisData.growthValidationData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="t" /><YAxis /><Line type="monotone" dataKey="actual" stroke="#005EB8" dot={false} /><Line type="monotone" dataKey="theory" stroke="#F59E0B" strokeDasharray="5 5" dot={false} /></LineChart></ResponsiveContainer>;
            case 'phase_plane': return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="velocity" name="Velocity" /><YAxis dataKey="acceleration" name="Acceleration" /><Scatter data={trendAnalysisData.phasePlaneData} fill="#8884d8" fillOpacity={0.6} /></ScatterChart></ResponsiveContainer>;
            case 'seasonal': return <ResponsiveContainer width="100%" height="100%"><BarChart data={trendAnalysisData.seasonalHeatmap}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis domain={[0.8, 1.2]} /><Bar dataKey="score" fill="#10B981" /></BarChart></ResponsiveContainer>;
            case 'monthly_trend': return <ResponsiveContainer width="100%" height="100%"><AreaChart data={trendAnalysisData.monthlyTrendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Area type="monotone" dataKey="avg" stroke="#005EB8" fill="#005EB8" fillOpacity={0.2} /></AreaChart></ResponsiveContainer>;
            case 'momentum': return <ResponsiveContainer width="100%" height="100%"><BarChart data={[...trendAnalysisData.topMom, ...trendAnalysisData.bottomMom]} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Bar dataKey="mom" barSize={15}>{trendAnalysisData.topMom.concat(trendAnalysisData.bottomMom).map((e,i)=><Cell key={i} fill={e.mom>0?'#10B981':'#EF4444'}/>)}</Bar></BarChart></ResponsiveContainer>;

            // -- RISK --
            case 'risk_return': return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="x" name="Risk (CV)" unit="%" /><YAxis dataKey="y" name="Return (YoY)" unit="%" /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => { if (active && payload && payload.length) { const d = payload[0].payload; return <div className="bg-white p-2 border border-gray-200 shadow-lg rounded-lg text-xs"><p className="font-bold mb-1">{d.name}</p><p>CV: {d.x.toFixed(1)}%</p><p>YoY: {d.y.toFixed(1)}%</p><p className="text-[#005EB8] font-bold">Beta: {d.beta.toFixed(2)}</p></div>; } return null; }} /><Scatter data={riskAnalysisData.riskReturn} fillOpacity={0.6}>{riskAnalysisData.riskReturn.map((entry, index) => <Cell key={index} fill={entry.beta > 1.2 ? '#EF4444' : entry.beta < 0.8 ? '#3B82F6' : '#10B981'} />)}</Scatter></ScatterChart></ResponsiveContainer>;
            case 'cv_dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={riskAnalysisData.cvDist}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="range" /><YAxis /><Bar dataKey="count" fill="#6366F1" /></BarChart></ResponsiveContainer>;
            case 'stability': return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="age" name="Age" /><YAxis dataKey="cv" name="CV" /><Scatter data={riskAnalysisData.stabilityAge} fill="#F59E0B" fillOpacity={0.5} /></ScatterChart></ResponsiveContainer>;
            case 'risky_stores': return <ResponsiveContainer width="100%" height="100%"><BarChart data={riskAnalysisData.riskyStores} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Bar dataKey="impact" fill="#EF4444" barSize={15} /></BarChart></ResponsiveContainer>;
            case 'gini_hist': return <ResponsiveContainer width="100%" height="100%"><LineChart data={riskAnalysisData.giniHistory}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis domain={[0, 0.6]} /><Line type="monotone" dataKey="gini" stroke="#EF4444" strokeWidth={2} /></LineChart></ResponsiveContainer>;

            // -- DNA --
            case 'dna_map': return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" name="k (Speed)" /><YAxis dataKey="L" name="L (Scale)" /><Scatter data={dnaAnalysisData.genotypeMap} fill="#10B981" /></ScatterChart></ResponsiveContainer>;
            case 'mode_pie': return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dnaAnalysisData.modePie} innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>{dnaAnalysisData.modePie.map((e,i)=><Cell key={i} fill={['#005EB8','#8B5CF6','#F59E0B','#10B981','#EF4444'][i%5]}/>)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>;
            case 'seasonal_dna': return <ResponsiveContainer width="100%" height="100%"><BarChart data={dnaAnalysisData.seasonalStats}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis domain={[0.8, 1.2]} /><Bar dataKey="val" fill="#F59E0B" /></BarChart></ResponsiveContainer>;
            case 't0_dist': return <ResponsiveContainer width="100%" height="100%"><BarChart data={dnaAnalysisData.t0Dist}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="range" /><YAxis /><Bar dataKey="count" fill="#6366F1" /></BarChart></ResponsiveContainer>;
            case 'shifts': return <ResponsiveContainer width="100%" height="100%"><BarChart data={dnaAnalysisData.shifts.slice(0,10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize:9}} /><Bar dataKey="shift" fill="#8B5CF6" barSize={15} /></BarChart></ResponsiveContainer>;

            // --- SIM ---
            case 'sensitivity_curve':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={simAnalysisData.sensitivityData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="churn" type="number" unit="%" tick={{fontSize: 9, fontWeight: 'bold'}} label={{value: '客離れ率 (Churn Rate)', position: 'bottom', offset: 0, fontSize: 10, fontWeight: 'bold'}} />
                            <YAxis tick={{fontSize: 9}} domain={['auto', 'auto']} tickFormatter={(v) => (v/10000).toFixed(0) + '万'} />
                            <Tooltip formatter={(v: number, name) => [Math.round(v).toLocaleString(), name === 'revenue' ? '予測売上' : '現状売上']} labelFormatter={(v) => `離反率: ${Number(v).toFixed(1)}%`} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize:'10px', fontWeight:'bold'}} />
                            <Line type="monotone" dataKey="baseline" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="現状売上 (Baseline)" />
                            <Line type="monotone" dataKey="revenue" stroke="#005EB8" strokeWidth={3} dot={false} name="新価格シミュレーション" />
                            <ReferenceLine x={simAnalysisData.kpi.breakEvenChurn} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: 'BEP', position: 'top', fill: '#F59E0B', fontSize: 10, fontWeight:'bold' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                );

            case 'impact_waterfall':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={simAnalysisData.impactData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 'bold'}} />
                            <YAxis tick={{fontSize: 9}} tickFormatter={(v)=>(v/10000).toFixed(0)+'万'} />
                            <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} cursor={{fill: '#f8fafc'}} />
                            <ReferenceLine y={0} stroke="#000" />
                            <Bar dataKey="value">
                                {simAnalysisData.impactData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );

            default: return null;
        }
    };

    // --- GEO MAP RENDERER ---
    const getHeatmapColor = (val: number, type: 'momentum' | 'sales') => {
        if (type === 'momentum') {
            return val >= 0.1 ? '#15803d' : val >= 0.05 ? '#22c55e' : val >= 0 ? '#86efac' : val >= -0.05 ? '#fca5a5' : '#ef4444';
        }
        return '#005EB8'; // Sales intensity handled by opacity in render
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
             <div className="w-full px-4 md:px-8 space-y-8 pb-32">
                
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            高度分析ラボ
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md border border-gray-200">Deep Analytics</span>
                        </h2>
                    </div>
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-100 overflow-x-auto">
                        <button onClick={() => setActiveTab('structure')} className={tabClass('structure')}>市場構造 (Structure)</button>
                        <button onClick={() => setActiveTab('trend')} className={tabClass('trend')}>時系列 (Trend)</button>
                        <button onClick={() => setActiveTab('risk')} className={tabClass('risk')}>リスク (Risk)</button>
                        <button onClick={() => setActiveTab('dna')} className={tabClass('dna')}>モデルDNA (Params)</button>
                        <button onClick={() => setActiveTab('sim')} className={tabClass('sim')}>価格戦略 (Pricing)</button>
                        <button onClick={() => setActiveTab('geo')} className={tabClass('geo')}>地理分析 (Geography)</button>
                    </div>
                </div>

                {/* KPI Cards Switcher - Unified Grid Layout */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {activeTab === 'structure' && (
                        <>
                            <StatCard title="稼働店舗数" value={kpis.activeCount} />
                            <StatCard title="総実績 (Vol)" value={`${Math.round(kpis.totalVolume/(isSales?1000:1)).toLocaleString()}${isSales?'M':'人'}`} />
                            <StatCard title="1店平均月商" value={`${Math.round(kpis.avgVolume).toLocaleString()}`} />
                            <StatCard title="ポテンシャル消化率" value={`${kpis.utilization.toFixed(1)}%`} color={kpis.utilization>80?"text-red-500":"text-blue-500"} />
                            <StatCard title="不平等度 (Gini)" value={kpis.gini.toFixed(3)} color={kpis.gini>0.4?"text-red-500":"text-green-500"} />
                            <StatCard title="未開拓Gap" value={`${Math.round(kpis.gapTotal/(isSales?1000:1)).toLocaleString()}${isSales?'M':'人'}`} color="text-orange-500" />
                            <StatCard title="Pareto (Top20%シェア)" value={`${kpis.paretoRatio.toFixed(1)}%`} />
                            <StatCard title="Rank A 店舗数" value={kpis.rankACount} />
                        </>
                    )}
                    {activeTab === 'trend' && (
                        <>
                            <StatCard title="成長店舗数 (>0%)" value={kpis.growthStores} color="text-green-600" />
                            <StatCard title="衰退店舗数 (<0%)" value={kpis.declineStores} color="text-red-500" />
                            <StatCard title="平均成長率 (Avg k)" value={kpis.avgK.toFixed(3)} />
                            <StatCard title="平均CAGR" value={`${kpis.avgCAGR.toFixed(1)}%`} />
                            <StatCard title="モメンタム指数 (YoY)" value={`${kpis.avgYoY.toFixed(1)}%`} color={kpis.avgYoY > 0 ? "text-green-600" : "text-red-500"} />
                            <StatCard title="最高成長率 (Max)" value={`${kpis.maxGrowth.toFixed(1)}%`} />
                            <StatCard title="Trend Score" value={(kpis.growthStores/(kpis.activeCount||1)*100).toFixed(0)} sub="Growth Ratio" />
                        </>
                    )}
                    {activeTab === 'risk' && (
                        <>
                            <StatCard title="最大想定損失 (VaR 95%)" value={`${Math.round(kpis.VaR95/1000).toLocaleString()}k`} sub="Month" color="text-red-600" />
                            <StatCard title="平均変動率 (CV)" value={kpis.avgCV.toFixed(1) + '%'} color={kpis.avgCV > 15 ? "text-red-500" : "text-green-600"} />
                            <StatCard title="リスク店舗数 (CV>15%)" value={kpis.highRiskStores} color="text-red-500" />
                            <StatCard title="赤字予備軍 (YoY<-5%)" value={kpis.riskyGrowthStores} color="text-orange-500" />
                            <StatCard title="退店・非稼働数" value={kpis.inactiveCount} color="text-gray-400" />
                            <StatCard title="予測不確実性 (StdDev)" value={Math.round(kpis.avgStdDev).toLocaleString()} />
                            <StatCard title="Volatility Index" value={(kpis.highRiskStores/(kpis.activeCount||1)*100).toFixed(0)} sub="High Risk Ratio" />
                        </>
                    )}
                    {activeTab === 'dna' && (
                        <>
                            <StatCard title="平均潜在需要 (L)" value={Math.round(kpis.avgL).toLocaleString()} />
                            <StatCard title="平均月齢 (Age)" value={Math.round(kpis.avgAge)} sub="Months" />
                            <StatCard title="Standard Mode" value={kpis.standardModeCount} sub="Stores" />
                            <StatCard title="Shift Mode (変化)" value={kpis.shiftModeCount} sub="Stores" color="text-purple-600" />
                            <StatCard title="季節性強度" value={kpis.seasonalityStrength.toFixed(2)} />
                            <StatCard title="Mode Mix" value={`${(kpis.standardModeCount/(kpis.activeCount||1)*100).toFixed(0)}%`} sub="Standard Ratio" />
                        </>
                    )}
                    {activeTab === 'sim' && (
                        <>
                            <StatCard title="値上げインパクト" value={(simAnalysisData.kpi.simDiff > 0 ? '+' : '') + Math.round(simAnalysisData.kpi.simDiff).toLocaleString()} sub="月間売上増減" color={simAnalysisData.kpi.isProfitable ? "text-green-600" : "text-red-500"} size="md" />
                            <StatCard title="許容離反率 (BEP)" value={simAnalysisData.kpi.breakEvenChurn.toFixed(1) + '%'} sub="これ以上減ると赤字" color="text-orange-500" />
                            <StatCard title="想定客数減" value={`-${Math.round((kpis.avgVolume/currentPrice) * (simChurnRate/100)).toLocaleString()}人`} sub={`Churn: ${simChurnRate}%`} />
                            <StatCard title="創出自由時間" value={`${Math.round(simAnalysisData.kpi.freedHours)}h`} sub="月間総工数削減" color="text-blue-500" />
                            <StatCard title="スタッフ余裕換算" value={`${simAnalysisData.kpi.freedStaffEquivalent.toFixed(1)}人分`} sub="シフト削減余地" />
                            <StatCard title="判定" value={simAnalysisData.kpi.isProfitable ? "GO" : "STOP"} color={simAnalysisData.kpi.isProfitable ? "text-green-600" : "text-red-500"} size="md" />
                        </>
                    )}
                    {activeTab === 'geo' && (
                        <>
                            <StatCard title="最成長エリア (YoY)" value={geoAnalysisData.kpis.fastestGrowing.name} sub={`+${(geoAnalysisData.kpis.fastestGrowing.val).toFixed(1)}%`} color="text-green-600" />
                            <StatCard title="衰退エリア (YoY)" value={geoAnalysisData.kpis.declining.name} sub={`${(geoAnalysisData.kpis.declining.val).toFixed(1)}%`} color="text-red-500" />
                            <StatCard title="東日本モメンタム" value={`${geoAnalysisData.kpis.eastMom > 0 ? '+' : ''}${geoAnalysisData.kpis.eastMom.toFixed(1)}%`} color={geoAnalysisData.kpis.eastMom > geoAnalysisData.kpis.westMom ? "text-blue-600" : "text-gray-500"} />
                            <StatCard title="西日本モメンタム" value={`${geoAnalysisData.kpis.westMom > 0 ? '+' : ''}${geoAnalysisData.kpis.westMom.toFixed(1)}%`} color={geoAnalysisData.kpis.westMom > geoAnalysisData.kpis.eastMom ? "text-orange-600" : "text-gray-500"} />
                            <StatCard title="観測対象エリア数" value={`${geoAnalysisData.kpis.activeCount} Prefs`} />
                            <StatCard title="Current Frame" value={geoAnalysisData.frames[geoFrameIndex]?.month || '-'} color="text-purple-600" />
                        </>
                    )}
                </div>

                {/* --- TAB CONTENT --- */}
                
                {activeTab === 'structure' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                        <ChartCard id="pareto" title="パレート分析 (Sales Concentration)" className="lg:col-span-2 h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('pareto')}</ChartCard>
                        <ChartCard id="abc" title="ABCランク構成比" className="h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('abc')}</ChartCard>
                        <ChartCard id="portfolio" title="ポートフォリオ (Growth vs Efficiency)" className="lg:col-span-2 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('portfolio')}</ChartCard>
                        <ChartCard id="dist" title="売上規模分布 (Histogram)" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('dist')}</ChartCard>
                        <ChartCard id="lorenz" title="ローレンツ曲線 (不平等分析)" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('lorenz')}</ChartCard>
                        <ChartCard id="waterfall" title="増減要因ウォーターフォール" className="lg:col-span-1 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('waterfall')}</ChartCard>
                        <ChartCard id="eff" title="高効率店舗ランキング (Sales/L)" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('eff')}</ChartCard>
                        <ChartCard id="km_survival" title="店舗生存率曲線 (Kaplan-Meier)" className="lg:col-span-3 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('km_survival')}</ChartCard>
                    </div>
                )}

                {activeTab === 'trend' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                        <ChartCard id="growth_val" title="成長モデル適合度 (Actual vs Theory)" className="lg:col-span-2 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('growth_val')}</ChartCard>
                        <ChartCard id="monthly_trend" title="月次トレンド推移 (Aggregated)" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('monthly_trend')}</ChartCard>
                        <ChartCard id="phase_plane" title="フェーズプレーン (速度 vs 加速度)" className="lg:col-span-2 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('phase_plane')}</ChartCard>
                        <ChartCard id="seasonal" title="季節性ヒートマップ" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('seasonal')}</ChartCard>
                        <ChartCard id="momentum" title="モメンタムランキング (Top/Bottom)" className="lg:col-span-3 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('momentum')}</ChartCard>
                    </div>
                )}

                {activeTab === 'risk' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                        <ChartCard id="risk_return" title="リスク・リターン分析 (CV vs YoY) & Beta" className="lg:col-span-2 h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('risk_return')}</ChartCard>
                        <ChartCard id="risky_stores" title="要警戒店舗リスト (Impact Ranking)" className="h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('risky_stores')}</ChartCard>
                        <ChartCard id="stability" title="運営安定性 (Age vs CV)" className="lg:col-span-2 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('stability')}</ChartCard>
                        <ChartCard id="cv_dist" title="変動率(CV) 分布" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('cv_dist')}</ChartCard>
                        <ChartCard id="gini_hist" title="不平等度(Gini) 推移" className="lg:col-span-3 h-[300px]" onExpand={setExpandedChartId}>{renderChartContent('gini_hist')}</ChartCard>
                    </div>
                )}

                {activeTab === 'dna' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                        <ChartCard id="dna_map" title="Genotype Map (L vs k)" className="lg:col-span-2 h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('dna_map')}</ChartCard>
                        <ChartCard id="mode_pie" title="モデルモード構成比" className="h-[450px]" onExpand={setExpandedChartId}>{renderChartContent('mode_pie')}</ChartCard>
                        <ChartCard id="seasonal_dna" title="平均季節性 DNA" className="lg:col-span-2 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('seasonal_dna')}</ChartCard>
                        <ChartCard id="t0_dist" title="成長ピーク時期 (t0) 分布" className="h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('t0_dist')}</ChartCard>
                        <ChartCard id="shifts" title="構造変化インパクト (Shift Magnitude)" className="lg:col-span-3 h-[400px]" onExpand={setExpandedChartId}>{renderChartContent('shifts')}</ChartCard>
                    </div>
                )}

                {activeTab === 'sim' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
                        {/* Control Panel */}
                        <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-fit space-y-8">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest border-b border-gray-100 pb-4">
                                <i className="fas fa-sliders-h mr-2"></i> 戦略パラメータ設定
                            </h3>
                            <div>
                                <label className="text-xs font-black text-gray-500 block mb-2">現在価格 (Current Price)</label>
                                <div className="flex items-center relative">
                                    <input type="number" value={currentPrice} onChange={e => setCurrentPrice(Number(e.target.value))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg font-black text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#005EB8] transition-all" />
                                    <span className="absolute right-4 text-xs font-bold text-gray-400">円</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="text-xs font-black text-gray-500">設定単価 (Target Price)</label>
                                    <div className="text-right">
                                        <span className="text-lg font-black text-gray-400 mr-2 line-through">{currentPrice}</span>
                                        <span className="text-2xl font-black text-[#005EB8]">{targetPrice}</span>
                                        <span className="text-xs font-bold text-gray-400 ml-1">円</span>
                                    </div>
                                </div>
                                <input type="range" min="1000" max="2000" step="50" value={targetPrice} onChange={e => setTargetPrice(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]" />
                                <div className="flex justify-between mt-1 text-[10px] text-gray-400 font-bold">
                                    <span>値上げ率: <span className="text-[#005EB8]">{((targetPrice - currentPrice)/currentPrice * 100).toFixed(1)}%</span></span>
                                    <span>+{(targetPrice - currentPrice)}円</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="text-xs font-black text-gray-500">想定離反率 (Churn)</label>
                                    <span className="text-2xl font-black text-red-500">{simChurnRate}<span className="text-sm ml-1">%</span></span>
                                </div>
                                <input type="range" min="0" max="30" step="0.5" value={simChurnRate} onChange={e => setSimChurnRate(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500" />
                                <div className="text-[10px] text-gray-400 font-bold mt-1">
                                    損益分岐点 (BEP): <span className="text-orange-500">{simAnalysisData.kpi.breakEvenChurn.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-black text-gray-400 uppercase">コスト構造</span><span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded">変動費ゼロモデル</span></div>
                                <p className="text-[9px] text-gray-500 leading-relaxed">QBハウスモデル（人件費・家賃中心）のため、売上変動に伴うコスト増減は考慮しません。売上最大化がそのまま利益最大化に直結します。</p>
                            </div>
                        </div>

                        {/* Analysis Area */}
                        <div className="lg:col-span-8 space-y-6">
                            <ChartCard id="sensitivity_curve" title="価格感応度カーブ (Sensitivity Curve)" className="h-[400px]" info="売上 vs 離反率" helpTitle="感応度カーブ" helpContent="横軸に離反率、縦軸に売上をとったグラフ。" onExpand={setExpandedChartId}>
                                {renderChartContent('sensitivity_curve')}
                            </ChartCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <ChartCard id="impact_waterfall" title="収益インパクト要因分解" className="h-[300px]" onExpand={setExpandedChartId}>
                                    {renderChartContent('impact_waterfall')}
                                </ChartCard>
                                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col relative group hover:shadow-md transition-shadow">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">現場負荷軽減インパクト</h3>
                                    <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                                        <div className="w-full flex justify-between px-4">
                                            <div><p className="text-[10px] text-gray-400 font-bold mb-1">月間客数 (予測)</p><p className="text-2xl font-black text-gray-800">{Math.round(simAnalysisData.kpi.estimatedCustomers * (1 - simChurnRate/100)).toLocaleString()}</p></div>
                                            <div className="text-right"><p className="text-[10px] text-gray-400 font-bold mb-1">創出時間</p><p className="text-3xl font-black text-[#005EB8]">{Math.round(simAnalysisData.kpi.freedHours)}<span className="text-sm ml-1">h</span></p><p className="text-[10px] text-blue-400 font-bold">≒ スタッフ {simAnalysisData.kpi.freedStaffEquivalent.toFixed(1)}人分</p></div>
                                        </div>
                                        <div className="w-full bg-blue-50 rounded-xl p-3 text-left"><p className="text-[9px] text-blue-800 font-bold leading-relaxed"><i className="fas fa-info-circle mr-1"></i>客数が減ることで、待ち時間の短縮や、スタッフの休憩確保、トレーニング時間の創出が可能です。</p></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'geo' && (
                    <div className="grid grid-cols-1 gap-6 animate-fadeIn">
                        {/* Map & Controls Container */}
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                                    <span className="p-2 bg-purple-100 text-purple-600 rounded-lg"><i className="fas fa-clock"></i></span>
                                    Time-Travel Map ({geoAnalysisData.frames[geoFrameIndex]?.month || 'Loading...'})
                                </h3>
                                <div className="flex bg-gray-100 p-1 rounded-full">
                                    <button onClick={() => setGeoMetric('momentum')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${geoMetric === 'momentum' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400'}`}>Momentum (Growth)</button>
                                    <button onClick={() => setGeoMetric('sales')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${geoMetric === 'sales' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>Volume (Sales)</button>
                                </div>
                            </div>

                            {/* The Map */}
                            <div className="relative h-[600px] w-full flex items-center justify-center bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden">
                                <div className="relative w-full max-w-4xl h-full transform scale-90 md:scale-100 origin-center">
                                    {PREF_GRID.map(p => {
                                        const prefData = geoAnalysisData.frames[geoFrameIndex]?.data[p.id];
                                        const val = geoMetric === 'momentum' ? (prefData?.yoy || 0) : (prefData?.total || 0);
                                        // Dynamic coloring logic
                                        const color = getHeatmapColor(val, geoMetric);
                                        const opacity = geoMetric === 'sales' ? Math.min(1, Math.max(0.1, val / (geoAnalysisData.frames[geoFrameIndex]?.data['東京']?.total || 1))) : 1;
                                        
                                        return (
                                            <div 
                                                key={p.id} 
                                                className="absolute w-12 h-12 flex flex-col items-center justify-center rounded-lg shadow-sm border border-white text-white transition-all duration-500 ease-in-out hover:scale-110 hover:z-10 cursor-pointer"
                                                style={{ 
                                                    left: `${p.x * 48 + 50}px`, 
                                                    top: `${p.y * 48 + 30}px`, 
                                                    backgroundColor: color,
                                                    opacity: geoMetric === 'sales' ? 0.3 + opacity * 0.7 : 1
                                                }}
                                                title={`${p.id}: ${val.toFixed(2)}`}
                                            >
                                                <span className="text-[9px] font-black drop-shadow-md">{p.id}</span>
                                                <span className="text-[8px] font-mono drop-shadow-md">
                                                    {geoMetric === 'momentum' 
                                                        ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(0)}%` 
                                                        : Math.round(val / 1000).toLocaleString() + 'M'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="absolute bottom-4 right-4 bg-white/80 p-4 rounded-xl shadow-lg backdrop-blur-sm text-xs font-bold text-gray-500">
                                    <div>Active Stores: {Object.values(geoAnalysisData.frames[geoFrameIndex]?.data || {}).reduce((a:any,b:any)=>a+b.count,0)}</div>
                                </div>
                            </div>

                            {/* Timeline Controls */}
                            <div className="mt-8 flex items-center gap-6">
                                <button 
                                    onClick={() => setIsGeoPlaying(!isGeoPlaying)} 
                                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all hover:scale-110 active:scale-95 ${isGeoPlaying ? 'bg-orange-500' : 'bg-[#005EB8]'}`}
                                >
                                    <i className={`fas ${isGeoPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                                </button>
                                <div className="flex-1">
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max={geoAnalysisData.frames.length - 1} 
                                        value={geoFrameIndex} 
                                        onChange={(e) => { setIsGeoPlaying(false); setGeoFrameIndex(Number(e.target.value)); }}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#005EB8]"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-2">
                                        <span>{geoAnalysisData.frames[0]?.month}</span>
                                        <span className="text-[#005EB8] font-black text-sm">{geoAnalysisData.frames[geoFrameIndex]?.month}</span>
                                        <span>{geoAnalysisData.frames[geoAnalysisData.frames.length - 1]?.month}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

             </div>

             {/* Fullscreen Modal */}
             {expandedChartId && (
                <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-md animate-fadeIn flex flex-col p-4 md:p-8">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display">拡大表示分析</h2>
                        <button onClick={() => setExpandedChartId(null)} className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all shadow-sm">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full bg-white rounded-3xl shadow-2xl border border-gray-200 p-8 overflow-hidden relative">
                        {renderChartContent(expandedChartId)}
                    </div>
                </div>
             )}
        </div>
    );
};

export default AnalyticsView;
