import React, { useState, useMemo } from 'react';
import { UserMode } from '../types';
import { playClick, playSelect } from '../services/uiEffects';

// ==========================================================================================
// ▼ MENU CONFIGURATION
// ==========================================================================================

const EXECUTIVE_PASSWORD = "QB9119"; 

type AccessLevel = 'all' | 'executive'; 
type MenuGroup = 'main' | 'strategy' | 'system';     

interface MenuConfigItem {
    id: string;         
    label: string;      
    icon: string;       
    access: AccessLevel;
    isVisible: boolean; 
    group: MenuGroup;   
}

const MENU_ITEMS: MenuConfigItem[] = [
    // --- MAIN ---
    { id: 'data', label: 'データ読込', icon: 'fa-database', access: 'all', isVisible: true, group: 'main' },
    { id: 'dashboard', label: '全社ダッシュボード', icon: 'fa-chart-pie', access: 'all', isVisible: true, group: 'main' },
    { id: 'spot', label: '単月スポット分析', icon: 'fa-bolt', access: 'executive', isVisible: true, group: 'main' },
    { id: 'regional_spot', label: '地域スポット分析', icon: 'fa-map-marked-alt', access: 'all', isVisible: true, group: 'main' },
    { id: 'store', label: '店舗詳細分析', icon: 'fa-store', access: 'all', isVisible: true, group: 'main' },
    { id: 'table', label: 'データリスト', icon: 'fa-table', access: 'executive', isVisible: true, group: 'main' },

    // --- STRATEGY ---
    { id: 'ai_analyst', label: 'AI参謀', icon: 'fa-robot', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'vintage', label: '新店成長羅針盤', icon: 'fa-chart-line', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'regional_strategy', label: '地域戦略・予実', icon: 'fa-globe-asia', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'analytics', label: '高度分析ラボ', icon: 'fa-flask', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'simulation', label: '出店シミュレータ', icon: 'fa-chess-knight', access: 'all', isVisible: true, group: 'strategy' },
    { id: 'budget', label: '予算策定', icon: 'fa-money-bill-wave', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'budget_comparison', label: '予実管理', icon: 'fa-balance-scale', access: 'executive', isVisible: true, group: 'strategy' },
    { id: 'logic_flow', label: '思考整理(LogicFlow)', icon: 'fa-project-diagram', access: 'all', isVisible: true, group: 'strategy' },
    { id: 'marketing_design', label: 'マーケティング設計', icon: 'fa-bullhorn', access: 'all', isVisible: true, group: 'strategy' },
    { id: 'coach', label: '経営コーチ(Reflect)', icon: 'fa-user-astronaut', access: 'all', isVisible: true, group: 'strategy' },

    // --- SYSTEM ---
    { id: 'bench', label: '比較ベンチマーク', icon: 'fa-layer-group', access: 'all', isVisible: true, group: 'system' },
    { id: 'validate', label: 'モデル精度検証', icon: 'fa-check-double', access: 'executive', isVisible: true, group: 'system' },
    { id: 'validate_budget', label: '予算精度検証', icon: 'fa-clipboard-check', access: 'executive', isVisible: true, group: 'system' },
    { id: 'logic', label: 'ロジック仕様書', icon: 'fa-code', access: 'executive', isVisible: true, group: 'system' },
    { id: 'guide', label: '操作ガイド', icon: 'fa-book', access: 'executive', isVisible: true, group: 'system' },
    { id: 'version_history', label: '更新履歴', icon: 'fa-history', access: 'all', isVisible: true, group: 'system' },
];

