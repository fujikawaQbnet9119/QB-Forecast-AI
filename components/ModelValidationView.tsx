
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import { analyzeStore, logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Brush, ScatterChart, Scatter, ZAxis
} from 'recharts';

interface ModelValidationViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

interface BacktestResult {
    name: string;
    mape: number; // Mean Absolute Percentage Error
    bias: number; // Mean Error (Actual - Forecast)
    rmse: number; // Root Mean Squared Error
    actuals: number[]; // Last 12 months actuals
    forecasts: number[]; // Last 12 months forecasts (trained on N-12)
    dates: string[];
    trainingK: number;
    trainingL: number;
}

const ModelValidationView: React.FC<ModelValidationViewProps> = ({ allStores, dataType }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<BacktestResult[]>([]);
    const [selectedStore, setSelectedStore] = useState<BacktestResult | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const isSales = dataType === 'sales';

    // --- Backtest Execution Logic ---
    const runBacktest = async () => {
        setIsProcessing(true);
        setProgress(0);
        setResults([]);
        setSelectedStore(null);

        // Filter eligible stores (must have > 24 months of data to cut 12 and still have 12 for training)
        const eligibleStores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.raw.length >= 24);
        const batchSize = 10;
        const tempResults: BacktestResult[] = [];

        for (let i = 0; i < eligibleStores.length; i += batchSize) {
            const batch = eligibleStores.slice(i, i + batchSize);
            
            // Process batch
            batch.forEach(store => {
                try {
                    // 1. Cut Data (Time Machine)
                    const cutoff = 12;
                    const trainRaw = store.raw.slice(0, -cutoff);
                    const trainDates = store.dates.slice(0, -cutoff);
                    const testRaw = store.raw.slice(-cutoff);
                    const testDates = store.dates.slice(-cutoff);
                    
                    // Use the date of the last training point as the "current max date"
                    const cutoffDate = new Date(trainDates[trainDates.length - 1].replace(/\//g, '-'));

                    // 2. Re-train Model
                    // Note: We don't have historical GlobalStats easily available, 
                    // so we run individual analysis without global priors (or use current ones as approx).
                    // Using individual analysis is stricter test of the model itself.
                    const result = analyzeStore(store.name, trainRaw, trainDates, cutoffDate);

                    if (result.error) return;

                    // 3. Forecast Next 12 Months
                    const forecasts: number[] = [];
                    let sumAbsPercError = 0;
                    let sumSqError = 0;
                    let sumError = 0;
                    const n = testDates.length;

                    testDates.forEach((d, idx) => {
                        // Prediction Index = trainRaw.length + idx
                        const t = trainRaw.length + idx;
                        const dObj = new Date(d.replace(/\//g, '-'));
                        
                        // Logistic Trend
                        const tr = logisticModel(t, result.fit.params, result.fit.mode, result.fit.shockIdx);
                        
                        // Seasonality (from Training Phase)
                        const sea = result.seasonal[dObj.getMonth()] || 1.0;
                        
                        // Nudge (Decayed from Training End)
                        // Nudge is calculated at end of training set
                        const decay = result.nudgeDecay || 0.7;
                        const nudgeEffect = result.nudge * Math.pow(decay, idx + 1);
                        
                        const pred = Math.max(0, (tr * sea) + nudgeEffect);
                        const actual = testRaw[idx];

                        forecasts.push(pred);

                        if (actual > 0) {
                            const err = actual - pred;
                            sumError += err;
                            sumSqError += err * err;
                            sumAbsPercError += Math.abs(err / actual);
                        }
                    });

                    // 4. Calculate Metrics
                    const mape = (sumAbsPercError / n) * 100;
                    const rmse = Math.sqrt(sumSqError / n);
                    const bias = sumError / n;

                    tempResults.push({
                        name: store.name,
                        mape,
                        rmse,
                        bias,
                        actuals: testRaw,
                        forecasts,
                        dates: testDates,
                        trainingK: result.params.k,
                        trainingL: result.params.L
                    });

                } catch (e) {
                    console.warn(`Failed to backtest ${store.name}`, e);
                }
            });

            // Update Progress
            setProgress(Math.round(((i + batch.length) / eligibleStores.length) * 100));
            // Yield to UI
            await new Promise(r => setTimeout(r, 0));
        }

        // Sort by MAPE (Accuracy)
        tempResults.sort((a, b) => a.mape - b.mape);
        setResults(tempResults);
        setIsProcessing(false);
    };

    // --- View Helpers ---
    const filteredResults = useMemo(() => {
        return results.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [results, searchTerm]);

    const globalMetrics = useMemo(() => {
        if (results.length === 0) return null;
        const totalMape = results.reduce((s, r) => s + r.mape, 0);
        const avgMape = totalMape / results.length;
        
        const sortedMape = [...results].sort((a,b) => a.mape - b.mape);
        const medianMape = sortedMape[Math.floor(results.length / 2)].mape;
        
        // Count "Good" Forecasts (<7.5% error) - UPDATED THRESHOLD
        const goodCount = results.filter(r => r.mape < 7.5).length;
        const goodRate = (goodCount / results.length) * 100;

        // Bias (Total Bias)
        const totalBias = results.reduce((s, r) => s + r.bias, 0);

        return { avgMape, medianMape, goodRate, totalBias };
    }, [results]);

    const histData = useMemo(() => {
        if (results.length === 0) return [];
        const buckets = Array(10).fill(0); // 0-5, 5-10, ...
        results.forEach(r => {
            const idx = Math.min(9, Math.floor(r.mape / 5)); // Bucket size 5%
            buckets[idx]++;
        });
        return buckets.map((c, i) => ({
            range: `${i*5}-${(i+1)*5}%`,
            count: c
        }));
    }, [results]);

    const detailChartData = useMemo(() => {
        if (!selectedStore) return [];
        return selectedStore.dates.map((d, i) => ({
            date: d,
            actual: selectedStore.actuals[i],
            forecast: Math.round(selectedStore.forecasts[i]),
            diff: Math.round(selectedStore.actuals[i] - selectedStore.forecasts[i])
        }));
    }, [selectedStore]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display flex items-center gap-3">
                            モデル精度検証 (Backtest Benchmark)
                            <HelpTooltip title="バックテスト検証" content="過去のデータを意図的に隠し（直近12ヶ月分）、1年前の時点で予測モデルを作成した場合、その予測が実際の結果とどれくらい一致したかを検証します。" />
                        </h2>
                        <p className="text-xs text-gray-500 font-bold mt-2">
                            検証対象: 全{Object.keys(allStores).length}店舗 (直近12ヶ月の実績 vs 12ヶ月前のAI予測)
                        </p>
                    </div>
                    <div className="w-full md:w-auto flex flex-col items-end">
                        <button 
                            onClick={runBacktest}
                            disabled={isProcessing}
                            className={`px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg transition-all transform active:scale-95 flex items-center gap-2 ${isProcessing ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#005EB8] text-white hover:bg-[#004a94]'}`}
                        >
                            {isProcessing ? (
                                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 検証実行中 ({progress}%)</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> バックテスト開始</>
                            )}
                        </button>
                    </div>
                </div>

                {results.length > 0 && globalMetrics && (
                    <div className="animate-fadeIn space-y-6">
                        {/* Global Metrics Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">平均誤差率 (Avg MAPE)</p>
                                <p className={`text-3xl font-black font-display ${globalMetrics.avgMape < 7.5 ? 'text-green-500' : 'text-orange-500'}`}>
                                    {globalMetrics.avgMape.toFixed(1)}<span className="text-sm">%</span>
                                </p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">中央値誤差 (Median)</p>
                                <p className="text-3xl font-black font-display text-[#005EB8]">
                                    {globalMetrics.medianMape.toFixed(1)}<span className="text-sm">%</span>
                                </p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">高精度店舗率 (Error &lt; 7.5%)</p>
                                <p className="text-3xl font-black font-display text-gray-800">
                                    {globalMetrics.goodRate.toFixed(1)}<span className="text-sm">%</span>
                                </p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">総売上バイアス (Bias)</p>
                                <p className={`text-3xl font-black font-display ${globalMetrics.totalBias > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {globalMetrics.totalBias > 0 ? '+' : ''}{Math.round(globalMetrics.totalBias).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Distribution Histogram */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[300px]">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">
                                    予測精度分布 (MAPE Histogram)
                                </h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={histData} margin={{ top: 0, right: 0, bottom: 20, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="range" tick={{fontSize:9}} label={{ value: '誤差率 (MAPE)', position: 'bottom', offset: 0, fontSize: 9 }} />
                                        <YAxis tick={{fontSize:9}} allowDecimals={false} />
                                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                        <Bar dataKey="count" fill="#005EB8" radius={[4, 4, 0, 0]} name="店舗数" />
                                        {/* Reference Line for 7.5% threshold is between 5-10% bucket */}
                                        <ReferenceLine x="5-10%" stroke="#10B981" strokeDasharray="3 3" label={{ value: 'Target (7.5%)', position: 'top', fontSize: 9, fill: '#10B981' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Detail Chart (Selected Store) */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[300px] flex flex-col relative">
                                {selectedStore ? (
                                    <>
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center justify-between">
                                            <span>詳細検証: {selectedStore.name}</span>
                                            <span className="text-red-500">MAPE: {selectedStore.mape.toFixed(1)}%</span>
                                        </h3>
                                        <div className="flex-1 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={detailChartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                    <XAxis dataKey="date" tick={{fontSize:9}} />
                                                    <YAxis tick={{fontSize:9}} />
                                                    <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                                    <Legend wrapperStyle={{ fontSize: '9px' }} iconSize={8} />
                                                    <Line type="monotone" dataKey="actual" name="実績" stroke="#1A1A1A" strokeWidth={2} dot={true} />
                                                    <Line type="monotone" dataKey="forecast" name="1年前の予測" stroke="#005EB8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest">
                                        <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                        <p>下のリストから店舗を選択</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Result Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display">店舗別 検証結果リスト</h3>
                                <input 
                                    type="text" 
                                    placeholder="店舗検索..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="text-xs font-bold bg-gray-50 border-none rounded-lg p-2 w-48 outline-none focus:ring-1 focus:ring-[#005EB8]"
                                />
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full text-left text-xs">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-3 font-black text-gray-500 uppercase">店舗名</th>
                                            <th className="p-3 font-black text-gray-500 uppercase text-right">MAPE (誤差率)</th>
                                            <th className="p-3 font-black text-gray-500 uppercase text-right">Bias (平均乖離)</th>
                                            <th className="p-3 font-black text-gray-500 uppercase text-right">学習時 k</th>
                                            <th className="p-3 font-black text-gray-500 uppercase text-right">学習時 L</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredResults.map(r => (
                                            <tr 
                                                key={r.name} 
                                                onClick={() => setSelectedStore(r)}
                                                className={`cursor-pointer transition-colors ${selectedStore?.name === r.name ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                            >
                                                <td className="p-3 font-bold text-gray-700">{r.name}</td>
                                                <td className={`p-3 font-bold text-right ${r.mape < 7.5 ? 'text-green-600' : r.mape > 20 ? 'text-red-500' : 'text-orange-500'}`}>
                                                    {r.mape.toFixed(1)}%
                                                </td>
                                                <td className="p-3 font-mono text-right text-gray-500">
                                                    {Math.round(r.bias).toLocaleString()}
                                                </td>
                                                <td className="p-3 font-mono text-right text-gray-400">
                                                    {r.trainingK.toFixed(3)}
                                                </td>
                                                <td className="p-3 font-mono text-right text-gray-400">
                                                    {Math.round(r.trainingL).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModelValidationView;
