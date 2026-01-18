
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';
import { calculatePearsonCorrelation, logisticModel } from '../services/analysisEngine';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Legend, Cell, ReferenceLine, PieChart, Pie, LineChart, Line, ComposedChart, AreaChart, Area
} from 'recharts';

interface RegionalAnalysisDetailViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type AnalysisLevel = 'region' | 'prefecture' | 'block';

// Statistical Helpers
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const RegionalAnalysisDetailView: React.FC<RegionalAnalysisDetailViewProps> = ({ allStores, dataType }) => {
    const [level, setLevel] = useState<AnalysisLevel>('region');
    const [selectedValue, setSelectedValue] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '売上 (千円)' : '客数 (人)';

    const levelGroups = useMemo(() => {
        const regions = new Set<string>();
        const prefectures = new Set<string>();
        const blocks = new Set<string>();
        (Object.values(allStores) as StoreData[]).forEach(s => {
            if (s.region) regions.add(s.region);
            if (s.prefecture) prefectures.add(s.prefecture);
            if (s.block) blocks.add(s.block);
        });
        return {
            region: Array.from(regions).sort(),
            prefecture: Array.from(prefectures).sort(),
            block: Array.from(blocks).sort()
        };
    }, [allStores]);

    const currentList = levelGroups[level].filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));

    const storesInScope = useMemo(() => {
        if (!selectedValue) return [];
        return (Object.values(allStores) as StoreData[]).filter(s => {
            if (level === 'region') return s.region === selectedValue;
            if (level === 'prefecture') return s.prefecture === selectedValue;
            if (level === 'block') return s.block === selectedValue;
            return false;
        }).filter(s => s.isActive);
    }, [allStores, level, selectedValue]);

    const metrics = useMemo(() => {
        if (storesInScope.length === 0) return null;
        
        const count = storesInScope.length;
        const totalLastYear = storesInScope.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
        const totalPrevYear = storesInScope.reduce((a, s) => a + (s.stats?.prevYearSales || 0), 0);
        const yoy = totalPrevYear > 0 ? ((totalLastYear - totalPrevYear) / totalPrevYear) * 100 : 0;
        
        const avgK = storesInScope.reduce((a, s) => a + s.params.k, 0) / count;
        const avgL = storesInScope.reduce((a, s) => a + s.params.L, 0) / count;
        const avgAge = storesInScope.reduce((a, s) => a + s.raw.length, 0) / count;
        const avgCV = storesInScope.reduce((a, s) => a + (s.stats?.cv || 0), 0) / count;
        
        // Efficiency: Sales / (L * 12)
        const totalL = storesInScope.reduce((a,s) => a + s.params.L, 0);
        const areaEfficiency = totalL > 0 ? (totalLastYear / 12) / totalL * 100 : 0;

        const abc = { A: 0, B: 0, C: 0 };
        const modes = { standard: 0, shift: 0, dual_shift: 0, recovery: 0, startup: 0 };
        storesInScope.forEach(s => { 
            if(s.stats?.abcRank) abc[s.stats.abcRank]++;
            if(s.fit.mode) modes[s.fit.mode]++;
        });

        // Advanced: Gini & Correlation
        const salesList = storesInScope.map(s => s.stats?.lastYearSales || 0);
        const gini = calculateGini(salesList);

        // Inter-store Correlation
        const top5 = [...storesInScope].sort((a,b) => (b.stats?.lastYearSales||0)-(a.stats?.lastYearSales||0)).slice(0, 5);
        let corrSum = 0, corrCnt = 0;
        for(let i=0; i<top5.length; i++) {
            for(let j=i+1; j<top5.length; j++) {
                corrSum += calculatePearsonCorrelation(top5[i].raw.slice(-12), top5[j].raw.slice(-12));
                corrCnt++;
            }
        }
        const areaCohesion = corrCnt > 0 ? corrSum / corrCnt : 0;

        // Seasonality DNA
        const areaSeasonality = Array(12).fill(0);
        storesInScope.forEach(s => s.seasonal.forEach((v, i) => areaSeasonality[i] += v));
        const avgSeasonality = areaSeasonality.map(v => v / count);

        // Future Forecast Aggregate (3 Year)
        const forecastDates = [];
        const forecastValues = [];
        let totalForecastY1 = 0;
        const lastYearTotal = totalLastYear;

        for (let t = 1; t <= 36; t++) {
            let monthSum = 0;
            storesInScope.forEach(s => {
                const tr = logisticModel(s.raw.length + t - 1, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const sIdx = (new Date().getMonth() + t) % 12;
                monthSum += tr * (s.seasonal[sIdx] || 1.0);
            });
            forecastValues.push({ t, val: monthSum });
            if (t <= 12) totalForecastY1 += monthSum;
        }
        const cagr3y = (Math.pow((forecastValues[35].val * 12) / lastYearTotal, 1/3) - 1) * 100;

        // Area Z-Chart (MAT)
        const datesSet = new Set<string>();
        storesInScope.forEach(s => s.dates.forEach(d => datesSet.add(d)));
        const sortedDates = Array.from(datesSet).sort((a,b) => new Date(a.replace(/\//g,'-')).getTime() - new Date(b.replace(/\//g,'-')).getTime());
        const zChartData = sortedDates.map(date => {
            let monthlyTotal = 0;
            storesInScope.forEach(s => {
                const idx = s.dates.indexOf(date);
                if (idx !== -1) monthlyTotal += s.raw[idx];
            });
            return { date, monthly: monthlyTotal };
        }).map((d, i, arr) => {
            let mat = 0;
            if (i >= 11) {
                for (let k = 0; k < 12; k++) mat += arr[i - k].monthly;
            }
            return { ...d, mat: mat > 0 ? mat : null };
        });

        // Top Stores Matrix for Heatmap
        const matrix = top5.map(s1 => ({
            name: s1.name,
            values: top5.map(s2 => calculatePearsonCorrelation(s1.raw.slice(-12), s2.raw.slice(-12)))
        }));

        return { 
            count, totalLastYear, totalPrevYear, yoy, avgK, avgL, avgAge, avgCV, areaEfficiency, areaCohesion, gini, cagr3y,
            abc, modes, zChartData, avgSeasonality, matrix, topStoreNames: top5.map(s=>s.name), forecastValues
        };
    }, [storesInScope]);

    const internalRankingData = useMemo(() => {
        return [...storesInScope].sort((a, b) => (b.stats?.lastYearSales || 0) - (a.stats?.lastYearSales || 0));
    }, [storesInScope]);

    const kHistogramData = useMemo(() => {
        const buckets = Array(10).fill(0);
        storesInScope.forEach(s => {
            const idx = Math.min(9, Math.floor(s.params.k / 0.1));
            buckets[idx]++;
        });
        return buckets.map((v, i) => ({ range: `${(i * 0.1).toFixed(1)}`, count: v }));
    }, [storesInScope]);

    const modePieData = useMemo(() => {
        if (!metrics) return [];
        return [
            { name: 'Standard', value: metrics.modes.standard, fill: '#005EB8' },
            { name: 'Shift', value: metrics.modes.shift, fill: '#8B5CF6' },
            { name: 'Startup', value: metrics.modes.startup, fill: '#F59E0B' },
            { name: 'Recovery', value: metrics.modes.recovery, fill: '#10B981' }
        ].filter(d => d.value > 0);
    }, [metrics]);

    const levelTabClass = (l: AnalysisLevel) => `px-4 py-2 rounded-lg text-xs font-black transition-all ${level === l ? 'bg-[#005EB8] text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`;

    return (
        <div className="absolute inset-0 flex flex-col lg:flex-row gap-6 p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            {/* Sidebar */}
            <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-gray-50">
                    <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight font-display mb-4">地域エリア詳細分析</h2>
                    <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                        <button onClick={() => { setLevel('region'); setSelectedValue(null); }} className={levelTabClass('region')}>地方</button>
                        <button onClick={() => { setLevel('prefecture'); setSelectedValue(null); }} className={levelTabClass('prefecture')}>都道府県</button>
                        <button onClick={() => { setLevel('block'); setSelectedValue(null); }} className={levelTabClass('block')}>ブロック</button>
                    </div>
                    <input type="text" placeholder="検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8]" />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                    {currentList.map(v => (
                        <button key={v} onClick={() => setSelectedValue(v)} className={`w-full text-left px-5 py-3 rounded-2xl text-xs font-bold transition-all ${selectedValue === v ? 'bg-blue-50 text-[#005EB8] border-l-4 border-[#005EB8]' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:w-3/4 flex flex-col gap-6 h-full overflow-y-auto pb-20 pr-2 custom-scrollbar">
                {selectedValue && metrics ? (
                    <div className="animate-fadeIn space-y-8">
                        {/* Header */}
                        <div>
                            <h3 className="text-3xl font-black text-gray-800 tracking-tighter uppercase font-display">{selectedValue} <span className="text-sm text-gray-400 normal-case ml-2">の構造診断レポート</span></h3>
                            <div className="flex gap-2 mt-2">
                                <span className="bg-blue-50 text-[#005EB8] px-2 py-0.5 rounded text-[10px] font-black border border-blue-100 uppercase">{level} mode</span>
                                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] font-black uppercase">Active Stores: {metrics.count}</span>
                            </div>
                        </div>

                        {/* Expanded KPI Row (10 Cards) */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1 flex items-center gap-1">売上集中度(Gini)</p>
                                <p className={`text-xl font-black font-display ${metrics.gini > 0.4 ? 'text-red-500' : 'text-[#005EB8]'}`}>{metrics.gini.toFixed(3)}</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">エリア昨対比</p>
                                <p className={`text-xl font-black font-display ${metrics.yoy >= 0 ? 'text-green-500' : 'text-red-500'}`}>{metrics.yoy.toFixed(1)}%</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">平均月齢 (Age)</p>
                                <p className="text-xl font-black text-gray-800 font-display">{Math.round(metrics.avgAge)}ヶ月</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">潜在需要(L) 平均</p>
                                <p className="text-xl font-black text-gray-800 font-display">{Math.round(metrics.avgL).toLocaleString()}</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">ポテンシャル消化率</p>
                                <p className="text-xl font-black text-[#8B5CF6] font-display">{metrics.areaEfficiency.toFixed(1)}%</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">運営安定性(CV)</p>
                                <p className="text-xl font-black text-gray-800 font-display">{(metrics.avgCV * 100).toFixed(1)}%</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">成長加速度(k)</p>
                                <p className="text-xl font-black text-orange-500 font-display">{metrics.avgK.toFixed(3)}</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">3年予測CAGR</p>
                                <p className={`text-xl font-black font-display ${metrics.cagr3y >= 0 ? 'text-green-500' : 'text-red-500'}`}>{metrics.cagr3y.toFixed(1)}%</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">連動性コア指数</p>
                                <p className="text-xl font-black text-gray-800 font-display">{metrics.areaCohesion.toFixed(2)}</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                <p className="text-[9px] text-gray-400 font-black uppercase mb-1">成熟度フェーズ</p>
                                <p className="text-xl font-black text-[#005EB8] font-display">{metrics.avgAge > 120 ? 'Mature' : metrics.avgAge > 60 ? 'Stable' : 'Growing'}</p>
                            </div>
                        </div>

                        {/* --- CONTENT ROW 1: Operational Stability & Life-cycle --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    1. 運営安定性分析 (ボラティリティ・スマイル)
                                    <HelpTooltip title="変動率分析" content="横軸に店舗規模、縦軸に変動率(CV)をとっています。通常、規模が大きい店ほど安定（右下）しますが、左上（小規模で不安定）や右上（大規模なのに不安定）の店舗は管理強化が必要です。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis type="number" dataKey="size" name="規模" tick={{fontSize:9}} label={{ value: '平均月商 →', position: 'bottom', fontSize: 9 }} domain={['auto', 'auto']} />
                                            <YAxis type="number" dataKey="cv" name="変動率" unit="%" tick={{fontSize:9}} label={{ value: 'CV (%) →', angle: -90, position: 'left', fontSize: 9 }} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                            <Scatter name="Stores" data={storesInScope.map(s => ({ name: s.name, size: (s.stats?.lastYearSales||0)/12, cv: (s.stats?.cv||0)*100 }))}>
                                                {storesInScope.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={(entry.stats?.cv || 0) > 0.15 ? '#EF4444' : '#10B981'} fillOpacity={0.7} />
                                                ))}
                                            </Scatter>
                                            <ReferenceLine y={10} stroke="#cbd5e1" strokeDasharray="3 3" />
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    2. 店舗ライフサイクル分析 (Age vs Growth)
                                    <HelpTooltip title="ライフサイクル" content="店舗の『若さ（月齢）』と『勢い（YoY）』の関係。右下（古くてマイナス成長）の店舗は劣化のサイン。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis type="number" dataKey="age" name="月齢" tick={{fontSize:9}} label={{ value: '店舗年齢(月) →', position: 'bottom', fontSize: 9 }} />
                                            <YAxis type="number" dataKey="yoy" name="昨対比" unit="%" tick={{fontSize:9}} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                            <ReferenceLine y={0} stroke="#94a3b8" />
                                            <Scatter name="Stores" data={storesInScope.map(s => ({ name: s.name, age: s.raw.length, yoy: (s.stats?.yoy||0)*100 }))} fill="#8B5CF6" fillOpacity={0.6} />
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* --- CONTENT ROW 2: Cohesion & Seasonality --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 font-display flex items-center gap-2">3. エリア内連動性ヒートマップ</h4>
                                <div className="flex-1 overflow-x-auto">
                                    <table className="w-full text-[8px] border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="p-1"></th>
                                                {metrics.topStoreNames.map(n => <th key={n} className="p-1 font-bold text-gray-400 rotate-45 h-12 text-left align-bottom">{n}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metrics.matrix.map((row, i) => (
                                                <tr key={row.name}>
                                                    <td className="p-1 font-bold text-gray-500 text-right whitespace-nowrap">{row.name}</td>
                                                    {row.values.map((val, j) => (
                                                        <td key={j} className="p-0.5">
                                                            <div className="w-full h-6 rounded-sm flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: val > 0.7 ? '#005EB8' : val > 0.4 ? '#3B82F6' : '#f1f5f9', color: val < 0.4 ? '#94a3b8' : 'white' }}>
                                                                {val.toFixed(1)}
                                                            </div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">4. エリア独自の季節性 DNA</h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={metrics.avgSeasonality.map((v, i) => ({ month: i + 1, val: v }))}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" tick={{fontSize:9}} tickFormatter={(v)=>`${v}月`} />
                                            <YAxis domain={[0.8, 1.2]} tick={{fontSize:9}} />
                                            <Tooltip formatter={(v:number)=>v.toFixed(3)} />
                                            <ReferenceLine y={1} stroke="#cbd5e1" strokeDasharray="3 3" />
                                            <Area type="monotone" dataKey="val" stroke="#10B981" fill="#10B981" fillOpacity={0.1} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* --- CONTENT ROW 3: Concentration & Growth Distribution --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">5. エリア内売上貢献度分布</h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={internalRankingData.map(s => ({ name: s.name, value: s.stats?.lastYearSales || 0 }))}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" hide />
                                            <YAxis tick={{fontSize:9}} />
                                            <Tooltip formatter={(v:number)=>v.toLocaleString()} />
                                            <Bar dataKey="value" fill="#E2E8F0" radius={[4, 4, 0, 0]}>
                                                {internalRankingData.map((_, index) => <Cell key={index} fill={index < metrics.count * 0.2 ? '#005EB8' : '#cbd5e1'} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    6. 成長速度 (k) の統計分布
                                    <HelpTooltip title="k分布" content="エリア内店舗の成長スピードの分布。右に偏っているほど、新規顧客の獲得が早いエリアです。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={kHistogramData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="range" tick={{fontSize:9}} label={{ value: 'k-Factor →', position: 'bottom', fontSize: 9 }} />
                                            <YAxis tick={{fontSize:9}} />
                                            <Tooltip />
                                            <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                            <ReferenceLine x={metrics.avgK.toFixed(1)} stroke="#000" strokeDasharray="3 3" label={{ value: 'AVG', position: 'top', fontSize: 8 }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* --- CONTENT ROW 4: Z-Chart Area & Potential Ranking --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    7. エリア統合 Zチャート (MAT推移)
                                    <HelpTooltip title="MAT推移" content="エリア全体の移動年計(MAT)を表示。季節性を排除したエリア本来の実力トレンドを把握します。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={metrics.zChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tick={{fontSize:9}} minTickGap={30} />
                                            <YAxis tick={{fontSize:9}} />
                                            <Tooltip formatter={(v:number)=>v.toLocaleString()} />
                                            <Line type="monotone" dataKey="mat" stroke="#005EB8" strokeWidth={3} dot={false} name="エリアMAT" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    8. ポテンシャル未充足(L-Gap) ランキング
                                    <HelpTooltip title="L-Gap" content="AIが算出したポテンシャル(L)に対して、現状の売上がどれだけ低いか（伸びしろがあるか）の順位。" />
                                </h4>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    {[...storesInScope].sort((a,b) => (b.params.L - (a.stats?.lastYearSales||0)/12) - (a.params.L - (b.stats?.lastYearSales||0)/12)).slice(0, 10).map((s, i) => {
                                        const gap = s.params.L - (s.stats?.lastYearSales||0)/12;
                                        return (
                                            <div key={s.name} className="flex items-center justify-between p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-gray-300">#{i+1}</span>
                                                    <span className="text-xs font-bold text-gray-700">{s.name}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black text-red-500">Gap: +{Math.round(gap).toLocaleString()}</div>
                                                    <div className="w-24 bg-gray-100 h-1 rounded-full mt-1 overflow-hidden">
                                                        <div className="bg-red-400 h-full" style={{ width: `${Math.min(100, (gap/s.params.L)*100)}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* --- CONTENT ROW 5: Forecast Area & Mode Mix --- */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    9. エリア将来予測ファンチャート
                                    <HelpTooltip title="将来予測" content="エリア内全店舗のロジスティック回帰モデルを統合。今後3年間のエリア総売上の予測軌道。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={metrics.forecastValues}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="t" tick={{fontSize:9}} label={{ value: 'Months Ahead →', position: 'bottom', fontSize: 8 }} />
                                            <YAxis tick={{fontSize:9}} />
                                            <Tooltip />
                                            <Area type="monotone" dataKey="val" stroke="#005EB8" fill="#005EB8" fillOpacity={0.1} strokeWidth={2} name="予測総売上" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    10. エリア構成店舗特性ポートフォリオ
                                    <HelpTooltip title="モード比率" content="エリア内にどのような成長フェーズの店舗が混在しているか。Startupが多いエリアは将来の伸びしろ大。" />
                                </h4>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={modePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                                {modePieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                                            </Pie>
                                            <Tooltip />
                                            <Legend verticalAlign="bottom" wrapperStyle={{fontSize: '9px', fontWeight: 'bold'}} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Store List Table */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">エリア内全店舗 パフォーマンス比較マトリクス</h4>
                            <div className="flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50 sticky top-0 bg-white">
                                        <tr>
                                            <th className="py-2">店舗名</th>
                                            <th className="py-2 text-right">昨対比</th>
                                            <th className="py-2 text-right">ABC</th>
                                            <th className="py-2 text-right">効率(%)</th>
                                            <th className="py-2 text-right">k値</th>
                                            <th className="py-2 text-right">CV</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {internalRankingData.map((s) => (
                                            <tr key={s.name} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="py-2 font-bold text-gray-700">{s.name}</td>
                                                <td className={`py-2 text-right font-black ${(s.stats?.yoy||0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>{((s.stats?.yoy||0) * 100).toFixed(1)}%</td>
                                                <td className="py-2 text-right font-bold text-gray-500">{s.stats?.abcRank}</td>
                                                <td className="py-2 text-right font-mono text-[#8B5CF6]">{( ((s.stats?.lastYearSales||0)/12) / s.params.L * 100 ).toFixed(1)}%</td>
                                                <td className="py-2 text-right font-mono text-gray-400">{s.params.k.toFixed(3)}</td>
                                                <td className="py-2 text-right font-mono text-gray-400">{((s.stats?.cv||0)*100).toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest h-full bg-white rounded-3xl border border-dashed border-gray-200">
                        <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <p>左のリストから分析対象を選択してください</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RegionalAnalysisDetailView;
