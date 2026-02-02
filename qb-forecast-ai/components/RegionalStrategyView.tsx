
import React, { useState, useMemo } from 'react';
import { StoreData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, ComposedChart, Line, ScatterChart, Scatter, ReferenceLine, 
    Treemap, PieChart, Pie, Legend, ZAxis, LabelList
} from 'recharts';

interface RegionalStrategyViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type ScopeType = 'region' | 'prefecture' | 'block';
type SortField = 'name' | 'sales' | 'budget' | 'achievement' | 'diff' | 'yoy' | 'efficiency' | 'lUtil' | 'gini';
type SortOrder = 'asc' | 'desc';

// --- Helper Functions ---
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const RegionalStrategyView: React.FC<RegionalStrategyViewProps> = ({ allStores, dataType }) => {
    // --- State ---
    const [scope, setScope] = useState<ScopeType>('region');
    const [sortField, setSortField] = useState<SortField>('achievement');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [expandedChart, setExpandedChart] = useState<string | null>(null);
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    const displayUnit = isSales ? 'M' : '人';
    const displayDivider = isSales ? 1000 : 1; 

    // --- Data Aggregation (Fiscal Year YTD) ---
    const strategyData = useMemo(() => {
        const stores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && !s.error);
        
        // 1. Identify Fiscal Year Range based on latest available data
        let maxDate = new Date(0);
        stores.forEach(s => {
            const dStr = s.dates[s.dates.length - 1];
            if (dStr) {
                const d = new Date(dStr.replace(/\//g, '-'));
                if (d > maxDate) maxDate = d;
            }
        });

        // Fiscal Year Start (July 1st)
        let fyStartYear = maxDate.getFullYear();
        if (maxDate.getMonth() < 6) fyStartYear -= 1; // Before July -> Start is prev year July
        const fyStartDate = new Date(fyStartYear, 6, 1);
        
        // Month keys for YTD (e.g., "2024-07", "2024-08"...)
        const ytdMonths: string[] = [];
        let curr = new Date(fyStartDate);
        while (curr <= maxDate) {
            ytdMonths.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
            curr.setMonth(curr.getMonth() + 1);
        }

        // 2. Aggregate by Scope
        const groups = new Map<string, any>();
        let totalSales = 0;
        let totalBudget = 0;
        let totalPrevYear = 0;
        let totalL = 0;

        stores.forEach(s => {
            let key = "Unknown";
            if (scope === 'region') key = s.region || "未分類";
            else if (scope === 'prefecture') key = s.prefecture || "未分類";
            else if (scope === 'block') key = s.block || "未分類";

            if (!groups.has(key)) {
                groups.set(key, {
                    name: key,
                    count: 0,
                    sales: 0,
                    budget: 0,
                    prevYear: 0,
                    L: 0,
                    storeValues: [] as number[],
                    riskyCount: 0
                });
            }
            const g = groups.get(key);

            let sSales = 0;
            let sBudget = 0;
            let sPrev = 0;

            ytdMonths.forEach(m => {
                // Actual
                const idx = s.dates.findIndex(d => d.replace(/\//g, '-') === m);
                if (idx !== -1) sSales += s.raw[idx];

                // Budget
                if (s.budget && s.budget[m]) sBudget += s.budget[m];

                // Prev Year
                const dObj = new Date(m + '-01');
                dObj.setFullYear(dObj.getFullYear() - 1);
                const prevM = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}`;
                const prevIdx = s.dates.findIndex(d => d.replace(/\//g, '-') === prevM);
                if (prevIdx !== -1) sPrev += s.raw[prevIdx];
            });

            g.count++;
            g.sales += sSales;
            g.budget += sBudget;
            g.prevYear += sPrev;
            g.L += s.params.L; // Monthly L capacity
            g.storeValues.push(sSales); // For Gini

            // Risk check (YoY < 95%)
            if (sPrev > 0 && (sSales / sPrev) < 0.95) g.riskyCount++;

            totalSales += sSales;
            totalBudget += sBudget;
            totalPrevYear += sPrev;
            totalL += s.params.L;
        });

        // 3. Calculate Metrics
        const data = Array.from(groups.values()).map(g => {
            const monthsCount = ytdMonths.length || 1;
            const avgMonthlySales = g.sales / monthsCount;
            const totalCapacity = g.L * monthsCount; // Total L over YTD period

            return {
                ...g,
                achievement: g.budget > 0 ? (g.sales / g.budget) * 100 : 0,
                diff: g.sales - g.budget,
                yoy: g.prevYear > 0 ? ((g.sales - g.prevYear) / g.prevYear) * 100 : 0,
                efficiency: g.count > 0 ? avgMonthlySales / g.count : 0,
                lUtil: totalCapacity > 0 ? (g.sales / totalCapacity) * 100 : 0,
                gini: calculateGini(g.storeValues),
                riskRate: g.count > 0 ? (g.riskyCount / g.count) * 100 : 0
            };
        });

        // 4. Sort
        data.sort((a, b) => {
            const vA = a[sortField];
            const vB = b[sortField];
            return sortOrder === 'asc' ? vA - vB : vB - vA;
        });

        return {
            data,
            kpis: {
                periodLabel: `${ytdMonths[0]} 〜 ${ytdMonths[ytdMonths.length-1]} (YTD)`,
                totalSales,
                totalBudget,
                totalDiff: totalSales - totalBudget,
                totalAchievement: totalBudget > 0 ? (totalSales / totalBudget) * 100 : 0,
                totalYoY: totalPrevYear > 0 ? ((totalSales - totalPrevYear) / totalPrevYear) * 100 : 0,
                activeStores: stores.length
            }
        };
    }, [allStores, scope, sortField, sortOrder, isSales]);

    // --- AI Insight ---
    const handleGenerateAI = async () => {
        if (!strategyData) return;
        setAiLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const topArea = strategyData.data[0];
        const bottomArea = strategyData.data[strategyData.data.length - 1];
        
        const prompt = `
        あなたは経営戦略コンサルタントです。以下の地域別予実データに基づき、戦略的アドバイスをMarkdownで出力してください。
        
        ## 全社状況 (${strategyData.kpis.periodLabel})
        - 予算達成率: ${strategyData.kpis.totalAchievement.toFixed(1)}%
        - 昨対成長率: ${strategyData.kpis.totalYoY.toFixed(1)}%
        - 予算乖離額: ${Math.round(strategyData.kpis.totalDiff).toLocaleString()}
        
        ## エリア別状況 (Scope: ${scope})
        - Top Performer: ${topArea.name} (達成率: ${topArea.achievement.toFixed(1)}%, 効率: ${Math.round(topArea.efficiency).toLocaleString()})
        - Worst Performer: ${bottomArea.name} (達成率: ${bottomArea.achievement.toFixed(1)}%, 効率: ${Math.round(bottomArea.efficiency).toLocaleString()})
        
        ## 依頼事項
        1. 全体の健康状態の診断
        2. 予算未達エリアへの具体的なテコ入れ方針
        3. 好調エリアの成功要因の仮説と横展開の提案
        `;

        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setAiReport(res.text || "分析に失敗しました。");
        } catch (e) {
            setAiReport("AI分析中にエラーが発生しました。");
        } finally {
            setAiLoading(false);
        }
    };

    // --- Chart Data Preparation ---
    const waterfallData = useMemo(() => {
        const diffs = strategyData.data.map(d => ({ name: d.name, val: d.diff })).sort((a,b) => b.val - a.val);
        // Show top 5 positive and bottom 5 negative if too many
        if (diffs.length > 15) {
            return [...diffs.slice(0, 8), ...diffs.slice(-7)];
        }
        return diffs;
    }, [strategyData]);

    const portfolioData = useMemo(() => {
        return strategyData.data.map(d => ({
            name: d.name,
            x: Math.round(d.efficiency), // Efficiency
            y: Number(d.achievement.toFixed(1)), // Achievement
            z: Math.round(d.sales / 1000), // Size
            fill: d.achievement >= 100 ? (d.yoy >= 0 ? '#10B981' : '#F59E0B') : (d.yoy >= 0 ? '#3B82F6' : '#EF4444')
        }));
    }, [strategyData]);

    // --- Handlers ---
    const handleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('desc'); }
    };

    const toggleScope = (s: ScopeType) => {
        setScope(s);
        setAiReport(null);
    };

    // --- Components ---
    const KpiCard = ({ title, value, sub, color="border-t-gray-200", trend }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} flex flex-col justify-between h-full`}>
            <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{title}</p>
                <div className="text-2xl font-black text-gray-800 font-display truncate">{value}</div>
            </div>
            <div className="flex justify-between items-end mt-2">
                <span className="text-[10px] text-gray-400 font-bold">{sub}</span>
                {trend !== undefined && <span className={`text-[10px] font-black ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{trend > 0 ? '+' : ''}{trend}%</span>}
            </div>
        </div>
    );

    const ExpandButton = ({ id }: { id: string }) => (
        <button onClick={() => setExpandedChart(id)} className="absolute top-4 right-4 text-gray-300 hover:text-[#005EB8] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
        </button>
    );

    // --- Chart Renderers ---
    const renderAchievementChart = () => (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={strategyData.data.slice(0, 15)} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" domain={[80, 'auto']} hide />
                <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fontWeight: 'bold'}} />
                <Tooltip formatter={(v:number) => v.toFixed(1) + '%'} cursor={{fill: 'transparent'}} />
                <ReferenceLine x={100} stroke="#EF4444" strokeDasharray="3 3" />
                <Bar dataKey="achievement" radius={[0, 4, 4, 0]} barSize={15}>
                    {strategyData.data.slice(0, 15).map((entry, index) => (
                        <Cell key={index} fill={entry.achievement >= 100 ? '#10B981' : '#F59E0B'} />
                    ))}
                    <LabelList dataKey="achievement" position="right" fontSize={9} formatter={(v:number)=>v.toFixed(1)+'%'} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    const renderWaterfallChart = () => (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{fontSize: 8}} interval={0} angle={-30} textAnchor="end" height={40} />
                <YAxis tick={{fontSize: 9}} />
                <Tooltip formatter={(v:number) => Math.round(v).toLocaleString()} />
                <ReferenceLine y={0} stroke="#000" />
                <Bar dataKey="val">
                    {waterfallData.map((entry, index) => (
                        <Cell key={index} fill={entry.val > 0 ? '#10B981' : '#EF4444'} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    const renderPortfolioChart = () => (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" dataKey="x" name="効率" unit={unitLabel} tick={{fontSize: 9}} label={{ value: '店舗効率 (Avg Sales)', position: 'bottom', offset: 0, fontSize: 9 }} domain={['auto', 'auto']} />
                <YAxis type="number" dataKey="y" name="達成率" unit="%" tick={{fontSize: 9}} label={{ value: '予算達成率', angle: -90, position: 'left', offset: 0, fontSize: 9 }} domain={['auto', 'auto']} />
                <ZAxis type="number" dataKey="z" range={[100, 1000]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <ReferenceLine y={100} stroke="#CBD5E1" />
                <ReferenceLine x={strategyData.data.reduce((a,b)=>a+b.efficiency,0)/strategyData.data.length} stroke="#CBD5E1" />
                <Scatter name="Regions" data={portfolioData}>
                    {portfolioData.map((entry, index) => <Cell key={index} fill={entry.fill} fillOpacity={0.6} />)}
                    <LabelList dataKey="name" position="top" style={{ fontSize: '8px', fontWeight: 'bold' }} />
                </Scatter>
            </ScatterChart>
        </ResponsiveContainer>
    );

    const renderTreemap = () => (
        <ResponsiveContainer width="100%" height="100%">
            <Treemap 
                data={strategyData.data.map(d => ({ name: d.name, size: d.sales, ach: d.achievement }))} 
                dataKey="size" 
                aspectRatio={4/3} 
                stroke="#fff" 
                content={(props: any) => {
                    const { root, depth, x, y, width, height, index, name, ach } = props;
                    return (
                        <g>
                            <rect x={x} y={y} width={width} height={height} style={{ fill: ach >= 100 ? '#10B981' : ach >= 90 ? '#F59E0B' : '#EF4444', stroke: '#fff', strokeWidth: 2, fillOpacity: 0.8 }} />
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
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            地域戦略・予実分析
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-purple-200">
                                {strategyData.kpis.periodLabel}
                            </span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Strategic Regional Performance & Budget Control</p>
                    </div>
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                        {(['region', 'prefecture', 'block'] as ScopeType[]).map(s => (
                            <button 
                                key={s} 
                                onClick={() => toggleScope(s)}
                                className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase flex items-center gap-2 ${scope === s ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
                            >
                                {s === 'region' ? '地方' : s === 'prefecture' ? '都道府県' : 'ブロック'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* KPI Deck */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <KpiCard title="YTD 予算達成率" value={`${strategyData.kpis.totalAchievement.toFixed(1)}%`} sub="全社累計" color={strategyData.kpis.totalAchievement >= 100 ? "border-t-green-500" : "border-t-red-500"} />
                    <KpiCard title="予算乖離額 (Gap)" value={`${strategyData.kpis.totalDiff > 0 ? '+' : ''}${Math.round(strategyData.kpis.totalDiff).toLocaleString()}`} sub={`${unitLabel}`} color={strategyData.kpis.totalDiff >= 0 ? "border-t-green-500" : "border-t-red-500"} />
                    <KpiCard title="昨対成長率 (YoY)" value={`${strategyData.kpis.totalYoY.toFixed(1)}%`} sub="前年同期比" color={strategyData.kpis.totalYoY >= 0 ? "border-t-blue-400" : "border-t-orange-400"} />
                    <KpiCard title="最高達成エリア" value={strategyData.data[0]?.name} sub={`Ach: ${strategyData.data[0]?.achievement.toFixed(1)}%`} color="border-t-yellow-500" />
                    <KpiCard title="要改善エリア" value={[...strategyData.data].sort((a,b)=>a.achievement-b.achievement)[0]?.name} sub="Worst Achievement" color="border-t-red-600" />
                    
                    <KpiCard title="1店平均実績" value={`${Math.round(strategyData.data.reduce((a,b)=>a+b.efficiency,0)/strategyData.data.length).toLocaleString()}`} sub={`/${unitLabel}`} color="border-t-purple-500" />
                    <KpiCard title="L消化率 (全社)" value={`${(strategyData.data.reduce((a,g)=>a+g.lUtil,0)/strategyData.data.length).toFixed(1)}%`} sub="ポテンシャル充足度" />
                    <KpiCard title="ジニ係数 (格差)" value={calculateGini(strategyData.data.map(d=>d.sales)).toFixed(3)} sub="エリア間格差" color="border-t-gray-400" />
                    <KpiCard title="リスク店舗率" value={`${(strategyData.data.reduce((a,g)=>a+g.riskRate,0)/strategyData.data.length).toFixed(1)}%`} sub="昨対割れ店舗比率" color="border-t-red-400" />
                    <KpiCard title="稼働店舗数" value={`${strategyData.kpis.activeStores}店`} sub="Current Active" />
                </div>

                {/* Comparison Dashboard (Charts) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 h-[450px] relative group">
                        <ExpandButton id="achievement" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">予算達成率ランキング (Achievement Race)</h3>
                        <div className="flex-1 w-full h-full pb-6">{renderAchievementChart()}</div>
                    </div>
                    
                    <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 h-[450px] relative group">
                        <ExpandButton id="portfolio" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">エリアポートフォリオ (Efficiency vs Achievement)</h3>
                        <div className="flex-1 w-full h-full pb-6">{renderPortfolioChart()}</div>
                    </div>

                    <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 h-[450px] relative group">
                        <ExpandButton id="waterfall" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">予算乖離ウォーターフォール (Variance Contribution)</h3>
                        <div className="flex-1 w-full h-full pb-6">{renderWaterfallChart()}</div>
                    </div>

                    <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 h-[450px] relative group">
                        <ExpandButton id="treemap" />
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">シェア構成 & 達成状況 (Treemap)</h3>
                        <div className="flex-1 w-full h-full pb-6">{renderTreemap()}</div>
                    </div>
                </div>

                {/* AI Analysis Section */}
                <div className="bg-gradient-to-r from-purple-50 to-white rounded-[2rem] p-8 border border-purple-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><i className="fas fa-robot text-9xl text-purple-900"></i></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <h3 className="text-xl font-black text-purple-800 font-display mb-2 flex items-center gap-2">
                                <span className="bg-purple-200 text-purple-800 p-1.5 rounded-lg"><i className="fas fa-magic text-sm"></i></span>
                                AI Strategic Insight
                            </h3>
                            <p className="text-xs text-purple-600 font-bold mb-4">Gemini 3 Proによる戦略診断レポート</p>
                        </div>
                        <button 
                            onClick={handleGenerateAI} 
                            disabled={aiLoading}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg shadow-purple-200 transition-all flex items-center gap-2"
                        >
                            {aiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lightbulb"></i>}
                            {aiLoading ? '分析中...' : 'AI診断を実行'}
                        </button>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-purple-50 text-sm text-gray-700 leading-relaxed min-h-[100px]">
                        {aiReport ? <div dangerouslySetInnerHTML={{ __html: marked(aiReport) }} className="prose prose-sm max-w-none" /> : <span className="text-gray-400 font-bold">「AI診断を実行」ボタンを押すと、現在のデータに基づいた戦略レポートが生成されます。</span>}
                    </div>
                </div>

                {/* Detailed Table (The Matrix) */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                        <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-table"></i> 詳細クロス集計表</h3>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="min-w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-white text-gray-400 font-black uppercase tracking-wider border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('name'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>エリア名</th>
                                    <th className="p-4 text-right cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('budget'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>累計予算</th>
                                    <th className="p-4 text-right cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('sales'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>累計実績</th>
                                    <th className="p-4 text-right cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('diff'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>差異 (Diff)</th>
                                    <th className="p-4 text-center cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('achievement'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>達成率</th>
                                    <th className="p-4 text-center cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('yoy'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>昨対比</th>
                                    <th className="p-4 text-right cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('efficiency'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>効率 (Avg)</th>
                                    <th className="p-4 text-center cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('lUtil'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>L消化率</th>
                                    <th className="p-4 text-center cursor-pointer hover:text-[#005EB8]" onClick={() => {setSortField('gini'); setSortOrder(sortOrder==='asc'?'desc':'asc')}}>不平等度 (Gini)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 font-bold text-gray-700">
                                {strategyData.data.map((row, i) => (
                                    <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-4 group-hover:text-[#005EB8]">{row.name}</td>
                                        <td className="p-4 text-right text-gray-400">{Math.round(row.budget).toLocaleString()}</td>
                                        <td className="p-4 text-right">{Math.round(row.sales).toLocaleString()}</td>
                                        <td className={`p-4 text-right ${row.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>{row.diff > 0 ? '+' : ''}{Math.round(row.diff).toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded ${row.achievement >= 100 ? 'bg-green-100 text-green-700' : row.achievement >= 90 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                                {row.achievement.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className={`p-4 text-center ${row.yoy >= 0 ? 'text-green-500' : 'text-red-500'}`}>{row.yoy > 0 ? '+' : ''}{row.yoy.toFixed(1)}%</td>
                                        <td className="p-4 text-right text-gray-500">{Math.round(row.efficiency).toLocaleString()}</td>
                                        <td className="p-4 text-center text-purple-500">{row.lUtil.toFixed(1)}%</td>
                                        <td className={`p-4 text-center ${row.gini > 0.4 ? 'text-red-500' : 'text-gray-400'}`}>{row.gini.toFixed(3)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* Expanded Chart Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm animate-fadeIn flex flex-col p-8">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 font-display">拡大表示分析</h2>
                        <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-gray-100 rounded-full"><i className="fas fa-times"></i></button>
                    </div>
                    <div className="flex-1 bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
                        {expandedChart === 'achievement' && renderAchievementChart()}
                        {expandedChart === 'portfolio' && renderPortfolioChart()}
                        {expandedChart === 'waterfall' && renderWaterfallChart()}
                        {expandedChart === 'treemap' && renderTreemap()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegionalStrategyView;
