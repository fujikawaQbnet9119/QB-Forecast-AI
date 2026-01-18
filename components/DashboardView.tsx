
import React, { useMemo, useState } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Legend, Brush, ReferenceLine,
    AreaChart, Area, ComposedChart, Bar, Cell, BarChart
} from 'recharts';

interface DashboardViewProps {
    allStores: { [name: string]: StoreData };
    forecastMonths: number;
    dataType: 'sales' | 'customers';
}

// --- Helpers ---
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

const get5YearCohort = (dateStr: string) => {
    const year = new Date(dateStr.replace(/\//g, '-')).getFullYear();
    if (year <= 2000) return "Before 2000";
    if (year <= 2005) return "2001-2005";
    if (year <= 2010) return "2006-2010";
    if (year <= 2015) return "2011-2015";
    if (year <= 2020) return "2016-2020";
    return "2021-Present";
};

const COHORT_ORDER = ["Before 2000", "2001-2005", "2006-2010", "2011-2015", "2016-2020", "2021-Present"];
const COHORT_COLORS: Record<string, string> = {
    "Before 2000": "#334155", "2001-2005": "#475569", "2006-2010": "#64748b",
    "2011-2015": "#005EB8", "2016-2020": "#3B82F6", "2021-Present": "#93C5FD"
};

// Component
const DashboardView: React.FC<DashboardViewProps> = ({ allStores, forecastMonths, dataType }) => {
    const [viewMode, setViewMode] = useState<'fiscal' | 'strategic'>('fiscal');
    const [hiddenCohorts, setHiddenCohorts] = useState<Set<string>>(new Set());

    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);
    const activeStores = stores.filter(s => s.isActive);
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    
    // --- 1. Identify Data Range & Fiscal Year ---
    const dateRangeInfo = useMemo(() => {
        const allDates = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => allDates.add(d)));
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime());
        
        const lastDateStr = sortedDates[sortedDates.length - 1];
        const lastDate = lastDateStr ? new Date(lastDateStr.replace(/\//g, '-')) : new Date();
        
        // Define Fiscal Year (July 1st Start - June 30th End)
        let fyStartYear = lastDate.getFullYear();
        if (lastDate.getMonth() < 6) fyStartYear -= 1; 
        
        const fyStartDate = new Date(fyStartYear, 6, 1); // July 1st
        const fyEndDate = new Date(fyStartYear + 1, 5, 30); // June 30th next year

        return { sortedDates, lastDate, fyStartDate, fyEndDate, fyStartYear };
    }, [stores]);

    // --- 2. Aggregate Data (Both Strategic & Fiscal) ---
    const aggregatedData = useMemo(() => {
        const { sortedDates, lastDate, fyStartDate, fyEndDate } = dateRangeInfo;
        
        // --- A. Strategic Long-term Data ---
        const combinedDates = [...sortedDates];
        for(let i = 1; i <= forecastMonths; i++) {
            const d = new Date(lastDate);
            d.setMonth(d.getMonth() + i);
            combinedDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }

        let runningCumulative = 0;
        let cumulativeActual = 0;

        const strategicData = combinedDates.map(date => {
            const dateObj = new Date(date.replace(/\//g, '-'));
            const isFuture = dateObj > lastDate;
            const pt: any = { date, isFuture, actualTotal: 0, forecastTotal: 0, budgetTotal: 0 };
            
            COHORT_ORDER.forEach(c => pt[c] = 0);

            stores.forEach(s => {
                const cLabel = get5YearCohort(s.dates[0]);
                let val = 0;
                let sBudget = 0;

                // 1. Calculate Value (Actual or Forecast)
                if (!isFuture) {
                    const idx = s.dates.indexOf(date.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(date.replace(/-/g, '/')) : s.dates.indexOf(date);
                    if (idx !== -1) val = s.raw[idx];
                } else {
                    if (s.isActive) {
                        const monthsDiff = (dateObj.getFullYear() - lastDate.getFullYear()) * 12 + (dateObj.getMonth() - lastDate.getMonth());
                        const idx = s.raw.length + monthsDiff - 1;
                        const tr = logisticModel(idx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                        const sea = s.seasonal[dateObj.getMonth()] || 1.0;
                        const decay = s.nudgeDecay || 0.7;
                        const nudge = s.nudge * Math.pow(decay, monthsDiff);
                        val = Math.max(0, (tr + nudge) * sea);
                    }
                }

                // 2. Budget Fallback Logic
                const budgetKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}`;
                if (s.budget && s.budget[budgetKey] && s.budget[budgetKey] > 0) {
                    sBudget = s.budget[budgetKey];
                } else {
                    // Fallback to Actual (Past) or Forecast (Future)
                    sBudget = val;
                }

                if (!isFuture) pt.actualTotal += val;
                else pt.forecastTotal += val;
                
                pt.budgetTotal += sBudget;
                pt[cLabel] += val;
            });

            pt.actual = !isFuture ? pt.actualTotal : null;
            pt.forecast = isFuture ? pt.forecastTotal : null;
            pt.budget = pt.budgetTotal > 0 ? pt.budgetTotal : null;

            // Cumulative Calc
            const currentVal = !isFuture ? pt.actualTotal : pt.forecastTotal;
            runningCumulative += currentVal;
            pt.cumulative = runningCumulative;

            if (!isFuture) {
                cumulativeActual = runningCumulative;
            }

            return pt;
        });

        // --- B. Fiscal Year Data (Current Term: July-June) ---
        const fyMonths: string[] = [];
        let curr = new Date(fyStartDate);
        while (curr <= fyEndDate) {
            fyMonths.push(`${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}`);
            curr.setMonth(curr.getMonth() + 1);
        }

        let fyCumActual = 0;
        let fyCumBudget = 0;
        let fyCumForecast = 0;
        let fyCumLastYear = 0;
        
        const fyChartData = fyMonths.map(month => {
            let mActual = 0;
            let mBudget = 0;
            let mForecast = 0;
            let mLastYear = 0;
            let hasActual = false;

            const dateObj = new Date(month + '-01');
            const prevYearDate = new Date(dateObj);
            prevYearDate.setFullYear(dateObj.getFullYear() - 1);
            const prevYearMonth = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth()+1).padStart(2,'0')}`;

            const isPastOrPresent = dateObj <= lastDate;

            stores.forEach(s => {
                let sActual = 0;
                let sForecast = 0;
                
                // 1. Actual
                if (isPastOrPresent) {
                    const idx = s.dates.indexOf(month.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(month.replace(/-/g, '/')) : s.dates.indexOf(month);
                    if (idx !== -1) {
                        sActual = s.raw[idx];
                        mActual += sActual;
                        hasActual = true;
                    }
                } 
                
                // 2. Forecast (needed for future budget fallback)
                if (!isPastOrPresent && s.isActive) {
                    const monthsDiff = (dateObj.getFullYear() - lastDate.getFullYear()) * 12 + (dateObj.getMonth() - lastDate.getMonth());
                    const idx = s.raw.length + monthsDiff - 1;
                    const tr = logisticModel(idx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                    const sea = s.seasonal[dateObj.getMonth()] || 1.0;
                    const decay = s.nudgeDecay || 0.7;
                    const nudge = s.nudge * Math.pow(decay, monthsDiff);
                    sForecast = Math.max(0, (tr + nudge) * sea);
                    
                    // Accumulate to total forecast
                    mForecast += sForecast;
                } else if (isPastOrPresent) {
                    // For past, forecast tracks actual
                    sForecast = sActual;
                }

                // 3. Budget with Fallback Logic
                // If budget is missing or 0, use Actual (Past) or Forecast (Future) to prevent skewed achievement rates
                if (s.budget && s.budget[month] && s.budget[month] > 0) {
                    mBudget += s.budget[month];
                } else {
                    mBudget += isPastOrPresent ? sActual : sForecast;
                }

                // 4. Last Year
                const idxLY = s.dates.indexOf(prevYearMonth.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(prevYearMonth.replace(/-/g, '/')) : s.dates.indexOf(prevYearMonth);
                if (idxLY !== -1) mLastYear += s.raw[idxLY];
            });

            if (isPastOrPresent) {
                mForecast = mActual;
            }

            if (hasActual) fyCumActual += mActual;
            fyCumBudget += mBudget;
            fyCumForecast += (hasActual ? mActual : mForecast);
            fyCumLastYear += mLastYear;

            return {
                month,
                actual: hasActual ? mActual : null,
                budget: mBudget,
                lastYear: mLastYear,
                forecast: hasActual ? null : Math.round(mForecast),
                cumActual: hasActual ? fyCumActual : null,
                cumBudget: fyCumBudget,
                cumLastYear: fyCumLastYear,
                cumForecast: fyCumForecast,
                diff: hasActual ? mActual - mBudget : null,
                yoy: mLastYear > 0 ? ((mActual - mLastYear) / mLastYear) * 100 : null,
                isClosed: hasActual
            };
        });

        // --- C. KPIs Calculation ---
        let lastClosedMonthIdx = -1;
        for (let i = fyChartData.length - 1; i >= 0; i--) {
            if (fyChartData[i].isClosed) {
                lastClosedMonthIdx = i;
                break;
            }
        }
        
        const currentProgress = fyChartData[lastClosedMonthIdx];
        const landingPrediction = fyChartData[fyChartData.length - 1]; // End of FY

        const totalBudgetFY = landingPrediction.cumBudget;
        const totalForecastFY = landingPrediction.cumForecast;
        
        // Expanded Fiscal KPIs
        const ytdLastYear = currentProgress?.cumLastYear || 0;
        const ytdYoY = ytdLastYear > 0 ? (( (currentProgress?.cumActual || 0) - ytdLastYear) / ytdLastYear) * 100 : 0;
        
        const totalLastYearFY = landingPrediction.cumLastYear;
        const landingYoY = totalLastYearFY > 0 ? ((totalForecastFY - totalLastYearFY) / totalLastYearFY) * 100 : 0;

        // Strategic KPIs
        const totalStoreCount = stores.length;
        const activeStoreCount = activeStores.length;
        const gini = calculateGini(activeStores.map(s => s.stats?.lastYearSales || 0));
        
        // Vintage Growth Curve
        const vGroups: Record<string, { sums: number[], counts: number[] }> = {};
        stores.forEach(s => {
            const cLabel = get5YearCohort(s.dates[0]);
            if(!vGroups[cLabel]) vGroups[cLabel] = { sums: Array(60).fill(0), counts: Array(60).fill(0) };
            s.raw.forEach((v, i) => { 
                if(i<60) {
                    vGroups[cLabel].sums[i] += v;
                    vGroups[cLabel].counts[i]++;
                }
            });
        });
        const vintageCurveData = Array.from({length:60}, (_,i) => {
            const p: any = { period: i+1 };
            Object.keys(vGroups).forEach(k => {
                if (vGroups[k].counts[i] >= 1) {
                    p[k] = Math.round(vGroups[k].sums[i] / vGroups[k].counts[i]);
                }
            });
            return p;
        });

        return {
            strategicData,
            fyChartData,
            vintageCurveData,
            kpis: {
                // Fiscal
                fyLabel: `${dateRangeInfo.fyStartYear}年度 (Jul-Jun)`,
                currentMonth: currentProgress?.month,
                
                // Budget KPIs
                ytdActual: currentProgress?.cumActual || 0,
                ytdBudget: currentProgress?.cumBudget || 0,
                ytdDiff: (currentProgress?.cumActual || 0) - (currentProgress?.cumBudget || 0),
                ytdAchievement: (currentProgress?.cumBudget || 0) > 0 ? ((currentProgress?.cumActual || 0) / currentProgress!.cumBudget) * 100 : 0,
                
                // YoY KPIs
                ytdLastYear,
                ytdYoY,
                landingLastYear: totalLastYearFY,
                landingYoY,

                // Forecast & Landing
                landingForecast: totalForecastFY,
                landingBudget: totalBudgetFY,
                landingDiff: totalForecastFY - totalBudgetFY,
                landingAchievement: totalBudgetFY > 0 ? (totalForecastFY / totalBudgetFY) * 100 : 0,
                remainingBudget: totalBudgetFY - (currentProgress?.cumActual || 0),
                
                // Strategic
                totalStoreCount,
                activeStoreCount,
                gini,
                avgAge: activeStores.reduce((a,s)=>a+s.raw.length,0)/activeStores.length,
                abcA: activeStores.filter(s=>s.stats?.abcRank==='A').length,
                cumulativeActual
            },
            bubbleData: activeStores.map(s => ({ x: Number(s.params.k.toFixed(3)), y: Math.round(s.params.L), z: Math.round(s.stats?.lastYearSales || 0), name: s.name, cluster: s.raw.length < 24 ? 1 : 0 })),
        };

    }, [stores, activeStores, forecastMonths, dateRangeInfo]);

    const { kpis, fyChartData, strategicData, vintageCurveData, bubbleData } = aggregatedData;

    // --- Components ---
    const KpiCard = ({ title, value, sub, color = "border-t-[#005EB8]", unit="", delay="", tooltip }: any) => (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 border-t-4 ${color} flex flex-col justify-between h-full hover:shadow-md transition-shadow animate-entry card-hover ${delay}`}>
            <div>
                <p className="text-[9px] text-gray-400 font-black uppercase mb-1 tracking-widest flex items-center gap-1">
                    {title}
                    {tooltip && <HelpTooltip title={title} content={tooltip} />}
                </p>
                <div className="flex items-baseline gap-1">
                    <h3 className="text-xl font-black text-gray-800 font-display">{value}</h3>
                    <span className="text-[10px] text-gray-500 font-bold">{unit}</span>
                </div>
            </div>
            {sub && <p className="text-[9px] text-gray-400 font-bold mt-2 border-t border-gray-50 pt-2">{sub}</p>}
        </div>
    );

    const CohortLegend = () => (
        <div className="flex flex-wrap gap-2 justify-end">
            {COHORT_ORDER.map(c => (
                <button
                    key={c}
                    onClick={() => setHiddenCohorts(prev => {
                        const next = new Set(prev);
                        if (next.has(c)) next.delete(c);
                        else next.add(c);
                        return next;
                    })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[9px] font-bold transition-all btn-press ${hiddenCohorts.has(c) ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-200 shadow-sm'}`}
                >
                    <span className={`w-2 h-2 rounded-full ${hiddenCohorts.has(c) ? 'bg-gray-300' : ''}`} style={{ backgroundColor: hiddenCohorts.has(c) ? undefined : COHORT_COLORS[c] }}></span>
                    {c}
                </button>
            ))}
        </div>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-32">
                
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6 animate-entry">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">Executive Dashboard</h2>
                            <span className="bg-blue-100 text-[#005EB8] px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-blue-200">
                                {viewMode === 'fiscal' ? 'Current Fiscal Year' : 'Long-term Strategy'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 font-bold">
                            {viewMode === 'fiscal' 
                                ? `今期決算進捗 (${kpis.fyLabel}): ${kpis.currentMonth || 'Start'}時点` 
                                : '創業からの全期間推移と長期構造改革'}
                        </p>
                    </div>
                    
                    <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                        <button 
                            onClick={() => setViewMode('fiscal')}
                            className={`px-6 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 btn-press ${viewMode === 'fiscal' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            今期決算進捗
                        </button>
                        <button 
                            onClick={() => setViewMode('strategic')}
                            className={`px-6 py-2 rounded-full text-xs font-black transition-all flex items-center gap-2 btn-press ${viewMode === 'strategic' ? 'bg-[#005EB8] text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            長期成長戦略
                        </button>
                    </div>
                </div>

                {/* --- FISCAL VIEW --- */}
                {viewMode === 'fiscal' && (
                    <div className="space-y-6">
                        {/* KPI Grid - Row 1: Budget & Forecast */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            <KpiCard title="通期予算 (Budget)" value={Math.round(kpis.landingBudget/1000).toLocaleString()} unit="M" sub="今期必達目標" color="border-t-[#005EB8]" tooltip="今期（7月〜翌6月）の会社全体の売上目標総額です。" />
                            <KpiCard title="YTD 予算達成率" value={kpis.ytdAchievement.toFixed(1)} unit="%" sub={`実績 ${Math.round(kpis.ytdActual/1000).toLocaleString()}M`} color={kpis.ytdAchievement >= 100 ? "border-t-green-500" : "border-t-red-500"} delay="delay-100" tooltip="期首から現時点までの予算に対する実績の進捗率です。100%超で順調です。" />
                            <KpiCard title="着地見込 (Forecast)" value={Math.round(kpis.landingForecast/1000).toLocaleString()} unit="M" sub="現在のペースでの着地" color="border-t-blue-400" delay="delay-200" tooltip="現在のペースが続いた場合の、期末時点の予想売上です。" />
                            <KpiCard title="予実乖離 (Gap)" value={(kpis.landingDiff/1000 > 0 ? '+' : '') + Math.round(kpis.landingDiff/1000).toLocaleString()} unit="M" sub="着地見込 - 予算" color={kpis.landingDiff >= 0 ? "border-t-green-500" : "border-t-red-500"} delay="delay-300" tooltip="着地見込と予算の差額です。プラスなら貯金、マイナスなら借金です。" />
                            <KpiCard title="残予算 (Remaining)" value={Math.round(kpis.remainingBudget/1000).toLocaleString()} unit="M" sub="期末までに必要な売上" color="border-t-orange-400" delay="delay-100" tooltip="目標達成のために、残りの期間で売り上げる必要がある金額です。" />
                            <KpiCard title="通期達成率見込" value={kpis.landingAchievement.toFixed(1)} unit="%" sub="このまま推移した場合" color={kpis.landingAchievement >= 100 ? "border-t-green-500" : "border-t-yellow-500"} delay="delay-200" tooltip="期末時点での最終的な達成率予測です。" />
                        </div>

                        {/* KPI Grid - Row 2: YoY Comparison */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-entry delay-300">
                            <KpiCard title="YTD 昨対比" value={`${kpis.ytdYoY >= 0 ? '+' : ''}${kpis.ytdYoY.toFixed(1)}`} unit="%" sub={`前年同期: ${Math.round(kpis.ytdLastYear/1000).toLocaleString()}M`} color={kpis.ytdYoY >= 0 ? "border-t-green-500" : "border-t-red-500"} tooltip="期首から現時点までの、昨年の実績に対する成長率です。" />
                            <KpiCard title="期末着地 昨対比" value={`${kpis.landingYoY >= 0 ? '+' : ''}${kpis.landingYoY.toFixed(1)}`} unit="%" sub={`前年通期: ${Math.round(kpis.landingLastYear/1000).toLocaleString()}M`} color={kpis.landingYoY >= 0 ? "border-t-green-500" : "border-t-red-500"} tooltip="期末の見込み売上が、昨年の通期売上に対してどれくらい伸びるか。" />
                            <div className="md:col-span-2 bg-gradient-to-r from-blue-50 to-white p-4 rounded-2xl border border-blue-100 flex items-center justify-between card-hover">
                                <div>
                                    <p className="text-[9px] font-black text-blue-400 uppercase flex items-center gap-1">昨対成長額 (YTD) <HelpTooltip title="昨対成長額" content="昨年同期と比較して、いくら売上が増えたか（減ったか）の絶対額。" /></p>
                                    <p className={`text-2xl font-black ${kpis.ytdActual - kpis.ytdLastYear >= 0 ? 'text-[#005EB8]' : 'text-red-500'}`}>
                                        {kpis.ytdActual - kpis.ytdLastYear > 0 ? '+' : ''}{Math.round((kpis.ytdActual - kpis.ytdLastYear)/1000).toLocaleString()} <span className="text-sm">M</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-gray-400 uppercase flex items-center justify-end gap-1">通期成長見込額 <HelpTooltip title="通期成長見込" content="期末までに、昨年の総売上に対していくら上積みできるかの予測。" /></p>
                                    <p className={`text-xl font-bold ${kpis.landingForecast - kpis.landingLastYear >= 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                                        {kpis.landingForecast - kpis.landingLastYear > 0 ? '+' : ''}{Math.round((kpis.landingForecast - kpis.landingLastYear)/1000).toLocaleString()} <span className="text-xs">M</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Main Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-entry delay-200">
                            {/* Monthly Budget vs Actual + Last Year Line */}
                            <div className="lg:col-span-2 bg-white p-5 rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col card-hover">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#005EB8]"></span>
                                    月次予実 & 累積進捗 (with 昨対比較)
                                    <HelpTooltip title="月次予実推移" content="月ごとの予算と実績を棒グラフで、累積の進捗を折れ線で比較します。点線は昨年の累積線です。" />
                                </h3>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={fyChartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" tick={{fontSize: 9}} tickFormatter={(v)=>v.split('-')[1]+'月'} />
                                            <YAxis yAxisId="left" tick={{fontSize: 9}} />
                                            <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} />
                                            <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            <Legend wrapperStyle={{ fontSize: '10px' }} />
                                            
                                            <Bar yAxisId="left" dataKey="budget" name="月次予算" fill="#CBD5E1" barSize={20} radius={[4,4,0,0]} />
                                            <Bar yAxisId="left" dataKey="actual" name="月次実績" fill="#005EB8" barSize={20} radius={[4,4,0,0]} />
                                            <Bar yAxisId="left" dataKey="forecast" name="AI予測" fill="#93C5FD" barSize={20} radius={[4,4,0,0]} />

                                            <Line yAxisId="right" type="monotone" dataKey="cumBudget" name="累積予算" stroke="#64748B" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                                            <Line yAxisId="right" type="monotone" dataKey="cumActual" name="累積実績" stroke="#005EB8" strokeWidth={3} dot={{r:3}} />
                                            {/* Last Year Cumulative Line */}
                                            <Line yAxisId="right" type="monotone" dataKey="cumLastYear" name="前年累積" stroke="#94A3B8" strokeWidth={2} strokeDasharray="2 2" dot={false} />
                                            
                                            <ReferenceLine x={kpis.currentMonth} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: 'NOW', position: 'top', fontSize: 9, fill: '#F59E0B' }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Variance Analysis */}
                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 h-[400px] flex flex-col card-hover">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                                    月次予実乖離 (Monthly Variance)
                                    <HelpTooltip title="予実乖離" content="毎月の実績が予算に対してプラスだったかマイナスだったかを示します。" />
                                </h3>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={fyChartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 20, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis type="number" tick={{fontSize: 9}} />
                                            <YAxis dataKey="month" type="category" tick={{fontSize: 9}} width={40} tickFormatter={(v)=>v.split('-')[1]} />
                                            <Tooltip formatter={(val: number) => val.toLocaleString()} cursor={{fill: 'transparent'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                            <ReferenceLine x={0} stroke="#000" />
                                            <Bar dataKey="diff" radius={[0, 4, 4, 0]} barSize={15} name="予算差額">
                                                {fyChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.diff && entry.diff > 0 ? '#10B981' : '#EF4444'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-50 text-center">
                                    <p className="text-[10px] text-gray-400 font-bold">累積乖離額</p>
                                    <p className={`text-2xl font-black ${kpis.ytdDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {kpis.ytdDiff > 0 ? '+' : ''}{Math.round(kpis.ytdDiff).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* New Chart: YoY Growth Trend */}
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 h-[300px] flex flex-col animate-entry delay-300 card-hover">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                                月次 昨対成長率トレンド (YoY Growth Rate %)
                                <HelpTooltip title="昨対成長率" content="去年の同じ月と比べて何%成長したかを示します。100%未満は前年割れです。" />
                            </h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fyChartData} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{fontSize: 9}} tickFormatter={(v)=>v.split('-')[1]+'月'} />
                                        <YAxis tick={{fontSize: 9}} unit="%" />
                                        <Tooltip formatter={(val: number) => val ? val.toFixed(1)+'%' : '-'} cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none'}} />
                                        <ReferenceLine y={0} stroke="#000" />
                                        <Bar dataKey="yoy" name="昨対成長率" barSize={30} radius={[4,4,0,0]}>
                                            {fyChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={(entry.yoy || 0) > 0 ? '#10B981' : '#EF4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- STRATEGIC VIEW --- */}
                {viewMode === 'strategic' && (
                    <div className="space-y-6 animate-entry">
                        {/* Strategic KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* New Cumulative Card - Span 2 */}
                            <div className="col-span-2 bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg text-white flex flex-col justify-between h-full transform hover:scale-[1.02] transition-transform relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1 flex items-center gap-1">
                                        創業以来 累計{isSales ? '売上高' : '客数'} (Grand Total)
                                        <HelpTooltip title="創業累計" content="創業初日から現在までの全店舗の実績合計値です。" />
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <h3 className="text-3xl font-black font-display tracking-tight">
                                            {isSales 
                                                ? (aggregatedData.kpis.cumulativeActual / 100000).toLocaleString(undefined, {maximumFractionDigits: 0}) 
                                                : (aggregatedData.kpis.cumulativeActual / 10000).toLocaleString(undefined, {maximumFractionDigits: 1})
                                            }
                                        </h3>
                                        <span className="text-sm font-bold opacity-80">{isSales ? '億円' : '万人'}</span>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-white/20 text-[10px] font-bold opacity-80 flex justify-between">
                                    <span>From Inception to Now</span>
                                    <span>All Stores</span>
                                </div>
                            </div>

                            <KpiCard title="全店舗数" value={kpis.totalStoreCount} unit="店" tooltip="現在登録されている全店舗数です（閉店含む）。" />
                            <KpiCard title="稼働店舗数" value={kpis.activeStoreCount} unit="店" sub={`${(kpis.activeStoreCount/kpis.totalStoreCount*100).toFixed(1)}% Active`} tooltip="現在営業中の店舗数です。" />
                            <KpiCard title="Aランク店舗数" value={kpis.abcA} unit="店" sub="主力稼働店" color="border-t-yellow-500" tooltip="売上貢献度が高い（上位70%を占める）優良店舗の数です。" />
                            <KpiCard title="平均月齢" value={Math.round(kpis.avgAge)} unit="ヶ月" sub="店舗成熟度" color="border-t-purple-500" tooltip="全店舗の平均営業期間です。高いほど老舗が多く、低いほど新陳代謝が進んでいます。" />
                            <KpiCard title="ジニ係数" value={kpis.gini.toFixed(2)} unit="" sub="店舗間格差 (0.4注意)" color={kpis.gini > 0.4 ? "border-t-red-500" : "border-t-green-500"} tooltip="店舗間の売上格差を示す指標です。0.4を超えると一部の店舗に依存しすぎている危険信号です。" />
                        </div>

                        {/* 1. Long-term Trend (Existing) */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 h-[400px] flex flex-col card-hover">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                                長期成長軌道 & 将来予測 (Historical & Forecast Trend)
                                <HelpTooltip title="長期トレンド" content="創業からの長期的な売上推移と、AIによる将来予測です。過去の傾向から未来をシミュレーションします。" />
                            </h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={strategicData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={50} />
                                        <YAxis tick={{fontSize: 9}} />
                                        <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                        
                                        <Area type="monotone" dataKey="actual" name="実績" stroke="none" fill="#1A1A1A" fillOpacity={0.1} />
                                        <Line type="monotone" dataKey="actual" name="実績推移" stroke="#1A1A1A" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="forecast" name="AI長期予測" stroke="#005EB8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                        <Line type="monotone" dataKey="budget" name="予算ライン" stroke="#10B981" strokeWidth={1} dot={false} />
                                        
                                        <ReferenceLine x={dateRangeInfo.lastDate.toISOString().slice(0,7)} stroke="#F59E0B" label={{ value: 'NOW', position: 'top', fontSize: 9, fill: '#F59E0B' }} />
                                        <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" startIndex={Math.max(0, strategicData.length - 48)} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 2. Mountain Chart (New) */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 h-[400px] flex flex-col animate-entry delay-100 card-hover">
                            <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display flex items-center gap-2">
                                    世代別 総量推移 (Cohort Mountain Chart)
                                    <HelpTooltip title="マウンテンチャート" content="創業からの売上総量の推移を、オープン時期（世代）ごとに積み上げて表示します。どの世代が現在の収益を支えているか、新しい世代が順調に育っているかを確認できます。" />
                                </h3>
                                <CohortLegend />
                            </div>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={strategicData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={30} />
                                        <YAxis tick={{fontSize: 9}} />
                                        <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        
                                        {COHORT_ORDER.map((c) => (
                                            !hiddenCohorts.has(c) && (
                                                <Area 
                                                    key={c} 
                                                    type="monotone" 
                                                    dataKey={c} 
                                                    stackId="1" 
                                                    stroke={COHORT_COLORS[c]} 
                                                    fill={COHORT_COLORS[c]} 
                                                    fillOpacity={0.8} 
                                                    name={c}
                                                    animationDuration={500}
                                                />
                                            )
                                        ))}
                                        
                                        <ReferenceLine x={dateRangeInfo.lastDate.toISOString().slice(0,7)} stroke="#EF4444" strokeWidth={2} label={{ value: 'NOW', position: 'top', fill: '#EF4444', fontSize: 10, fontWeight: 'black' }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 3. Cumulative Growth (New) */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 h-[400px] flex flex-col card-hover animate-entry delay-150">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                創業からの累積{isSales ? '売上' : '客数'}推移 (Cumulative Total)
                                <HelpTooltip title="累積推移" content="創業初日からの実績（および将来予測）を積み上げた総量グラフです。企業の歴史的な総生産量を可視化します。" />
                            </h3>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={strategicData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={50} />
                                        <YAxis tick={{fontSize: 9}} tickFormatter={(val) => isSales ? (val/100000000).toFixed(0) + '億円' : (val/10000).toFixed(0) + '万人'} />
                                        <Tooltip formatter={(val: number) => isSales ? Math.round(val).toLocaleString() + '円' : Math.round(val).toLocaleString() + '人'} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                        <Area type="monotone" dataKey="cumulative" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.1} strokeWidth={3} name={`累積${isSales ? '売上' : '客数'}`} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-entry delay-200">
                            {/* 3. Vintage Chart (Existing) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 h-[400px] flex flex-col card-hover">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display flex items-center gap-1">
                                        Vintage Efficiency Curve (1店舗平均)
                                        <HelpTooltip title="Vintage分析" content="オープン後1ヶ月目、2ヶ月目…という経過月数で揃えた成長カーブです。新しい世代の店舗が過去の店舗より強く育っているかを確認します。" />
                                    </h3>
                                    <CohortLegend />
                                </div>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={vintageCurveData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="period" type="number" tick={{fontSize: 9}} label={{ value: 'Months Since Open', position: 'bottom', offset: 0, fontSize: 9 }} />
                                            <YAxis tick={{fontSize: 9}} />
                                            <Tooltip formatter={(val: number) => val.toLocaleString()} />
                                            {COHORT_ORDER.map(c => (
                                                !hiddenCohorts.has(c) && (
                                                    <Line key={c} type="monotone" dataKey={c} stroke={COHORT_COLORS[c]} strokeWidth={3} dot={false} connectNulls name={c} />
                                                )
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* 4. Portfolio Map (Existing) */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 h-[400px] flex flex-col card-hover">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center gap-1">
                                    Store Portfolio (Growth vs Scale)
                                    <HelpTooltip title="ポートフォリオ" content="各店舗を「成長率(k)」と「規模(L)」で配置した地図です。右上がエース店舗（Star）、左上が安定収益店舗（Cash Cow）です。" />
                                </h3>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis type="number" dataKey="x" name="Growth (k)" tick={{fontSize: 9}} label={{ value: 'Growth Speed (k)', position: 'bottom', offset: 0, fontSize: 9 }} />
                                            <YAxis type="number" dataKey="y" name="Scale (L)" tick={{fontSize: 9}} label={{ value: 'Potential Scale (L)', angle: -90, position: 'left', offset: 0, fontSize: 9 }} />
                                            <ZAxis type="number" dataKey="z" range={[50, 400]} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                            <Scatter name="Stores" data={bubbleData} fill="#005EB8" fillOpacity={0.6} />
                                            <ReferenceLine x={0.1} stroke="#cbd5e1" strokeDasharray="3 3" />
                                            <ReferenceLine y={3000} stroke="#cbd5e1" strokeDasharray="3 3" />
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default DashboardView;
