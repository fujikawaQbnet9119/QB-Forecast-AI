
import React, { useState, useMemo, useEffect } from 'react';
import { StoreData } from '../types';
import HelpTooltip from './HelpTooltip';

interface StoreTableViewProps {
    allStores: { [name: string]: StoreData };
    dataType: 'sales' | 'customers';
}

type SortField = 'region' | 'prefecture' | 'block' | 'name' | 'sales' | 'yoy' | 'abc' | 'k' | 'L' | 'age' | 'status';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'list' | 'matrix';

const StoreTableView: React.FC<StoreTableViewProps> = ({ allStores, dataType }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    
    // Filter States
    const [filterText, setFilterText] = useState('');
    const [filterABC, setFilterABC] = useState<string>('All');
    const [filterMode, setFilterMode] = useState<string>('All');
    const [showInactive, setShowInactive] = useState(false);
    
    // Date Range Filters (YYYY-MM format)
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    // Sort States
    const [sortField, setSortField] = useState<SortField>('sales');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const isSales = dataType === 'sales';

    // --- Unified Data Pipeline ---

    // 0. Pre-calculate All Unique Dates (Sorted)
    const allUniqueDates = useMemo(() => {
        const allDatesSet = new Set<string>();
        Object.values(allStores).forEach((s: StoreData) => s.dates.forEach(d => allDatesSet.add(d)));
        return Array.from(allDatesSet).sort((a, b) => {
            return new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime();
        });
    }, [allStores]);

    // Initialize Date Filters to Min/Max
    useEffect(() => {
        if (allUniqueDates.length > 0 && !filterStartDate) {
            const first = allUniqueDates[0].replace(/\//g, '-'); // YYYY/MM -> YYYY-MM
            const last = allUniqueDates[allUniqueDates.length - 1].replace(/\//g, '-');
            setFilterStartDate(first);
            setFilterEndDate(last);
        }
    }, [allUniqueDates, filterStartDate]);
    
    // 1. Base Data Construction (Calculated Fields)
    const baseData = useMemo(() => {
        return Object.values(allStores).map((s: StoreData) => {
            const latestSales = s.raw.length > 0 ? s.raw[s.raw.length - 1] : 0;
            const age = s.raw.length;
            return {
                ...s,
                latestSales,
                age
            };
        });
    }, [allStores]);

    // 2. Filtering & Sorting
    const sortedFilteredData = useMemo(() => {
        return baseData
            .filter(s => {
                // Status Filter
                if (!showInactive && !s.isActive) return false;
                
                // Text Filter (Name, Block, Region, Prefecture)
                if (filterText) {
                    const search = filterText.toLowerCase();
                    const nameMatch = s.name.toLowerCase().includes(search);
                    const blockMatch = (s.block || "").toLowerCase().includes(search);
                    const regionMatch = (s.region || "").toLowerCase().includes(search);
                    const prefMatch = (s.prefecture || "").toLowerCase().includes(search);
                    if (!nameMatch && !blockMatch && !regionMatch && !prefMatch) return false;
                }
                
                // ABC Filter
                if (filterABC !== 'All') {
                    const rank = s.stats?.abcRank || 'C'; // Default to C if undefined, though usually defined
                    if (rank !== filterABC) return false;
                }

                // Mode Filter
                if (filterMode !== 'All') {
                    // mode in data is 'standard'|'shift'|'dual_shift'|'recovery'|'startup'
                    if (s.fit.mode !== filterMode) return false;
                }

                return true;
            })
            .sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                switch (sortField) {
                    case 'region': valA = a.region || ""; valB = b.region || ""; break;
                    case 'prefecture': valA = a.prefecture || ""; valB = b.prefecture || ""; break;
                    case 'block': valA = a.block || ""; valB = b.block || ""; break;
                    case 'name': valA = a.name; valB = b.name; break;
                    case 'sales': valA = a.latestSales; valB = b.latestSales; break;
                    case 'yoy': valA = a.stats?.yoy || -999; valB = b.stats?.yoy || -999; break;
                    case 'abc': valA = a.stats?.abcRank || 'Z'; valB = b.stats?.abcRank || 'Z'; break;
                    case 'k': valA = a.params.k; valB = b.params.k; break;
                    case 'L': valA = a.params.L; valB = b.params.L; break;
                    case 'age': valA = a.age; valB = b.age; break;
                    case 'status': valA = a.isActive ? 1 : 0; valB = b.isActive ? 1 : 0; break;
                }

                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
    }, [baseData, showInactive, filterText, filterABC, filterMode, sortField, sortOrder]);

    // 3. Matrix View Helpers (Filtered Headers)
    const matrixHeaders = useMemo(() => {
        return allUniqueDates.filter(d => {
            const current = d.replace(/\//g, '-');
            if (filterStartDate && current < filterStartDate) return false;
            if (filterEndDate && current > filterEndDate) return false;
            return true;
        });
    }, [allUniqueDates, filterStartDate, filterEndDate]);

    // Optimize Matrix Row Data Access
    const matrixRows = useMemo(() => {
        return sortedFilteredData.map(s => {
            const dataMap: { [date: string]: number | null } = {};
            // Pre-fill? No, just lookup.
            s.dates.forEach((d, i) => {
                dataMap[d] = s.raw[i];
            });
            return {
                ...s,
                dataMap
            };
        });
    }, [sortedFilteredData]);


    // --- Handlers ---

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const handleDownloadCSV = () => {
        if (viewMode === 'list') {
            const headers = ["地方", "都道府県", "ブロック", "店舗名", "ステータス", "ABCランク", "稼働月数", isSales ? "直近月商(k)" : "直近客数(人)", "昨対比(YoY)", "成長率(k)", "潜在需要(L)", "モード", "変動率(CV)"];
            let csv = headers.join(",") + "\n";
            
            sortedFilteredData.forEach(s => {
                const row = [
                    `"${s.region || '-'}"`,
                    `"${s.prefecture || '-'}"`,
                    `"${s.block || '-'}"`,
                    `"${s.name}"`,
                    s.isActive ? "稼働中" : "閉店/休業",
                    s.stats?.abcRank || "-",
                    s.age,
                    s.latestSales,
                    (s.stats?.yoy ? (s.stats.yoy * 100).toFixed(1) : 0) + "%",
                    s.params.k.toFixed(4),
                    Math.round(s.params.L),
                    s.fit.mode,
                    (s.stats?.cv ? (s.stats.cv * 100).toFixed(1) : 0) + "%"
                ];
                csv += row.join(",") + "\n";
            });
            downloadBlob(csv, `store_list_${new Date().toISOString().slice(0,10)}.csv`);
        } else {
            // Matrix CSV
            const headers = ["地方", "都道府県", "ブロック", "店舗名", "ステータス", ...matrixHeaders];
            let csv = headers.join(",") + "\n";
            matrixRows.forEach(r => {
                const row = [
                    `"${r.region || '-'}"`,
                    `"${r.prefecture || '-'}"`,
                    `"${r.block || '-'}"`,
                    `"${r.name}"`,
                    r.isActive ? "稼働中" : "閉店/休業",
                    ...matrixHeaders.map(d => r.dataMap[d] !== undefined ? r.dataMap[d] : "")
                ];
                csv += row.join(",") + "\n";
            });
            downloadBlob(csv, `sales_matrix_${new Date().toISOString().slice(0,10)}.csv`);
        }
    };

    const downloadBlob = (content: string, filename: string) => {
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const thClass = (field: SortField) => `
        px-4 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none font-display whitespace-nowrap
        ${sortField === field ? 'bg-gray-50 text-[#005EB8]' : ''}
    `;

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            <div className="w-full px-4 md:px-8 h-full flex flex-col">
                {/* Header & Controls Area */}
                <div className="flex flex-col gap-4 mb-6 flex-shrink-0">
                    
                    {/* Top Row: Title & View Switcher */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tight font-display flex items-center gap-3">
                                全店舗データリスト
                                <HelpTooltip title="データリスト" content="全店舗の最新KPI（ABCランク、成長率など）を一覧表示します。Excelのようにソートや絞り込みができ、CSVダウンロードも可能です。" />
                            </h2>
                            <p className="text-xs text-gray-400 font-bold mt-1">
                                {sortedFilteredData.length} stores found
                            </p>
                        </div>
                        <div className="bg-gray-200 p-1 rounded-lg flex text-xs font-bold font-display shadow-inner">
                            <button 
                                onClick={() => setViewMode('list')}
                                className={`px-4 py-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                サマリ一覧
                            </button>
                            <button 
                                onClick={() => setViewMode('matrix')}
                                className={`px-4 py-1.5 rounded-md transition-all ${viewMode === 'matrix' ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                月次推移表
                            </button>
                        </div>
                    </div>

                    {/* Bottom Row: Filters & Actions */}
                    <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                        
                        {/* Search */}
                        <div className="relative flex-1 w-full xl:w-64">
                            <input 
                                type="text" 
                                placeholder="地名・店舗名で検索..." 
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#005EB8]"
                            />
                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>

                        <div className="w-px h-8 bg-gray-100 hidden xl:block"></div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center">
                            <select 
                                value={filterABC} 
                                onChange={(e) => setFilterABC(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#005EB8] bg-gray-50 hover:bg-white transition-colors cursor-pointer"
                            >
                                <option value="All">ABC: 全て</option>
                                <option value="A">Rank A (上位)</option>
                                <option value="B">Rank B (中位)</option>
                                <option value="C">Rank C (下位)</option>
                            </select>

                            <select 
                                value={filterMode} 
                                onChange={(e) => setFilterMode(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#005EB8] bg-gray-50 hover:bg-white transition-colors cursor-pointer"
                            >
                                <option value="All">Mode: 全て</option>
                                <option value="standard">Standard (安定)</option>
                                <option value="shift">Shift (構造変化)</option>
                                <option value="dual_shift">Dual Shift (コロナ+α)</option>
                                <option value="recovery">Recovery (回復)</option>
                                <option value="startup">Startup (新規)</option>
                            </select>

                             {/* Sort Dropdown (Visible mainly for Matrix View or Mobile) */}
                             <select 
                                value={sortField} 
                                onChange={(e) => { setSortField(e.target.value as SortField); setSortOrder('desc'); }}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#005EB8] bg-gray-50 hover:bg-white transition-colors cursor-pointer xl:hidden"
                            >
                                <option value="sales">Sort: {isSales ? '売上' : '客数'}</option>
                                <option value="yoy">Sort: 昨対比</option>
                                <option value="abc">Sort: ABC</option>
                                <option value="name">Sort: 店舗名</option>
                                <option value="block">Sort: ブロック</option>
                                <option value="prefecture">Sort: 都道府県</option>
                            </select>

                            {/* Date Range Filters (Visible only in Matrix Mode) */}
                            {viewMode === 'matrix' && (
                                <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1">
                                    <input 
                                        type="month" 
                                        value={filterStartDate}
                                        onChange={(e) => setFilterStartDate(e.target.value)}
                                        className="bg-transparent text-xs font-bold text-gray-600 focus:outline-none p-1 cursor-pointer w-24"
                                    />
                                    <span className="text-gray-400 font-bold">~</span>
                                    <input 
                                        type="month" 
                                        value={filterEndDate}
                                        onChange={(e) => setFilterEndDate(e.target.value)}
                                        className="bg-transparent text-xs font-bold text-gray-600 focus:outline-none p-1 cursor-pointer w-24"
                                    />
                                </div>
                            )}

                            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer bg-gray-50 hover:bg-white transition-colors select-none">
                                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[#005EB8]" />
                                <span className="text-xs font-bold text-gray-600 whitespace-nowrap">閉店を含む</span>
                            </label>
                        </div>

                        <div className="w-px h-8 bg-gray-100 hidden xl:block"></div>

                        {/* Action */}
                        <button 
                            onClick={handleDownloadCSV}
                            className="bg-[#005EB8] hover:bg-[#004a94] text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap ml-auto xl:ml-0"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path></svg>
                            CSV出力
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col relative">
                    {viewMode === 'list' ? (
                        <div className="overflow-auto flex-1">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th onClick={() => handleSort('status')} className={thClass('status')}>状態</th>
                                        <th onClick={() => handleSort('region')} className={thClass('region')}>地方</th>
                                        <th onClick={() => handleSort('prefecture')} className={thClass('prefecture')}>都道府県</th>
                                        <th onClick={() => handleSort('block')} className={thClass('block')}>ブロック</th>
                                        <th onClick={() => handleSort('name')} className={thClass('name')}>店舗名</th>
                                        <th onClick={() => handleSort('abc')} className={thClass('abc')}>ABC</th>
                                        <th onClick={() => handleSort('sales')} className={`${thClass('sales')} text-right`}>{isSales ? '直近月商 (k)' : '直近客数 (人)'}</th>
                                        <th onClick={() => handleSort('yoy')} className={`${thClass('yoy')} text-right`}>昨対比 (YoY)</th>
                                        <th onClick={() => handleSort('k')} className={`${thClass('k')} text-right`}>成長率 (k)</th>
                                        <th onClick={() => handleSort('L')} className={`${thClass('L')} text-right`}>潜在需要 (L)</th>
                                        <th className={thClass('status')}>モード</th>
                                        <th className={`${thClass('status')} text-right`}>変動率(CV)</th>
                                        <th onClick={() => handleSort('age')} className={`${thClass('age')} text-right`}>稼働月数</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {sortedFilteredData.map((s) => (
                                        <tr key={s.name} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-full font-bold ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {s.isActive ? 'ACTIVE' : 'CLOSED'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-gray-500 whitespace-nowrap">{s.region || "-"}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-gray-500 whitespace-nowrap">{s.prefecture || "-"}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-gray-500 whitespace-nowrap">{s.block || "-"}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-gray-800 whitespace-nowrap">{s.name}</td>
                                            <td className="px-4 py-3 text-xs font-black">
                                                <span className={`
                                                    ${s.stats?.abcRank === 'A' ? 'text-yellow-500' : s.stats?.abcRank === 'B' ? 'text-blue-500' : 'text-gray-400'}
                                                `}>
                                                    {s.stats?.abcRank || '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-right text-gray-700">{s.latestSales.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-right">
                                                <span className={!s.stats?.yoy ? 'text-gray-400' : s.stats.yoy > 0 ? 'text-green-600' : 'text-red-500'}>
                                                    {s.stats?.yoy ? (s.stats.yoy * 100).toFixed(1) : '-'}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono text-right text-gray-500">{s.params.k.toFixed(3)}</td>
                                            <td className="px-4 py-3 text-xs font-mono text-right text-[#005EB8]">{Math.round(s.params.L).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                                                    ${s.fit.mode === 'dual_shift' ? 'bg-indigo-100 text-indigo-600' :
                                                      s.fit.mode === 'shift' ? 'bg-purple-100 text-purple-600' : 
                                                      s.fit.mode === 'startup' ? 'bg-orange-100 text-orange-600' : 
                                                      'bg-gray-100 text-gray-500'}
                                                `}>
                                                    {s.fit.mode}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-right text-gray-500">
                                                {s.stats?.cv ? (s.stats.cv * 100).toFixed(1) : '-'}%
                                            </td>
                                            <td className="px-4 py-3 text-xs text-right text-gray-400">{s.age}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="overflow-auto flex-1">
                            <table className="min-w-full divide-y divide-gray-200 border-separate" style={{borderSpacing: 0}}>
                                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="sticky left-0 bg-white z-20 px-4 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">地方</th>
                                        <th className="sticky left-[100px] bg-white z-20 px-4 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">都道府県</th>
                                        <th className="sticky left-[200px] bg-white z-20 px-4 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">店舗名</th>
                                        <th className="sticky left-[340px] bg-white z-20 px-4 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">Status</th>
                                        {matrixHeaders.map(date => (
                                            <th key={date} className="px-2 py-3 text-center text-[10px] font-bold text-gray-400 border-b border-gray-100 min-w-[60px] whitespace-nowrap">
                                                {date.split('/')[0]}<br/><span className="text-gray-600 text-xs">{date.split('/')[1]}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {matrixRows.map(r => (
                                        <tr key={r.name} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="sticky left-0 bg-white z-10 px-4 py-2 text-xs font-bold text-gray-600 border-r border-gray-200 whitespace-nowrap w-[100px] truncate" title={r.region}>{r.region || "-"}</td>
                                            <td className="sticky left-[100px] bg-white z-10 px-4 py-2 text-xs font-bold text-gray-600 border-r border-gray-200 whitespace-nowrap w-[100px] truncate" title={r.prefecture}>{r.prefecture || "-"}</td>
                                            <td className="sticky left-[200px] bg-white z-10 px-4 py-2 text-xs font-bold text-gray-800 border-r border-gray-200 whitespace-nowrap w-[140px] truncate" title={r.name}>{r.name}</td>
                                            <td className="sticky left-[340px] bg-white z-10 px-4 py-2 text-xs border-r border-gray-200 whitespace-nowrap">
                                                <span className={`w-2 h-2 inline-block rounded-full ${r.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                            </td>
                                            {matrixHeaders.map(date => {
                                                const val = r.dataMap[date];
                                                return (
                                                    <td key={date} className="px-2 py-2 text-center text-xs border-r border-gray-50">
                                                        {val ? (
                                                            <span className={val > 1000 ? 'font-bold text-gray-700' : 'text-gray-400'}>
                                                                {val.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-200 text-[10px]">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StoreTableView;
