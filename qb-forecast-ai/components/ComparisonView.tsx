
import React, { useState, useMemo, useCallback } from 'react';
import { StoreData } from '../types';
import { logisticModel } from '../services/analysisEngine';
import HelpTooltip from './HelpTooltip';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush
} from 'recharts';

interface ComparisonViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ allStores, dataType }) => {
    const [selectedStores, setSelectedStores] = useState<string[]>([]);
    const [mode, setMode] = useState<'calendar' | 'vintage'>('vintage');
    const [showForecast, setShowForecast] = useState(true);
    const [expandedChart, setExpandedChart] = useState<boolean>(false);

    const storeNames = Object.keys(allStores).sort();
    const isSales = dataType === 'sales';

    const toggleStore = (name: string) => {
        if (selectedStores.includes(name)) {
            setSelectedStores(prev => prev.filter(n => n !== name));
        } else {
            // No limit on selection
            setSelectedStores(prev => [...prev, name]);
        }
    };

    // Dynamic Color Generator
    const getColor = (index: number) => {
        const colors = [
            '#005EB8', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', 
            '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4',
            '#84CC16', '#A855F7', '#D946EF', '#E11D48', '#3B82F6'
        ];
        return colors[index % colors.length];
    };

    const chartData = useMemo(() => {
        if (selectedStores.length === 0) return [];

        if (mode === 'calendar') {
            const dateSet = new Set<string>();
            selectedStores.forEach(name => {
                const s = allStores[name];
                s.dates.forEach(d => dateSet.add(d));
                if(showForecast) {
                    const lastD = new Date(s.dates[s.dates.length-1].replace(/\//g,'-'));
                    for(let i=1; i<=12; i++) {
                        const fd = new Date(lastD);
                        fd.setMonth(lastD.getMonth() + i);
                        dateSet.add(`${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}`);
                    }
                }
            });
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
                        const lastDate = new Date(s.dates[s.dates.length-1].replace(/\//g,'-'));
                        const currDate = new Date(d.replace(/\//g,'-'));
                        if (currDate > lastDate) {
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
                        // For seasonality in vintage mode, we align by month index relative to start or average seasonality?
                        // Usually Vintage mode strips seasonality or uses raw. Here we use model projection.
                        // Let's use simple trend for forecast in vintage to avoid seasonality phase mismatch.
                        // Or imply a 'standard' seasonality.
                        const val = tr; // Simplified for vintage forecast
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
                <Tooltip formatter={(val: number) => val.toLocaleString() + (isSales ? '' : '人')} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 'bold' }} />
                
                {selectedStores.map((name, i) => (
                    <React.Fragment key={name}>
                        <Line 
                            type="monotone" 
                            dataKey={name} 
                            name={name} 
                            stroke={getColor(i)} 
                            strokeWidth={2} 
                            dot={false}
                            connectNulls
                        />
                        {showForecast && (
                            <Line 
                                type="monotone" 
                                dataKey={`${name}_forecast`} 
                                name={`${name} (予)`} 
                                stroke={getColor(i)} 
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
    ), [chartData, selectedStores, mode, showForecast, isSales]);

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="flex flex-col lg:flex-row gap-6 h-full">
                
                {/* Sidebar Selection */}
                <div className="lg:w-1/4 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                    <div className="p-6 bg-white border-b border-gray-100">
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight font-display mb-2">店舗比較ベンチマーク</h2>
                        <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                            <span>選択中: <span className="text-[#005EB8]">{selectedStores.length}</span> 店舗</span>
                            {selectedStores.length > 0 && (
                                <button onClick={() => setSelectedStores([])} className="text-red-400 hover:underline">クリア</button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                        {storeNames.map((n, idx) => {
                            const isSelected = selectedStores.includes(n);
                            // Find index in selection for color
                            const selectionIndex = selectedStores.indexOf(n);
                            const color = selectionIndex >= 0 ? getColor(selectionIndex) : '#9CA3AF';
                            
                            return (
                                <button
                                    key={n}
                                    onClick={() => toggleStore(n)}
                                    className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex justify-between items-center border ${isSelected ? 'bg-blue-50 border-blue-100 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50 text-gray-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors`} style={{ backgroundColor: isSelected ? color : '#E5E7EB' }}></div>
                                        <span className={isSelected ? 'text-gray-800' : ''}>{n}</span>
                                    </div>
                                    {isSelected && <span className="text-[#005EB8] font-black">✓</span>}
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
                                        className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-1 ${mode === 'vintage' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Vintage基準
                                        <HelpTooltip title="Vintage基準" content="オープン日を「1ヶ月目」として横軸を揃えます。オープン時期が異なる店舗同士の「立ち上がりスピード」や「成長カーブ」を比較するのに適しています。" />
                                    </button>
                                    <button 
                                        onClick={() => setMode('calendar')}
                                        className={`px-6 py-2 rounded-full text-xs font-black transition-all uppercase font-display flex items-center gap-1 ${mode === 'calendar' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        カレンダー基準
                                        <HelpTooltip title="カレンダー基準" content="通常の時系列（2023年1月、2月...）で比較します。同じ時期に起きた外部要因（コロナ、増税、天候など）の影響を比較するのに適しています。" />
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
                                                <th key={name} className="py-2 px-4 font-black text-gray-800" style={{color: getColor(i)}}>{name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600 flex items-center">成長速度 (k)<HelpTooltip title="成長速度 (k)" content="値が大きいほど、短期間で急成長したことを意味します。" /></td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{allStores[name].params.k.toFixed(3)}</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600 flex items-center">潜在需要 (L)<HelpTooltip title="潜在需要 (L)" content="その店舗が到達しうる売上の天井です。" /></td>
                                            {selectedStores.map(name => (
                                                <td key={name} className="py-3 px-4">{Math.round(allStores[name].params.L).toLocaleString()}</td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 text-left font-bold text-gray-600 flex items-center">年平均成長率 (CAGR)<HelpTooltip title="CAGR" content="直近3年間の平均的な成長率です。" /></td>
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
