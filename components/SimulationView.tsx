
import React, { useState, useMemo, useEffect } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, ReferenceLine, Area,
    Bar, Cell, BarChart
} from 'recharts';

interface SimulationViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

// Tag Definition for filtering
const STORE_TAGS = [
    { id: 'rank_a', label: 'Rank A (優良)', color: 'bg-blue-50 text-blue-600 border-blue-100', filter: (s: StoreData) => s.stats?.abcRank === 'A' },
    { id: 'fast_grow', label: '急成長 (High-k)', color: 'bg-orange-50 text-orange-600 border-orange-100', filter: (s: StoreData) => s.params.k >= 0.15 },
    { id: 'high_pot', label: '大型店 (High-L)', color: 'bg-purple-50 text-purple-600 border-purple-100', filter: (s: StoreData) => s.params.L >= 2500 },
    { id: 'stable', label: '安定 (Low-CV)', color: 'bg-green-50 text-green-600 border-green-100', filter: (s: StoreData) => (s.stats?.cv || 1) < 0.1 },
    { id: 'recent', label: '直近オープン', color: 'bg-teal-50 text-teal-600 border-teal-100', filter: (s: StoreData) => s.raw.length <= 24 && s.raw.length >= 3 },
];

type ScenarioType = 'base' | 'optimistic' | 'pessimistic';

interface ScenarioParams {
    lMult: number;
    kMult: number;
    initialRatio: number;
}

interface SensitivityCell {
    lFactor: number;
    kFactor: number;
    metricValue: number; // ROI or % over BEP
    profit3y: number; // or Surplus Count
}

interface ProjectionResult {
    data: any[];
    yearly: { year: number; revenue: number; cost: number; profit: number }[];
    summary: {
        totalL: number;
        growthL: number;
        base: number;
        k: number;
        year1: number;
        year3Total: number;
        bepMonth: number | null;
        paybackMonth: number | null;
        roi: number | null;
        netImpactYear1: number;
        finalCumulativeProfit: number;
    };
}

