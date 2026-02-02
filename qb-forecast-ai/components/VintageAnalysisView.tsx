
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { StoreData } from '../types';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, ComposedChart, Line, Area, Legend, ReferenceLine, Label
} from 'recharts';

interface VintageAnalysisViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

// --- Constants & Types ---

const GROWTH_TYPES: Record<string, { color: string; text: string; desc: string; support: boolean }> = {
    '継続成長型': { color: '#005BAC', text: 'white', desc: '高水準・高成長 (導入High/成長High)', support: false },
    '早期ピーク型': { color: '#F59E0B', text: 'white', desc: '初期急伸・後停滞 (導入High/成長Low)', support: false },
    '成熟安定型': { color: '#10B981', text: 'white', desc: '高水準・安定 (導入High/Slope Low)', support: false },
    '巻き返し型': { color: '#8B5CF6', text: 'white', desc: '再成長・要支援 (導入High/初期苦戦)', support: true },
    '跳ね返し型': { color: '#EC4899', text: 'white', desc: '急回復・要支援 (導入Low/高成長)', support: true },
    '立ち上がり型': { color: '#6366F1', text: 'white', desc: '徐々に上昇 (導入Low/着実成長)', support: true },
    '見極め型': { color: '#F97316', text: 'white', desc: '回復兆し (導入Low/要経過観察)', support: true },
    '成長難航型': { color: '#EF4444', text: 'white', desc: '低迷・要判断 (導入Low/成長Low)', support: true },
    '分類外': { color: '#94A3B8', text: 'white', desc: 'パターン合致せず', support: false },
    '新店': { color: '#0EA5E9', text: 'white', desc: '新規開業 (データ蓄積中)', support: false },
    'データ不足': { color: '#CBD5E1', text: 'slate-600', desc: 'データ不足/閉店', support: false },
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    '高水準': { label: '高水準', color: '#047857', bg: '#d1fae5', dot: '#10B981' },
    '標準': { label: '標準', color: '#334155', bg: '#f1f5f9', dot: '#3B82F6' },
    '注意': { label: '注意', color: '#b91c1c', bg: '#fee2e2', dot: '#EF4444' },
    '好調型': { label: '好調', color: '#15803d', bg: '#dcfce7', dot: '#10B981' },
    '成長進行型': { label: '成長進行', color: '#0369a1', bg: '#e0f2fe', dot: '#3B82F6' },
    '成長停滞型': { label: '成長停滞', color: '#b45309', bg: '#fef3c7', dot: '#F59E0B' },
    '回復基調型': { label: '回復基調', color: '#0891b2', bg: '#cffafe', dot: '#06B6D4' },
    '難航型': { label: '難航', color: '#be123c', bg: '#ffe4e6', dot: '#EF4444' },
    '-': { label: '-', color: '#94a3b8', bg: '#f1f5f9', dot: '#CBD5E1' }
};

// Checkpoints: 7, 13, 19, 25, 37
const REVIEW_CHECKPOINTS = [7, 13, 19, 25, 37];

// --- Analytics Logic Helpers ---

const isCovidException = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    return y === 2020 && (m === 2 || m === 3 || m === 4);
};

const calculateLinearRegression = (x: number[], y: number[]) => {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0 };
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    if (n * sumXX - sumX * sumX === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
};

