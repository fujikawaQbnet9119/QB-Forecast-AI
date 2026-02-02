
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import { analyzeStore, logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ScatterChart, Scatter, Cell, LabelList
} from 'recharts';

interface ModelValidationViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

interface BacktestResult {
    name: string;
    mape: number; 
    bias: number; 
    rmse: number; 
    trackingSignal: number; 
    actuals: number[]; 
    forecasts: number[]; 
    dates: string[];
    trainingK: number;
    trainingL: number;
    trainingMode: string;
}

const ModelValidationView: React.FC<ModelValidationViewProps> = ({ allStores, dataType }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<BacktestResult[]>([]);
    const [selectedStoreName, setSelectedStoreName] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Test Period Selection
    const [testPeriod, setTestPeriod] = useState<number>(12);

    const isSales = dataType === 'sales';
    const unitLabel = isSales ? '千円' : '人';

    const runBacktest = async () => {
        setIsProcessing(true);
        setProgress(0);
        setResults([]);
        setSelectedStoreName(null);

        // Ensure we have enough data for the selected period plus minimum training (e.g. 12 months)
        const minDataLength = testPeriod + 12;
        const eligibleStores = (Object.values(allStores) as StoreData[]).filter(s => s.isActive && s.raw.length >= minDataLength);
        
        const tempResults: BacktestResult[] = [];
        const total = eligibleStores.length;

        for (let i = 0; i < total; i++) {
            const store = eligibleStores[i];
            try {
                // 1. Split Data: Last N months as Test set, rest as Training set
                const cutoff = testPeriod;
                const trainRaw = store.raw.slice(0, -cutoff);
                const trainDates = store.dates.slice(0, -cutoff);
                const testRaw = store.raw.slice(-cutoff);
                const testDates = store.dates.slice(-cutoff);
                
                // Final training date for reference
                const lastTrainDateStr = trainDates[trainDates.length - 1].replace(/\//g, '-');
                const lastTrainDate = new Date(lastTrainDateStr);

                // 2. Train Model on Training Set
                const result = analyzeStore(store.name, trainRaw, trainDates, lastTrainDate);
                if (result.error) continue;

                // 3. Forecast the "Future" (The hidden N months)
                const forecasts: number[] = [];
                let sumAbsPercError = 0;
                let sumSqError = 0;
                let sumError = 0;
                let sumAbsError = 0; 
                const n = testDates.length;

                testDates.forEach((d, idx) => {
                    const t = trainRaw.length + idx;
                    const dObj = new Date(d.replace(/\//g, '-'));
                    
                    // Core Logistic Trend
                    const tr = logisticModel(t, result.fit.params, result.fit.mode, result.fit.shockIdx);
                    
                    // Seasonality from training
                    const sea = result.seasonal[dObj.getMonth()] || 1.0;
                    
                    // Persistent Nudge (No decay as requested)
                    const nudgeEffect = result.nudge; // decay factor is 1.0
                    
                    const pred = Math.max(0, (tr + nudgeEffect) * sea);
                    const actual = testRaw[idx];
                    forecasts.push(Math.round(pred));

                    if (actual > 0) {
                        const err = actual - pred;
                        sumError += err;
                        sumAbsError += Math.abs(err);
                        sumSqError += err * err;
                        sumAbsPercError += Math.abs(err / actual);
                    }
                });

                const mad = sumAbsError / n;
                tempResults.push({
                    name: store.name,
                    mape: (sumAbsPercError / n) * 100,
                    rmse: Math.sqrt(sumSqError / n),
                    bias: sumError / n,
                    trackingSignal: mad !== 0 ? sumError / mad : 0,
                    actuals: testRaw,
                    forecasts,
                    dates: testDates,
                    trainingK: result.params.k,
                    trainingL: result.params.L,
                    trainingMode: result.fit.mode
                });
            } catch (e) {
                console.warn(`Backtest failed for ${store.name}:`, e);
            }

            // Update progress every 10 stores
            if (i % 10 === 0 || i === total - 1) {
                setProgress(Math.round(((i + 1) / total) * 100));
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // Sort by accuracy (MAPE asc)
        tempResults.sort((a, b) => a.mape - b.mape);
        setResults(tempResults);
        setIsProcessing(false);
        if (tempResults.length > 0) setSelectedStoreName(tempResults[0].name);
    };

    const filteredResults = useMemo(() => {
        return results.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [results, searchTerm]);

    const selectedStore = useMemo(() => {
        return results.find(r => r.name === selectedStoreName) || null;
    }, [results, selectedStoreName]);

    const globalMetrics = useMemo(() => {
        if (results.length === 0) return null;
        const avgMape = results.reduce((s, r) => s + r.mape, 0) / results.length;
        const sortedMape = [...results].sort((a, b) => a.mape - b.mape);
        const medianMape = sortedMape[Math.floor(results.length / 2)].mape;
        const goodRate = (results.filter(r => r.mape < 10).length / results.length) * 100;
        const totalBias = results.reduce((s, r) => s + r.bias, 0) / results.length;

        return { avgMape, medianMape, goodRate, totalBias };
    }, [results]);

    const mapeDistData = useMemo(() => {
        if (results.length === 0) return [];
        const buckets = Array(10).fill(0); // 0-5, 5-10, ... 45-50+
        results.forEach(r => {
            const idx = Math.min(9, Math.floor(r.mape / 5));
            buckets[idx]++;
        });
        return buckets.map((c, i) => ({
            range: i === 9 ? '45%+' : `${i * 5}-${(i + 1) * 5}%`,
            count: c
        }));
    }, [results]);

    const detailChartData = useMemo(() => {
        if (!selectedStore) return [];
        return selectedStore.dates.map((d, i) => ({
            date: d,
            actual: selectedStore.actuals[i],
            forecast: selectedStore.forecasts[i]
        }));
    }, [selectedStore]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-[1600px] mx-auto h-full flex flex-col gap-6">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-[#0F2540] uppercase tracking-tight font-display flex items-center gap-3">
                            モデル精度検証 (Backtest Strategy)
                            <HelpTooltip title="バックテスト" content={`過去${testPeriod}ヶ月のデータを「未知のもの」として隠し、それ以前のデータだけでモデルを学習させます。その後、隠していた${testPeriod}ヶ月間を予測し、実際の実績と照らし合わせることで、AIモデルの『真の予測力』を測定します。`} />
                        </h2>
                        <p className="text-xs text-gray-500 font-bold mt-1">検証条件: 過去{testPeriod}ヶ月ブラインドテスト / 永続ナッジ適用(Decay=1.0)</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {[1, 3, 6, 12].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setTestPeriod(m)}
                                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${testPeriod === m ? 'bg-white text-[#0F2540] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    {m}ヶ月
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={runBacktest} 
                            disabled={isProcessing}
                            className={`px-10 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all transform active:scale-95 flex items-center gap-3 ${isProcessing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#0F2540] text-white hover:bg-[#1e3a8a]'}`}
                        >
                            {isProcessing ? (
                                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 検証中... {progress}%</>
                            ) : 'バックテストを実行'}
                        </button>
                    </div>
                </div>

                {results.length > 0 ? (
                    <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                        
                        {/* Left Sidebar: Results List */}
                        <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                            <div className="p-5 border-b border-gray-100">
                                <input 
                                    type="text" 
                                    placeholder="店舗検索..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0F2540]"
                                />
                                <div className="flex justify-between mt-3 text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                                    <span>店舗名 ({filteredResults.length})</span>
                                    <span>MAPE (精度)</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {filteredResults.map(r => (
                                    <button
                                        key={r.name}
                                        onClick={() => setSelectedStoreName(r.name)}
                                        className={`w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all ${selectedStoreName === r.name ? 'bg-blue-50 text-[#0F2540] shadow-sm border-l-4 border-[#0F2540]' : 'hover:bg-gray-50 text-gray-600'}`}
                                    >
                                        <span className="text-xs font-bold truncate pr-2">{r.name}</span>
                                        <span className={`text-xs font-black ${r.mape < 10 ? 'text-green-500' : r.mape > 20 ? 'text-red-500' : 'text-orange-500'}`}>
                                            {r.mape.toFixed(1)}%
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right Content: Analysis Dash */}
                        <div className="lg:w-3/4 flex flex-col gap-6 overflow-y-auto pr-2 pb-10 custom-scrollbar">
                            
                            {/* Global Metrics Row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">平均誤差率 (Avg MAPE)</p>
                                    <p className="text-3xl font-black text-[#0F2540] font-display">{globalMetrics?.avgMape.toFixed(1)}%</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">精度中央値 (Median)</p>
                                    <p className="text-3xl font-black text-gray-800 font-display">{globalMetrics?.medianMape.toFixed(1)}%</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">高精度店舗率 (&lt;10%)</p>
                                    <p className="text-3xl font-black text-green-500 font-display">{globalMetrics?.goodRate.toFixed(1)}%</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">平均バイアス (Bias)</p>
                                    <p className={`text-3xl font-black font-display ${globalMetrics!.totalBias > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                        {globalMetrics!.totalBias > 0 ? '+' : ''}{Math.round(globalMetrics!.totalBias).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            {/* Charts Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-shrink-0">
                                {/* Error Distribution */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[350px] flex flex-col">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">精度分布 (MAPE Distribution)</h3>
                                    <div className="flex-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={mapeDistData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="range" tick={{fontSize:9}} />
                                                <YAxis tick={{fontSize:9}} />
                                                <Tooltip cursor={{fill: '#f8fafc'}} />
                                                <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Selected Store Detail */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-[350px] flex flex-col relative group">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display flex items-center justify-between">
                                        個別検証: {selectedStore?.name}
                                        <div className="flex gap-3">
                                            <span className="text-[10px] bg-blue-50 text-[#0F2540] px-2 py-0.5 rounded font-black uppercase">{selectedStore?.trainingMode}</span>
                                            <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded font-black uppercase">MAPE: {selectedStore?.mape.toFixed(1)}%</span>
                                        </div>
                                    </h3>
                                    <div className="flex-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={detailChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="date" tick={{fontSize:9}} />
                                                <YAxis tick={{fontSize:9}} />
                                                <Tooltip formatter={(v:number)=>v.toLocaleString()} />
                                                <Legend wrapperStyle={{fontSize:9}} />
                                                <Line type="monotone" dataKey="actual" name="実績 (Test Set)" stroke="#1A1A1A" strokeWidth={3} dot={{r:4}} />
                                                <Line type="monotone" dataKey="forecast" name="予測 (Blind Forecast)" stroke="#005EB8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Table for Selected Store KPIs */}
                            {selectedStore && (
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex-shrink-0 animate-fadeIn">
                                    <div className="p-4 bg-gray-50 border-b border-gray-100">
                                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Statistical Accuracy Report: {selectedStore.name}</h3>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
                                        <div className="p-6">
                                            <p className="text-[9px] text-gray-400 font-black uppercase mb-1">RMSE (標準誤差)</p>
                                            <p className="text-xl font-black text-gray-800 font-display">{Math.round(selectedStore.rmse).toLocaleString()}</p>
                                        </div>
                                        <div className="p-6">
                                            <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Bias (平均乖離)</p>
                                            <p className={`text-xl font-black font-display ${selectedStore.bias >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                                {selectedStore.bias > 0 ? '+' : ''}{Math.round(selectedStore.bias).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="p-6">
                                            <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Tracking Signal</p>
                                            <p className={`text-xl font-black font-display ${Math.abs(selectedStore.trackingSignal) > 4 ? 'text-red-500' : 'text-green-500'}`}>
                                                {selectedStore.trackingSignal.toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="p-6">
                                            <p className="text-[9px] text-gray-400 font-black uppercase mb-1">Training k-Factor</p>
                                            <p className="text-xl font-black text-orange-500 font-display">{selectedStore.trainingK.toFixed(3)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100 text-gray-300 font-bold uppercase tracking-widest">
                        {isProcessing ? (
                             <div className="flex flex-col items-center gap-6">
                                 <div className="relative w-32 h-32 flex items-center justify-center">
                                     <svg className="animate-spin w-full h-full text-[#0F2540]" viewBox="0 0 24 24">
                                         <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                     </svg>
                                     <span className="absolute text-lg font-black text-[#0F2540]">{progress}%</span>
                                 </div>
                                 <p className="text-sm">大規模バックテストを実行中...</p>
                             </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <svg className="w-16 h-16 mx-auto mb-2 text-gray-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 2v-6m-8 13h11a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2z"></path></svg>
                                <p className="text-xs">検証期間を選択し、ボタンを押して予測モデルの精度を検証してください</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }`}} />
        </div>
    );
};

export default ModelValidationView;
