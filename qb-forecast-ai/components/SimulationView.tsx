
import React, { useState, useMemo, useEffect } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Area,
    Bar, Cell, BarChart, ReferenceLine
} from 'recharts';

interface SimulationViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type ScenarioType = 'conservative' | 'standard' | 'optimistic';

interface ScenarioParams {
    base: number;
    L: number;
    k: number;
}

const SimulationView: React.FC<SimulationViewProps> = ({ allStores, dataType }) => {
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上' : '客数';
    const displayUnit = isSales ? 'k' : '人';
    const valueDivider = isSales ? 1000 : 1;

    // --- State ---
    const [openDate, setOpenDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Selection & Config
    const [selectedRefStores, setSelectedRefStores] = useState<string[]>([]);
    const [cannibalStores, setCannibalStores] = useState<{ id: string, impact: number }[]>([]);
    const [graphMode, setGraphMode] = useState<'gross' | 'net'>('net');
    const [refSearchTerm, setRefSearchTerm] = useState("");
    const [initialInvestment, setInitialInvestment] = useState<number>(30000); // 30M (in k unit)

    // Scenarios State
    const [params, setParams] = useState<Record<ScenarioType, ScenarioParams>>({
        conservative: { base: 0, L: 2500, k: 0.08 },
        standard: { base: 0, L: 3000, k: 0.1 },
        optimistic: { base: 0, L: 3500, k: 0.12 }
    });

    // --- Calculations ---
    
    // Filter valid stores for reference
    const eligibleStores = useMemo(() => (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.raw.length > 12), [allStores]);

    // Calculate Reference Stats (Ghost Lines & Auto-params)
    const refStats = useMemo(() => {
        if (selectedRefStores.length === 0) return null;
        
        const targets = selectedRefStores.map(id => allStores[id]).filter(Boolean);
        if (targets.length === 0) return null;

        // Averages for auto-fill
        const avgL = targets.reduce((a, s) => a + s.params.L, 0) / targets.length;
        const avgK = targets.reduce((a, s) => a + s.params.k, 0) / targets.length;
        const avgBase = targets.reduce((a, s) => a + (s.params.base || 0), 0) / targets.length;
        
        // StdDev for range estimation
        const stdL = Math.sqrt(targets.reduce((a, s) => a + Math.pow(s.params.L - avgL, 2), 0) / targets.length);
        const stdK = Math.sqrt(targets.reduce((a, s) => a + Math.pow(s.params.k - avgK, 2), 0) / targets.length);

        // Seasonality averaging
        const avgSeasonality = Array(12).fill(0).map((_, i) => {
            return targets.reduce((a, s) => a + (s.seasonal[i] || 1.0), 0) / targets.length;
        });

        // Ghost Lines Data (Vintage aligned)
        const maxLen = 36;
        const ghostLines = targets.map(s => {
            return s.raw.slice(0, maxLen).map((val, i) => ({ month: i, val }));
        });

        return { avgL, avgK, avgBase, stdL, stdK, avgSeasonality, ghostLines };
    }, [selectedRefStores, allStores]);

    // Auto-populate params when refStats change (only if user hasn't manually heavily edited, 
    // but here we just auto-update for UX smoothness in this demo. In prod, maybe add a "Apply" button)
    useEffect(() => {
        if (refStats) {
            setParams({
                standard: {
                    base: Math.round(refStats.avgBase),
                    L: Math.round(refStats.avgL),
                    k: parseFloat(refStats.avgK.toFixed(3))
                },
                conservative: {
                    base: Math.round(refStats.avgBase * 0.9),
                    L: Math.round(refStats.avgL - refStats.stdL * 0.5), // -0.5 SD
                    k: parseFloat((Math.max(0.05, refStats.avgK - refStats.stdK * 0.5)).toFixed(3))
                },
                optimistic: {
                    base: Math.round(refStats.avgBase * 1.1),
                    L: Math.round(refStats.avgL + refStats.stdL * 0.5), // +0.5 SD
                    k: parseFloat((refStats.avgK + refStats.stdK * 0.5).toFixed(3))
                }
            });
        }
    }, [refStats]);

    // Generate Simulation Data (36 Months)
    const simulationResult = useMemo(() => {
        const start = new Date(openDate + '-01');
        const months = 36;
        const data: any[] = [];
        
        // Summaries
        const summary = {
            conservative: { totalSales: 0, netIncrease: 0, finalMonthly: 0, roiMonths: 999 },
            standard: { totalSales: 0, netIncrease: 0, finalMonthly: 0, roiMonths: 999 },
            optimistic: { totalSales: 0, netIncrease: 0, finalMonthly: 0, roiMonths: 999 },
            cannibalLossTotal: 0
        };

        const t0 = 12; // Assume standard inflection point
        const seasonality = refStats?.avgSeasonality || Array(12).fill(1.0);

        let cumProfitCons = -initialInvestment * (isSales ? 1000 : 1); // rough scaling if needed
        let cumProfitStd = -initialInvestment * (isSales ? 1000 : 1);
        let cumProfitOpt = -initialInvestment * (isSales ? 1000 : 1);
        
        // Profit Margin Assumption (e.g., 20%)
        const margin = 0.2; 

        for (let t = 0; t < months; t++) {
            const current = new Date(start);
            current.setMonth(start.getMonth() + t);
            const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
            const monthIdx = current.getMonth(); // 0-11
            const sea = seasonality[monthIdx];

            // Cannibalization
            let cannibalLoss = 0;
            cannibalStores.forEach(c => {
                const store = allStores[c.id];
                if (store) {
                    const baseline = (store.stats?.lastYearSales || 0) / 12; 
                    cannibalLoss += baseline * (c.impact / 100);
                }
            });
            summary.cannibalLossTotal += cannibalLoss;

            const row: any = { 
                month: monthStr, 
                index: t,
                cannibalLoss: Math.round(cannibalLoss) 
            };

            // Ghost Lines
            if (refStats && refStats.ghostLines) {
                refStats.ghostLines.forEach((line, idx) => {
                    if (line[t]) row[`ghost_${idx}`] = line[t].val;
                });
            }

            (['conservative', 'standard', 'optimistic'] as const).forEach(scen => {
                const p = params[scen];
                const trend = p.base + (p.L / (1 + Math.exp(-p.k * (t - t0))));
                const sales = Math.round(Math.max(0, trend * sea));
                const net = sales - Math.round(cannibalLoss);

                row[scen] = sales;
                row[`${scen}_net`] = net;

                summary[scen].totalSales += sales;
                summary[scen].netIncrease += net;
                if (t === months - 1) summary[scen].finalMonthly = sales;

                // ROI Calculation (Cashflow)
                const profit = sales * margin; 
                if (scen === 'conservative') {
                    cumProfitCons += profit;
                    if (cumProfitCons >= 0 && summary.conservative.roiMonths === 999) summary.conservative.roiMonths = t + 1;
                }
                if (scen === 'standard') {
                    cumProfitStd += profit;
                    if (cumProfitStd >= 0 && summary.standard.roiMonths === 999) summary.standard.roiMonths = t + 1;
                }
                if (scen === 'optimistic') {
                    cumProfitOpt += profit;
                    if (cumProfitOpt >= 0 && summary.optimistic.roiMonths === 999) summary.optimistic.roiMonths = t + 1;
                }
            });

            data.push(row);
        }

        return { data, summary };
    }, [params, openDate, cannibalStores, allStores, refStats, initialInvestment, isSales]);


    // --- Handlers ---
    const toggleRefStore = (id: string) => {
        if (selectedRefStores.includes(id)) setSelectedRefStores(prev => prev.filter(x => x !== id));
        else setSelectedRefStores(prev => [...prev, id]);
    };

    const addCannibalStore = (id: string) => {
        if (!cannibalStores.find(c => c.id === id)) {
            setCannibalStores(prev => [...prev, { id, impact: 5 }]); 
        }
    };

    const updateCannibalImpact = (id: string, val: number) => {
        setCannibalStores(prev => prev.map(c => c.id === id ? { ...c, impact: val } : c));
    };

    const removeCannibalStore = (id: string) => {
        setCannibalStores(prev => prev.filter(c => c.id !== id));
    };

    const handleParamChange = (scen: ScenarioType, key: keyof ScenarioParams, val: number) => {
        setParams(prev => ({
            ...prev,
            [scen]: { ...prev[scen], [key]: val }
        }));
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-32">
                
                {/* Header */}
                <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            <span className="p-2 bg-orange-100 text-orange-600 rounded-xl"><i className="fas fa-store"></i></span>
                            新規出店計画シミュレーター Pro
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1 ml-1">3-Scenario Forecasting & Cannibalization Impact Analysis</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase">Target Open Date</p>
                            <input 
                                type="month" 
                                value={openDate} 
                                onChange={e => setOpenDate(e.target.value)} 
                                className="font-black text-lg text-gray-700 bg-transparent outline-none text-right cursor-pointer hover:text-orange-500 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT: SETTINGS (5 cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                        
                        {/* 1. Reference Selection */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col h-[320px]">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex justify-between items-center">
                                <span>1. 参照モデル選択 ({selectedRefStores.length})</span>
                                <HelpTooltip title="参照店舗 (Reference)" content="出店予定地と類似した特性を持つ既存店を選択してください。これらの中央値と標準偏差から、3つのシナリオ（保守・標準・楽観）のパラメータを自動算出します。" />
                            </h3>
                            <input 
                                type="text" placeholder="店舗検索..." 
                                value={refSearchTerm} onChange={e => setRefSearchTerm(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-orange-500 mb-2"
                            />
                            <div className="flex-1 overflow-y-auto p-1 custom-scrollbar space-y-1">
                                {eligibleStores.filter(s => s.name.toLowerCase().includes(refSearchTerm.toLowerCase())).map(s => (
                                    <button 
                                        key={s.name} onClick={() => toggleRefStore(s.name)}
                                        className={`w-full text-left px-3 py-2 rounded-lg flex justify-between items-center transition-all ${selectedRefStores.includes(s.name) ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-100' : 'text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        <span className="text-xs font-bold truncate">{s.name}</span>
                                        <div className="flex gap-1">
                                            <span className="text-[9px] bg-white px-1.5 rounded text-gray-400 border border-gray-100">L:{Math.round(s.params.L/1000)}k</span>
                                            <span className="text-[9px] bg-white px-1.5 rounded text-gray-400 border border-gray-100">k:{s.params.k.toFixed(2)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Scenario Parameter Matrix */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i className="fas fa-sliders-h"></i> 2. シナリオ別パラメータ設定
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center text-xs border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="p-2 text-left text-gray-400 border-b">Parameter</th>
                                            <th className="p-2 text-blue-600 bg-blue-50/50 border-b w-20 rounded-tl-lg">悲観 (Low)</th>
                                            <th className="p-2 text-gray-800 bg-gray-50 border-b w-20">標準 (Mid)</th>
                                            <th className="p-2 text-green-600 bg-green-50/50 border-b w-20 rounded-tr-lg">楽観 (High)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold">
                                        <tr>
                                            <td className="p-3 text-left text-gray-600">Base (初期)</td>
                                            <td className="p-1 bg-blue-50/20"><input type="number" value={params.conservative.base} onChange={e => handleParamChange('conservative', 'base', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-blue-700" /></td>
                                            <td className="p-1 bg-gray-50"><input type="number" value={params.standard.base} onChange={e => handleParamChange('standard', 'base', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-gray-700" /></td>
                                            <td className="p-1 bg-green-50/20"><input type="number" value={params.optimistic.base} onChange={e => handleParamChange('optimistic', 'base', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-green-700" /></td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-left text-gray-600">L (潜在規模)</td>
                                            <td className="p-1 bg-blue-50/20"><input type="number" value={params.conservative.L} onChange={e => handleParamChange('conservative', 'L', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-blue-700" /></td>
                                            <td className="p-1 bg-gray-50"><input type="number" value={params.standard.L} onChange={e => handleParamChange('standard', 'L', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-gray-700" /></td>
                                            <td className="p-1 bg-green-50/20"><input type="number" value={params.optimistic.L} onChange={e => handleParamChange('optimistic', 'L', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-green-700" /></td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-left text-gray-600">k (立上り)</td>
                                            <td className="p-1 bg-blue-50/20"><input type="number" step="0.01" value={params.conservative.k} onChange={e => handleParamChange('conservative', 'k', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-blue-700" /></td>
                                            <td className="p-1 bg-gray-50"><input type="number" step="0.01" value={params.standard.k} onChange={e => handleParamChange('standard', 'k', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-gray-700" /></td>
                                            <td className="p-1 bg-green-50/20"><input type="number" step="0.01" value={params.optimistic.k} onChange={e => handleParamChange('optimistic', 'k', Number(e.target.value))} className="w-full text-center bg-transparent outline-none text-green-700" /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 3. Cannibalization */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col h-[300px]">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                                3. カニバリゼーション設定
                                <HelpTooltip title="カニバリ設定" content="新店オープンにより影響を受ける既存店を選択し、想定される売上減少率(%)を設定します。これは全シナリオ共通のコストとして計算されます。" />
                            </h3>
                            <select 
                                onChange={e => { if(e.target.value) { addCannibalStore(e.target.value); e.target.value = ""; } }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-red-500 mb-2"
                            >
                                <option value="">影響店舗を追加...</option>
                                {eligibleStores.filter(s => !cannibalStores.find(c => c.id === s.name)).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </select>
                            <div className="flex-1 overflow-y-auto p-1 custom-scrollbar space-y-2">
                                {cannibalStores.map(c => (
                                    <div key={c.id} className="flex items-center justify-between bg-red-50 p-2 rounded-lg border border-red-100">
                                        <span className="text-[10px] font-black text-red-800 truncate w-24">{c.id}</span>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="number" value={c.impact} onChange={e => updateCannibalImpact(c.id, Number(e.target.value))}
                                                className="w-10 bg-white border border-red-200 rounded text-center text-xs font-black text-red-600 outline-none"
                                            />
                                            <span className="text-[9px] text-red-400">%減</span>
                                        </div>
                                        <button onClick={() => removeCannibalStore(c.id)} className="text-red-300 hover:text-red-500"><i className="fas fa-times"></i></button>
                                    </div>
                                ))}
                                {cannibalStores.length === 0 && <div className="text-center text-[10px] text-gray-400 mt-4">影響店舗なし</div>}
                            </div>
                        </div>

                    </div>

                    {/* RIGHT: RESULTS (7 cols) */}
                    <div className="lg:col-span-7 space-y-6">
                        
                        {/* Comparison Table */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">シナリオ別 3年経営シミュレーション</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center text-xs">
                                    <thead className="text-[10px] font-black text-gray-400 uppercase bg-gray-50">
                                        <tr>
                                            <th className="p-3 text-left">Scenario</th>
                                            <th className="p-3">3年累計売上</th>
                                            <th className="p-3 text-red-400">カニバリ損失</th>
                                            <th className="p-3 text-[#005EB8] bg-blue-50/30">純増額 (Net)</th>
                                            <th className="p-3">投資回収 (ROI)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                        <tr>
                                            <td className="p-3 text-left text-blue-600">保守 (Low)</td>
                                            <td className="p-3">{Math.round(simulationResult.summary.conservative.totalSales/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-red-400">-{Math.round(simulationResult.summary.cannibalLossTotal/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-[#005EB8] bg-blue-50/30">{Math.round(simulationResult.summary.conservative.netIncrease/valueDivider).toLocaleString()}</td>
                                            <td className="p-3">{simulationResult.summary.conservative.roiMonths < 999 ? `${simulationResult.summary.conservative.roiMonths}ヶ月` : '未回収'}</td>
                                        </tr>
                                        <tr className="bg-gray-50/50 border-l-4 border-l-gray-400">
                                            <td className="p-3 text-left text-gray-800">標準 (Mid)</td>
                                            <td className="p-3">{Math.round(simulationResult.summary.standard.totalSales/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-red-400">-{Math.round(simulationResult.summary.cannibalLossTotal/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-[#005EB8] bg-blue-50/30 text-lg">{Math.round(simulationResult.summary.standard.netIncrease/valueDivider).toLocaleString()}</td>
                                            <td className="p-3">{simulationResult.summary.standard.roiMonths < 999 ? `${simulationResult.summary.standard.roiMonths}ヶ月` : '未回収'}</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-left text-green-600">楽観 (High)</td>
                                            <td className="p-3">{Math.round(simulationResult.summary.optimistic.totalSales/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-red-400">-{Math.round(simulationResult.summary.cannibalLossTotal/valueDivider).toLocaleString()}</td>
                                            <td className="p-3 text-[#005EB8] bg-blue-50/30">{Math.round(simulationResult.summary.optimistic.netIncrease/valueDivider).toLocaleString()}</td>
                                            <td className="p-3">{simulationResult.summary.optimistic.roiMonths < 999 ? `${simulationResult.summary.optimistic.roiMonths}ヶ月` : '未回収'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Chart: Growth Curve Comparison */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[500px] flex flex-col">
                            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest font-display flex items-center gap-2">
                                    <i className="fas fa-chart-line text-orange-500"></i> 3シナリオ予測 & リファレンス比較
                                </h3>
                                <div className="flex bg-gray-100 p-1 rounded-full">
                                    <button 
                                        onClick={() => setGraphMode('gross')}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${graphMode === 'gross' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400'}`}
                                    >
                                        売上総額 (Gross)
                                    </button>
                                    <button 
                                        onClick={() => setGraphMode('net')}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${graphMode === 'net' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        純増効果 (Net)
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={simulationResult.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="month" tick={{fontSize: 9}} minTickGap={30} />
                                        <YAxis tick={{fontSize: 9}} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                                        
                                        {/* Ghost Lines (Reference Stores) */}
                                        {refStats?.ghostLines.map((line, i) => (
                                            <Line key={`ghost-${i}`} type="monotone" dataKey={`ghost_${i}`} stroke="#e2e8f0" strokeWidth={1} dot={false} name="Reference" />
                                        ))}

                                        {graphMode === 'gross' ? (
                                            <>
                                                {/* Range Area */}
                                                <Area type="monotone" dataKey="optimistic" stroke="none" fill="#E0F2FE" fillOpacity={0.4} />
                                                <Area type="monotone" dataKey="conservative" stroke="none" fill="#fff" fillOpacity={1} />
                                                
                                                <Line type="monotone" dataKey="standard" name="標準 (Standard)" stroke="#64748B" strokeWidth={2} dot={false} />
                                                <Line type="monotone" dataKey="conservative" name="保守 (Cons)" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                                <Line type="monotone" dataKey="optimistic" name="楽観 (Opt)" stroke="#10B981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                            </>
                                        ) : (
                                            <>
                                                <Line type="monotone" dataKey="standard_net" name="標準純増 (Net)" stroke="#005EB8" strokeWidth={3} dot={false} />
                                                <Line type="monotone" dataKey="conservative_net" name="保守純増" stroke="#93C5FD" strokeWidth={2} dot={false} />
                                                <Line type="monotone" dataKey="optimistic_net" name="楽観純増" stroke="#10B981" strokeWidth={2} dot={false} />
                                            </>
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SimulationView;
