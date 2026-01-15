
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush
} from 'recharts';

interface ComparisonViewProps {
    allStores: { [name: string]: StoreData };
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ allStores }) => {
    const [selectedStores, setSelectedStores] = useState<string[]>([]);
    const [mode, setMode] = useState<'calendar' | 'vintage'>('vintage');
    const [showForecast, setShowForecast] = useState(true);
    const [expandedChart, setExpandedChart] = useState<boolean>(false);

    const storeNames = Object.keys(allStores).sort();
    
    // Limits
    const MAX_SELECTION = 3;

    const toggleStore = (name: string) => {
        if (selectedStores.includes(name)) {
            setSelectedStores(prev => prev.filter(n => n !== name));
        } else {
            if (selectedStores.length < MAX_SELECTION) {
                setSelectedStores(prev => [...prev, name]);
            }
        }
    };

    const colors = ['#005EB8', '#F59E0B', '#10B981'];

    const chartData = useMemo(() => {
        if (selectedStores.length === 0) return [];

        if (mode === 'calendar') {
            // Calendar Mode: X-Axis is Date string
            const dateSet = new Set<string>();
            selectedStores.forEach(name => {
                const s = allStores[name];
                s.dates.forEach(d => dateSet.add(d));
                // Add forecast dates if needed
                if(showForecast) {
                    const lastD = new Date(s.dates[s.dates.length-1].replace(/\//g,'-'));
                    for(let i=1; i<=12; i++) {
                        const fd = new Date(lastD);
                        fd.setMonth(lastD.getMonth() + i);
                        dateSet.add(`${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}`);
                    }
                }
            });
            // Fix: Sort chronologically using Date objects
            const dates = Array.from(dateSet).sort((a, b) => {
                return new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime();
            });
            
            return dates.map(d => {
                const pt: any = { date: d };
                selectedStores.forEach(name => {
                    const s = allStores[name];
                    const idx = s.dates.indexOf(d);
                    
                    if (idx !== -1 && s.mask[idx]) {
                        pt[name] = s.raw[idx];
                    } else if (showForecast) {
                        // Check if it's a future date relative to this store's last date
                        const lastDate = new Date(s.dates[s.dates.length-1].replace(/\//g,'-'));
                        const currDate = new Date(d.replace(/\//g,'-'));
                        if (currDate > lastDate) {
                            // Forecast calculation
                            const monthsDiff = (currDate.getFullYear() - lastDate.getFullYear()) * 12 + (currDate.getMonth() - lastDate.getMonth());
                             if(monthsDiff <= 12) {
                                const t = s.raw.length + monthsDiff - 1;
                                const tr = logisticModel(t, s.fit.params, s.fit.mode, s.fit.shockIdx);
                                const sea = s.seasonal[currDate.getMonth()] || 1.0;
                                const val = (tr * sea) + (s.nudge * Math.pow(s.nudgeDecay, monthsDiff));
                                pt[`${name}_forecast`] = Math.round(val);
                             }
                        }
                    }
                });
                return pt;
            });
        } else {
            // Vintage Mode: X-Axis is Month Number (1, 2, 3...)
            let maxLen = 0;
            selectedStores.forEach(name => {
                const len = allStores[name].raw.length + (showForecast ? 12 : 0);
                if (len > maxLen) maxLen = len;
            });

            return Array.from({ length: maxLen }, (_, i) => {
                const pt: any = { month: i + 1 };
                selectedStores.forEach(name => {
                    const s = allStores[name];
                    if (i < s.raw.length) {
                        if (s.mask[i]) pt[name] = s.raw[i];
                    } else if (showForecast && i < s.raw.length + 12) {
                        const t = i;
                        const tr = logisticModel(t, s.fit.params, s.fit.mode, s.fit.shockIdx);
                        // For vintage mode, seasonality is tricky because months don't align. 
                        // We use index % 12, but we need the start month offset.
                        const startD = new Date(s.dates[0].replace(/\//g, '-'));
                        const mIdx = (startD.getMonth() + i) % 12;
                        const sea = s.seasonal[mIdx] || 1.0;
                        const nudgeStep = i - s.raw.length + 1;
                        const val = (tr * sea) + (s.nudge * Math.pow(s.nudgeDecay, nudgeStep));
                        pt[`${name}_forecast`] = Math.round(val);
                    }
                });
                return pt;
            });
        }
    }, [selectedStores, mode, showForecast, allStores]);

    const renderChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey={mode === 'vintage' ? 'month' : 'date'} 
                    tick={{fontSize: 9}} 
                    label={mode === 'vintage' ? { value: '経過月数', position: 'bottom', fontSize: 9 } : undefined}
                    minTickGap={30}
                />
                <YAxis tick={{fontSize: 9}} />
                <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 'bold' }} />
                
                {selectedStores.map((name, i) => (
                    <React.Fragment key={name}>
                        <Line 
                            type="monotone" 
                            dataKey={name} 
                            name={name} 
                            stroke={colors[i]} 
                            strokeWidth={2} 
                            dot={false}
                            connectNulls
                        />
                        {showForecast && (
                            <Line 
                                type="monotone" 
                                dataKey={`${name}_forecast`} 
                                name={`${name} (予)`} 
                                stroke={colors[i]} 
                                strokeWidth={2} 
                                strokeDasharray="5 5" 
                                dot={false}
                            />
                        )}
                    </React.Fragment>
                ))}
                {mode === 'calendar' && <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" />}
            </LineChart>
        </ResponsiveContainer>
    ), [chartData, selectedStores, mode, showForecast, colors]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="flex flex-col lg:flex-row gap-6 h-full">
                
                {/* Sidebar Selection */}
                <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                    <div className="p-6 bg-white border-b border-gray-100">
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight font-display mb-2">店舗比較ベンチマーク</h2>
                        <p className="text-xs text-gray-400 font-bold">最大3店舗まで選択可能</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-1">
                        {storeNames.map(n => {
                            const isSelected = selectedStores.includes(n);
                            const isDisabled = !isSelected && selectedStores.length >= MAX_SELECTION;
                            return (
                                <button
                                    key={n}
                                    onClick={() => toggleStore(n)}
                                    disabled={isDisabled}
                                    className={`w-full text-left px-5 py-3 rounded-2xl text-xs font-bold transition-all flex justify-between items-center ${isSelected ? 'bg-[#005EB8] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    <span>{n}</span>
                                    {isSelected && <span className="bg-white/20 px-2 py-0.5 rounded text-[9px]">選択中</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Chart Area */}
                <div className="lg:w-3/4 flex flex-col gap-6">
                    {selectedStores.length > 0 ? (
                        <>
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex gap-2 bg-gray-100 p-1 rounded-full">
                                    <button 
                                        onClick={() => setMode('vintage')}
                                        className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display ${mode === 'vintage' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Vintage基準 (経過月数)
                                    </button>
                                    <button 
                                        onClick={() => setMode('calendar')}
                                        className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display ${mode === 'calendar' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        カレンダー基準 (時系列)
                                    </button>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={showForecast} onChange={e => setShowForecast(e.target.checked)} className="accent-[#005EB8]" />
                                    <span>予測線を表示 (12ヶ月)</span>
                                </label>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex-1 relative flex flex-col group">
                                <button 
                                    onClick={() => setExpandedChart(true)}
                                    className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-gray-400 hover:text-[#005EB8] rounded-md shadow-sm transition-all z-10"
                                    title="全画面表示"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                                </button>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display text-center">
                                    {mode === 'vintage' ? 'Normalized Growth Curve (Open Month = 1)' : 'Historical Timeline Comparison'}
                                </h3>
                                <div className="flex-1 w-full min-h-[400px]">
                                    {renderChart()}
                                </div>
                            </div>

                            {/* Stats Comparison Table */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
                                <table className="min-w-full text-center text-xs">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="py-2 px-4 text-left font-black text-gray-400 uppercase">Metric</th>
                                            {selectedStores.map((name, i) => (
                                                <th key={name} className="py-2 px-4 font-black text-gray-800" style={{color: colors[i]}}>{name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600">成長速度 (k)</td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{allStores[name].params.k.toFixed(3)}</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600">潜在需要 (L)</td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{Math.round(allStores[name].params.L).toLocaleString()}</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600">年平均成長率 (CAGR)</td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{(allStores[name].stats?.cagr ? allStores[name].stats.cagr * 100 : 0).toFixed(1)}%</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600">昨対比 (YoY)</td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{(allStores[name].stats?.yoy ? allStores[name].stats.yoy * 100 : 0).toFixed(1)}%</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600">安定性 (CV)</td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{(allStores[name].stats?.cv ? allStores[name].stats.cv * 100 : 0).toFixed(1)}%</td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 font-bold uppercase tracking-widest bg-white rounded-3xl border border-dashed border-gray-200">
                            <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            <p>左のリストから店舗を選択して比較を開始</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Fullscreen Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">
                            ベンチマーク比較チャート 詳細
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(false)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                        {renderChart()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComparisonView;
