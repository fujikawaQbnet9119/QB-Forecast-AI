
import React, { useState, useMemo, useEffect } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Line, Cell, Legend, ReferenceLine, LabelList, ScatterChart, Scatter,
    AreaChart, Area, Treemap
} from 'recharts';

interface BudgetComparisonViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

interface BudgetRow {
    storeName: string;
    block: string;
    region: string;
    totalBudget: number;
    monthlyBudget: { [date: string]: number };
}

const BudgetComparisonView: React.FC<BudgetComparisonViewProps> = ({ allStores, dataType }) => {
    // UI States
    const [activeTab, setActiveTab] = useState<'global' | 'individual' | 'analysis' | 'landing' | 'leaders'>('global');
    const [filterText, setFilterText] = useState("");
    const [sortKey, setSortKey] = useState<string>('achievement');
    const [sortDesc, setSortDesc] = useState(true);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);

    // Individual View States
    const [selectedBlock, setSelectedBlock] = useState<string>("");
    const [selectedStoreName, setSelectedStoreName] = useState<string | null>(null);

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    const displayDivider = isSales ? 1000 : 1;
    const displayUnit = isSales ? 'M' : '人';

    // --- Prepare Budget Data from allStores ---
    const { budgetData, fiscalMonths } = useMemo(() => {
        const rows: BudgetRow[] = [];
        const dateSet = new Set<string>();

        (Object.values(allStores) as StoreData[]).forEach(store => {
            if (store.budget) {
                const dates = Object.keys(store.budget);
                dates.forEach(d => dateSet.add(d));
                
                let total = 0;
                dates.forEach(d => total += (store.budget![d] || 0));

                rows.push({
                    storeName: store.name,
                    block: store.block || "Other",
                    region: store.region || "Other",
                    totalBudget: total,
                    monthlyBudget: store.budget
                });
            }
        });

        return { 
            budgetData: rows, 
            fiscalMonths: Array.from(dateSet).sort() 
        };
    }, [allStores]);

    // --- Core Calculation ---
    const comparisonData = useMemo(() => {
        if (budgetData.length === 0) return null;

        // 1. Determine Current Progress Month based on Actuals
        const actualDatesSet = new Set<string>();
        (Object.values(allStores) as StoreData[]).forEach(s => s.dates.forEach(d => actualDatesSet.add(d.replace(/\//g, '-'))));
        const sortedActualDates = Array.from(actualDatesSet).sort();
        
        const relevantMonths = fiscalMonths.filter(fm => sortedActualDates.includes(fm));
        const lastClosedMonth = relevantMonths.length > 0 ? relevantMonths[relevantMonths.length - 1] : null;
        
        // Future Months (for Landing Prediction)
        const remainingMonths = fiscalMonths.filter(fm => !sortedActualDates.includes(fm));

        // 2. Aggregate Company Wide & Store Level
        let totalLanding = 0;
        let totalBudgetGlobal = 0;
        
        const storeStats = budgetData.map(b => {
            let cumBudget = 0;
            let cumActual = 0;
            let forecastRemaining = 0;
            
            const monthlyTrend: any[] = [];

            // YTD Calculation
            relevantMonths.forEach(m => {
                const valB = b.monthlyBudget[m] || 0;
                cumBudget += valB;
                
                let valA = 0;
                const store = allStores[b.storeName];
                if (store) {
                    const idx = store.dates.findIndex(d => d.replace(/\//g, '-') === m);
                    if (idx !== -1) valA = store.raw[idx];
                }
                cumActual += valA;
                
                monthlyTrend.push({
                    month: m,
                    type: 'actual',
                    val: valA,
                    budget: valB,
                    diff: valA - valB
                });
            });

            // Remaining Forecast Calculation
            const store = allStores[b.storeName];
            remainingMonths.forEach((m, i) => {
                const valB = b.monthlyBudget[m] || 0;
                let valF = valB; // Fallback
                if (store && store.isActive) {
                    const recentAch = cumBudget > 0 ? cumActual / cumBudget : 1.0;
                    const pace = Math.min(1.2, Math.max(0.8, recentAch));
                    valF = valB * pace;
                }
                forecastRemaining += valF;

                monthlyTrend.push({
                    month: m,
                    type: 'forecast',
                    val: valF,
                    budget: valB,
                    diff: valF - valB
                });
            });

            const totalBudget = b.totalBudget;
            const landing = cumActual + forecastRemaining;
            const landingDiff = landing - totalBudget;
            const landingAchievement = totalBudget > 0 ? (landing / totalBudget) * 100 : 0;
            
            totalLanding += landing;
            totalBudgetGlobal += totalBudget;

            return {
                ...b,
                cumBudget,
                cumActual,
                cumDiff: cumActual - cumBudget,
                cumAchievement: cumBudget > 0 ? (cumActual / cumBudget) * 100 : 0,
                forecastRemaining,
                landing,
                landingDiff,
                landingAchievement,
                monthlyTrend
            };
        });

        // 3. Global Monthly Aggregation
        const companyMonthly = fiscalMonths.map(m => {
            let budget = 0;
            let actual = 0;
            let forecast = 0;
            let isActual = relevantMonths.includes(m);

            storeStats.forEach(s => {
                const mData = s.monthlyTrend.find(mt => mt.month === m);
                if (mData) {
                    budget += mData.budget;
                    if (isActual) actual += mData.val;
                    else forecast += mData.val;
                }
            });

            return {
                month: m,
                budget,
                actual: isActual ? actual : null,
                forecast: !isActual ? forecast : null,
                landing: isActual ? actual : forecast,
                isActual
            };
        });

        // 4. Summaries & Analysis Sets
        const totalCumBudget = storeStats.reduce((a, s) => a + s.cumBudget, 0);
        const totalCumActual = storeStats.reduce((a, s) => a + s.cumActual, 0);
        const totalAchievement = totalCumBudget > 0 ? (totalCumActual / totalCumBudget) * 100 : 0;
        
        // Gap Waterfall Data
        const waterfallData = storeStats.map(s => ({ name: s.storeName, val: s.cumDiff })).sort((a,b) => b.val - a.val);
        
        // Landing Waterfall (Bridge)
        const bridgeData = [
            { name: '期初予算', val: totalBudgetGlobal, type: 'base' },
            { name: 'YTD実績乖離', val: totalCumActual - totalCumBudget, type: 'diff' },
            { name: '残期間予測乖離', val: totalLanding - totalBudgetGlobal - (totalCumActual - totalCumBudget), type: 'diff' },
            { name: '着地見込', val: totalLanding, type: 'total' }
        ];

        // Leaderboard Sets
        const heroes = storeStats.filter(s => s.landingDiff > 0).sort((a,b) => b.landingDiff - a.landingDiff);
        const killers = storeStats.filter(s => s.landingDiff < 0).sort((a,b) => a.landingDiff - b.landingDiff); // Ascending (worst first)

        const totalSurplus = heroes.reduce((a, s) => a + s.landingDiff, 0);
        const totalDeficit = killers.reduce((a, s) => a + s.landingDiff, 0);

        return {
            relevantMonths,
            lastClosedMonth,
            companyMonthly,
            storeStats,
            waterfallData,
            bridgeData,
            heroes,
            killers,
            summary: {
                totalCumBudget,
                totalCumActual,
                diff: totalCumActual - totalCumBudget,
                achievement: totalAchievement,
                winCount: storeStats.filter(s => s.cumAchievement >= 100).length,
                loseCount: storeStats.filter(s => s.cumAchievement < 100).length,
                
                // Landing KPIs
                totalBudget: totalBudgetGlobal,
                totalLanding,
                landingDiff: totalLanding - totalBudgetGlobal,
                landingAchievement: totalBudgetGlobal > 0 ? (totalLanding / totalBudgetGlobal) * 100 : 0,
                remainingBudget: totalBudgetGlobal - totalCumActual,
                requiredRunRate: (totalBudgetGlobal - totalCumActual) > 0 && (totalBudgetGlobal - totalCumBudget) > 0 
                    ? ((totalBudgetGlobal - totalCumActual) / (totalBudgetGlobal - totalCumBudget)) * 100 // Approximation
                    : 0,
                
                // Leaders KPIs
                totalSurplus,
                totalDeficit,
                heroCount: heroes.length,
                killerCount: killers.length,
                topStoreShare: heroes.length > 0 ? (heroes[0].landingDiff / totalSurplus) * 100 : 0
            }
        };

    }, [budgetData, allStores, fiscalMonths]);

    // --- Derived Data for Individual Tab ---
    const uniqueBlocks = useMemo(() => {
        if (!comparisonData) return [];
        const blocks = new Set<string>();
        comparisonData.storeStats.forEach(s => blocks.add(s.block));
        return Array.from(blocks).sort();
    }, [comparisonData]);

    const storesInBlock = useMemo(() => {
        if (!comparisonData) return [];
        let list = comparisonData.storeStats;
        if (selectedBlock) {
            list = list.filter(s => s.block === selectedBlock);
        }
        return list.map(s => s.storeName).sort();
    }, [comparisonData, selectedBlock]);

    const singleStoreData = useMemo(() => {
        if (!comparisonData || !selectedStoreName) return null;
        const stats = comparisonData.storeStats.find(s => s.storeName === selectedStoreName);
        if (!stats) return null;

        const monthlyData = stats.monthlyTrend.map(m => ({
            month: m.month,
            budget: m.budget,
            actual: m.type === 'actual' ? m.val : null,
            forecast: m.type === 'forecast' ? m.val : null,
            diff: m.diff,
            achievement: m.type === 'actual' && m.budget > 0 ? (m.val / m.budget) * 100 : null
        }));

        return {
            budgetItem: { block: stats.block, region: stats.region },
            summary: {
                cumAchievement: stats.cumAchievement,
                cumDiff: stats.cumDiff,
                cumBudget: stats.cumBudget,
                cumActual: stats.cumActual
            },
            monthlyData
        };
    }, [comparisonData, selectedStoreName]);

    // Initialize selection
    useEffect(() => {
        if (activeTab === 'individual' && !selectedStoreName && storesInBlock.length > 0) {
            setSelectedStoreName(storesInBlock[0]);
        }
    }, [activeTab, storesInBlock, selectedStoreName]);

    // --- Filtering & Sorting (Global) ---
    const filteredStores = useMemo(() => {
        if (!comparisonData) return [];
        let data = [...comparisonData.storeStats].filter(s => 
            s.storeName.toLowerCase().includes(filterText.toLowerCase()) || 
            s.block.toLowerCase().includes(filterText.toLowerCase())
        );
        data.sort((a, b) => {
            let valA: any = a[sortKey as keyof typeof a];
            let valB: any = b[sortKey as keyof typeof b];
            if (valA === undefined) valA = 0;
            if (valB === undefined) valB = 0;
            
            if (typeof valA === 'string') return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            return sortDesc ? (valB - valA) : (valA - valB);
        });
        return data;
    }, [comparisonData, filterText, sortKey, sortDesc]);

    const handleSort = (key: string) => {
        if (sortKey === key) setSortDesc(!sortDesc);
        else {
            setSortKey(key);
            setSortDesc(true);
        }
    };

    const SortIcon = ({ col }: { col: string }) => (
        <span className={`ml-1 text-[8px] ${sortKey === col ? 'text-[#005EB8]' : 'text-gray-300'}`}>
            {sortKey === col && !sortDesc ? '▲' : '▼'}
        </span>
    );

    // --- Renderers ---
    const renderKpiCard = (title: string, value: string, sub: string, colorClass: string, icon?: string) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${colorClass} flex flex-col justify-between h-full hover:shadow-md transition-shadow`}>
            <div>
                <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-widest flex items-center gap-1">
                    {icon && <i className={`fas ${icon}`}></i>} {title}
                </p>
                <div className="text-2xl font-black text-gray-800 font-display truncate">{value}</div>
            </div>
            <p className="text-[10px] text-gray-400 font-bold mt-2 truncate border-t border-gray-50 pt-1">{sub}</p>
        </div>
    );

    const ExpandButton = ({ id }: { id: string }) => (
        <button onClick={() => setExpandedChart(id)} className="absolute top-4 right-4 text-gray-300 hover:text-[#005EB8] transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
        </button>
    );

    if (!comparisonData) return <div className="p-20 text-center font-bold text-gray-400">Loading Analysis...</div>;

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-32">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">予実管理ダッシュボード</h2>
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-green-200">
                                {comparisonData.lastClosedMonth || "FY Start"}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200 overflow-x-auto">
                        <button onClick={() => setActiveTab('global')} className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === 'global' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>全社サマリ (Global)</button>
                        <button onClick={() => setActiveTab('landing')} className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === 'landing' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>着地予測 (Landing)</button>
                        <button onClick={() => setActiveTab('leaders')} className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === 'leaders' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>貢献序列 (Leaders)</button>
                        <button onClick={() => setActiveTab('individual')} className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === 'individual' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>店舗詳細 (Individual)</button>
                        <button onClick={() => setActiveTab('analysis')} className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>要因分析 (Analysis)</button>
                    </div>
                </div>

                {/* --- TAB: GLOBAL --- */}
                {activeTab === 'global' && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* 6 KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {renderKpiCard("全社達成率 (YTD)", `${comparisonData.summary.achievement.toFixed(1)}%`, "対累計予算", comparisonData.summary.achievement >= 100 ? "border-t-green-500" : "border-t-red-500")}
                            {renderKpiCard("予算乖離 (Diff)", `${comparisonData.summary.diff > 0 ? '+' : ''}${Math.round(comparisonData.summary.diff/displayDivider).toLocaleString()}${displayUnit}`, "YTD実績 - 予算", comparisonData.summary.diff >= 0 ? "border-t-green-500" : "border-t-red-500")}
                            {renderKpiCard("達成店舗数", `${comparisonData.summary.winCount} / ${comparisonData.storeStats.length}`, `Win Rate: ${(comparisonData.summary.winCount/comparisonData.storeStats.length*100).toFixed(0)}%`, "border-t-blue-500")}
                            {renderKpiCard("累計実績 (Actual)", `${Math.round(comparisonData.summary.totalCumActual/displayDivider).toLocaleString()}${displayUnit}`, "当月確定分まで", "border-t-purple-500")}
                            {renderKpiCard("累計予算 (Budget)", `${Math.round(comparisonData.summary.totalCumBudget/displayDivider).toLocaleString()}${displayUnit}`, "必達ライン", "border-t-gray-400")}
                            {renderKpiCard("進捗ステータス", comparisonData.summary.achievement >= 100 ? "On Track" : "Behind", "期末に向けたペース", comparisonData.summary.achievement >= 100 ? "border-t-green-600" : "border-t-orange-500")}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[450px] relative group">
                                <ExpandButton id="global_trend" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">月次予実推移 (Actual vs Budget)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={comparisonData.companyMonthly} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{fontSize: 9}} />
                                        <YAxis yAxisId="left" tick={{fontSize: 9}} />
                                        <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} unit="%" domain={[80, 120]} />
                                        <Tooltip />
                                        <Legend wrapperStyle={{fontSize: '10px'}} />
                                        <Bar yAxisId="left" dataKey="budget" name="予算" fill="#CBD5E1" barSize={20} radius={[4,4,0,0]} />
                                        <Bar yAxisId="left" dataKey="actual" name="実績" fill="#005EB8" barSize={20} radius={[4,4,0,0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="achievement" name="達成率" stroke="#F59E0B" strokeWidth={3} dot={{r:4}} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[450px] relative group">
                                <ExpandButton id="global_dist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">店舗別達成率分布</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={[{ range: '110%~', count: comparisonData.storeStats.filter(s => s.cumAchievement >= 110).length, fill: '#10B981' }, { range: '100~110%', count: comparisonData.storeStats.filter(s => s.cumAchievement >= 100 && s.cumAchievement < 110).length, fill: '#3B82F6' }, { range: '90~100%', count: comparisonData.storeStats.filter(s => s.cumAchievement >= 90 && s.cumAchievement < 100).length, fill: '#F59E0B' }, { range: '~90%', count: comparisonData.storeStats.filter(s => s.cumAchievement < 90).length, fill: '#EF4444' }]}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="range" type="category" tick={{fontSize: 10, fontWeight: 'bold'}} width={60} />
                                        <Tooltip cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={30}>
                                            <LabelList dataKey="count" position="right" fontSize={10} fontWeight="bold" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: LANDING --- */}
                {activeTab === 'landing' && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* 6 KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {renderKpiCard("期末着地見込", `${Math.round(comparisonData.summary.totalLanding/displayDivider).toLocaleString()}${displayUnit}`, "YTD実績 + 残期間予測", "border-t-blue-500")}
                            {renderKpiCard("最終予算乖離", `${comparisonData.summary.landingDiff > 0 ? '+' : ''}${Math.round(comparisonData.summary.landingDiff/displayDivider).toLocaleString()}${displayUnit}`, "着地見込 - 通期予算", comparisonData.summary.landingDiff >= 0 ? "border-t-green-500" : "border-t-red-500")}
                            {renderKpiCard("着地達成率", `${comparisonData.summary.landingAchievement.toFixed(1)}%`, "通期着地予想", comparisonData.summary.landingAchievement >= 100 ? "border-t-green-600" : "border-t-orange-500")}
                            {renderKpiCard("残予算 (Remaining)", `${Math.round(comparisonData.summary.remainingBudget/displayDivider).toLocaleString()}${displayUnit}`, "100%達成に必要な額", "border-t-gray-400")}
                            {renderKpiCard("必要達成ペース", `${comparisonData.summary.requiredRunRate.toFixed(1)}%`, "残期間に必要な平均達成率", "border-t-purple-500")}
                            {renderKpiCard("通期予算総額", `${Math.round(comparisonData.summary.totalBudget/displayDivider).toLocaleString()}${displayUnit}`, "期初設定ターゲット", "border-t-gray-300")}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* 1. Bridge Waterfall - Larger */}
                            <div className="lg:col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[450px] relative group">
                                <ExpandButton id="landing_bridge" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">着地見込ウォーターフォール (Landing Bridge)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData.bridgeData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" tick={{fontSize:10, fontWeight:'bold'}} />
                                        <YAxis tick={{fontSize:9}} />
                                        <Tooltip formatter={(v:number) => Math.round(v).toLocaleString()} />
                                        <ReferenceLine y={0} stroke="#000" />
                                        <Bar dataKey="val">
                                            {comparisonData.bridgeData.map((e,i) => (
                                                <Cell key={i} fill={e.type === 'total' || e.type === 'base' ? '#64748B' : e.val > 0 ? '#10B981' : '#EF4444'} />
                                            ))}
                                            <LabelList dataKey="val" position="top" fontSize={9} formatter={(v:number)=>Math.round(v/displayDivider).toLocaleString()} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 4. Probability - Smaller */}
                            <div className="lg:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[450px] relative group">
                                <ExpandButton id="landing_dist" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">店舗別着地達成率分布</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={(() => {
                                        const buckets = Array(10).fill(0); // 80% to 120% steps of 5%
                                        comparisonData.storeStats.forEach(s => {
                                            const ach = s.landingAchievement;
                                            if(ach < 80) buckets[0]++;
                                            else if(ach >= 120) buckets[9]++;
                                            else {
                                                const idx = Math.floor((ach - 80) / 5) + 1; // 80-85 -> idx 1
                                                if(idx > 0 && idx < 9) buckets[idx]++;
                                            }
                                        });
                                        return buckets.map((c, i) => ({ 
                                            range: i===0 ? '<80%' : i===9 ? '>120%' : `${80+(i-1)*5}-${80+i*5}%`, 
                                            count: c 
                                        }));
                                    })()}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="range" tick={{fontSize:8}} />
                                        <YAxis tick={{fontSize:9}} />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 2. Trajectory Chart - Wider */}
                            <div className="lg:col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[400px] relative group">
                                <ExpandButton id="landing_traj" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">通期着地軌道 (Landing Trajectory)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={comparisonData.companyMonthly}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{fontSize:9}} />
                                        <YAxis tick={{fontSize:9}} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} />
                                        <Legend wrapperStyle={{fontSize:'10px'}} />
                                        <Area type="monotone" dataKey="budget" stroke="#CBD5E1" fill="#F1F5F9" name="予算ライン" />
                                        <Line type="monotone" dataKey="actual" stroke="#005EB8" strokeWidth={3} dot={{r:4}} name="実績 (確定)" />
                                        <Line type="monotone" dataKey="forecast" stroke="#93C5FD" strokeWidth={2} strokeDasharray="5 5" dot={false} name="予測 (残期間)" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 3. Gap Trend - Narrower */}
                            <div className="lg:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[400px] relative group">
                                <ExpandButton id="landing_gap" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">月次ギャップ推移</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData.companyMonthly.map(m => ({ month: m.month, val: m.isActual ? (m.actual||0) - m.budget : (m.forecast||0) - m.budget, isForecast: !m.isActual }))}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{fontSize:9}} />
                                        <YAxis tick={{fontSize:9}} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} />
                                        <ReferenceLine y={0} stroke="#000" />
                                        <Bar dataKey="val">
                                            {comparisonData.companyMonthly.map((m, i) => (
                                                <Cell key={i} fill={m.isActual ? ((m.actual||0)-m.budget > 0 ? '#005EB8' : '#EF4444') : '#CBD5E1'} fillOpacity={m.isActual ? 1 : 0.5} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 5. Prediction List */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">着地予測詳細リスト (Landing Forecast)</h3>
                                <input type="text" placeholder="Search..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8]" />
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="bg-white sticky top-0 z-10 shadow-sm font-black text-gray-500 uppercase tracking-widest">
                                        <tr>
                                            <th className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('name')}>店舗名 <SortIcon col="name" /></th>
                                            <th className="p-4 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('landing')}>着地見込 <SortIcon col="landing" /></th>
                                            <th className="p-4 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('budget')}>通期予算 <SortIcon col="budget" /></th>
                                            <th className="p-4 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('landingDiff')}>最終乖離 <SortIcon col="landingDiff" /></th>
                                            <th className="p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort('landingAchievement')}>着地率 <SortIcon col="landingAchievement" /></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                        {filteredStores.map(s => (
                                            <tr key={s.storeName} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-4">{s.storeName}</td>
                                                <td className="p-4 text-right text-blue-600">{s.landing.toLocaleString()}</td>
                                                <td className="p-4 text-right text-gray-400">{s.totalBudget.toLocaleString()}</td>
                                                <td className={`p-4 text-right ${s.landingDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>{s.landingDiff > 0 ? '+' : ''}{s.landingDiff.toLocaleString()}</td>
                                                <td className="p-4 text-center"><span className={`px-2 py-1 rounded ${s.landingAchievement >= 100 ? 'bg-green-100 text-green-700' : s.landingAchievement >= 90 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{s.landingAchievement.toFixed(1)}%</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: LEADERS --- */}
                {activeTab === 'leaders' && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* 6 KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {renderKpiCard("貯金総額 (Surplus)", `+${Math.round(comparisonData.summary.totalSurplus/displayDivider).toLocaleString()}${displayUnit}`, "予算超過分の合計", "border-t-green-500")}
                            {renderKpiCard("借金総額 (Deficit)", `${Math.round(comparisonData.summary.totalDeficit/displayDivider).toLocaleString()}${displayUnit}`, "予算未達分の合計", "border-t-red-500")}
                            {renderKpiCard("Heroes (貢献店)", `${comparisonData.summary.heroCount}店`, "予算達成・貯金店", "border-t-blue-500")}
                            {renderKpiCard("Draggers (足枷店)", `${comparisonData.summary.killerCount}店`, "予算未達・借金店", "border-t-orange-500")}
                            {renderKpiCard("Top 1 依存度", `${comparisonData.summary.topStoreShare.toFixed(1)}%`, "最大貢献店のシェア", "border-t-purple-500")}
                            {renderKpiCard("Net Impact", `${(comparisonData.summary.totalSurplus + comparisonData.summary.totalDeficit) > 0 ? '+' : ''}${Math.round((comparisonData.summary.totalSurplus + comparisonData.summary.totalDeficit)/displayDivider).toLocaleString()}${displayUnit}`, "純増減額", "border-t-gray-800")}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* 1. Heroes vs Killers Scatter - Larger */}
                            <div className="lg:col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[500px] relative group">
                                <ExpandButton id="leaders_scatter" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">貢献度マップ (Achievement % vs Amount)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" dataKey="landingAchievement" name="達成率" unit="%" tick={{fontSize:9}} label={{value:'達成率', position:'bottom', fontSize:9}} domain={['auto', 'auto']} />
                                        <YAxis type="number" dataKey="landingDiff" name="貢献額" tick={{fontSize:9}} label={{value:'貢献額 (Gap)', angle:-90, position:'left', fontSize:9}} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v:any, n:string) => n==='貢献額' ? Math.round(v).toLocaleString() : v} />
                                        <ReferenceLine y={0} stroke="#000" />
                                        <ReferenceLine x={100} stroke="#000" />
                                        <Scatter name="Stores" data={comparisonData.storeStats} fill="#8884d8">
                                            {comparisonData.storeStats.map((entry, index) => (
                                                <Cell key={index} fill={entry.landingDiff >= 0 ? '#10B981' : '#EF4444'} fillOpacity={0.6} />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 4. Contribution Treemap - Compact */}
                            <div className="lg:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[500px] relative group">
                                <ExpandButton id="leaders_treemap" />
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">予算規模 × 貢献度マップ</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <Treemap 
                                        data={comparisonData.storeStats.map(s => ({ name: s.storeName, size: s.totalBudget, diff: s.landingDiff }))} 
                                        dataKey="size" 
                                        aspectRatio={4/3} 
                                        stroke="#fff" 
                                        content={(props: any) => {
                                            const { root, depth, x, y, width, height, index, name, diff } = props;
                                            return (
                                                <g>
                                                    <rect x={x} y={y} width={width} height={height} style={{ fill: diff >= 0 ? '#10B981' : '#EF4444', stroke: '#fff', strokeWidth: 2, fillOpacity: 0.8 }} />
                                                    {width > 30 && height > 20 && (
                                                        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold">
                                                            {name}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        }}
                                    >
                                        <Tooltip />
                                    </Treemap>
                                </ResponsiveContainer>
                            </div>

                            {/* 2. Top 10 Heroes Bar */}
                            <div className="lg:col-span-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[500px] relative group">
                                <ExpandButton id="leaders_top10" />
                                <h3 className="text-xs font-black text-green-600 uppercase tracking-widest mb-4 font-display">Top 10 Heroes (貯金貢献ランキング)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData.heroes.slice(0, 10)} layout="vertical" margin={{left:20}}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="storeName" type="category" width={100} tick={{fontSize:9, fontWeight:'bold'}} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} />
                                        <Bar dataKey="landingDiff" fill="#10B981" radius={[0,4,4,0]}>
                                            <LabelList dataKey="landingDiff" position="right" fontSize={9} formatter={(v:number)=>Math.round(v/displayDivider).toLocaleString()} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 3. Bottom 10 Killers Bar */}
                            <div className="lg:col-span-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[500px] relative group">
                                <ExpandButton id="leaders_bottom10" />
                                <h3 className="text-xs font-black text-red-500 uppercase tracking-widest mb-4 font-display">Worst 10 Drag (借金要因ランキング)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData.killers.slice(0, 10)} layout="vertical" margin={{left:20}}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="storeName" type="category" width={100} tick={{fontSize:9, fontWeight:'bold'}} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} />
                                        <Bar dataKey="landingDiff" fill="#EF4444" radius={[4,0,0,4]}>
                                            <LabelList dataKey="landingDiff" position="left" fontSize={9} formatter={(v:number)=>Math.round(v/displayDivider).toLocaleString()} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 5. Full Leaderboard */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">全店舗 貢献度ランキング</h3>
                                <input type="text" placeholder="Search..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8]" />
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="bg-white sticky top-0 z-10 shadow-sm font-black text-gray-500 uppercase tracking-widest">
                                        <tr>
                                            <th className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('name')}>店舗名 <SortIcon col="name" /></th>
                                            <th className="p-4 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('landingDiff')}>貢献額 (Gap) <SortIcon col="landingDiff" /></th>
                                            <th className="p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort('landingAchievement')}>達成率 <SortIcon col="landingAchievement" /></th>
                                            <th className="p-4 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('totalBudget')}>予算規模 <SortIcon col="totalBudget" /></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                        {filteredStores.map(s => (
                                            <tr key={s.storeName} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-4">{s.storeName}</td>
                                                <td className={`p-4 text-right ${s.landingDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{s.landingDiff > 0 ? '+' : ''}{s.landingDiff.toLocaleString()}</td>
                                                <td className="p-4 text-center"><span className={`px-2 py-1 rounded ${s.landingAchievement >= 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.landingAchievement.toFixed(1)}%</span></td>
                                                <td className="p-4 text-right text-gray-400">{s.totalBudget.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'analysis' && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Modified Layout: Stacked for better visibility of large datasets */}
                        
                        {/* 1. Waterfall - Extended Height for 600+ stores */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[2000px] flex flex-col relative group">
                            <ExpandButton id="analysis_waterfall" />
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">YTD 予算差異要因分析 (Waterfall) - 全店舗</h3>
                            <div className="flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData.waterfallData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} barCategoryGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" orientation="top" tick={{fontSize: 9}} />
                                        <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 9, fontWeight: 'bold'}} interval={0} />
                                        <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} />
                                        <ReferenceLine x={0} stroke="#000" />
                                        <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                                            {comparisonData.waterfallData.map((entry, index) => <Cell key={index} fill={entry.val > 0 ? '#10B981' : '#EF4444'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        
                        {/* 2. Scatter Map */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[600px] flex flex-col relative group">
                            <ExpandButton id="analysis_scatter" />
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">予算規模 vs 達成率マップ</h3>
                            <div className="flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis type="number" dataKey="cumBudget" name="予算規模" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '予算規模', position: 'bottom', fontSize: 9 }} />
                                        <YAxis type="number" dataKey="cumAchievement" name="達成率" unit="%" tick={{fontSize: 9}} label={{ value: '達成率', angle: -90, position: 'left', fontSize: 9 }} domain={['auto', 'auto']} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                        <ReferenceLine y={100} stroke="#10B981" strokeDasharray="3 3" label={{ value: 'Target', position: 'insideTopLeft', fontSize: 9, fill: '#10B981' }} />
                                        <Scatter name="Stores" data={comparisonData.storeStats} fill="#005EB8" fillOpacity={0.6} />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'individual' && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[800px] animate-fadeIn">
                        {/* Same Individual Content as before */}
                        <div className="lg:col-span-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">ブロック選択</h4>
                                <select 
                                    value={selectedBlock} 
                                    onChange={(e) => setSelectedBlock(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8] mb-4"
                                >
                                    {uniqueBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">店舗リスト ({storesInBlock.length})</h4>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {storesInBlock.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => setSelectedStoreName(name)}
                                        className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${selectedStoreName === name ? 'bg-blue-50 text-[#005EB8] shadow-sm' : 'hover:bg-gray-50 text-gray-600'}`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                            {singleStoreData ? (
                                <>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <h3 className="text-2xl font-black text-gray-800 font-display">{selectedStoreName}</h3>
                                            <p className="text-xs text-gray-400 font-bold">{singleStoreData.budgetItem.block} / {singleStoreData.budgetItem.region}</p>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm text-center">
                                                <div className="text-[9px] text-gray-400 font-black uppercase">累計達成率</div>
                                                <div className={`text-xl font-black ${singleStoreData.summary.cumAchievement >= 100 ? 'text-green-500' : 'text-red-500'}`}>{singleStoreData.summary.cumAchievement.toFixed(1)}%</div>
                                            </div>
                                            <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm text-center">
                                                <div className="text-[9px] text-gray-400 font-black uppercase">累計差異</div>
                                                <div className={`text-xl font-black ${singleStoreData.summary.cumDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>{singleStoreData.summary.cumDiff > 0 ? '+' : ''}{singleStoreData.summary.cumDiff.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">月次予実推移</h4>
                                        <div className="flex-1">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={singleStoreData.monthlyData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="month" tick={{fontSize: 9}} />
                                                    <YAxis yAxisId="left" tick={{fontSize: 9}} />
                                                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} unit="%" domain={[80, 120]} />
                                                    <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                                    <Legend wrapperStyle={{fontSize: '10px'}} />
                                                    <Bar yAxisId="left" dataKey="budget" name="予算" fill="#CBD5E1" barSize={20} radius={[4,4,0,0]} />
                                                    <Bar yAxisId="left" dataKey="actual" name="実績" fill="#005EB8" barSize={20} radius={[4,4,0,0]} />
                                                    <Line yAxisId="right" type="monotone" dataKey="achievement" name="達成率" stroke="#F59E0B" strokeWidth={3} dot={{r:4}} connectNulls />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">月次詳細データ</h4>
                                        </div>
                                        <table className="min-w-full text-center text-xs">
                                            <thead className="bg-white font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                                <tr>
                                                    <th className="p-3 text-left">Month</th>
                                                    <th className="p-3">予算</th>
                                                    <th className="p-3 text-[#005EB8]">実績</th>
                                                    <th className="p-3">差異</th>
                                                    <th className="p-3">達成率</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                                {singleStoreData.monthlyData.map((row) => (
                                                    <tr key={row.month} className="hover:bg-gray-50">
                                                        <td className="p-3 text-left font-black">{row.month}</td>
                                                        <td className="p-3 text-gray-400">{row.budget.toLocaleString()}</td>
                                                        <td className="p-3 text-[#005EB8]">{row.actual !== null ? row.actual.toLocaleString() : '-'}</td>
                                                        <td className={`p-3 ${(row.diff || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {row.diff !== null ? (row.diff > 0 ? '+' : '') + row.diff.toLocaleString() : '-'}
                                                        </td>
                                                        <td className="p-3">
                                                            {row.achievement !== null ? (
                                                                <span className={`px-2 py-1 rounded ${row.achievement >= 100 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                                    {row.achievement.toFixed(1)}%
                                                                </span>
                                                            ) : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-100 border-t-2 border-gray-200">
                                                    <td className="p-3 text-left font-black text-gray-800">TOTAL (YTD)</td>
                                                    <td className="p-3 text-gray-500">{singleStoreData.summary.cumBudget.toLocaleString()}</td>
                                                    <td className="p-3 text-[#005EB8] font-black text-lg">{singleStoreData.summary.cumActual.toLocaleString()}</td>
                                                    <td className={`p-3 font-black ${singleStoreData.summary.cumDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {singleStoreData.summary.cumDiff > 0 ? '+' : ''}{singleStoreData.summary.cumDiff.toLocaleString()}
                                                    </td>
                                                    <td className="p-3 font-black">{singleStoreData.summary.cumAchievement.toFixed(1)}%</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-300 font-bold uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-3xl">
                                    Select a store from the sidebar
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Expanded Chart Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm animate-fadeIn flex flex-col p-4 md:p-10">
                    <div className="flex justify-between items-center mb-8 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display">拡大表示分析</h2>
                        <button onClick={() => setExpandedChart(null)} className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-all">
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div className="flex-1 bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 overflow-auto relative">
                        {/* Rendering logic repeated for simplicity, ideally componentized */}
                        {expandedChart === 'landing_bridge' && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonData.bridgeData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{fontSize:10, fontWeight:'bold'}} />
                                    <YAxis tick={{fontSize:9}} />
                                    <Tooltip formatter={(v:number) => Math.round(v).toLocaleString()} />
                                    <ReferenceLine y={0} stroke="#000" />
                                    <Bar dataKey="val">
                                        {comparisonData.bridgeData.map((e,i) => (
                                            <Cell key={i} fill={e.type === 'total' || e.type === 'base' ? '#64748B' : e.val > 0 ? '#10B981' : '#EF4444'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                        {expandedChart === 'analysis_waterfall' && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonData.waterfallData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" orientation="top" />
                                    <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 9, fontWeight: 'bold'}} interval={0} />
                                    <Tooltip formatter={(val: number) => val.toLocaleString()} />
                                    <ReferenceLine x={0} stroke="#000" />
                                    <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                                        {comparisonData.waterfallData.map((entry, index) => <Cell key={index} fill={entry.val > 0 ? '#10B981' : '#EF4444'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                        {expandedChart === 'analysis_scatter' && (
                             <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" dataKey="cumBudget" name="予算規模" unit={unitLabel} />
                                    <YAxis type="number" dataKey="cumAchievement" name="達成率" unit="%" />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                    <ReferenceLine y={100} stroke="#10B981" strokeDasharray="3 3" />
                                    <Scatter name="Stores" data={comparisonData.storeStats} fill="#005EB8" fillOpacity={0.6} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        )}
                        {/* ... add other expanded charts similarly if needed ... */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetComparisonView;