const SimulationView: React.FC<SimulationViewProps> = ({ allStores, dataType }) => {
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';
    const unitDisplay = isSales ? 'k' : '人';
    
    // --- Global Simulation Settings ---
    const [simName, setSimName] = useState("新規出店計画 2024-Phase1");
    const [openDate, setOpenDate] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
    
    // --- Model Selection State ---
    const [selectedStoreNames, setSelectedStoreNames] = useState<string[]>([]);
    const [storeSearch, setStoreSearch] = useState("");
    const [activeTag, setActiveTag] = useState<string | null>(null);

    // --- Base & Financial Settings ---
    const [manualBase, setManualBase] = useState<number>(0);
    const [useModelBase, setUseModelBase] = useState<boolean>(true);
    const [monthlyCost, setMonthlyCost] = useState<number>(1800);
    const [initialInvestment, setInitialInvestment] = useState<number>(30000);

    // --- Scenario Settings ---
    const [scenarios, setScenarios] = useState<Record<ScenarioType, ScenarioParams>>({
        base: { lMult: 1.0, kMult: 1.0, initialRatio: 0.2 },
        optimistic: { lMult: 1.2, kMult: 1.2, initialRatio: 0.3 },
        pessimistic: { lMult: 0.8, kMult: 0.8, initialRatio: 0.1 },
    });
    const [activeScenarioTab, setActiveScenarioTab] = useState<ScenarioType>('base');

    // --- Cannibalization Settings ---
    const [cannibalTargets, setCannibalTargets] = useState<string[]>([]);
    const [cannibalRate, setCannibalRate] = useState<number>(10);
    const [showCannibalUI, setShowCannibalUI] = useState(false);

    // --- UI State ---
    const [showRevenueTable, setShowRevenueTable] = useState(false);
    const [showProfitTable, setShowProfitTable] = useState(false);

    // --- Defaults & Effects ---
    useEffect(() => {
        if (isSales) {
            setMonthlyCost(1800); // 1.8M Yen
            setInitialInvestment(30000); // 30M Yen
        } else {
            setMonthlyCost(1200); // 1200 Persons
            setInitialInvestment(0); // Not applicable for counts usually
        }
    }, [isSales]);

    // --- 1. Compute Eligible Stores ---
    const eligibleStores = useMemo(() => {
        return (Object.values(allStores) as StoreData[]).filter(s => {
            if (!s.isActive) return false;
            if (s.raw.length < 6) return false;
            
            if (activeTag) {
                const tag = STORE_TAGS.find(t => t.id === activeTag);
                if (tag && !tag.filter(s)) return false;
            }
            if (storeSearch) {
                return s.name.toLowerCase().includes(storeSearch.toLowerCase());
            }
            return true;
        });
    }, [allStores, activeTag, storeSearch]);

    // --- 2. Compute Base Model Stats ---
    const baseModelStats = useMemo(() => {
        const models = selectedStoreNames.map(n => allStores[n]).filter(s => s);
        if (models.length === 0) return null;

        const avgGrowthL = models.reduce((a, s) => a + s.params.L, 0) / models.length;
        const avgK = models.reduce((a, s) => a + s.params.k, 0) / models.length;
        const avgBase = models.reduce((a, s) => a + (s.params.base || 0), 0) / models.length;
        
        const avgSeasonal = Array(12).fill(0);
        models.forEach(s => {
            s.seasonal.forEach((v, i) => avgSeasonal[i] += v);
        });
        for (let i = 0; i < 12; i++) avgSeasonal[i] /= models.length;

        return { avgGrowthL, avgK, avgBase, avgSeasonal, count: models.length };
    }, [selectedStoreNames, allStores]);

    useEffect(() => {
        if (useModelBase && baseModelStats) {
            setManualBase(Math.round(baseModelStats.avgBase));
        }
    }, [baseModelStats, useModelBase]);

    // --- 3. Compute Projections ---
    const cannibalImpactMonthly = useMemo(() => {
        if (cannibalTargets.length === 0) return 0;
        let totalImpact = 0;
        cannibalTargets.forEach(name => {
            const s = allStores[name];
            if (s && s.stats) {
                const monthlyAvg = s.stats.lastYearSales / 12;
                totalImpact += monthlyAvg * (cannibalRate / 100);
            }
        });
        return Math.round(totalImpact);
    }, [cannibalTargets, cannibalRate, allStores]);

    const calculateProjection = (params: ScenarioParams, customLMult?: number, customKMult?: number): ProjectionResult | null => {
        if (!baseModelStats) return null;
        const { avgGrowthL, avgK, avgSeasonal } = baseModelStats;

        // Use custom multipliers if provided (for sensitivity analysis), else scenario params
        const lM = customLMult !== undefined ? customLMult : params.lMult;
        const kM = customKMult !== undefined ? customKMult : params.kMult;

        const finalGrowthL = avgGrowthL * lM;
        const finalK = avgK * kM;
        const finalBase = manualBase;

        const startY = parseInt(openDate.split('-')[0]);
        const startM = parseInt(openDate.split('-')[1]) - 1;

        const safeRatio = Math.max(0.01, Math.min(0.99, params.initialRatio));
        const t0_shift = Math.log((1 - safeRatio) / safeRatio) / finalK;

        const data = [];
        const yearly = [
            { year: 1, revenue: 0, cost: 0, profit: 0 },
            { year: 2, revenue: 0, cost: 0, profit: 0 },
            { year: 3, revenue: 0, cost: 0, profit: 0 },
        ];

        let totalYear1 = 0;
        let totalYear3Total = 0;
        let cumulativeProfit = -initialInvestment;
        let bepMonthIndex = -1;
        let paybackMonthIndex = -1;

        for (let t = 0; t < 36; t++) {
            const logisticPart = 1 / (1 + Math.exp(-finalK * (t - t0_shift)));
            const growthVal = finalGrowthL * logisticPart;
            const currentMonthIdx = (startM + t) % 12;
            const seaVal = avgSeasonal[currentMonthIdx];
            
            const totalRaw = (finalBase + growthVal) * seaVal;
            const val = Math.max(0, Math.round(totalRaw));
            const netVal = val - cannibalImpactMonthly;
            const profit = netVal - monthlyCost; // Sales Profit OR Surplus Visitors
            
            cumulativeProfit += profit;

            if (bepMonthIndex === -1 && netVal > monthlyCost) bepMonthIndex = t;
            
            // Payback is only relevant if we have an initial investment (usually sales mode)
            if (initialInvestment > 0 && paybackMonthIndex === -1 && cumulativeProfit > 0) paybackMonthIndex = t;

            const d = new Date(startY, startM + t, 1);
            const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

            data.push({
                month: t + 1,
                date: label,
                val,
                baseComponent: finalBase * seaVal,
                growthComponent: growthVal * seaVal,
                netVal,
                profit,
                cumProfit: cumulativeProfit
            });

            if (t < 12) totalYear1 += val;
            totalYear3Total += val;

            // Yearly Aggregation
            const yIdx = Math.floor(t / 12);
            if(yIdx < 3) {
                yearly[yIdx].revenue += netVal;
                yearly[yIdx].cost += monthlyCost;
                yearly[yIdx].profit += profit;
            }
        }

        return {
            data,
            yearly,
            summary: {
                totalL: finalBase + finalGrowthL,
                growthL: finalGrowthL,
                base: finalBase,
                k: finalK,
                year1: totalYear1,
                year3Total: totalYear3Total,
                bepMonth: bepMonthIndex !== -1 ? bepMonthIndex + 1 : null,
                paybackMonth: paybackMonthIndex !== -1 ? paybackMonthIndex + 1 : null,
                roi: isSales ? ((cumulativeProfit + initialInvestment) / initialInvestment * 100) : null,
                netImpactYear1: totalYear1 - (cannibalImpactMonthly * 12),
                finalCumulativeProfit: cumulativeProfit
            }
        };
    };

    const scenarioResults = useMemo(() => {
        return {
            base: calculateProjection(scenarios.base),
            optimistic: calculateProjection(scenarios.optimistic),
            pessimistic: calculateProjection(scenarios.pessimistic),
        };
    }, [baseModelStats, scenarios, manualBase, openDate, monthlyCost, initialInvestment, cannibalImpactMonthly, isSales]);

    // --- 4. Sensitivity Analysis Matrix ---
    const sensitivityData = useMemo(() => {
        if (!baseModelStats) return null;
        const matrix: SensitivityCell[] = [];
        const lSteps = [0.8, 0.9, 1.0, 1.1, 1.2];
        const kSteps = [0.8, 0.9, 1.0, 1.1, 1.2];

        // Use Base Scenario params as the anchor
        const baseL = scenarios.base.lMult;
        const baseK = scenarios.base.kMult;

        for (let lFac of lSteps) {
            for (let kFac of kSteps) {
                const sim = calculateProjection(scenarios.base, baseL * lFac, baseK * kFac);
                if (sim) {
                    let metric = 0;
                    if (isSales) {
                        metric = sim.summary.roi || 0;
                    } else {
                        // For customers: % over BEP cost (Surplus Ratio)
                        const avgMonthly = sim.summary.year3Total / 36;
                        metric = monthlyCost > 0 ? (avgMonthly / monthlyCost) * 100 : 0;
                    }

                    matrix.push({
                        lFactor: lFac,
                        kFactor: kFac,
                        metricValue: metric,
                        profit3y: sim.summary.finalCumulativeProfit
                    });
                }
            }
        }
        return matrix;
    }, [baseModelStats, scenarios.base, isSales, calculateProjection, monthlyCost]);

    // --- Chart Data Formatting ---
    const chartData = useMemo(() => {
        if (!scenarioResults.base) return [];
        return scenarioResults.base.data.map((d, i) => ({
            ...d,
            optimistic: scenarioResults.optimistic?.data[i].val,
            pessimistic: scenarioResults.pessimistic?.data[i].val,
            cost: monthlyCost,
        }));
    }, [scenarioResults, monthlyCost]);

    // --- Helpers ---
    const updateScenarioParam = (key: keyof ScenarioParams, value: number) => {
        setScenarios(prev => ({
            ...prev,
            [activeScenarioTab]: { ...prev[activeScenarioTab], [key]: value }
        }));
    };

    const toggleStore = (name: string) => {
        setSelectedStoreNames(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    };

    const toggleCannibalTarget = (name: string) => {
        setCannibalTargets(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    };

    // --- Sub-components ---
    const SliderControl = ({ label, value, min, max, step, onChange, format }: any) => (
        <div className="mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    {label.split('(')[0]}
                    {label.includes('L') && <HelpTooltip title="Growth Potential (L倍率)" content="シミュレーションの「売上の天井（規模）」を調整します。1.0倍がモデル平均です。" />}
                    {label.includes('k') && <HelpTooltip title="Growth Speed (k倍率)" content="立ち上がりの「速さ」を調整します。1.0倍より大きくすると急成長、小さくすると緩やかな成長になります。" />}
                    {label.includes('初動') && <HelpTooltip title="Initial Progress (初動率)" content="オープン初月の売上が、最終的な天井(L)の何%からスタートするかを設定します。" />}
                </span>
                <span className="text-sm font-black text-[#005EB8] font-mono">{format ? format(value) : value}</span>
            </div>
            <input 
                type="range" min={min} max={max} step={step} value={value} 
                onChange={e => onChange(parseFloat(e.target.value))} 
                className="w-full accent-[#005EB8] h-1.5 bg-gray-200 rounded-lg cursor-pointer appearance-none" 
            />
        </div>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1400px] mx-auto space-y-6 pb-40">
                
                {/* 1. Header & Configuration Bar */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 backdrop-blur-sm bg-white/95">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#005EB8] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight font-display flex items-center gap-2">
                                新店シミュレーション Pro
                                <HelpTooltip title="新店シミュレーション" content="既存店のデータをモデル（教師データ）として使い、新しい店の売上・客数推移を予測します。Base（基礎売上）とGrowth（成長分）を分けて計算する高度なロジックを採用しています。" />
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold">Incremental Logistic Model (Base + Growth)</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <label className="text-[9px] font-black text-gray-400 uppercase">プロジェクト名</label>
                            <input type="text" value={simName} onChange={e => setSimName(e.target.value)} className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 w-48 focus:ring-1 focus:ring-[#005EB8] outline-none" />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[9px] font-black text-gray-400 uppercase">オープン予定年月</label>
                            <input type="month" value={openDate} onChange={e => setOpenDate(e.target.value)} className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* --- LEFT COLUMN: SETTINGS (4 cols) --- */}
                    <div className="lg:col-span-4 space-y-6">
                        
                        {/* STEP 1: Model Selection */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[420px]">
                            <div className="px-5 py-4 border-b border-gray-50 bg-slate-50/50">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">1</span>
                                        モデル店舗選択
                                        <HelpTooltip title="モデル店舗" content="新店の「手本」となる既存店を選んでください。これらの店の「成長カーブ」と「季節性」を平均化して予測に使います。" />
                                    </h3>
                                    <span className="bg-[#005EB8] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">{selectedStoreNames.length}店</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {STORE_TAGS.map(t => (
                                        <button 
                                            key={t.id} onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
                                            className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${t.color} ${activeTag === t.id ? 'ring-2 ring-offset-1 ring-gray-300 shadow-sm scale-105' : 'opacity-70 hover:opacity-100'}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <input type="text" placeholder="店舗名で検索..." value={storeSearch} onChange={e => setStoreSearch(e.target.value)} className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#005EB8]" />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                                {eligibleStores.map(s => {
                                    const selected = selectedStoreNames.includes(s.name);
                                    return (
                                        <div key={s.name} onClick={() => toggleStore(s.name)} className={`p-3 rounded-xl cursor-pointer flex justify-between items-center border transition-all ${selected ? 'bg-blue-50 border-blue-200 shadow-inner' : 'bg-white border-transparent hover:bg-gray-50'}`}>
                                            <div>
                                                <div className={`text-xs font-bold ${selected ? 'text-[#005EB8]' : 'text-slate-700'}`}>{s.name}</div>
                                                <div className="flex gap-2 text-[9px] text-slate-400 mt-0.5 font-mono">
                                                    <span>L:{Math.round(s.params.L).toLocaleString()}</span>
                                                    <span>k:{s.params.k.toFixed(3)}</span>
                                                    <span>Base:{Math.round(s.params.base || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                            {selected && <div className="w-4 h-4 bg-[#005EB8] rounded-full flex items-center justify-center"><svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg></div>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* STEP 2: Parameters (Base + Growth) */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-50 bg-slate-50/50">
                                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">2</span>
                                    構造パラメータ設定
                                </h3>
                            </div>
                            
                            <div className="p-5 space-y-6">
                                {/* Base Setting */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                            基礎{isSales ? '売上' : '客数'} (Base)
                                            <HelpTooltip title="Base (基礎値)" content={`オープン初月から確実に見込める${isSales ? '売上' : '来店客数'}のベースラインです。「居抜き」や「近隣移転」の場合は高めに設定します。完全新規なら0でも構いません。`} />
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" checked={useModelBase} onChange={e => setUseModelBase(e.target.checked)} className="accent-[#005EB8] w-3 h-3" id="useAvg" />
                                            <label htmlFor="useAvg" className="text-[9px] font-bold text-slate-400 cursor-pointer">モデル平均を使用</label>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" value={manualBase} onChange={e => { setManualBase(Number(e.target.value)); setUseModelBase(false); }}
                                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-black text-right text-slate-700 focus:ring-1 focus:ring-[#005EB8] outline-none"
                                        />
                                        <span className="text-xs font-bold text-slate-400">{unitDisplay}</span>
                                    </div>
                                </div>

                                {/* Scenario Tabs */}
                                <div>
                                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                                        {(['base', 'optimistic', 'pessimistic'] as ScenarioType[]).map(s => (
                                            <button key={s} onClick={() => setActiveScenarioTab(s)} className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${activeScenarioTab === s ? (s === 'base' ? 'bg-white text-slate-800 shadow-sm' : s === 'optimistic' ? 'bg-green-50 text-green-600 shadow-sm' : 'bg-red-50 text-red-600 shadow-sm') : 'text-gray-400 hover:text-gray-600'}`}>
                                                {s === 'base' ? '標準' : s === 'optimistic' ? '楽観' : '悲観'}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    <SliderControl 
                                        label="潜在規模 (L倍率)" 
                                        value={scenarios[activeScenarioTab].lMult} 
                                        min={0.5} max={2.0} step={0.05} 
                                        onChange={(v: number) => updateScenarioParam('lMult', v)} 
                                        format={(v:number) => `x${v.toFixed(2)}`}
                                    />
                                    <SliderControl 
                                        label="成長速度 (k倍率)" 
                                        value={scenarios[activeScenarioTab].kMult} 
                                        min={0.5} max={2.0} step={0.05} 
                                        onChange={(v: number) => updateScenarioParam('kMult', v)} 
                                        format={(v:number) => `x${v.toFixed(2)}`}
                                    />
                                    <SliderControl 
                                        label="初動率 (Initial Ratio)" 
                                        value={scenarios[activeScenarioTab].initialRatio} 
                                        min={0.05} max={0.9} step={0.05} 
                                        onChange={(v: number) => updateScenarioParam('initialRatio', v)} 
                                        format={(v:number) => `${Math.round(v*100)}%`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* STEP 3: Cost & Cannibalization */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-50 bg-slate-50/50">
                                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">3</span>
                                    コスト・カニバリ設定
                                </h3>
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1">
                                            月次BEP{isSales ? 'コスト' : '客数'}
                                            <HelpTooltip title="BEPライン" content={`損益分岐点となる${isSales ? '月額コスト（家賃・人件費等）' : '月間来店客数'}を入力します。このラインを超えた分が利益となります。`} />
                                        </label>
                                        <input type="number" value={monthlyCost} onChange={e => setMonthlyCost(Number(e.target.value))} className="w-full mt-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-right" />
                                    </div>
                                    {isSales && (
                                        <div>
                                            <label className="text-[9px] font-black text-gray-400 uppercase flex items-center gap-1">
                                                初期投資額
                                                <HelpTooltip title="初期投資額" content="内装工事費などのイニシャルコスト。これをいつ回収できるか（Payback Period）を計算します。" />
                                            </label>
                                            <input type="number" value={initialInvestment} onChange={e => setInitialInvestment(Number(e.target.value))} className="w-full mt-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-right" />
                                        </div>
                                    )}
                                </div>
                                <div className="pt-2 border-t border-dashed border-gray-200">
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input type="checkbox" checked={showCannibalUI} onChange={e => setShowCannibalUI(e.target.checked)} className="accent-red-500 w-4 h-4 rounded" />
                                        <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            カニバリゼーション (商圏競合)
                                            <HelpTooltip title="カニバリゼーション" content="新店を出すことで、近隣の既存店から客を奪ってしまう現象。既存店の売上減少分を「コスト」としてシミュレーションに織り込みます。" />
                                        </span>
                                    </label>
                                    {showCannibalUI && (
                                        <div className="bg-red-50 rounded-xl p-3 border border-red-100 space-y-2 animate-fadeIn">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-red-400">
                                                <span>影響率</span>
                                                <span>{cannibalRate}%</span>
                                            </div>
                                            <input type="range" min="0" max="50" value={cannibalRate} onChange={e => setCannibalRate(Number(e.target.value))} className="w-full accent-red-500 h-1 bg-red-200 rounded-lg" />
                                            <div className="h-24 overflow-y-auto bg-white rounded border border-red-100 p-1 space-y-1 custom-scrollbar">
                                                {Object.keys(allStores).sort().map(n => (
                                                    <div key={n} onClick={() => toggleCannibalTarget(n)} className={`text-[10px] p-1.5 rounded cursor-pointer flex justify-between items-center ${cannibalTargets.includes(n) ? 'bg-red-100 text-red-700 font-bold' : 'hover:bg-gray-50 text-slate-500'}`}>
                                                        <span>{n}</span>
                                                        {cannibalTargets.includes(n) && <span>-{Math.round(((allStores[n].stats?.lastYearSales||0)/12)*(cannibalRate/100)).toLocaleString()}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-right text-[10px] font-black text-red-600">Total Impact: -{cannibalImpactMonthly.toLocaleString()} /月</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* --- RIGHT COLUMN: RESULTS (8 cols) --- */}
                    <div className="lg:col-span-8 space-y-8">
                        
                        {/* CHART 1: REVENUE & VOLUME */}
                        {baseModelStats ? (
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col relative animate-fadeIn">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest font-display flex items-center gap-2">
                                        <span className="p-1.5 bg-blue-100 text-[#005EB8] rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg></span>
                                        売上・客数シミュレーション (Base + Growth)
                                    </h3>
                                    <div className="flex gap-4 text-[10px] font-bold">
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#CBD5E1]"></span>Base (基礎)</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#005EB8]"></span>Growth (成長)</div>
                                        <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500"></span>楽観</div>
                                        <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500"></span>悲観</div>
                                    </div>
                                </div>
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={30} />
                                            <YAxis tick={{fontSize: 9}} label={{ value: unitLabel, angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                                            <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            <Area type="monotone" dataKey="baseComponent" stackId="1" stroke="none" fill="#CBD5E1" fillOpacity={0.5} name="Base (基礎)" />
                                            <Area type="monotone" dataKey="growthComponent" stackId="1" stroke="#005EB8" strokeWidth={2} fill="url(#colorGrowth)" name="Growth (成長)" />
                                            <Line type="monotone" dataKey="optimistic" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="楽観シナリオ" />
                                            <Line type="monotone" dataKey="pessimistic" stroke="#EF4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="悲観シナリオ" />
                                            <defs>
                                                <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#005EB8" stopOpacity={0.2}/>
                                                    <stop offset="95%" stopColor="#005EB8" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                
                                {/* REVENUE DATA TABLE */}
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                    <div 
                                        className="cursor-pointer flex justify-between items-center bg-slate-50 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                                        onClick={() => setShowRevenueTable(!showRevenueTable)}
                                    >
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">詳細データテーブル (売上・客数)</span>
                                        <svg className={`w-3 h-3 text-slate-400 transition-transform ${showRevenueTable ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                    {showRevenueTable && scenarioResults.base && (
                                        <div className="overflow-x-auto mt-2 max-h-[200px] animate-fadeIn">
                                            <table className="min-w-full text-center text-[10px]">
                                                <thead className="bg-white sticky top-0 z-10 shadow-sm text-slate-500 font-bold uppercase">
                                                    <tr>
                                                        <th className="py-2 px-2 text-left">年月</th>
                                                        <th className="py-2 px-2 bg-blue-50 text-[#005EB8]">予測合計</th>
                                                        <th className="py-2 px-2 text-gray-400">Base</th>
                                                        <th className="py-2 px-2 text-gray-400">Growth</th>
                                                        <th className="py-2 px-2 text-red-400">カニバリ</th>
                                                        <th className="py-2 px-2">純増分</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 font-mono text-slate-600">
                                                    {scenarioResults.base.data.map((row, i) => (
                                                        <tr key={i} className="hover:bg-blue-50/30">
                                                            <td className="py-1 px-2 text-left font-bold">{row.date}</td>
                                                            <td className="py-1 px-2 font-bold text-[#005EB8]">{row.val.toLocaleString()}</td>
                                                            <td className="py-1 px-2 text-gray-400">{Math.round(row.baseComponent).toLocaleString()}</td>
                                                            <td className="py-1 px-2 text-gray-400">{Math.round(row.growthComponent).toLocaleString()}</td>
                                                            <td className="py-1 px-2 text-red-400">-{cannibalImpactMonthly.toLocaleString()}</td>
                                                            <td className="py-1 px-2 font-bold">{row.netVal.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-50 rounded-3xl border border-dashed border-gray-200 h-[400px] flex items-center justify-center text-gray-400 font-bold text-xs uppercase tracking-widest">
                                左側からモデル店舗を選択してください
                            </div>
                        )}

                        {/* CHART 2: PROFIT & CASHFLOW */}
                        {baseModelStats && (
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col relative animate-fadeIn">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest font-display flex items-center gap-2">
                                        <span className="p-1.5 bg-yellow-100 text-yellow-600 rounded-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>
                                        収支・投資回収シミュレーション (Profit & Payback)
                                    </h3>
                                    <div className="flex gap-4 text-[10px] font-bold">
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"></span>黒字月</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span>赤字月</div>
                                        <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-500"></span>累積損益</div>
                                        {isSales && <div className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 border-dashed border-t"></span>初期投資</div>}
                                    </div>
                                </div>
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={30} />
                                            <YAxis yAxisId="left" tick={{fontSize: 9}} label={{ value: '月次損益', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                                            <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} label={{ value: '累積損益', angle: -90, position: 'right', offset: 0, fontSize: 9 }} />
                                            <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            
                                            <Bar yAxisId="left" dataKey="profit" name="月次損益" barSize={12} radius={[2,2,0,0]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10B981' : '#EF4444'} />
                                                ))}
                                            </Bar>
                                            
                                            <Line yAxisId="right" type="monotone" dataKey="cumProfit" stroke="#F59E0B" strokeWidth={2} dot={false} name="累積損益" />
                                            
                                            <ReferenceLine yAxisId="left" y={0} stroke="#000" strokeOpacity={0.2} />
                                            {isSales && <ReferenceLine yAxisId="right" y={0} stroke="#8B5CF6" strokeDasharray="3 3" label={{ value: 'Payback (回収完了)', position: 'insideTopRight', fontSize: 9, fill: '#8B5CF6' }} />}
                                            {isSales && initialInvestment > 0 && <ReferenceLine yAxisId="right" y={-initialInvestment} stroke="#CBD5E1" strokeDasharray="3 3" label={{ value: 'Initial Cost', position: 'insideBottomRight', fontSize: 9, fill: '#94A3B8' }} />}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* PROFIT DATA TABLE */}
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                    <div 
                                        className="cursor-pointer flex justify-between items-center bg-slate-50 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                                        onClick={() => setShowProfitTable(!showProfitTable)}
                                    >
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">詳細データテーブル (収支・キャッシュフロー)</span>
                                        <svg className={`w-3 h-3 text-slate-400 transition-transform ${showProfitTable ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                    {showProfitTable && scenarioResults.base && (
                                        <div className="overflow-x-auto mt-2 max-h-[200px] animate-fadeIn">
                                            <table className="min-w-full text-center text-[10px]">
                                                <thead className="bg-white sticky top-0 z-10 shadow-sm text-slate-500 font-bold uppercase">
                                                    <tr>
                                                        <th className="py-2 px-2 text-left">年月</th>
                                                        <th className="py-2 px-2 bg-blue-50 text-[#005EB8]">{isSales ? '売上(Net)' : '客数(Net)'}</th>
                                                        <th className="py-2 px-2 text-red-400">{isSales ? 'コスト(BEP)' : 'BEPライン'}</th>
                                                        <th className="py-2 px-2">月次損益</th>
                                                        <th className="py-2 px-2 text-yellow-600">累積損益</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 font-mono text-slate-600">
                                                    {scenarioResults.base.data.map((row, i) => (
                                                        <tr key={i} className="hover:bg-yellow-50/30">
                                                            <td className="py-1 px-2 text-left font-bold">{row.date}</td>
                                                            <td className="py-1 px-2 font-bold text-[#005EB8]">{row.netVal.toLocaleString()}</td>
                                                            <td className="py-1 px-2 text-red-400">{monthlyCost.toLocaleString()}</td>
                                                            <td className={`py-1 px-2 font-bold ${row.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.profit.toLocaleString()}</td>
                                                            <td className={`py-1 px-2 font-bold ${row.cumProfit >= 0 ? 'text-yellow-600' : 'text-red-400'}`}>{row.cumProfit.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* SUMMARY METRICS & SENSITIVITY */}
                        {scenarioResults.base && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Yearly P&L */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-[320px] flex flex-col">
                                    <h4 className="text-xs font-black text-gray-600 uppercase tracking-widest mb-4 font-display">
                                        年次収支サマリ ({isSales ? 'Revenue vs Cost' : 'Visitor vs BEP'})
                                    </h4>
                                    <div className="flex-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={scenarioResults.base.yearly} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="year" tickFormatter={(v) => `Year ${v}`} tick={{fontSize:10, fontWeight:'bold'}} />
                                                <YAxis tick={{fontSize:9}} />
                                                <Tooltip formatter={(v:number) => v.toLocaleString()} cursor={{fill:'transparent'}} contentStyle={{borderRadius:'8px'}} />
                                                <Bar dataKey="revenue" name={isSales ? "売上" : "実績客数"} fill="#005EB8" barSize={30} radius={[4,4,0,0]} />
                                                <Bar dataKey="cost" name={isSales ? "コスト" : "BEP客数"} fill="#CBD5E1" barSize={30} radius={[4,4,0,0]} />
                                                <ReferenceLine y={0} stroke="#000" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex justify-between mt-2 px-2 text-[10px] font-bold text-gray-500">
                                        {scenarioResults.base.yearly.map(y => (
                                            <div key={y.year} className="text-center">
                                                <div className={y.profit > 0 ? 'text-green-600' : 'text-red-500'}>
                                                    {isSales ? '利益' : '差分'}: {y.profit > 0 ? '+' : ''}{Math.round(y.profit).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Sensitivity Matrix */}
                                {sensitivityData && (
                                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-[320px] flex flex-col">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-xs font-black text-gray-600 uppercase tracking-widest font-display">感度分析 (リスク・リターン)</h4>
                                            <HelpTooltip title="感度分析" content={`成長率(k)やポテンシャル(L)が想定から外れた場合の${isSales ? 'ROI（投資回収率）' : 'BEP達成率'}の変化を一覧化しました。赤色はリスクが高い領域です。`} />
                                        </div>
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex text-[9px] font-bold text-gray-400 mb-1">
                                                <div className="w-8"></div>
                                                <div className="flex-1 text-center">成長速度(k) 倍率 →</div>
                                            </div>
                                            <div className="flex flex-1">
                                                <div className="w-8 flex flex-col justify-center text-[9px] font-bold text-gray-400">
                                                    <span className="-rotate-90 whitespace-nowrap">潜在規模(L) 倍率 →</span>
                                                </div>
                                                <div className="flex-1 grid grid-cols-5 grid-rows-5 gap-1">
                                                    {sensitivityData.map((cell, i) => {
                                                        // Color scale logic adaptation
                                                        let bg = 'bg-gray-100';
                                                        let text = 'text-gray-500';
                                                        
                                                        if (isSales) {
                                                            // ROI based
                                                            if (cell.metricValue < 80) { bg = 'bg-red-100'; text = 'text-red-700'; }
                                                            else if (cell.metricValue < 100) { bg = 'bg-orange-100'; text = 'text-orange-700'; }
                                                            else if (cell.metricValue < 150) { bg = 'bg-yellow-50'; text = 'text-yellow-700'; }
                                                            else { bg = 'bg-green-100'; text = 'text-green-700'; }
                                                        } else {
                                                            // Visitor % over BEP
                                                            if (cell.metricValue < 90) { bg = 'bg-red-100'; text = 'text-red-700'; }
                                                            else if (cell.metricValue < 100) { bg = 'bg-orange-100'; text = 'text-orange-700'; }
                                                            else if (cell.metricValue < 110) { bg = 'bg-yellow-50'; text = 'text-yellow-700'; }
                                                            else { bg = 'bg-green-100'; text = 'text-green-700'; }
                                                        }

                                                        // Highlight center (Base case)
                                                        const isBase = cell.lFactor === 1.0 && cell.kFactor === 1.0;
                                                        
                                                        return (
                                                            <div key={i} className={`${bg} rounded flex flex-col items-center justify-center p-1 relative group cursor-default transition-transform hover:scale-110 hover:z-10 hover:shadow-md ${isBase ? 'ring-2 ring-[#005EB8] ring-offset-1' : ''}`}>
                                                                <span className={`text-[10px] font-black ${text}`}>{cell.metricValue.toFixed(0)}%</span>
                                                                {/* Tooltip */}
                                                                <div className="absolute bottom-full mb-1 bg-gray-800 text-white text-[9px] p-2 rounded hidden group-hover:block whitespace-nowrap z-20">
                                                                    L: x{cell.lFactor.toFixed(1)}, k: x{cell.kFactor.toFixed(1)}<br/>
                                                                    {isSales ? `Profit: ${Math.round(cell.profit3y).toLocaleString()}` : `Surplus: ${Math.round(cell.profit3y).toLocaleString()}`}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                            <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-1">
                                                <span>x0.8</span>
                                                <span>x1.0</span>
                                                <span>x1.2</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CANNIBAL IMPACT CARD */}
                        {showCannibalUI && scenarioResults.base && (
                            <div className="bg-red-50 rounded-2xl p-5 border border-red-100 flex items-center justify-between animate-fadeIn">
                                <div>
                                    <h4 className="font-black text-red-800 text-sm uppercase mb-1">カニバリゼーション警告</h4>
                                    <p className="text-xs text-red-600 font-bold">既存店合計 {cannibalTargets.length}店舗への影響予測</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-red-400 uppercase">純増効果 (初年度)</div>
                                    <div className="text-2xl font-black text-red-700">
                                        <span className="text-sm mr-1">Net:</span>
                                        +{Math.round(scenarioResults.base.summary.netImpactYear1).toLocaleString()}
                                        <span className="text-sm ml-1">{unitDisplay}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SimulationView;