const calculateSeasonalityIndices = (allStores: StoreData[]) => {
    const monthRatios = Array(12).fill(0).map(() => [] as number[]);
    allStores.forEach(store => {
        const records = store.dates.map((d, i) => ({
            date: new Date(d.replace(/\//g, '-')),
            sales: store.raw[i]
        })).filter(r => !isNaN(r.date.getTime()) && r.sales > 0);

        const validRecords = records.filter(r => !isCovidException(r.date));
        if (validRecords.length < 36) return;

        for (let i = 6; i < validRecords.length - 6; i++) {
            const window = validRecords.slice(i - 6, i + 6);
            const trend = window.reduce((sum, r) => sum + r.sales, 0) / 12;
            if (trend > 0) {
                monthRatios[validRecords[i].date.getMonth()].push(validRecords[i].sales / trend);
            }
        }
    });
    const indices = monthRatios.map(ratios =>
        ratios.length === 0 ? 1.0 : ratios.reduce((a, b) => a + b, 0) / ratios.length
    );
    const avg = indices.reduce((a, b) => a + b, 0) / 12;
    return indices.map(v => v / avg);
};

const getDynamicSlopeThreshold = (monthAge: number) => {
    if (monthAge <= 18) return 36;
    if (monthAge <= 24) return 27;
    if (monthAge <= 36) return 16;
    return 10;
};

const evaluateGrowthStatus = (avg: number | null, slope: number | null, monthAge: number) => {
    if (avg === null || slope === null) return '-';
    const requiredSlope = getDynamicSlopeThreshold(monthAge);
    const TH_S = 2500;
    const TH_A = 2000;
    if (avg >= TH_S) return '好調型';
    if (avg >= TH_A) return slope >= requiredSlope ? '成長進行型' : '成長停滞型';
    return slope >= requiredSlope ? '回復基調型' : '難航型';
};

// Logistic Scenario Calculation
const calculateLogisticScenario = (baseCapacity: number, startMonthIdx: number, startDate: Date, seasonalIndices: number[], K: number, r: number, t0: number, targetEndMonth = 60) => {
    const logistic = (t: number) => K / (1 + Math.exp(-r * (t - t0)));
    const currentLogisticY = logistic(startMonthIdx);
    const scenarioData = [];
    for (let m = startMonthIdx + 1; m <= targetEndMonth; m++) {
        const futureDate = new Date(startDate);
        futureDate.setMonth(startDate.getMonth() + (m - startMonthIdx));
        const futureLogisticY = logistic(m);
        const netGain = Math.max(0, futureLogisticY - currentLogisticY);
        const sIdx = futureDate.getMonth();
        const sea = seasonalIndices[sIdx] || 1.0;
        const val = (baseCapacity + netGain) * sea;
        scenarioData.push({
            month_idx: m,
            sales: val,
            date_str: futureDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' })
        });
    }
    return scenarioData;
};

const generatePredictions = (currentData: any[], seasonalIndices: number[], isClosed: boolean, isDetailMode: boolean) => {
    const lastRecord = currentData[currentData.length - 1];
    const lastMonthIdx = lastRecord.month_idx;
    const lastDate = lastRecord.date;
    
    // Quick fallback for closed or mature stores, or list mode partial calc
    if (isClosed || lastMonthIdx >= 38) {
        const validData = currentData.filter(d => !isCovidException(d.date));
        const recent = validData.slice(-3);
        const deseasonalized = recent.map(r => r.sales / (seasonalIndices[r.date.getMonth()] || 1.0));
        const base = deseasonalized.length ? deseasonalized.reduce((a, b) => a + b, 0) / deseasonalized.length : 0;
        return { standard: [], upper: [], lower: [], base_line: base };
    }

    const validData = currentData.filter(d => !isCovidException(d.date));
    const recent = validData.slice(-3);
    let baseCapacity = 2000;
    if (recent.length > 0) {
        const deseasonalized = recent.map(r => r.sales / (seasonalIndices[r.date.getMonth()] || 1.0));
        baseCapacity = deseasonalized.reduce((a, b) => a + b, 0) / deseasonalized.length;
    }

    // Optimization: Only calculate Standard prediction for list view (needed for cumulative sum)
    // Upper/Lower are only needed for detail chart.
    const standard = calculateLogisticScenario(baseCapacity, lastMonthIdx, lastDate, seasonalIndices, 1500, 0.15, 24);
    
    if (!isDetailMode) {
        return {
            upper: [],
            standard: standard,
            lower: [],
            base_line: baseCapacity
        };
    }

    return {
        upper: calculateLogisticScenario(baseCapacity, lastMonthIdx, lastDate, seasonalIndices, 2500, 0.25, 20),
        standard: standard,
        lower: calculateLogisticScenario(baseCapacity, lastMonthIdx, lastDate, seasonalIndices, 100, 0.10, 30),
        base_line: baseCapacity
    };
};

// Main Analysis Function for Vintage View
const analyzeShopData = (store: StoreData, seasonalIndices: number[], globalMaxDate: Date, isSales: boolean, isDetailMode: boolean) => {
    // 1. Data Preparation (Vintage Format)
    const firstIdx = store.raw.findIndex(v => v > 0);
    if (firstIdx === -1) return null;

    const startDate = new Date(store.dates[firstIdx].replace(/\//g, '-'));
    const monthlyData = store.raw.slice(firstIdx).map((sales, i) => {
        const date = new Date(startDate);
        date.setMonth(startDate.getMonth() + i);
        return {
            month_idx: i + 2, // Data starts from Month 2
            sales: sales,
            date_str: date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' }),
            date: date
        };
    });

    const maxMonth = monthlyData.length;
    let is_closed = !store.isActive;

    // 2. Metrics & Classification (Specification 4: 8 Types Classification)
    const validDataForMetrics = monthlyData.filter(d => !isCovidException(d.date));
    // NOTE: Analysis starts from Month 2. Range 2-13 is the first 12 months data.
    const initPhase = validDataForMetrics.filter(d => d.month_idx >= 2 && d.month_idx <= 13);
    const growthPhase = validDataForMetrics.filter(d => d.month_idx >= 14 && d.month_idx <= 37);
    
    let init_avg: number | null = null, init_slope: number | null = null;
    let growth_avg: number | null = null, growth_slope: number | null = null;

    if (initPhase.length >= 2) {
        init_avg = initPhase.reduce((acc, cur) => acc + cur.sales, 0) / initPhase.length;
        init_slope = calculateLinearRegression(initPhase.map(d => d.month_idx), initPhase.map(d => d.sales)).slope;
    }
    if (growthPhase.length >= 2) {
        growth_avg = growthPhase.reduce((acc, cur) => acc + cur.sales, 0) / growthPhase.length;
        growth_slope = calculateLinearRegression(growthPhase.map(d => d.month_idx), growthPhase.map(d => d.sales)).slope;
    }

    // Thresholds
    const TH_INIT_AVG = isSales ? 1800 : 1500; 
    const TH_INIT_SLOPE = isSales ? 36 : 30;
    const TH_GROWTH_AVG = isSales ? 2000 : 1600;
    const TH_GROWTH_SLOPE = isSales ? 10 : 8;

    let growthType = '分類外';
    if (init_avg !== null && init_slope !== null && growth_avg !== null && growth_slope !== null) {
        const isInitAvgHigh = init_avg >= TH_INIT_AVG;
        const isInitSlopeHigh = init_slope >= TH_INIT_SLOPE;
        const isGrowthAvgHigh = growth_avg >= TH_GROWTH_AVG;
        const isGrowthSlopeHigh = growth_slope >= TH_GROWTH_SLOPE;

        if (isGrowthAvgHigh) {
            // High Group
            if (isInitAvgHigh && isInitSlopeHigh && isGrowthSlopeHigh) growthType = '継続成長型';
            else if (isInitAvgHigh && isInitSlopeHigh && !isGrowthSlopeHigh) growthType = '早期ピーク型';
            else if (isInitAvgHigh && !isInitSlopeHigh && !isGrowthSlopeHigh) growthType = '成熟安定型';
            else if (isInitAvgHigh && !isInitSlopeHigh && isGrowthSlopeHigh) growthType = '巻き返し型';
            else if (!isInitAvgHigh && isInitSlopeHigh && isGrowthSlopeHigh) growthType = '跳ね返し型';
            else growthType = '跳ね返し型'; // Fallback for High Group (e.g. Intro Low/High/Low)
        } else {
            // Low Group
            if (!isInitAvgHigh && isInitSlopeHigh && isGrowthSlopeHigh) growthType = '立ち上がり型';
            else if (!isInitAvgHigh && !isInitSlopeHigh && isGrowthSlopeHigh) growthType = '見極め型';
            // 成長難航: Intro Low & Intro Slope Low & Growth Slope Low
            else if (!isInitAvgHigh && !isInitSlopeHigh && !isGrowthSlopeHigh) growthType = '成長難航型';
            // Ambiguous Low cases go to 分類外 or closest fit? Default to 分類外 for now.
            else growthType = '分類外';
        }
    } else {
        if (maxMonth < 14) growthType = 'データ不足'; // Or '新店' depending on context
        else growthType = '分類外';
    }

    if (globalMaxDate) {
        const diffTime = Math.abs(globalMaxDate.getTime() - startDate.getTime());
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); 
        if (diffMonths <= 6 && !is_closed) growthType = '新店';
    }

    const status = growthType !== '新店' && growthType !== 'データ不足' && !is_closed && growth_avg !== null && growth_slope !== null
        ? evaluateGrowthStatus(growth_avg, growth_slope, maxMonth)
        : '-';

    // 3. Forecasts (Optimize: only standard needed for list)
    const predictions = generatePredictions(monthlyData, seasonalIndices, is_closed, isDetailMode);
    
    // 4. Historical Predictions & Review Stats
    const historical_predictions: any[] = [];
    const reviewHistory: any[] = [];

    // Calculate review history ALWAYS (lightweight enough), so we can show it in the list view
    REVIEW_CHECKPOINTS.forEach(cp => {
        if (monthlyData.some(d => d.month_idx === cp)) {
            // A. Prediction Scenario (Ghost Lines) - HEAVY, ONLY DETAIL
            if (isDetailMode) {
                const slicedData = monthlyData.filter(d => d.month_idx <= cp);
                const cpLastRecord = slicedData[slicedData.length - 1];
                const validData = slicedData.filter(d => !isCovidException(d.date));
                const recent = validData.slice(-3);
                let baseCapacity = 2000;
                if (recent.length > 0) {
                    const deseasonalized = recent.map(r => r.sales / (seasonalIndices[r.date.getMonth()] || 1.0));
                    baseCapacity = deseasonalized.reduce((a, b) => a + b, 0) / deseasonalized.length;
                }
                const scenario = calculateLogisticScenario(baseCapacity, cp, cpLastRecord.date, seasonalIndices, 1500, 0.15, 24);
                historical_predictions.push({ review_month: cp, scenario: scenario });
            }

            // B. Status & Regression Analysis at this point - LIGHT, ALWAYS RUN for Table
            let rangeStart = 2;
            let rangeEnd = cp;
            let reqSlope = 10;

            if (cp === 7) { rangeStart = 2; rangeEnd = 7; reqSlope = 36; }
            else if (cp === 13) { rangeStart = 8; rangeEnd = 13; reqSlope = 36; }
            else if (cp === 19) { rangeStart = 14; rangeEnd = 19; reqSlope = 27; }
            else if (cp === 25) { rangeStart = 20; rangeEnd = 25; reqSlope = 16; }
            else if (cp === 37) { rangeStart = 26; rangeEnd = 37; reqSlope = 10; }

            const segmentData = monthlyData.filter(d => d.month_idx >= rangeStart && d.month_idx <= rangeEnd && !isCovidException(d.date));
            
            if (segmentData.length >= 2) { 
                const { slope, intercept } = calculateLinearRegression(
                    segmentData.map(d => d.month_idx),
                    segmentData.map(d => d.sales)
                );
                const avg = segmentData.reduce((a, b) => a + b.sales, 0) / segmentData.length;
                
                let label = '-';
                if (cp <= 13) {
                    if (avg >= 2000) label = '高水準';
                    else if (avg >= 1800) label = '標準';
                    else label = '注意';
                } else {
                    const TH_S = 2500;
                    const TH_A = 2000;
                    if (avg >= TH_S) label = '好調型'; 
                    else if (avg >= TH_A) label = slope >= reqSlope ? '成長進行型' : '成長停滞型'; 
                    else label = slope >= reqSlope ? '回復基調型' : '難航型'; 
                }

                reviewHistory.push({
                    month: cp,
                    range: [rangeStart, rangeEnd],
                    slope,
                    intercept,
                    avg,
                    label,
                    equation: `y=${slope.toFixed(1)}x${intercept >= 0 ? '+' : ''}${Math.round(intercept)}`
                });
            }
        }
    });

    // 5. Cumulative
    const targetMonth = 60;
    const actualTotal = monthlyData.filter(d => d.month_idx <= targetMonth).reduce((sum, d) => sum + d.sales, 0);
    // Use standard prediction which is always calculated
    const sumPrediction = (scenario: any[]) => scenario.filter(p => p.month_idx <= targetMonth).reduce((sum, p) => sum + p.sales, 0);
    
    const cumulative_sales = {
        actual_to_date: actualTotal,
        upper_60mo: isDetailMode ? actualTotal + sumPrediction(predictions.upper) : 0, // Not needed for list
        standard_60mo: actualTotal + sumPrediction(predictions.standard),
        lower_60mo: isDetailMode ? actualTotal + sumPrediction(predictions.lower) : 0,
    };

    return {
        shop_name: store.name,
        start_date: startDate,
        data_months_count: maxMonth,
        init_avg, init_slope, growth_avg, growth_slope,
        growth_type: growthType,
        status: status,
        monthly_data: monthlyData,
        predictions,
        historical_predictions,
        reviewHistory, 
        cumulative_sales,
        is_closed
    };
};

// --- View Components ---

const Badge: React.FC<{ type: string; large?: boolean }> = ({ type, large = false }) => {
    const info = GROWTH_TYPES[type] || GROWTH_TYPES['分類外'];
    return (
        <span
            className={`inline-flex items-center justify-center font-bold tracking-wide rounded-full shadow-sm border border-opacity-20 whitespace-nowrap ${large ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-[10px]'}`}
            style={{
                color: info.color,
                backgroundColor: `${info.color}10`,
                borderColor: info.color
            }}
        >
            {type}
        </span>
    );
};

const ChartWrapper: React.FC<{ children: React.ReactNode; title: string; headerControls?: React.ReactNode; className?: string }> = ({ children, title, headerControls, className = "" }) => (
    <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 relative flex flex-col overflow-hidden ${className}`}>
        <div className="flex justify-between items-center pt-5 px-6 pb-2 shrink-0 z-10 bg-white">
            <div className="flex-1 mr-4 min-w-0">
                <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest font-display">{title}</h3>
                <div className="mt-2">{headerControls}</div>
            </div>
        </div>
        <div className="flex-1 w-full relative min-h-0 px-4 pb-4">{children}</div>
    </div>
);

const VintageAnalysisView: React.FC<VintageAnalysisViewProps> = ({ allStores, dataType }) => {
    const [currentView, setCurrentView] = useState<'dashboard' | 'detail'>('dashboard');
    const [selectedShop, setSelectedShop] = useState<any>(null);
    const [filterType, setFilterType] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'data_months_count', direction: 'desc' });
    
    // Detailed View State
    const [showFullPeriod, setShowFullPeriod] = useState(false);
    const [visibleHistories, setVisibleHistories] = useState<number[]>([]);
    
    // Feature Toggles
    const [showGuidelines, setShowGuidelines] = useState(true);
    const [showRegressions, setShowRegressions] = useState(true);
    const [showStatusLabels, setShowStatusLabels] = useState(true);

    const isSales = dataType === 'sales';
    const unitS = isSales ? 'k' : '人';

    // Optimization: Memoize environment data separately to avoid re-calc
    const envData = useMemo(() => {
        const stores = Object.values(allStores) as StoreData[];
        if (stores.length === 0) return { indices: [], maxDate: new Date(0) };
        const indices = calculateSeasonalityIndices(stores);
        let maxDate = new Date(0);
        stores.forEach(s => {
            const dStr = s.dates[s.dates.length - 1];
            if (dStr) {
                const d = new Date(dStr.replace(/\//g, '-'));
                if (d > maxDate) maxDate = d;
            }
        });
        return { indices, maxDate };
    }, [allStores]);

    // Optimization: Perform "lightweight" analysis for the list view (skip ghost lines & heavy details)
    const processedData = useMemo(() => {
        const stores = Object.values(allStores) as StoreData[];
        if (stores.length === 0) return [];
        // Use memoized env data
        return stores.map(s => analyzeShopData(s, envData.indices, envData.maxDate, isSales, false)).filter(Boolean);
    }, [allStores, isSales, envData]);

    const stats = useMemo(() => {
        if (!processedData) return null;
        const typeCounts: Record<string, number> = {};
        processedData.forEach((d: any) => typeCounts[d.growth_type] = (typeCounts[d.growth_type] || 0) + 1);
        const pieData = Object.keys(GROWTH_TYPES)
            .filter(t => typeCounts[t])
            .map(t => ({ name: t, value: typeCounts[t], color: GROWTH_TYPES[t].color }))
            .sort((a, b) => b.value - a.value);
        const scatterData = processedData
            .filter((d: any) => d.growth_avg !== null && d.growth_slope !== null)
            .map((d: any) => ({ ...d, x: d.growth_avg, y: d.growth_slope, fill: GROWTH_TYPES[d.growth_type]?.color || '#999' }));
        return { typeCounts, pieData, scatterData, total: processedData.length };
    }, [processedData]);

    const filteredAndSortedData = useMemo(() => {
        let filtered = processedData.filter((d: any) => {
            const matchesType = filterType === 'all' || d.growth_type === filterType;
            const matchesSearch = d.shop_name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesType && matchesSearch;
        });
        return filtered.sort((a: any, b: any) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];
            if (sortConfig.key === 'cumulative_sales') {
                aValue = a.cumulative_sales.standard_60mo;
                bValue = b.cumulative_sales.standard_60mo;
            }
            if (aValue === null) aValue = -999999;
            if (bValue === null) bValue = -999999;
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [processedData, filterType, searchTerm, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const handleSelectShop = (lightweightShop: any) => {
        // Optimization: Perform "heavy" analysis ONLY for the selected shop on demand
        // Find the raw store data
        const rawStore = allStores[lightweightShop.shop_name];
        if (rawStore) {
            const fullAnalysis = analyzeShopData(rawStore, envData.indices, envData.maxDate, isSales, true);
            setSelectedShop(fullAnalysis);
        } else {
            setSelectedShop(lightweightShop); // Fallback
        }
        
        setCurrentView('detail');
        setVisibleHistories([]); // Reset history toggles
        setShowFullPeriod(false);
    };

    const toggleHistory = (month: number) => {
        setVisibleHistories(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
    };

    if (currentView === 'detail' && selectedShop) {
        // --- DETAIL VIEW RE-IMPLEMENTATION ---
        const statusStyle = STATUS_STYLES[selectedShop.status] || STATUS_STYLES['-'];
        const fmtM = (val: number) => (val / (isSales ? 1000 : 1)).toFixed(1);
        const chartMonthlyData = showFullPeriod ? selectedShop.monthly_data : selectedShop.monthly_data.filter((d: any) => d.month_idx <= 60);
        const maxMonthIdx = Math.max(...selectedShop.monthly_data.map((d: any) => d.month_idx));
        const domainMax = showFullPeriod ? Math.max(60, maxMonthIdx + 6) : 60;
        const xTicks = []; for (let i = 0; i <= domainMax; i += 12) xTicks.push(i);

        return (
            <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] animate-fadeIn p-4 md:p-8">
                <div className="max-w-[1600px] mx-auto space-y-8 pb-32">
                    <header className="flex items-center justify-between bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setCurrentView('dashboard')} className="p-3 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><i className="fas fa-arrow-left"></i></button>
                            <div>
                                <h1 className="text-2xl font-black text-slate-800 font-display">{selectedShop.shop_name}</h1>
                                <p className="text-xs text-gray-400 font-bold mt-1">Vintage Analytics & Forecast</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.color }}>
                                <i className="fas fa-activity"></i> {statusStyle.label}
                            </span>
                            <Badge type={selectedShop.growth_type} large={true} />
                        </div>
                    </header>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-8 border-l-slate-300 hover:shadow-md transition-shadow">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Month Age</div>
                            <div className="text-3xl font-black text-slate-800 font-display">{selectedShop.data_months_count}mo</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-8 border-l-[#005EB8] hover:shadow-md transition-shadow">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Base Capacity (L)</div>
                            <div className="text-3xl font-black text-[#005EB8] font-display">{Math.round(selectedShop.predictions.base_line || selectedShop.growth_avg || 0).toLocaleString()}</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-8 border-l-red-500 hover:shadow-md transition-shadow">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Growth Trend (Slope)</div>
                            <div className={`text-3xl font-black font-display ${selectedShop.growth_slope > 0 ? 'text-green-500' : 'text-slate-800'}`}>{selectedShop.growth_slope?.toFixed(1)}</div>
                        </div>
                        <div className="bg-slate-800 p-6 rounded-3xl shadow-lg text-white border-l-8 border-l-amber-400">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Insight</div>
                            <div className="text-sm font-medium opacity-90 leading-relaxed">{GROWTH_TYPES[selectedShop.growth_type]?.desc}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Main Chart */}
                        <ChartWrapper className="lg:col-span-3 h-[600px]" title="Vintage Growth Curve (Month 1 = Open)" headerControls={
                            <div className="flex flex-wrap gap-4 items-center">
                                {/* Visual Toggles */}
                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-gray-500 select-none hover:text-[#005EB8]">
                                    <input type="checkbox" checked={showGuidelines} onChange={e => setShowGuidelines(e.target.checked)} className="accent-[#005EB8]" />
                                    基準線
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-gray-500 select-none hover:text-[#EC4899]">
                                    <input type="checkbox" checked={showRegressions} onChange={e => setShowRegressions(e.target.checked)} className="accent-[#EC4899]" />
                                    回帰分析(式)
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-gray-500 select-none hover:text-green-600">
                                    <input type="checkbox" checked={showStatusLabels} onChange={e => setShowStatusLabels(e.target.checked)} className="accent-green-600" />
                                    ステータス
                                </label>
                                <div className="w-px h-4 bg-gray-200 mx-2"></div>
                                <label className="flex items-center gap-2 cursor-pointer" onClick={() => setShowFullPeriod(!showFullPeriod)}>
                                    <input type="checkbox" checked={showFullPeriod} onChange={() => {}} className="accent-[#005EB8]" />
                                    <span className={`text-xs font-bold ${showFullPeriod ? 'text-[#005EB8]' : 'text-slate-500'}`}>全期間表示</span>
                                </label>
                            </div>
                        }>
                            <div className="w-full h-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart margin={{ top: 30, right: 30, left: 10, bottom: 20 }}>
                                        <defs><linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#005EB8" stopOpacity={0.2} /><stop offset="95%" stopColor="#005EB8" stopOpacity={0} /></linearGradient></defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="month_idx" type="number" domain={[0, domainMax]} ticks={xTicks} tick={{ fontSize: 10, fill: '#94A3B8' }} label={{value:'経過月数', position:'bottom', fontSize:10}} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} unit={unitS} domain={['auto', 'auto']} />
                                        <Tooltip formatter={(v:number)=>Math.round(v).toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                                        
                                        {/* Predictions */}
                                        {selectedShop.predictions.standard.length > 0 && (
                                            <>
                                                <Line data={selectedShop.predictions.upper} type="monotone" dataKey="sales" name="Upper Case" stroke="#F59E0B" strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={false} />
                                                <Line data={selectedShop.predictions.standard} type="monotone" dataKey="sales" name="Standard Case" stroke="#10B981" strokeWidth={3} strokeDasharray="4 4" dot={false} activeDot={false} />
                                                <Line data={selectedShop.predictions.lower} type="monotone" dataKey="sales" name="Lower Case" stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={false} />
                                            </>
                                        )}
                                        
                                        {/* Historical Phantoms */}
                                        {selectedShop.historical_predictions.map((hist: any) => (
                                            visibleHistories.includes(hist.review_month) && (
                                                <Line key={`hist-${hist.review_month}`} data={hist.scenario} type="monotone" dataKey="sales" name={`${hist.review_month}ヶ月時点の予測`} stroke="#64748B" strokeWidth={2} strokeDasharray="2 2" dot={false} opacity={0.7} />
                                            )
                                        ))}
                                        
                                        {/* Reference Lines: Guidelines */}
                                        {showGuidelines && (
                                            <>
                                                {/* Vertical Boundaries */}
                                                <ReferenceLine x={13} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '導入期終了', position: 'insideTopRight', fontSize: 10, fill: '#EF4444', angle: -90 }} />
                                                <ReferenceLine x={37} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: '成長期終了', position: 'insideTopRight', fontSize: 10, fill: '#9CA3AF', angle: -90 }} />
                                                
                                                {/* Horizontal Thresholds */}
                                                <ReferenceLine y={1800} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '導入基準(1800)', position: 'left', fontSize: 10, fill: '#EF4444' }} />
                                                <ReferenceLine y={2000} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: '成長基準(2000)', position: 'left', fontSize: 10, fill: '#9CA3AF' }} />
                                            </>
                                        )}

                                        {/* Historical Regression Lines */}
                                        {showRegressions && selectedShop.reviewHistory.map((h: any, idx: number) => {
                                            // Calculate start and end points for the segment
                                            const yStart = h.slope * h.range[0] + h.intercept;
                                            const yEnd = h.slope * h.range[1] + h.intercept;
                                            return (
                                                <ReferenceLine 
                                                    key={`reg-${idx}`} 
                                                    segment={[{ x: h.range[0], y: yStart }, { x: h.range[1], y: yEnd }]} 
                                                    stroke="#EC4899" 
                                                    strokeWidth={2}
                                                    label={{ value: h.equation, position: 'top', fontSize: 10, fill: '#EC4899' }}
                                                />
                                            );
                                        })}

                                        {/* Review Points: Vertical Lines & Status Labels */}
                                        {showStatusLabels && selectedShop.reviewHistory.map((h: any, idx: number) => (
                                            <ReferenceLine 
                                                key={`status-${idx}`} 
                                                x={h.month} 
                                                stroke="#94A3B8" 
                                                strokeDasharray="3 3" 
                                                strokeWidth={2}
                                                label={{ 
                                                    value: h.label, 
                                                    position: 'insideTop', 
                                                    fontSize: 11, 
                                                    fill: '#0f766e', 
                                                    fontWeight: 'black', 
                                                    dy: 15,
                                                    dx: 5
                                                }} 
                                            />
                                        ))}

                                        {/* Actuals */}
                                        <Area type="monotone" data={chartMonthlyData} dataKey="sales" name="実績推移" stroke="#005EB8" fillOpacity={1} fill="url(#colorActual)" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                
                                {/* Historical Toggle Buttons Overlay */}
                                {selectedShop.historical_predictions.length > 0 && (
                                    <div className="absolute bottom-12 right-12 z-10 bg-white/90 p-3 rounded-2xl flex gap-2 shadow-sm border border-gray-100">
                                        <span className="text-[10px] font-bold text-gray-400 self-center mr-2">過去の予測線:</span>
                                        {selectedShop.historical_predictions.map((hist: any) => (
                                            <button 
                                                key={hist.review_month} 
                                                onClick={() => toggleHistory(hist.review_month)} 
                                                className={`text-[10px] px-3 py-1.5 rounded-lg border font-bold transition-all ${visibleHistories.includes(hist.review_month) ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                {hist.review_month}mo
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ChartWrapper>
                        
                        {/* Side Panel: Cumulative Sales */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-8 h-fit flex flex-col justify-center">
                            <div>
                                <div className="text-[10px] font-bold text-green-500 uppercase mb-2 tracking-widest">Standard Case (60mo)</div>
                                <div className="text-4xl font-black text-[#005EB8] font-display">{fmtM(selectedShop.cumulative_sales.standard_60mo)}<span className="text-sm text-slate-400 ml-1">{isSales ? 'M' : 'k人'}</span></div>
                                <p className="text-[10px] text-gray-400 mt-2 font-medium">オープンから5年間の累計売上予測 (標準シナリオ)</p>
                            </div>
                            <div className="w-full h-px bg-gray-100"></div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Actual to Date</div>
                                <div className="text-2xl font-black text-gray-700 font-display">{fmtM(selectedShop.cumulative_sales.actual_to_date)}<span className="text-xs text-gray-400 ml-1">{isSales ? 'M' : 'k人'}</span></div>
                                <p className="text-[10px] text-gray-400 mt-2 font-medium">現在までの実績累計</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-2xl mt-4">
                                <p className="text-[10px] text-blue-800 font-bold leading-relaxed">
                                    <i className="fas fa-info-circle mr-1"></i>
                                    グラフ右下のボタンで、過去の時点（7,13,19ヶ月目...）での予測ラインを表示し、当時の見込みと現在の実績を比較できます。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Detail Data Table */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col mt-6">
                        <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Monthly Data & Forecasts</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-center text-xs">
                                <thead className="bg-white font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                    <tr>
                                        <th className="p-3 text-left pl-6">Month</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3 text-right">Actual</th>
                                        <th className="p-3 text-right">Forecast (Std)</th>
                                        <th className="p-3">Status Check</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                    {/* Merge actual data and future predictions */}
                                    {Array.from({ length: 60 }, (_, i) => {
                                        const mIdx = i + 2; // Month index starts from 2
                                        const actual = selectedShop.monthly_data.find((d: any) => d.month_idx === mIdx);
                                        const pred = selectedShop.predictions.standard.find((d: any) => d.month_idx === mIdx);
                                        const status = selectedShop.reviewHistory.find((h: any) => h.month === mIdx);
                                        
                                        // Skip if neither actual nor pred exists (though pred usually covers up to 60)
                                        if (!actual && !pred) return null;

                                        const dateStr = actual ? actual.date_str : pred ? pred.date_str : '-';
                                        
                                        return (
                                            <tr key={mIdx} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-3 text-left pl-6 text-[#005EB8]">{mIdx}mo</td>
                                                <td className="p-3 text-gray-400">{dateStr}</td>
                                                <td className="p-3 text-right text-gray-800">{actual ? Math.round(actual.sales).toLocaleString() : '-'}</td>
                                                <td className="p-3 text-right text-gray-400">{pred ? Math.round(pred.sales).toLocaleString() : '-'}</td>
                                                <td className="p-3">
                                                    {status && (
                                                        <span className="px-2 py-1 rounded-full text-[10px] border" style={{ backgroundColor: STATUS_STYLES[status.label]?.bg || '#f1f5f9', color: STATUS_STYLES[status.label]?.color || '#94a3b8', borderColor: STATUS_STYLES[status.label]?.color }}>
                                                            {status.label}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // DASHBOARD VIEW
    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto space-y-6 pb-32">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display flex items-center gap-3">
                            新店成長羅針盤 (Vintage)
                            <span className="text-xs bg-blue-100 text-[#005EB8] px-2 py-1 rounded-md border border-blue-200 uppercase font-black tracking-widest">Standalone Analytics</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Vintage Growth Analysis & Type Classification</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-black uppercase">Displaying</p>
                            <p className="text-xl font-black text-gray-800 font-display">{filteredAndSortedData.length} <span className="text-xs text-gray-400">/ {stats?.total || 0}</span></p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sidebar Filters */}
                    <div className="lg:col-span-1 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-6 flex flex-col h-[600px]">
                        <div className="mb-6">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Search</label>
                            <input type="text" placeholder="店舗名検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-1 focus:ring-[#005EB8]" />
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter by Type</label>
                            {filterType !== 'all' && <button onClick={() => setFilterType('all')} className="text-[10px] text-[#005EB8] font-bold hover:underline">Reset</button>}
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-2">
                            <button onClick={() => setFilterType('all')} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all ${filterType === 'all' ? 'bg-slate-800 text-white shadow-md' : 'hover:bg-gray-50 text-gray-600'}`}>
                                <span className="text-xs font-bold">全て表示</span>
                                <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded">{stats?.total}</span>
                            </button>
                            {stats?.pieData.map((d: any) => (
                                <button key={d.name} onClick={() => setFilterType(d.name)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all border ${filterType === d.name ? 'bg-white border-[#005EB8] shadow-md ring-1 ring-[#005EB8] text-gray-800' : 'border-transparent hover:bg-gray-50 text-gray-500'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                                        <span className="text-xs font-bold">{d.name}</span>
                                    </div>
                                    <span className="text-[10px] font-black bg-gray-100 px-2 py-0.5 rounded">{d.value}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <ChartWrapper title="Growth Positioning (Avg vs Slope)" className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis type="number" dataKey="x" name="売上平均" unit={unitS} tick={{ fontSize: 9 }} label={{ value: '平均実績', position: 'bottom', fontSize: 9 }} />
                                        <YAxis type="number" dataKey="y" name="成長傾き" tick={{ fontSize: 9 }} label={{ value: '成長角度 (Slope)', angle: -90, position: 'left', fontSize: 9 }} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => { if (active && payload && payload.length) { const d = payload[0].payload; return (<div className="bg-white p-2 border border-gray-100 shadow-xl rounded-lg text-xs font-bold">{d.shop_name}</div>); } return null; }} />
                                        <Scatter data={stats?.scatterData} onClick={(d: any) => handleSelectShop(d.payload)} cursor="pointer">
                                            {stats?.scatterData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={filterType === 'all' || entry.growth_type === filterType ? 0.7 : 0.1} />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </ChartWrapper>
                            <ChartWrapper title="Composition (Type Ratio)" className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={stats?.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" cornerRadius={3} onClick={(data) => setFilterType(data.name === filterType ? 'all' : data.name)}>
                                            {stats?.pieData.map((e: any, i: number) => (<Cell key={i} fill={e.color} fillOpacity={filterType === 'all' || filterType === e.name ? 1 : 0.3} />))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </ChartWrapper>
                        </div>

                        {/* List Table */}
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[400px]">
                            <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Store List</h3>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="min-w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-white sticky top-0 z-10 shadow-sm border-b border-gray-100">
                                        <tr>
                                            <th className="p-4 font-black text-gray-400 uppercase cursor-pointer hover:text-[#005EB8]" onClick={() => handleSort('shop_name')}>店舗名</th>
                                            <th className="p-4 font-black text-gray-400 uppercase cursor-pointer hover:text-[#005EB8]" onClick={() => handleSort('data_months_count')}>月齢</th>
                                            <th className="p-4 font-black text-gray-400 uppercase">成長タイプ</th>
                                            <th className="p-4 font-black text-gray-400 uppercase">推移 (History)</th>
                                            <th className="p-4 font-black text-gray-400 uppercase text-right cursor-pointer hover:text-[#005EB8]" onClick={() => handleSort('cumulative_sales')}>60ヶ月累計予測</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-bold text-gray-600">
                                        {filteredAndSortedData.slice(0, 100).map((shop: any, i: number) => (
                                            <tr key={i} onClick={() => handleSelectShop(shop)} className="hover:bg-blue-50/30 cursor-pointer transition-colors">
                                                <td className="p-4 text-gray-800">{shop.shop_name}</td>
                                                <td className="p-4">{shop.data_months_count}mo</td>
                                                <td className="p-4"><Badge type={shop.growth_type} /></td>
                                                <td className="p-4">
                                                    <div className="flex gap-1">
                                                        {shop.reviewHistory.map((h: any) => (
                                                            <div key={h.month} className="group relative">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_STYLES[h.label]?.dot || '#CBD5E1' }}></div>
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                                                                    {h.month}mo: {h.label}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">{Math.round(shop.cumulative_sales.standard_60mo / (isSales ? 1000 : 1)).toLocaleString()} {isSales ? 'M' : 'k人'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VintageAnalysisView;