interface SidebarProps {
    currentView: string;
    setCurrentView: (view: string) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    isPinned: boolean;
    setIsPinned: (isPinned: boolean) => void;
    userMode: UserMode;
    setUserMode: (mode: UserMode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    currentView, setCurrentView, isOpen, setIsOpen, isPinned, setIsPinned, userMode, setUserMode 
}) => {
    
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [authPassword, setAuthPassword] = useState("");
    const [authError, setAuthError] = useState("");
    
    const accessibleItems = useMemo(() => {
        return MENU_ITEMS.filter(item => {
            if (!item.isVisible) return false;
            // Only hide from sidebar if access restricted.
            if (userMode === 'manager' && item.access === 'executive') return false;
            return true;
        });
    }, [userMode]);

    const handleModeSwitch = (targetMode: UserMode) => {
        playClick();
        if (targetMode === 'manager') {
            setUserMode('manager');
            setCurrentView('dashboard');
        } else {
            if (userMode !== 'executive') {
                setIsAuthOpen(true);
                setAuthError("");
                setAuthPassword("");
            }
        }
    };

    const handleAuthSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        playClick();
        if (authPassword === EXECUTIVE_PASSWORD) {
            playSelect();
            setUserMode('executive');
            setIsAuthOpen(false);
            setAuthPassword("");
        } else {
            setAuthError("Invalid Password");
        }
    };

    const handleViewChange = (id: string) => {
        if (currentView !== id) {
            playClick();
            setCurrentView(id);
            if (!isPinned && window.innerWidth < 1024) setIsOpen(false);
        }
    };

    const renderGroup = (group: MenuGroup, title: string) => {
        const items = accessibleItems.filter(item => item.group === group);
        if (items.length === 0) return null;
        return (
            <div className="mb-6">
                <h4 className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 font-display opacity-80">{title}</h4>
                <div className="space-y-1">
                    {items.map(item => {
                        const isActive = currentView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleViewChange(item.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 group relative btn-press ${
                                    isActive 
                                    ? 'bg-[#0F2540] text-white shadow-lg shadow-blue-900/30' 
                                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-white/20' : 'bg-white shadow-sm group-hover:scale-110'}`}>
                                    <i className={`fas ${item.icon} text-xs ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#0F2540]'}`}></i>
                                </div>
                                <span className={`text-xs font-bold tracking-wide font-display ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                                {isActive && (
                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-[#EE4B2B] animate-pulse shadow-[0_0_8px_rgba(238,75,43,0.8)]"></div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <>
            {isOpen && !isPinned && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsOpen(false)} />
            )}

            {isAuthOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-entry">
                    <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#0F2540] to-[#EE4B2B]"></div>
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-3 shadow-inner">
                                <i className="fas fa-fingerprint text-2xl text-gray-400"></i>
                            </div>
                            <h3 className="text-lg font-black font-display text-gray-800">Security Clearance</h3>
                            <p className="text-xs text-gray-400 font-medium">Executive Access Required</p>
                        </div>
                        <form onSubmit={handleAuthSubmit}>
                            <input 
                                type="password" autoFocus value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                                placeholder="Enter Access Code"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-sm font-bold outline-none focus:ring-2 focus:ring-[#0F2540] mb-3 transition-all focus:bg-white tracking-widest"
                            />
                            {authError && <p className="text-[10px] text-red-500 font-bold mb-3 text-center">{authError}</p>}
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setIsAuthOpen(false)} className="flex-1 py-3 bg-slate-100 text-gray-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-colors btn-press">CANCEL</button>
                                <button type="submit" className="flex-1 py-3 bg-[#0F2540] text-white rounded-xl text-xs font-black shadow-lg shadow-blue-900/20 hover:bg-[#1e3a8a] transition-colors btn-press">UNLOCK</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <aside 
                className={`fixed top-4 bottom-4 left-4 w-[260px] bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl rounded-[2rem] z-50 transform transition-transform duration-300 ease-in-out flex flex-col overflow-hidden ${
                    isOpen || isPinned ? 'translate-x-0' : '-translate-x-[calc(100%+20px)]'
                }`}
            >
                {/* Header */}
                <div className="p-6 pb-2">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#0F2540] to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 text-white">
                            <i className="fas fa-chart-network text-lg"></i>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tighter leading-none font-display text-gray-800">QB FORECAST</h1>
                            <p className="text-[9px] text-gray-400 font-bold tracking-widest mt-0.5">STRATEGIC AI ENGINE</p>
                        </div>
                    </div>
                    
                    {/* User Mode Card */}
                    <div className="bg-slate-50 rounded-2xl p-1.5 border border-slate-100 flex relative mb-2">
                        <button onClick={() => handleModeSwitch('manager')} className={`flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all z-10 ${userMode === 'manager' ? 'text-white' : 'text-gray-400 hover:text-gray-600'}`}>MGR</button>
                        <button onClick={() => handleModeSwitch('executive')} className={`flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all z-10 flex items-center justify-center gap-1 ${userMode === 'executive' ? 'text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                            EXEC {userMode !== 'executive' && <i className="fas fa-lock text-[8px] opacity-70"></i>}
                        </button>
                        <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-xl shadow-sm transition-all duration-300 ${userMode === 'manager' ? 'left-1.5 bg-gray-400' : 'left-[calc(50%+3px)] bg-[#EE4B2B]'}`}></div>
                    </div>
                </div>

                {/* Scrollable Menu */}
                <div className="flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
                    {renderGroup('main', '主要機能')}
                    {renderGroup('strategy', '戦略・AI')}
                    {renderGroup('system', 'システム・リソース')}
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                    <button 
                        onClick={() => { playClick(); setIsPinned(!isPinned); }}
                        className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all btn-press ${isPinned ? 'bg-blue-50 border-blue-100 text-[#0F2540]' : 'bg-white border-slate-200 text-gray-400 hover:border-slate-300'}`}
                    >
                        <i className={`fas ${isPinned ? 'fa-thumbtack' : 'fa-arrow-to-left'}`}></i>
                        {isPinned ? 'Unpin Sidebar' : 'Collapse'}
                    </button>
                    <p className="text-[8px] text-center text-gray-300 font-mono mt-3">v15.6 / Gemini 3.0 Pro</p>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;