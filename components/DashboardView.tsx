
import React, { useMemo, useState, useCallback } from 'react';
import { StoreData, BubblePoint } from '../types';
import { logisticModel } from '../services/analysisEngine';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Legend, Brush, ReferenceLine, Label,
    AreaChart, Area
} from 'recharts';

interface DashboardViewProps {
    allStores: { [name: string]: StoreData };
    forecastMonths: number;
}

const DashboardView: React.FC<DashboardViewProps> = ({ allStores, forecastMonths }) => {
    const stores = (Object.values(allStores) as StoreData[]).filter(s => !s.error);
    const activeStores = stores.filter(s => s.isActive);
    const [disabledCohorts, setDisabledCohorts] = useState<string[]>([]);
    const [showForecastTable, setShowForecastTable] = useState(true);
    const [expandedChart, setExpandedChart] = useState<string | null>(null);

    const { chartData, totalForecast, bubbleData, vintageData, maxLen, qMedians, stackedAreaData, allCohorts, monthlyForecasts, axisDomains } = useMemo(() => {
        if (stores.length === 0) return { 
            chartData: [], totalForecast: 0, bubbleData: [], vintageData: [], maxLen: 0, qMedians: {x:0, y:0},
            stackedAreaData: [], allCohorts: [], monthlyForecasts: [], axisDomains: { x: ['auto', 'auto'], y: ['auto', 'auto'] }
        };

        // --- 1. Total Forecast Chart Data ---
        const dSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => dSet.add(d)));
        const dates = Array.from(dSet).sort();
        
        const histData = dates.map(d => {
            const sum = stores.reduce((acc, s) => {
                const idx = s.dates.indexOf(d);
                return acc + (idx >= 0 ? (s.raw[idx] || 0) : 0);
            }, 0);
            return { date: d, actual: Math.round(sum), forecast: null as number | null };
        });

        const lastD = new Date(dates[dates.length - 1].replace(/\//g, '-'));
        const forecastData = [];
        let finalSum = 0;
        const monthlyFs = [];

        for (let t = 1; t <= forecastMonths; t++) {
            const fd = new Date(lastD);
            fd.setMonth(lastD.getMonth() + t);
            const label = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}`;
            
            let sum = 0;
            stores.forEach(s => {
                if (!s.isActive) return;
                const tr = logisticModel(s.raw.length + t - 1, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const decay = s.nudgeDecay !== undefined ? s.nudgeDecay : 0.7;
                const val = (tr * (s.seasonal[fd.getMonth()] || 1.0)) + (s.nudge * Math.pow(decay, t));
                sum += val;
            });
            sum = sum < 0 ? 0 : sum;
            if (t === forecastMonths) finalSum = sum;
            forecastData.push({ date: label, actual: null, forecast: Math.round(sum) });
            monthlyFs.push({ date: label, val: Math.round(sum) });
        }

        // --- 2. Portfolio Analysis (K-Means) ---
        let points = activeStores
            .filter(s => s.fit.mode !== 'startup') // Exclude startups
            .map(s => ({
            x: s.params.k,
            y: s.params.L,
            z: 100,
            name: s.name,
            cluster: 0,
            nx: 0, ny: 0
        }));

        let qMx = 0.1, qMy = 1000;
        let xDomain: any[] = ['auto', 'auto'];
        let yDomain: any[] = ['auto', 'auto'];

        if (points.length > 0) {
            const absMinX = Math.min(...points.map(p => p.x));
            const absMaxX = Math.max(...points.map(p => p.x));
            const absMinY = Math.min(...points.map(p => p.y));
            const absMaxY = Math.max(...points.map(p => p.y));

            const sortedXVals = points.map(p => p.x).sort((a, b) => a - b);
            const sortedYVals = points.map(p => p.y).sort((a, b) => a - b);
            
            const idx5 = Math.floor(points.length * 0.05);
            const idx95 = Math.floor(points.length * 0.95);
            
            let coreMinX = sortedXVals[idx5] !== undefined ? sortedXVals[idx5] : absMinX;
            let coreMaxX = sortedXVals[idx95] !== undefined ? sortedXVals[idx95] : absMaxX;
            let coreMinY = sortedYVals[idx5] !== undefined ? sortedYVals[idx5] : absMinY;
            let coreMaxY = sortedYVals[idx95] !== undefined ? sortedYVals[idx95] : absMaxY;

            if (coreMaxX <= coreMinX) { coreMinX = absMinX; coreMaxX = absMaxX; }
            if (coreMaxY <= coreMinY) { coreMinY = absMinY; coreMaxY = absMaxY; }
            
            const paddingX = (coreMaxX - coreMinX) * 0.1 || 0.05;
            const paddingY = (coreMaxY - coreMinY) * 0.1 || 1000;
            
            xDomain = [Math.max(0, coreMinX - paddingX), coreMaxX + paddingX];
            yDomain = [Math.max(0, coreMinY - paddingY), coreMaxY + paddingY];

            const rangeX = absMaxX - absMinX || 1;
            const rangeY = absMaxY - absMinY || 1;

            points = points.map(p => ({
                ...p,
                nx: (p.x - absMinX) / rangeX,
                ny: (p.y - absMinY) / rangeY
            }));

            const sortedX = [...points].sort((a,b)=>a.x-b.x);
            const sortedY = [...points].sort((a,b)=>a.y-b.y);
            qMx = sortedX[Math.floor(sortedX.length/2)].x;
            qMy = sortedY[Math.floor(sortedY.length/2)].y;

            const sortedNx = [...points].map(p => p.nx).sort((a,b)=>a-b);
            const sortedNy = [...points].map(p => p.ny).sort((a,b)=>a-b);
            let centroids = [
                { nx: sortedNx[Math.floor(sortedNx.length * 0.25)] || 0.25, ny: sortedNy[Math.floor(sortedNy.length * 0.25)] || 0.25 },
                { nx: sortedNx[Math.floor(sortedNx.length * 0.75)] || 0.75, ny: sortedNy[Math.floor(sortedNy.length * 0.25)] || 0.25 },
                { nx: sortedNx[Math.floor(sortedNx.length * 0.25)] || 0.25, ny: sortedNy[Math.floor(sortedNy.length * 0.75)] || 0.75 },
                { nx: sortedNx[Math.floor(sortedNx.length * 0.75)] || 0.75, ny: sortedNy[Math.floor(sortedNy.length * 0.75)] || 0.75 }
            ];

            for (let iter = 0; iter < 20; iter++) {
                points.forEach(p => {
                    let minDist = Infinity;
                    let clusterIdx = 0;
                    centroids.forEach((c, idx) => {
                        const dist = (p.nx - c.nx) ** 2 + (p.ny - c.ny) ** 2;
                        if (dist < minDist) { minDist = dist; clusterIdx = idx; }
                    });
                    p.cluster = clusterIdx;
                });
                const newCentroids = centroids.map(() => ({ nx: 0, ny: 0, count: 0 }));
                points.forEach(p => {
                    newCentroids[p.cluster].nx += p.nx;
                    newCentroids[p.cluster].ny += p.ny;
                    newCentroids[p.cluster].count++;
                });
                centroids = newCentroids.map((c, i) => c.count === 0 ? centroids[i] : { nx: c.nx / c.count, ny: c.ny / c.count });
            }
        }

        const bubbles: BubblePoint[] = points.map(p => ({ x: p.x, y: p.y, z: p.z, name: p.name, cluster: p.cluster }));

        // --- 3. Vintage Analysis (Normalized) ---
        const cohorts: { [key: string]: { s: number[], c: number[] } } = {};
        let maxL = 0;
        stores.forEach(s => {
            if(!s.dates[0]) return;
            const y = new Date(s.dates[0].replace(/\//g, '-')).getFullYear();
            const key = `${Math.floor(y / 5) * 5}s組`;
            if (!cohorts[key]) cohorts[key] = { s: [], c: [] };
            
            s.raw.forEach((v, i) => {
                if (s.mask[i]) {
                    if (cohorts[key].s[i] === undefined) { cohorts[key].s[i] = 0; cohorts[key].c[i] = 0; }
                    cohorts[key].s[i] += v;
                    cohorts[key].c[i]++;
                }
            });
            if (s.raw.length > maxL) maxL = s.raw.length;
        });

        const vData = Array.from({ length: maxL }, (_, i) => {
            const pt: any = { period: `${i + 1}ヶ月` };
            Object.keys(cohorts).forEach(k => {
                pt[k] = (cohorts[k].c[i] >= 5) ? Math.round(cohorts[k].s[i] / cohorts[k].c[i]) : null;
            });
            return pt;
        });

        // --- 4. Stacked Area Chart (Historical Absolute) ---
        const vintageMap: Record<string, StoreData[]> = {};
        const vSet = new Set<string>();
        
        stores.forEach(s => {
            if(s.dates.length === 0) return;
            const d = new Date(s.dates[0].replace(/\//g, '-'));
            if(isNaN(d.getTime())) return;
            const y = d.getFullYear();
            const k = `${Math.floor(y/5)*5}年代`;
            vSet.add(k);
            if(!vintageMap[k]) vintageMap[k] = [];
            vintageMap[k].push(s);
        });
        
        const sortedCohorts = Array.from(vSet).sort();
        
        const areaData = dates.map(date => {
            const p: any = { date };
            sortedCohorts.forEach(c => {
                let sum = 0;
                vintageMap[c].forEach(s => {
                    const idx = s.dates.indexOf(date);
                    if(idx !== -1 && s.mask[idx]) sum += s.raw[idx];
                });
                p[c] = Math.round(sum);
            });
            return p;
        });

        return {
            chartData: [...histData, ...forecastData],
            totalForecast: Math.round(finalSum),
            bubbleData: bubbles,
            vintageData: vData,
            maxLen: maxL,
            qMedians: { x: qMx, y: qMy },
            stackedAreaData: areaData,
            allCohorts: sortedCohorts,
            monthlyForecasts: monthlyFs,
            axisDomains: { x: xDomain, y: yDomain }
        };
    }, [stores, forecastMonths, activeStores]);

    const handleDownloadCSV = () => {
        if (stores.length === 0) return;
        const dSet = new Set<string>();
        stores.forEach(s => s.dates.forEach(d => dSet.add(d)));
        const dates = Array.from(dSet).sort();
        const lastD = new Date(dates[dates.length - 1].replace(/\//g, '-'));
        
        const forecastHeaders: string[] = [];
        const forecastDates: Date[] = [];
        for (let t = 1; t <= forecastMonths; t++) {
            const fd = new Date(lastD);
            fd.setMonth(lastD.getMonth() + t);
            const label = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}`;
            forecastHeaders.push(label);
            forecastDates.push(fd);
        }

        let csvContent = "店舗名," + forecastHeaders.join(",") + "\n";
        activeStores.forEach(s => {
            const row: string[] = [s.name];
            for (let t = 1; t <= forecastMonths; t++) {
                const tr = logisticModel(s.raw.length + t - 1, s.fit.params, s.fit.mode, s.fit.shockIdx);
                const monthIndex = forecastDates[t-1].getMonth();
                const seasonal = s.seasonal[monthIndex] || 1.0;
                const decay = s.nudgeDecay !== undefined ? s.nudgeDecay : 0.7;
                let val = (tr * seasonal) + (s.nudge * Math.pow(decay, t));
                if (val < 0) val = 0;
                row.push(val.toFixed(0)); // Integer output
            }
            csvContent += row.join(",") + "\n";
        });

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `qb_forecast_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const clusterColors = ['#005EB8', '#F59E0B', '#10B981', '#EF4444'];
    const vintageColors = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

    const toggleCohort = (c: string) => {
        setDisabledCohorts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
    };

    // --- Render Functions for Charts ---
    const renderForecastChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{fontSize: 9}} tickMargin={10} minTickGap={30} />
                <YAxis tick={{fontSize: 9}} />
                <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Line type="monotone" dataKey="actual" name="実績" stroke="#1A1A1A" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="forecast" name="予測" stroke="#005EB8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Brush dataKey="date" height={20} stroke="#cbd5e1" fill="#f8fafc" />
                <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
            </LineChart>
        </ResponsiveContainer>
    ), [chartData]);

    const renderPortfolioChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="成長率 (k)" 
                    domain={axisDomains.x} 
                    tick={{fontSize: 9}} 
                    tickFormatter={(v) => v.toFixed(3)}
                    label={{ value: '成長速度 (k) →', position: 'bottom', offset: 0, fontSize: 9, fontWeight: 900 }} 
                />
                <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="潜在需要 (L)" 
                    domain={axisDomains.y} 
                    tick={{fontSize: 9}} 
                    label={{ value: '潜在需要 (L) →', angle: -90, position: 'left', offset: 0, fontSize: 9, fontWeight: 900 }} 
                />
                <ZAxis type="number" dataKey="z" range={[50, 400]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                            <div className="bg-white p-3 border rounded shadow-lg text-xs z-50">
                                <p className="font-black text-[#005EB8] mb-1">{data.name}</p>
                                <p>Cluster: {data.cluster + 1}</p>
                                <div className="mt-1 border-t pt-1">
                                    <p>成長率(k): {data.x.toFixed(3)}</p>
                                    <p>潜在力(L): {Math.round(data.y).toLocaleString()}</p>
                                </div>
                            </div>
                        );
                    }
                    return null;
                }} />
                <ReferenceLine x={qMedians.x} stroke="gray" strokeDasharray="3 3" />
                <ReferenceLine y={qMedians.y} stroke="gray" strokeDasharray="3 3" />
                {clusterColors.map((color, i) => (
                    <Scatter key={i} name={`Cluster ${i+1}`} data={bubbleData.filter(d => d.cluster === i)} fill={color} fillOpacity={0.7} />
                ))}
                <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
            </ScatterChart>
        </ResponsiveContainer>
    ), [bubbleData, axisDomains, qMedians]);

    const renderStackedAreaChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stackedAreaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    {allCohorts.map((cohort, i) => (
                        <linearGradient key={cohort} id={`color${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={vintageColors[i % vintageColors.length]} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={vintageColors[i % vintageColors.length]} stopOpacity={0.1}/>
                        </linearGradient>
                    ))}
                </defs>
                <XAxis dataKey="date" tick={{fontSize: 9}} minTickGap={30} />
                <YAxis tick={{fontSize: 9}} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <Tooltip formatter={(val: number) => val.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                {allCohorts.map((cohort, i) => (
                    !disabledCohorts.includes(cohort) && (
                        <Area
                            key={cohort}
                            type="monotone"
                            dataKey={cohort}
                            stackId="1"
                            stroke={vintageColors[i % vintageColors.length]}
                            fill={`url(#color${i})`}
                            animationDuration={500}
                        />
                    )
                ))}
            </AreaChart>
        </ResponsiveContainer>
    ), [stackedAreaData, allCohorts, disabledCohorts]);

    const renderVintageChart = useCallback(() => (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vintageData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{fontSize: 9}} minTickGap={30} />
                <YAxis tick={{fontSize: 9}} />
                <Tooltip formatter={(val: number) => val.toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '10px' }} iconSize={8} />
                {Object.keys(vintageData[0] || {}).filter(k => k !== 'period').map((key, i) => (
                    <Line 
                        key={key} 
                        type="monotone" 
                        dataKey={key} 
                        stroke={['#005EB8', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'][i % 5]} 
                        strokeWidth={2} 
                        dot={false}
                        connectNulls
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    ), [vintageData]);

    const ExpandButton = ({ target }: { target: string }) => (
        <button 
            onClick={() => setExpandedChart(target)}
            className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-white text-gray-400 hover:text-[#005EB8] rounded-md shadow-sm transition-all z-10"
            title="全画面表示"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
        </button>
    );

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">全社経営ダッシュボード</h2>
                    <button 
                        onClick={handleDownloadCSV}
                        className="bg-white border border-gray-200 hover:bg-gray-50 text-[#005EB8] font-bold py-2 px-6 rounded-lg shadow-sm text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path></svg>
                        CSV出力 (予測値)
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-bold font-display">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-8 border-[#005EB8]">
                        <p className="text-[10px] text-gray-400 uppercase mb-1">稼働店舗合計予測値</p>
                        <h3 className="text-3xl font-black text-[#005EB8]">{totalForecast.toLocaleString()}</h3>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-8 border-orange-500">
                        <p className="text-[10px] text-gray-400 uppercase mb-1">分析対象店舗数 (稼働中)</p>
                        <h3 className="text-3xl font-black text-gray-800">{activeStores.length}</h3>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-8 border-purple-500">
                        <p className="text-[10px] text-gray-400 uppercase mb-1">閉店・非稼働店舗</p>
                        <h3 className="text-3xl font-black text-purple-600">{stores.length - activeStores.length}</h3>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-auto flex flex-col relative group">
                        <ExpandButton target="forecast" />
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-gray-700 text-xs uppercase tracking-widest font-display">全社推移予測 (稼働店積上 / Startup補正込)</h3>
                            <button onClick={() => setShowForecastTable(!showForecastTable)} className="text-xs text-[#005EB8] font-bold hover:underline">
                                {showForecastTable ? "テーブルを隠す" : "詳細テーブルを表示"}
                            </button>
                        </div>
                        <div className="h-[400px] w-full relative">
                            {renderForecastChart()}
                        </div>
                        {showForecastTable && monthlyForecasts.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100 overflow-x-auto animate-fadeIn">
                                <table className="min-w-full text-xs text-center">
                                    <thead>
                                        <tr>
                                            {monthlyForecasts.slice(0, 12).map(d => (
                                                <th key={d.date} className="px-2 py-1 font-black text-gray-500 bg-gray-50 border-r border-white whitespace-nowrap">{d.date.split('-')[1]}月</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {monthlyForecasts.slice(0, 12).map(d => (
                                                <td key={d.date} className="px-2 py-2 font-bold text-[#005EB8] border-r border-gray-100">{d.val.toLocaleString()}</td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[500px] flex flex-col relative group">
                        <ExpandButton target="portfolio" />
                        <div className="flex justify-between items-start mb-4">
                             <div>
                                <h3 className="font-black text-gray-700 text-xs uppercase tracking-widest font-display">ポートフォリオ分析 (K-Means Clustering)</h3>
                             </div>
                        </div>
                        <div className="flex-1 w-full relative">
                            {renderPortfolioChart()}
                            <div className="absolute top-10 right-10 text-[9px] font-black text-gray-300 pointer-events-none uppercase">高ポテンシャル / 高成長 (Star)</div>
                            <div className="absolute bottom-12 right-10 text-[9px] font-black text-gray-300 pointer-events-none uppercase">低ポテンシャル / 急成長 (Question)</div>
                            <div className="absolute top-10 left-16 text-[9px] font-black text-gray-300 pointer-events-none uppercase">高ポテンシャル / 成熟 (Cash Cow)</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-auto min-h-[500px] flex flex-col relative group">
                    <ExpandButton target="stacked" />
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <h3 className="font-black text-gray-700 text-xs uppercase tracking-widest font-display whitespace-nowrap">全社売上 積上構成 (創業ビンテージ別・山グラフ)</h3>
                        <div className="flex flex-wrap gap-2 max-w-full justify-end pr-8">
                            {allCohorts.map((cohort, i) => {
                                const isDisabled = disabledCohorts.includes(cohort);
                                const color = vintageColors[i % vintageColors.length];
                                return (
                                    <button
                                        key={cohort}
                                        onClick={() => toggleCohort(cohort)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 ${isDisabled ? 'bg-gray-100 text-gray-400' : 'text-white shadow-sm'}`}
                                        style={{ backgroundColor: isDisabled ? undefined : color }}
                                    >
                                        <span className={`w-2 h-2 rounded-full bg-white ${isDisabled ? 'opacity-0' : 'opacity-100'}`}></span>
                                        {cohort}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className="h-[400px] w-full relative">
                        {renderStackedAreaChart()}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-auto flex flex-col font-bold relative group">
                    <ExpandButton target="vintage" />
                    <h3 className="font-black text-gray-700 text-xs uppercase tracking-widest mb-4 font-display">Vintage分析 (5年開業組 / 正規化推移)</h3>
                    <div className="h-[350px] w-full relative">
                        {renderVintageChart()}
                    </div>
                </div>
            </div>

            {/* Fullscreen Modal */}
            {expandedChart && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col p-4 md:p-8 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight font-display">
                            {expandedChart === 'forecast' && '全社推移予測 詳細'}
                            {expandedChart === 'portfolio' && 'ポートフォリオ分析 詳細'}
                            {expandedChart === 'stacked' && '全社売上 積上構成 詳細'}
                            {expandedChart === 'vintage' && 'Vintage分析 詳細'}
                        </h2>
                        <button 
                            onClick={() => setExpandedChart(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="flex-1 w-full relative bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                        {expandedChart === 'forecast' && renderForecastChart()}
                        {expandedChart === 'portfolio' && renderPortfolioChart()}
                        {expandedChart === 'stacked' && renderStackedAreaChart()}
                        {expandedChart === 'vintage' && renderVintageChart()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardView;
