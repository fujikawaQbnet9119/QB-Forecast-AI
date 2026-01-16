
import React from 'react';

interface SidebarProps {
    currentView: 'data' | 'dashboard' | 'region' | 'analytics' | 'bench' | 'store' | 'simulation' | 'table' | 'logic' | 'guide' | 'validate';
    setCurrentView: (view: 'data' | 'dashboard' | 'region' | 'analytics' | 'bench' | 'store' | 'simulation' | 'table' | 'logic' | 'guide' | 'validate') => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isOpen, setIsOpen }) => {
    return (
        <aside 
            className={`
                sidebar-transition flex flex-col bg-white border-r border-gray-200 h-full flex-shrink-0 z-40 text-sm font-sans
                ${isOpen ? 'w-[260px] translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'}
            `}
        >
            <div className="p-6 relative">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#005EB8] rounded-md flex flex-col items-center justify-center text-white shadow-sm flex-shrink-0 font-display">
                            <span className="text-xl font-black leading-none tracking-tighter translate-y-[2px]">QB</span>
                            <span className="text-[6px] font-bold leading-none tracking-widest -translate-y-[1px]">HOUSE</span>
                        </div>
                        <h1 className="font-black text-[#005EB8] text-lg leading-tight uppercase tracking-tighter font-display">QB Forecast</h1>
                    </div>
                    {/* Close Button */}
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="text-gray-400 hover:text-[#005EB8] p-1 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
                    </button>
                </div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] font-display ml-1">データ分析基盤モデル</p>
            </div>
            <nav className="flex-1 px-4 space-y-1 overflow-y-auto min-w-[260px]">
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'data' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('data')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    <span>データ読込・設定</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'dashboard' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('dashboard')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    <span>全社ダッシュボード</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'region' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('region')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>地域・エリア分析</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'table' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('table')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7-8v8m14-8v8M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    <span>全店舗リスト (Table)</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'analytics' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('analytics')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    <span>高度分析ラボ</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'bench' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('bench')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"></path></svg>
                    <span>店舗比較 (Bench)</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'store' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('store')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    <span>店舗詳細分析</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'simulation' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('simulation')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                    <span>新店シミュレーション</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'validate' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('validate')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    <span>モデル精度検証</span>
                </div>
                <div 
                    className={`nav-item flex items-center gap-3 px-4 py-3 rounded-lg font-bold cursor-pointer transition-colors ${currentView === 'logic' ? 'bg-blue-50 text-[#005EB8]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#005EB8]'}`}
                    onClick={() => setCurrentView('logic')}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <span>予測モデル仕様書</span>
                </div>
            </nav>
            <div className="p-4 border-t text-[10px] text-gray-400 text-center uppercase font-black font-display min-w-[260px]">v10.9 Context Help</div>
        </aside>
    );
};

export default Sidebar;
