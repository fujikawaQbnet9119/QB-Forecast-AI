
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
    ComposedChart, Line, Area, Brush, LabelList, Legend, PieChart, Pie, ScatterChart, Scatter
} from 'recharts';

interface BudgetBuilderViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type SortKey = 'name' | 'block' | 'lastYearTotal' | 'forecastTotal' | 'stretch' | 'budgetTotal' | 'yoy';
type ScenarioType = 'conservative' | 'standard' | 'optimistic';

const BudgetBuilderView: React.FC<BudgetBuilderViewProps> = ({ allStores, dataType }) => {
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    const displayDivider = isSales ? 1000 : 1;
    const displayUnit = isSales ? 'M' : '人';

    // --- State ---
    const [activeTab, setActiveTab] = useState<'global' | 'individual' | 'risk'>('global');
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [globalStretch, setGlobalStretch] = useState<number>(105); 
    const [individualStretch, setIndividualStretch] = useState<Record<string, number>>({});
    const [manualOverrides, setManualOverrides] = useState<Record<string, Record<string, number>>>({}); 
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedBlock, setSelectedBlock] = useState<string>("");
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'budgetTotal', direction: 'desc' });
    const [conflictModal, setConflictModal] = useState<{ isOpen: boolean; storeName: string; targetValue: number } | null>(null);

    const [targetYear, setTargetYear] = useState<number>(() => {
        const today = new Date();
        return today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();
    });

    // Fiscal Year Info (July to June)
    const fiscalYearInfo = useMemo(() => {
        const endYear = targetYear;
        const startYear = endYear - 1;
        const dates: string[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(startYear, 6 + i, 1);
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return { label: `${endYear}年6月期`, dates, startYear, endYear };
    }, [targetYear]);

    // Data Aggregation
    const budgetData = useMemo(() => {
        const activeStores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && !s.error);
        
        return activeStores.map(s => {
            const forecastMonthly: number[] = [];
            const lastRawIdx = s.raw.length - 1;
            const lastDateObj = new Date(s.dates[lastRawIdx]?.replace(/\//g, '-') || new Date());
            
            fiscalYearInfo.dates.forEach(fyDate => {
                const targetDate = new Date(fyDate + '-01');
                const diffMonths = (targetDate.getFullYear() - lastDateObj.getFullYear()) * 12 + (targetDate.getMonth() - lastDateObj.getMonth());
                const futureIdx = lastRawIdx + diffMonths;
                const tr = logisticModel(futureIdx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const sea = s.seasonal[targetDate.getMonth()] || 1.0;
                const nudge = s.nudge || 0; // Persistent nudge
                const val = Math.max(0, (tr + nudge) * sea);
                forecastMonthly.push(Math.round(val));
            });

            const hasIndividual = individualStretch.hasOwnProperty(s.name);
            const storeStretch = hasIndividual ? individualStretch[s.name] : globalStretch;
            
            const budgetMonthly = forecastMonthly.map((fVal, idx) => {
                const monthKey = fiscalYearInfo.dates[idx];
                if (manualOverrides[s.name]?.[monthKey] !== undefined) return manualOverrides[s.name][monthKey];
                return Math.round(fVal * (storeStretch / 100));
            });

            let lastYearTotal = 0;
            const lastYearMonthly: (number | null)[] = fiscalYearInfo.dates.map(fyDate => {
                const dObj = new Date(fyDate + '-01');
                dObj.setFullYear(dObj.getFullYear() - 1);
                const lyStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}`;
                const idx = s.dates.findIndex(d => d.replace(/\//g, '-') === lyStr);
                if (idx !== -1) {
                    const v = s.raw[idx];
                    lastYearTotal += v;
                    return v;
                }
                return null;
            });

            const budgetTotal = budgetMonthly.reduce((a, b) => a + b, 0);
            return {
                name: s.name, block: s.block || "未分類", region: s.region || "未分類",
                lastYearTotal, lastYearMonthly,
                forecastTotal: forecastMonthly.reduce((a, b) => a + b, 0),
                budgetTotal, budgetMonthly, forecastMonthly,
                stretch: storeStretch,
                yoy: lastYearTotal > 0 ? ((budgetTotal - lastYearTotal) / lastYearTotal) * 100 : 0,
                stdDev: s.stdDev,
                hasManualOverrides: !!manualOverrides[s.name] && Object.keys(manualOverrides[s.name]).length > 0
            };
        });
    }, [allStores, globalStretch, individualStretch, manualOverrides, fiscalYearInfo]);

    const filteredData = useMemo(() => {
        let data = budgetData.filter(d => 
            d.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
            (selectedBlock ? d.block === selectedBlock : true)
        );
        data.sort((a, b) => {
            const vA = a[sortConfig.key], vB = b[sortConfig.key];
            if (typeof vA === 'string') return sortConfig.direction === 'asc' ? vA.localeCompare(vB as string) : (vB as string).localeCompare(vA);
            return sortConfig.direction === 'asc' ? (vA as number) - (vB as number) : (vB as number) - (vA as number);
        });
        return data;
    }, [budgetData, searchTerm, selectedBlock, sortConfig]);

    const summary = useMemo(() => {
        const totalLastYear = filteredData.reduce((a, b) => a + b.lastYearTotal, 0);
        const totalBudget = filteredData.reduce((a, b) => a + b.budgetTotal, 0);
        return {
            count: filteredData.length,
            totalLastYear,
            totalBudget,
            yoy: totalLastYear > 0 ? ((totalBudget - totalLastYear) / totalLastYear) * 100 : 0
        };
    }, [filteredData]);

    // Risk Simulation (Monte Carlo)
    const riskSimulation = useMemo(() => {
        if (activeTab !== 'risk' || filteredData.length === 0) return null;
        const trials = 1000;
        const landingTotals: number[] = [];
        const storeCount = filteredData.length;

        for (let i = 0; i < trials; i++) {
            let trialTotal = 0;
            filteredData.forEach(s => {
                // Simulate 12 months for each store
                let storeTrial = 0;
                s.budgetMonthly.forEach(b => {
                    const noise = (Math.random() * 2 - 1) * s.stdDev * 1.5; // Roughly Gaussian
                    storeTrial += Math.max(0, b + noise);
                });
                trialTotal += storeTrial;
            });
            landingTotals.push(trialTotal);
        }
        landingTotals.sort((a, b) => a - b);
        const p50 = landingTotals[Math.floor(trials * 0.5)];
        const p05 = landingTotals[Math.floor(trials * 0.05)];
        const p95 = landingTotals[Math.floor(trials * 0.95)];
        const winProb = (landingTotals.filter(v => v >= summary.totalBudget).length / trials) * 100;

        const histogram = Array(10).fill(0).map((_, i) => {
            const min = landingTotals[0], max = landingTotals[trials-1];
            const step = (max - min) / 10;
            const threshold = min + step * i;
            return { bin: `${Math.round(threshold/displayDivider)}k`, count: landingTotals.filter(v => v >= threshold && v < threshold + step).length };
        });

        return { p50, p05, p95, winProb, histogram };
    }, [filteredData, summary.totalBudget, activeTab]);

    const currentStore = budgetData.find(d => d.name === selectedStoreId);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const handleManualOverride = (storeName: string, monthKey: string, val: number) => {
        setManualOverrides(prev => ({
            ...prev,
            [storeName]: { ...(prev[storeName] || {}), [monthKey]: val }
        }));
    };

    const handleDownloadCSV = () => {
        const headers = ["店舗名", "ブロック", "昨期合計", "今期予算合計", "昨対比", ...fiscalYearInfo.dates];
        const csv = [
            headers.join(","),
            ...filteredData.map(d => [
                d.name, d.block, d.lastYearTotal, d.budgetTotal, `${d.yoy.toFixed(1)}%`, ...d.budgetMonthly
            ].join(","))
        ].join("\n");
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `budget_plan_${fiscalYearInfo.label}.csv`;
        link.click();
    };

    const handleDownloadForecastCSV = () => {
        const headers = ["店舗名", "ブロック", "都道府県", ...fiscalYearInfo.dates];
        const csv = [
            headers.join(","),
            ...filteredData.map(d => [
                d.name,
                d.block,
                d.region,
                ...d.forecastMonthly // AI Forecast Values
            ].join(","))
        ].join("\n");
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ai_forecast_raw_${fiscalYearInfo.label}.csv`;
        link.click();
    };

    const KpiCard = ({ title, value, sub, color = "border-t-[#005EB8]" }: any) => (
        <div className={`bg-white p-5 rounded-3xl shadow-sm border border-gray-100 border-t-4 ${color} flex flex-col justify-between hover:shadow-md transition-shadow`}>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{title}</p>
            <div className="text-2xl font-black text-gray-800 font-display">{value}</div>
            <p className="text-[10px] text-gray-400 font-bold mt-2 border-t border-gray-50 pt-2">{sub}</p>
        </div>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1500px] mx-auto space-y-6 pb-32">
                
                {/* Header */}
                <div className="flex flex-col xl:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            予算策定シミュレーター
                            <span className="text-xs bg-orange-100 text-orange-600 px-3 py-1 rounded-md border border-orange-200 font-black tracking-widest">{fiscalYearInfo.label}</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">AI-Powered Top-Down & Bottom-Up Budgeting</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                            <button onClick={() => setActiveTab('global')} className={`px-6 py-2 rounded-full text-xs font-black transition-all ${activeTab === 'global' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400'}`}>全社配分</button>
                            <button onClick={() => setActiveTab('individual')} className={`px-6 py-2 rounded-full text-xs font-black transition-all ${activeTab === 'individual' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400'}`}>店舗別精査</button>
                            <button onClick={() => setActiveTab('risk')} className={`px-6 py-2 rounded-full text-xs font-black transition-all ${activeTab === 'risk' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400'}`}>リスク診断</button>
                        </div>
                        <div className="flex gap-2 ml-4">
                            <button onClick={handleDownloadForecastCSV} className="bg-white text-[#005EB8] border border-[#005EB8] px-4 py-2 rounded-xl text-xs font-black shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
                                <i className="fas fa-robot"></i> AI予測のみ出力
                            </button>
                            <button onClick={handleDownloadCSV} className="bg-[#005EB8] text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg hover:bg-[#004a94] transition-all flex items-center gap-2">
                                <i className="fas fa-file-csv"></i> 予算案出力
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPIs Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard title="策定予算総額" value={`${Math.round(summary.totalBudget / displayDivider).toLocaleString()}${displayUnit}`} sub={`${summary.count}店舗合計`} color="border-t-blue-600" />
                    <KpiCard title="前年比 (YoY)" value={`${summary.yoy.toFixed(1)}%`} sub={`前年実績: ${Math.round(summary.totalLastYear/displayDivider).toLocaleString()}${displayUnit}`} color={summary.yoy >= 100 ? "border-t-green-500" : "border-t-orange-500"} />
                    <KpiCard title="ストレッチ総額" value={`+${Math.round((summary.totalBudget - summary.totalLastYear)/displayDivider).toLocaleString()}${displayUnit}`} sub="前年からの増分" color="border-t-purple-500" />
                    <KpiCard title="達成見込 (Prob)" value={riskSimulation ? `${riskSimulation.winProb.toFixed(0)}%` : "---"} sub="予算達成の確率" color="border-t-pink-500" />
                </div>

                {/* Tab: GLOBAL */}
                {activeTab === 'global' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
                        <div className="lg:col-span-4 space-y-6">
                            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">全社一括ストレッチ設定</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <label className="text-sm font-black text-gray-700">AI予測比 (%)</label>
                                        <span className="text-3xl font-black text-[#005EB8]">{globalStretch}%</span>
                                    </div>
                                    <input type="range" min="80" max="150" value={globalStretch} onChange={e => setGlobalStretch(Number(e.target.value))} className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#005EB8]" />
                                    <p className="text-[10px] text-gray-400 font-bold leading-relaxed">※AI予測をベースに一律で係数を乗算します。既に店舗別で個別設定されている場合は、そちらが優先されるか確認モーダルが表示されます。</p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 h-[400px]">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">ブロック別 予算構成</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={(() => {
                                            const m = new Map<string, number>();
                                            budgetData.forEach(d => m.set(d.block, (m.get(d.block) || 0) + d.budgetTotal));
                                            return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
                                        })()} innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>
                                            {budgetData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="lg:col-span-8 bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col h-[700px]">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                                <div className="flex gap-4">
                                    <input type="text" placeholder="店舗検索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none w-48" />
                                    <select value={selectedBlock} onChange={e => setSelectedBlock(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none">
                                        <option value="">全てのブロック</option>
                                        {Array.from(new Set(budgetData.map(d => d.block))).sort().map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="bg-white sticky top-0 font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                        <tr>
                                            <th className="p-4">店舗名</th>
                                            <th className="p-4 text-right cursor-pointer" onClick={() => handleSort('budgetTotal')}>今期予算 <SortIcon field="budgetTotal" /></th>
                                            <th className="p-4 text-right cursor-pointer" onClick={() => handleSort('yoy')}>昨対比 <SortIcon field="yoy" /></th>
                                            <th className="p-4 text-center cursor-pointer" onClick={() => handleSort('stretch')}>AI比 <SortIcon field="stretch" /></th>
                                            <th className="p-4">備考</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                        {filteredData.map(d => (
                                            <tr key={d.name} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-4">{d.name}</td>
                                                <td className="p-4 text-right">{Math.round(d.budgetTotal).toLocaleString()}</td>
                                                <td className={`p-4 text-right ${d.yoy >= 100 ? 'text-green-500' : 'text-red-500'}`}>{d.yoy.toFixed(1)}%</td>
                                                <td className="p-4 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded text-[10px]">{d.stretch}%</span></td>
                                                <td className="p-4 text-[10px] text-gray-400">{d.hasManualOverrides ? '手入力あり' : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: INDIVIDUAL */}
                {activeTab === 'individual' && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[800px] animate-fadeIn">
                        <div className="lg:col-span-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b border-gray-100">
                                <input type="text" placeholder="店舗検索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {filteredData.map(d => (
                                    <button key={d.name} onClick={() => setSelectedStoreId(d.name)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${selectedStoreId === d.name ? 'bg-blue-50 text-[#005EB8] border-l-4 border-[#005EB8]' : 'text-gray-500 hover:bg-gray-50'}`}>{d.name}</button>
                                ))}
                            </div>
                        </div>
                        <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                            {currentStore ? (
                                <>
                                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col gap-8">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-2xl font-black text-gray-800 font-display">{currentStore.name}</h3>
                                            <div className="bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 text-center">
                                                <div className="text-[10px] font-black text-blue-400 uppercase">店舗個別ストレッチ率</div>
                                                <div className="flex items-center gap-3">
                                                    <input type="range" min="80" max="150" value={currentStore.stretch} onChange={e => setIndividualStretch({...individualStretch, [currentStore.name]: Number(e.target.value)})} className="w-32 h-1.5 accent-[#005EB8]" />
                                                    <span className="text-lg font-black text-[#005EB8]">{currentStore.stretch}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-center text-[11px] border-collapse">
                                                <thead>
                                                    <tr className="text-gray-400 font-black uppercase tracking-widest border-b border-gray-100">
                                                        <th className="p-2 text-left">月度 (Month)</th>
                                                        {fiscalYearInfo.dates.map(d => <th key={d} className="p-2">{d.split('-')[1]}月</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    <tr>
                                                        <td className="p-3 text-left font-bold text-gray-400">昨期実績</td>
                                                        {currentStore.lastYearMonthly.map((v, i) => <td key={i} className="p-3 text-gray-400">{v ? Math.round(v).toLocaleString() : '-'}</td>)}
                                                    </tr>
                                                    <tr>
                                                        <td className="p-3 text-left font-bold text-blue-400">AI予測</td>
                                                        {currentStore.forecastMonthly.map((v, i) => <td key={i} className="p-3 text-blue-400">{Math.round(v).toLocaleString()}</td>)}
                                                    </tr>
                                                    <tr className="bg-blue-50/50 font-black">
                                                        <td className="p-3 text-left text-[#005EB8]">今期予算 (Edit)</td>
                                                        {currentStore.budgetMonthly.map((v, i) => (
                                                            <td key={i} className="p-1">
                                                                <input 
                                                                    type="number" value={v} 
                                                                    onChange={e => handleManualOverride(currentStore.name, fiscalYearInfo.dates[i], Number(e.target.value))}
                                                                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-center text-[#005EB8] outline-none focus:ring-2 focus:ring-[#005EB8]"
                                                                />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 h-[400px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={fiscalYearInfo.dates.map((d, i) => ({ month: d, budget: currentStore.budgetMonthly[i], forecast: currentStore.forecastMonthly[i], lastYear: currentStore.lastYearMonthly[i] }))}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="month" tick={{fontSize:9}} />
                                                <YAxis tick={{fontSize:9}} />
                                                <Tooltip />
                                                <Bar dataKey="lastYear" name="昨期実績" fill="#CBD5E1" barSize={15} />
                                                <Line type="monotone" dataKey="forecast" name="AI予測" stroke="#93C5FD" strokeDasharray="5 5" />
                                                <Line type="monotone" dataKey="budget" name="今期予算" stroke="#005EB8" strokeWidth={3} dot={{r:4}} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase border-2 border-dashed border-gray-100 rounded-[2rem]">Select store to edit</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Tab: RISK */}
                {activeTab === 'risk' && riskSimulation && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 h-[500px] flex flex-col">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">達成確率シミュレーション (Monte Carlo)</h3>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={riskSimulation.histogram}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="bin" tick={{fontSize:9}} label={{value:'着地予想', position:'bottom', fontSize:9}} />
                                            <YAxis hide />
                                            <Tooltip />
                                            <ReferenceLine x={Math.round(summary.totalBudget/displayDivider).toString()+'k'} stroke="#EF4444" strokeWidth={2} label={{value:'BUDGET', position:'top', fill:'#EF4444', fontSize:10}} />
                                            <Bar dataKey="count" fill="#3B82F6" radius={[4,4,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col justify-center gap-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-10 opacity-10"><i className="fas fa-dice text-[150px]"></i></div>
                                <div>
                                    <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4">Risk Assessment Result</p>
                                    <div className="flex items-baseline gap-4">
                                        <h4 className="text-7xl font-black font-display tracking-tight">{riskSimulation.winProb.toFixed(1)}%</h4>
                                        <span className="text-xl font-bold text-gray-400">Probability of Success</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
                                    <div><p className="text-[9px] text-gray-500 uppercase font-black mb-1">Downside (5%)</p><p className="text-lg font-black">{Math.round(riskSimulation.p05/displayDivider).toLocaleString()}k</p></div>
                                    <div><p className="text-[9px] text-gray-500 uppercase font-black mb-1">Expected (Mean)</p><p className="text-lg font-black text-blue-400">{Math.round(riskSimulation.p50/displayDivider).toLocaleString()}k</p></div>
                                    <div><p className="text-[9px] text-gray-500 uppercase font-black mb-1">Upside (95%)</p><p className="text-lg font-black">{Math.round(riskSimulation.p95/displayDivider).toLocaleString()}k</p></div>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-relaxed italic">※このシミュレーションは各店舗の過去のボラティリティに基づき、1,000パターンの将来を試行した結果です。達成率が50%を下回る場合は、予算設定が「極めて強気」であることを示唆します。</p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }`}} />
        </div>
    );
};

const COLORS = ['#005EB8', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
const SortIcon = ({ field }: { field: string }) => <span className="ml-1 opacity-50">⇅</span>;

export default BudgetBuilderView;
