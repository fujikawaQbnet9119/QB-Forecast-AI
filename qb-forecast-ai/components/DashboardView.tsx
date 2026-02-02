
import React, { useMemo, useState } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Legend, Brush, ReferenceLine,
    AreaChart, Area, ComposedChart, Bar, Cell, BarChart, LabelList
} from 'recharts';
// New Shared Components
import KPICard from './shared/KPICard';
import TrendIndicator from './shared/TrendIndicator';
import ProgressRing from './shared/ProgressRing';
import AlertCard from './shared/AlertCard';
import RankingCard from './shared/RankingCard';

interface DashboardViewProps {
    allStores: { [name: string]: StoreData };
    forecastMonths: number;
    dataType: 'sales' | 'customers';
}

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
// Updated Colors: Grayscale to Blue Gradient for Cohorts (Navy Scheme)
const COHORT_COLORS: Record<string, string> = {
    "Before 2000": "#94a3b8", // Slate 400
    "2001-2005": "#64748b", // Slate 500
    "2006-2010": "#475569", // Slate 600
    "2011-2015": "#60a5fa", // Blue 400
    "2016-2020": "#3b82f6", // Blue 500
    "2021-Present": "#0F2540" // Navy (Highlight)
};

const DashboardView: React.FC<DashboardViewProps> = ({ allStores, forecastMonths, dataType }) => {
    const [viewMode, setViewMode] = useState<'fiscal' | 'strategic'>('fiscal');
    const [hiddenCohorts, setHiddenCohorts] = useState<Set<string>>(new Set());

    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);
    const activeStores = stores.filter(s => s.isActive);
    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';
    const displayDivider = isSales ? 1000 : 1;
    const displayUnit = isSales ? 'M' : '人';

    // --- Data Aggregation Logic (Fully Preserved) ---
    const dateRangeInfo = useMemo(() => {
        const allDates = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => allDates.add(d)));
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime());
        const lastDateStr = sortedDates[sortedDates.length - 1];
        const lastDate = lastDateStr ? new Date(lastDateStr.replace(/\//g, '-')) : new Date();
        let fyStartYear = lastDate.getFullYear();
        if (lastDate.getMonth() < 6) fyStartYear -= 1;
        const fyStartDate = new Date(fyStartYear, 6, 1);
        const fyEndDate = new Date(fyStartYear + 1, 5, 30);
        return { sortedDates, lastDate, fyStartDate, fyEndDate, fyStartYear };
    }, [stores]);

    const aggregatedData = useMemo(() => {
        const { sortedDates, lastDate, fyStartDate, fyEndDate } = dateRangeInfo;

        // Strategic Data Construction
        const combinedDates = [...sortedDates];
        for (let i = 1; i <= forecastMonths; i++) {
            const d = new Date(lastDate);
            d.setMonth(d.getMonth() + i);
            combinedDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
                if (!isFuture) {
                    const idx = s.dates.indexOf(date.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(date.replace(/-/g, '/')) : s.dates.indexOf(date);
                    if (idx !== -1) val = s.raw[idx];
                } else {
                    if (s.isActive) {
                        const monthsDiff = (dateObj.getFullYear() - lastDate.getFullYear()) * 12 + (dateObj.getMonth() - lastDate.getMonth());
                        const idx = s.raw.length + monthsDiff - 1;
                        const tr = logisticModel(idx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                        const sea = s.seasonal[dateObj.getMonth()] || 1.0;
                        const nudge = s.nudge;
                        val = Math.max(0, (tr + nudge) * sea);
                    }
                }
                const budgetKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                if (s.budget && s.budget[budgetKey] && s.budget[budgetKey] > 0) sBudget = s.budget[budgetKey];
                else sBudget = val; // Placeholder budget for strategy view if missing

                if (!isFuture) pt.actualTotal += val;
                else pt.forecastTotal += val;
                pt.budgetTotal += sBudget;
                pt[cLabel] += val;
            });

            pt.actual = !isFuture ? pt.actualTotal : null;
            pt.forecast = isFuture ? pt.forecastTotal : null;
            pt.budget = pt.budgetTotal > 0 ? pt.budgetTotal : null;
            const currentVal = !isFuture ? pt.actualTotal : pt.forecastTotal;
            runningCumulative += currentVal;
            pt.cumulative = runningCumulative;
            if (!isFuture) cumulativeActual = runningCumulative;
            return pt;
        });

        // Fiscal Data Construction
        const fyMonths: string[] = [];
        let curr = new Date(fyStartDate);
        while (curr <= fyEndDate) {
            fyMonths.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
            curr.setMonth(curr.getMonth() + 1);
        }

        let fyCumActual = 0, fyCumBudget = 0, fyCumForecast = 0, fyCumLastYear = 0;
        const fyStoreStats = stores.map(s => {
            let sActual = 0, sBudget = 0, sLastYear = 0, sTotalBudget = 0;
            let hasData = false;
            fyMonths.forEach(month => {
                const dateObj = new Date(month + '-01');
                const prevYearDate = new Date(dateObj); prevYearDate.setFullYear(dateObj.getFullYear() - 1);
                const prevYearMonth = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;
                const isPastOrPresent = dateObj <= lastDate;

                if (s.budget && s.budget[month]) sTotalBudget += s.budget[month];
                else { const idx = s.dates.findIndex(d => d.replace(/\//g, '-') === month); if (idx !== -1) sTotalBudget += s.raw[idx]; }

                if (isPastOrPresent) {
                    const idx = s.dates.findIndex(d => d.replace(/\//g, '-') === month);
                    if (idx !== -1) { sActual += s.raw[idx]; hasData = true; }
                    if (s.budget && s.budget[month]) sBudget += s.budget[month];
                    else { const idxFallback = s.dates.findIndex(d => d.replace(/\//g, '-') === month); if (idxFallback !== -1) sBudget += s.raw[idxFallback]; }
                }
                if (isPastOrPresent) {
                    const idxLY = s.dates.findIndex(d => d.replace(/\//g, '-') === prevYearMonth);
                    if (idxLY !== -1) sLastYear += s.raw[idxLY];
                }
            });
            return { name: s.name, block: s.block || 'Unknown', actual: sActual, budget: sBudget, totalBudget: sTotalBudget, lastYear: sLastYear, diff: sActual - sBudget, achievement: sBudget > 0 ? (sActual / sBudget) * 100 : 0, hasData };
        });

        const achievementBuckets = Array(6).fill(0);
        fyStoreStats.filter(s => s.hasData).forEach(s => {
            if (s.achievement < 80) achievementBuckets[0]++;
            else if (s.achievement < 90) achievementBuckets[1]++;
            else if (s.achievement < 100) achievementBuckets[2]++;
            else if (s.achievement < 110) achievementBuckets[3]++;
            else if (s.achievement < 120) achievementBuckets[4]++;
            else achievementBuckets[5]++;
        });
        const fiscalDistData = [
            { range: '<80%', count: achievementBuckets[0], fill: '#ef4444' }, { range: '80-90%', count: achievementBuckets[1], fill: '#f97316' },
            { range: '90-100%', count: achievementBuckets[2], fill: '#f59e0b' }, { range: '100-110%', count: achievementBuckets[3], fill: '#10b981' },
            { range: '110-120%', count: achievementBuckets[4], fill: '#3b82f6' }, { range: '>120%', count: achievementBuckets[5], fill: '#0F2540' },
        ];

        const regionalAgg: Record<string, { actual: number, budget: number }> = {};
        fyStoreStats.filter(s => s.hasData).forEach(s => {
            if (!regionalAgg[s.block]) regionalAgg[s.block] = { actual: 0, budget: 0 };
            regionalAgg[s.block].actual += s.actual;
            regionalAgg[s.block].budget += s.budget;
        });
        const fiscalRegionalData = Object.entries(regionalAgg).map(([block, val]) => ({ name: block, achievement: val.budget > 0 ? (val.actual / val.budget) * 100 : 0 })).sort((a, b) => b.achievement - a.achievement);
        const sortedGap = fyStoreStats.filter(s => s.hasData).sort((a, b) => b.diff - a.diff);
        const fiscalWaterfallData = [...sortedGap.slice(0, 5), ...sortedGap.slice(-5)].sort((a, b) => b.diff - a.diff);

        const fyChartData = fyMonths.map(month => {
            let mActual = 0, mBudget = 0, mForecast = 0, mLastYear = 0;
            let hasActual = false;
            const dateObj = new Date(month + '-01');
            const prevYearDate = new Date(dateObj); prevYearDate.setFullYear(dateObj.getFullYear() - 1);
            const prevYearMonth = `${prevYearDate.getFullYear()}-${String(prevYearDate.getMonth() + 1).padStart(2, '0')}`;
            const isPastOrPresent = dateObj <= lastDate;

            stores.forEach(s => {
                let sActual = 0, sForecast = 0;
                if (isPastOrPresent) {
                    const idx = s.dates.indexOf(month.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(month.replace(/-/g, '/')) : s.dates.indexOf(month);
                    if (idx !== -1) { sActual = s.raw[idx]; mActual += sActual; hasActual = true; }
                }
                if (!isPastOrPresent && s.isActive) {
                    const monthsDiff = (dateObj.getFullYear() - lastDate.getFullYear()) * 12 + (dateObj.getMonth() - lastDate.getMonth());
                    const idx = s.raw.length + monthsDiff - 1;
                    const tr = logisticModel(idx, s.fit.params, s.fit.mode, s.fit.shockIdx);
                    const sea = s.seasonal[dateObj.getMonth()] || 1.0;
                    const nudge = s.nudge;
                    sForecast = Math.max(0, (tr + nudge) * sea);
                    mForecast += sForecast;
                } else if (isPastOrPresent) sForecast = sActual;

                if (s.budget && s.budget[month] && s.budget[month] > 0) mBudget += s.budget[month];
                else mBudget += isPastOrPresent ? sActual : sForecast;

                const idxLY = s.dates.indexOf(prevYearMonth.replace(/-/g, '/')) !== -1 ? s.dates.indexOf(prevYearMonth.replace(/-/g, '/')) : s.dates.indexOf(prevYearMonth);
                if (idxLY !== -1) mLastYear += s.raw[idxLY];
            });

            if (isPastOrPresent) mForecast = mActual;
            if (hasActual) fyCumActual += mActual;
            fyCumBudget += mBudget;
            fyCumForecast += (hasActual ? mActual : mForecast);
            fyCumLastYear += mLastYear;

            return { month, actual: hasActual ? mActual : null, budget: mBudget, lastYear: mLastYear, forecast: hasActual ? null : Math.round(mForecast), cumActual: hasActual ? fyCumActual : null, cumBudget: fyCumBudget, cumLastYear: fyCumLastYear, cumForecast: fyCumForecast, diff: hasActual ? mActual - mBudget : null, yoy: (hasActual && mLastYear > 0) ? ((mActual - mLastYear) / mLastYear) * 100 : null, isClosed: hasActual };
        });

        let lastClosedMonthIdx = -1;
        for (let i = fyChartData.length - 1; i >= 0; i--) { if (fyChartData[i].isClosed) { lastClosedMonthIdx = i; break; } }
        const currentProgress = fyChartData[lastClosedMonthIdx];
        const landingPrediction = fyChartData[fyChartData.length - 1];
        const totalBudgetFY = landingPrediction.cumBudget;
        const totalForecastFY = landingPrediction.cumForecast;
        const ytdLastYear = currentProgress?.cumLastYear || 0;
        const ytdYoY = ytdLastYear > 0 ? (((currentProgress?.cumActual || 0) - ytdLastYear) / ytdLastYear) * 100 : 0;
        const totalLastYearFY = landingPrediction.cumLastYear;
        const landingYoY = totalLastYearFY > 0 ? ((totalForecastFY - totalLastYearFY) / totalLastYearFY) * 100 : 0;
        const gini = calculateGini(activeStores.map(s => s.stats?.lastYearSales || 0));

        const vGroups: Record<string, { sums: number[], counts: number[] }> = {};
        stores.forEach(s => {
            const cLabel = get5YearCohort(s.dates[0]);
            if (!vGroups[cLabel]) vGroups[cLabel] = { sums: Array(60).fill(0), counts: Array(60).fill(0) };
            s.raw.forEach((v, i) => { if (i < 60) { vGroups[cLabel].sums[i] += v; vGroups[cLabel].counts[i]++; } });
        });
        const vintageCurveData = Array.from({ length: 60 }, (_, i) => {
            const p: any = { period: i + 1 };
            Object.keys(vGroups).forEach(k => { if (vGroups[k].counts[i] >= 1) p[k] = Math.round(vGroups[k].sums[i] / vGroups[k].counts[i]); });
            return p;
        });

        const ltvRankingData = activeStores.map(s => ({ name: s.name, ltv: s.raw.reduce((a, b) => a + b, 0), age: s.raw.length })).sort((a, b) => b.ltv - a.ltv).slice(0, 20);
        const ytdBudget = currentProgress?.cumBudget || 0;
        const ytdActual = currentProgress?.cumActual || 0;
        const remainingBudget = totalBudgetFY - ytdActual;
        const remainingMonthsCount = 12 - (lastClosedMonthIdx + 1);
        const requiredRunRate = remainingMonthsCount > 0 && remainingBudget > 0 ? (remainingBudget / remainingMonthsCount) / (totalBudgetFY / 12) * 100 : 0;
        const achievedStoresCount = fyStoreStats.filter(s => s.hasData && s.achievement >= 100).length;
        const winRate = fyStoreStats.filter(s => s.hasData).length > 0 ? (achievedStoresCount / fyStoreStats.filter(s => s.hasData).length) * 100 : 0;
        const topContributor = sortedGap.length > 0 ? sortedGap[0] : { name: '-', diff: 0 };
        const totalL = activeStores.reduce((a, s) => a + s.params.L, 0);
        const capacityUtilization = (totalL * 12) > 0 ? (activeStores.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0) / (totalL * 12)) * 100 : 0;
        const totalGrowthGap = (totalL * 12) - activeStores.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
        const avgK = activeStores.length > 0 ? activeStores.reduce((a, s) => a + s.params.k, 0) / activeStores.length : 0;
        const avgCAGR = activeStores.length > 0 ? activeStores.reduce((a, s) => a + (s.stats?.cagr || 0), 0) / activeStores.length * 100 : 0;
        const shiftModeCount = activeStores.filter(s => s.fit.mode === 'shift' || s.fit.mode === 'dual_shift').length;
        const standardModeCount = activeStores.filter(s => s.fit.mode === 'standard').length;
        const seasonalityStrength = activeStores.length > 0 ? activeStores.reduce((a, s) => a + (Math.max(...s.seasonal) - Math.min(...s.seasonal)), 0) / activeStores.length : 0;
        const totalNudge = activeStores.reduce((a, s) => a + Math.abs(s.nudge), 0);
        const avgLTV = activeStores.length > 0 ? activeStores.reduce((a, s) => a + s.raw.reduce((x, y) => x + y, 0), 0) / activeStores.length : 0;

        // Ranking Data for Top/Bottom Performers
        const topPerformers = fyStoreStats
            .filter(s => s.hasData)
            .sort((a, b) => b.achievement - a.achievement)
            .slice(0, 5)
            .map(s => ({
                name: s.name,
                value: s.achievement,
                change: s.lastYear > 0 ? ((s.actual - s.lastYear) / s.lastYear) * 100 : 0,
                subtitle: `${Math.round(s.actual / displayDivider).toLocaleString()} ${displayUnit}`
            }));

        const bottomPerformers = fyStoreStats
            .filter(s => s.hasData)
            .sort((a, b) => a.achievement - b.achievement)
            .slice(0, 5)
            .map(s => ({
                name: s.name,
                value: s.achievement,
                change: s.lastYear > 0 ? ((s.actual - s.lastYear) / s.lastYear) * 100 : 0,
                subtitle: `${Math.round(s.actual / displayDivider).toLocaleString()} ${displayUnit}`
            }));

        // Hotspot Detection (Rapid Growth/Decline)
        const alerts: Array<{ type: 'success' | 'warning' | 'danger' | 'info'; title: string; message: string }> = [];

        // Check for rapid growth stores
        const rapidGrowth = fyStoreStats.filter(s => s.hasData && s.lastYear > 0 && ((s.actual - s.lastYear) / s.lastYear) > 0.2);
        if (rapidGrowth.length > 0) {
            alerts.push({
                type: 'success',
                title: '急成長店舗を検出',
                message: `${rapidGrowth[0].name}が前年比+${(((rapidGrowth[0].actual - rapidGrowth[0].lastYear) / rapidGrowth[0].lastYear) * 100).toFixed(1)}%の成長を記録`
            });
        }

        // Check for underperforming stores
        const underperforming = fyStoreStats.filter(s => s.hasData && s.achievement < 80);
        if (underperforming.length > 0) {
            alerts.push({
                type: 'danger',
                title: '要注意店舗あり',
                message: `${underperforming.length}店舗が達成率80%未満。早急な対策が必要です。`
            });
        }

        // Check if landing forecast is below budget
        if (totalForecastFY < totalBudgetFY) {
            const gap = totalBudgetFY - totalForecastFY;
            alerts.push({
                type: 'warning',
                title: '着地予測が予算未達',
                message: `現在のペースでは予算に対し${Math.round(gap / displayDivider).toLocaleString()}${displayUnit}不足。挽回策の検討を推奨。`
            });
        }

        return {
            strategicData, fyChartData, vintageCurveData, fiscalDistData, fiscalRegionalData, fiscalWaterfallData, ltvRankingData,
            topPerformers, bottomPerformers, alerts,
            kpis: {
                fyLabel: `${dateRangeInfo.fyStartYear}年度 (Jul-Jun)`,
                currentMonth: currentProgress?.month,
                totalBudget: totalBudgetFY, ytdBudget, ytdActual, ytdDiff: ytdActual - ytdBudget, ytdAchievement: ytdBudget > 0 ? (ytdActual / ytdBudget) * 100 : 0, ytdYoY,
                currentBudget: currentProgress?.budget || 0, currentActual: currentProgress?.actual || 0, currentAchievement: (currentProgress?.budget || 0) > 0 ? ((currentProgress?.actual || 0) / currentProgress!.budget) * 100 : 0,
                remainingBudget, requiredRunRate, landingForecast: totalForecastFY, landingDiff: totalForecastFY - totalBudgetFY, landingAchievement: totalBudgetFY > 0 ? (totalForecastFY / totalBudgetFY) * 100 : 0,
                achievedStoresCount, missedStoresCount: fyStoreStats.filter(s => s.hasData).length - achievedStoresCount, storeWinRate: winRate, topContributorName: topContributor.name, topContributorVal: topContributor.diff,
                totalStoreCount: stores.length, activeStoreCount: activeStores.length, avgAge: activeStores.reduce((a, s) => a + s.raw.length, 0) / activeStores.length, totalCapacityL: totalL, capacityUtilization, totalGrowthGap, avgK, avgCAGR, shiftModeCount, standardModeCount, seasonalityStrength, totalNudge, rankACount: activeStores.filter(s => s.stats?.abcRank === 'A').length, rankCCount: activeStores.filter(s => s.stats?.abcRank === 'C').length, gini, highRiskCount: activeStores.filter(s => (s.stats?.cv || 0) > 0.15).length, cumulativeActual, avgLTV
            },
            bubbleData: activeStores.map(s => ({ x: Number(s.params.k.toFixed(3)), y: Math.round(s.params.L), z: Math.round(s.stats?.lastYearSales || 0), name: s.name, cluster: s.raw.length < 24 ? 1 : 0 })),
        };
    }, [stores, activeStores, forecastMonths, dateRangeInfo, displayDivider]);

    const { kpis, fyChartData, strategicData, vintageCurveData, bubbleData, fiscalDistData, fiscalRegionalData, fiscalWaterfallData, ltvRankingData, topPerformers, bottomPerformers, alerts } = aggregatedData;

    // --- Modernized Components (Navy/Vermilion) ---
    const KpiCard = ({ title, value, sub, color = "border-[#0F2540]", unit = "", delay = "" }: any) => (
        <div className={`glass-card p-5 rounded-[2rem] flex flex-col justify-between h-full relative overflow-hidden group animate-entry ${delay}`}>
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color === "success" ? "from-emerald-400 to-green-500" : color === "danger" ? "from-red-400 to-rose-500" : color === "warning" ? "from-amber-400 to-orange-500" : "from-[#0F2540] to-blue-800"}`}></div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-slate-600 transition-colors">{title}</p>
                <div className="flex items-baseline gap-1 relative z-10">
                    <h3 className="text-2xl font-black text-slate-800 font-display tracking-tight">{value}</h3>
                    <span className="text-xs font-bold text-slate-400">{unit}</span>
                </div>
            </div>
            {sub && <p className="text-[10px] font-bold text-slate-400 mt-3 pt-3 border-t border-slate-100">{sub}</p>}
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-gradient-to-br from-slate-50 to-white opacity-50 group-hover:scale-150 transition-transform duration-500 z-0"></div>
        </div>
    );

    const ChartContainer = ({ title, children, className = "" }: any) => (
        <div className={`glass-card p-6 rounded-[2.5rem] flex flex-col shadow-sm ${className}`}>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 font-display flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0F2540]"></span>
                {title}
            </h3>
            <div className="flex-1 w-full min-h-0">
                {children}
            </div>
        </div>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn">
            <div className="max-w-[1600px] mx-auto space-y-8 pb-32">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-[#0F2540] uppercase tracking-tighter font-display">全社ダッシュボード</h2>
                            <span className="bg-blue-50 text-[#0F2540] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                                {viewMode === 'fiscal' ? 'FY24 Budget Management' : 'Strategic Monitor'}
                            </span>
                        </div>
                        <p className="text-xs font-bold text-gray-400">
                            {viewMode === 'fiscal' ? `現在進捗: ${kpis.currentMonth || 'Start'}` : '構造改革・成長投資'}
                        </p>
                    </div>

                    <div className="bg-white/80 backdrop-blur rounded-2xl p-1 shadow-sm border border-white/50 flex">
                        <button onClick={() => setViewMode('fiscal')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 btn-press ${viewMode === 'fiscal' ? 'bg-[#0F2540] text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>
                            <i className="fas fa-chart-pie"></i> 予実管理 (Fiscal)
                        </button>
                        <button onClick={() => setViewMode('strategic')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 btn-press ${viewMode === 'strategic' ? 'bg-[#0F2540] text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>
                            <i className="fas fa-rocket"></i> 戦略KPI (Strategy)
                        </button>
                    </div>
                </div>

                {viewMode === 'fiscal' && (
                    <div className="space-y-6">
                        {/* Enhanced KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            <KPICard
                                title="Total Budget"
                                subtitle="予算総額"
                                value={`${Math.round(kpis.totalBudget / displayDivider).toLocaleString()}`}
                                icon="fa-bullseye"
                                color="blue"
                            />
                            <KPICard
                                title="YTD Actual"
                                subtitle="累計実績"
                                value={`${Math.round(kpis.ytdActual / displayDivider).toLocaleString()}`}
                                icon="fa-chart-line"
                                color="blue"
                                change={kpis.ytdYoY}
                                changeLabel="vs 前年"
                            />
                            <KPICard
                                title="YTD Diff"
                                subtitle="累計乖離"
                                value={`${kpis.ytdDiff / displayDivider > 0 ? '+' : ''}${Math.round(kpis.ytdDiff / displayDivider).toLocaleString()}`}
                                icon={kpis.ytdDiff >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}
                                color={kpis.ytdDiff >= 0 ? "green" : "red"}
                                trend={kpis.ytdDiff >= 0 ? "up" : "down"}
                            />
                            <KPICard
                                title="Achievement"
                                subtitle="達成率"
                                value={kpis.ytdAchievement.toFixed(1)}
                                icon="fa-percentage"
                                color={kpis.ytdAchievement >= 100 ? "green" : kpis.ytdAchievement >= 90 ? "yellow" : "red"}
                                change={kpis.ytdAchievement - 100}
                                changeLabel="vs 100%"
                            />
                            <KPICard
                                title="Landing Forecast"
                                subtitle="着地予測"
                                value={`${Math.round(kpis.landingForecast / displayDivider).toLocaleString()}`}
                                icon="fa-rocket"
                                color={kpis.landingAchievement >= 100 ? "green" : "yellow"}
                            />
                            <KPICard
                                title="Store Win Rate"
                                subtitle={`${kpis.achievedStoresCount}/${kpis.activeStoreCount}店舗`}
                                value={kpis.storeWinRate.toFixed(1)}
                                icon="fa-trophy"
                                color={kpis.storeWinRate >= 70 ? "green" : kpis.storeWinRate >= 50 ? "yellow" : "red"}
                            />
                        </div>

                        {/* Charts Row 1 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[420px]">
                            <ChartContainer title="月次予実推移 (Budget vs Actual Trend)" className="lg:col-span-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={fyChartData} margin={{ top: 20, right: 30, bottom: 0, left: 0 }}>
                                        <defs>
                                            <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0F2540" stopOpacity={0.8} /><stop offset="95%" stopColor="#0F2540" stopOpacity={0.4} /></linearGradient>
                                            <linearGradient id="colorBud" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e2e8f0" stopOpacity={0.8} /><stop offset="95%" stopColor="#e2e8f0" stopOpacity={0.4} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} tickFormatter={(v) => v.split('-')[1]} />
                                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[80, 120]} />
                                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f8fafc' }} formatter={(v: number) => Math.round(v).toLocaleString()} />
                                        <Bar yAxisId="left" dataKey="budget" name="予算" fill="url(#colorBud)" radius={[6, 6, 6, 6]} barSize={12} />
                                        <Bar yAxisId="left" dataKey="actual" name="実績" fill="url(#colorAct)" radius={[6, 6, 6, 6]} barSize={12} />
                                        <Line yAxisId="right" type="monotone" dataKey="achievement" stroke="#EE4B2B" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartContainer>

                            <ChartContainer title="予実乖離ウォーターフォール (Variance)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fiscalWaterfallData} layout="vertical" margin={{ left: 40, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" tick={{ fontSize: 10 }} hide />
                                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} interval={0} />
                                        <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)' }} formatter={(v: number) => Math.round(v).toLocaleString()} />
                                        <ReferenceLine x={0} stroke="#cbd5e1" />
                                        <Bar dataKey="diff" radius={[0, 4, 4, 0]} barSize={16}>
                                            {fiscalWaterfallData.map((entry, index) => (
                                                <Cell key={index} fill={entry.diff > 0 ? '#10B981' : '#EF4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </div>

                        {/* Charts Row 2 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
                            <ChartContainer title="ブロック別 達成状況 (Block Performance)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fiscalRegionalData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" domain={[80, 120]} hide />
                                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <ReferenceLine x={100} stroke="#cbd5e1" strokeDasharray="3 3" />
                                        <Bar dataKey="achievement" radius={[0, 6, 6, 0]} barSize={24}>
                                            {fiscalRegionalData.map((entry, index) => (
                                                <Cell key={index} fill={entry.achievement >= 100 ? '#10B981' : '#F59E0B'} />
                                            ))}
                                            <LabelList dataKey="achievement" position="right" fontSize={10} fontWeight="bold" formatter={(v: number) => v.toFixed(1) + '%'} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>

                            <ChartContainer title="達成率分布 (Achievement Dist)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fiscalDistData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="range" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} />
                                        <Bar dataKey="count" radius={[8, 8, 8, 8]} barSize={40}>
                                            {fiscalDistData.map((e, i) => (
                                                <Cell key={i} fill={e.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </div>

                        {/* Alerts & Rankings Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Alerts */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 font-display flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    アラート & インサイト
                                </h3>
                                {alerts.length > 0 ? (
                                    alerts.map((alert, idx) => (
                                        <AlertCard
                                            key={idx}
                                            type={alert.type}
                                            title={alert.title}
                                            message={alert.message}
                                        />
                                    ))
                                ) : (
                                    <AlertCard
                                        type="success"
                                        title="順調です"
                                        message="現在、重要なアラートはありません。"
                                    />
                                )}
                            </div>

                            {/* Top Performers */}
                            <RankingCard
                                title="Top Performers"
                                items={topPerformers}
                                type="top"
                                valueFormatter={(v) => `${v.toFixed(1)}%`}
                                icon="fa-trophy"
                                maxItems={5}
                            />

                            {/* Bottom Performers */}
                            <RankingCard
                                title="要改善店舗"
                                items={bottomPerformers}
                                type="bottom"
                                valueFormatter={(v) => `${v.toFixed(1)}%`}
                                icon="fa-exclamation-triangle"
                                maxItems={5}
                            />
                        </div>
                    </div>
                )}

                {viewMode === 'strategic' && (
                    <div className="space-y-6">
                        {/* Strategic KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            <KPICard
                                title="Total Capacity"
                                subtitle="総潜在能力 (L)"
                                value={`${Math.round(kpis.totalCapacityL / displayDivider).toLocaleString()}`}
                                icon="fa-warehouse"
                                color="purple"
                            />
                            <KPICard
                                title="Utilization"
                                subtitle="ポテンシャル消化率"
                                value={kpis.capacityUtilization.toFixed(1)}
                                icon="fa-gauge-high"
                                color={kpis.capacityUtilization > 80 ? "yellow" : "green"}
                                change={kpis.capacityUtilization - 70}
                                changeLabel="vs 70%"
                            />
                            <KPICard
                                title="Growth Gap"
                                subtitle="未開拓ギャップ"
                                value={`${Math.round(kpis.totalGrowthGap / displayDivider).toLocaleString()}`}
                                icon="fa-chart-gap"
                                color="yellow"
                            />
                            <KPICard
                                title="Avg Growth Rate"
                                subtitle="平均成長速度 (k)"
                                value={kpis.avgK.toFixed(3)}
                                icon="fa-rocket"
                                color="blue"
                            />
                            <KPICard
                                title="3Y CAGR"
                                subtitle="3年平均成長率"
                                value={kpis.avgCAGR.toFixed(1)}
                                icon="fa-chart-line-up"
                                color={kpis.avgCAGR > 0 ? "green" : "red"}
                                trend={kpis.avgCAGR > 0 ? "up" : "down"}
                            />
                            <KPICard
                                title="Gini Coefficient"
                                subtitle="ジニ係数"
                                value={kpis.gini.toFixed(3)}
                                icon="fa-balance-scale"
                                color={kpis.gini > 0.4 ? "red" : "green"}
                            />
                        </div>

                        {/* Strategic Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[450px]">
                            <ChartContainer title="長期成長軌道 (Long-term Forecast)" className="lg:col-span-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={strategicData} margin={{ top: 20, right: 30, bottom: 0, left: 0 }}>
                                        <defs>
                                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0F2540" stopOpacity={0.2} /><stop offset="95%" stopColor="#0F2540" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={50} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} formatter={(v: number) => Math.round(v).toLocaleString()} />
                                        <Area type="monotone" dataKey="actual" stroke="#0F2540" fill="url(#colorTotal)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="forecast" stroke="#93c5fd" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                        <ReferenceLine x={dateRangeInfo.lastDate.toISOString().slice(0, 7)} stroke="#F59E0B" strokeDasharray="3 3" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartContainer>

                            <ChartContainer title="累積成長カーブ (Cumulative)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={strategicData} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                                        <defs>
                                            <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={60} />
                                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} formatter={(v: number) => Math.round(v).toLocaleString()} />
                                        <Area type="monotone" dataKey="cumulative" stroke="#10b981" fill="url(#colorCum)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
                            <ChartContainer title="コホート分析 (Vintage Stack)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={strategicData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={50} />
                                        <Tooltip formatter={(v: number) => Math.round(v).toLocaleString()} />
                                        {COHORT_ORDER.map((c) => (
                                            !hiddenCohorts.has(c) && (
                                                <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={COHORT_COLORS[c]} fill={COHORT_COLORS[c]} fillOpacity={0.8} />
                                            )
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartContainer>

                            <ChartContainer title="ポートフォリオ (Scale vs Speed)">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis type="number" dataKey="x" name="k" tick={{ fontSize: 10 }} label={{ value: '成長速度 (k)', position: 'bottom', offset: 0, fontSize: 10 }} />
                                        <YAxis type="number" dataKey="y" name="L" tick={{ fontSize: 10 }} label={{ value: '潜在規模 (L)', angle: -90, position: 'left', offset: 0, fontSize: 10 }} />
                                        <ZAxis type="number" dataKey="z" range={[50, 400]} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                        <Scatter name="Stores" data={bubbleData} fill="#0F2540" fillOpacity={0.6} />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardView;
