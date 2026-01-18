
import React, { useState, useMemo } from 'react';
import { UserMode } from '../types';
import { playClick, playSelect } from '../services/uiEffects';

// ==========================================================================================
// ▼ MENU CONFIGURATION
// ==========================================================================================

const EXECUTIVE_PASSWORD = "QB9119"; // Password for Executive Mode

type AccessLevel = 'all' | 'executive'; 
type MenuGroup = 'main' | 'system';     

interface MenuConfigItem {
    id: string;         
    label: string;      
    icon: string;       
    access: AccessLevel;
    isVisible: boolean; 
    group: MenuGroup;   
}

const MENU_ITEMS: MenuConfigItem[] = [
    // --- MAIN FEATURES ---
    { 
        id: 'data', 
        label: 'データ読込・設定', 
        icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'dashboard', 
        label: '全社ダッシュボード', 
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'spot', 
        label: '全社単月スポット分析', 
        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'regional_strategy', 
        label: '地域戦略・予実分析', 
        icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'regional_spot', 
        label: '地域単月スポット分析', 
        icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'table', 
        label: '全店舗リスト (Table)', 
        icon: 'M3 10h18M3 14h18m-9-4v8m-7-8v8m14-8v8M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'store', 
        label: '店舗詳細分析', 
        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'bench', 
        label: '店舗比較 (Bench)', 
        icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 00-2-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'analytics', 
        label: '高度分析ラボ', 
        icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'simulation', 
        label: '新店シミュレーション', 
        icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'budget', 
        label: '予算策定シミュレーター', 
        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'budget_comparison', 
        label: '予実管理ダッシュボード', 
        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z', 
        access: 'executive', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'logic_flow', 
        label: '思考改善ツール (Logic)', 
        icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'marketing_design', 
        label: 'マーケティング設計', 
        icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },
    { 
        id: 'coach', 
        label: '経営コーチング (Reflect)', 
        icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', 
        access: 'all', 
        isVisible: true,
        group: 'main'
    },

    // --- SYSTEM & DOCUMENTATION ---
    { 
        id: 'logic', 
        label: '予測モデル論理仕様書', 
        icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', 
        access: 'executive', 
        isVisible: true,
        group: 'system'
    },
    { 
        id: 'guide', 
        label: '分析活用マスターガイド', 
        icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', 
        access: 'executive', 
        isVisible: true,
        group: 'system'
    },
    { 
        id: 'validate', 
        label: 'モデル精度検証 (Backtest)', 
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 00-2-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', 
        access: 'executive', 
        isVisible: true,
        group: 'system'
    },
    { 
        id: 'validate_budget', 
        label: '予算精度検証 (Budget Check)', 
        icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z', 
        access: 'executive', 
        isVisible: true,
        group: 'system'
    },
    { 
        id: 'version_history', 
        label: '更新履歴 (Release Note)', 
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', 
        access: 'all', 
        isVisible: true,
        group: 'system'
    },
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
    
    // Auth Modal State
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [authPassword, setAuthPassword] = useState("");
    const [authError, setAuthError] = useState("");
    
    // System Menu State
    const [isSystemOpen, setIsSystemOpen] = useState(false);

    // Filter items based on access level
    const accessibleItems = useMemo(() => {
        return MENU_ITEMS.filter(item => {
            if (!item.isVisible) return false;
            if (userMode === 'manager' && item.access === 'executive') return false;
            return true;
        });
    }, [userMode]);

    const mainItems = accessibleItems.filter(item => item.group === 'main');
    const systemItems = accessibleItems.filter(item => item.group === 'system');

    // Mode Switch Handler
    const handleModeSwitch = (targetMode: UserMode) => {
        playClick(); // Tactile feedback
        if (targetMode === 'manager') {
            setUserMode('manager');
            setCurrentView('dashboard'); // Redirect to safe view just in case
        } else {
            // Need password for Executive
            if (userMode !== 'executive') {
                setIsAuthOpen(true);
                setAuthError("");
                setAuthPassword("");
            }
        }
    };

    const handleAuthSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        playClick(); // Tactile feedback
        if (authPassword === EXECUTIVE_PASSWORD) {
            playSelect(); // Success sound
            setUserMode('executive');
            setIsAuthOpen(false);
            setAuthPassword("");
        } else {
            setAuthError("パスワードが正しくありません");
        }
    };

    const handleViewChange = (id: string) => {
        if (currentView !== id) {
            playClick(); // Click sound
            setCurrentView(id);
            if (!isPinned && window.innerWidth < 1024) setIsOpen(false);
        }
    };

    // Fullscreen Toggle
    const toggleFullscreen = () => {
        playClick();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log("Fullscreen request failed", err);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && !isPinned && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Auth Modal Overlay */}
            {isAuthOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 animate-entry">
                        <div className="flex items-center gap-3 mb-4 text-[#005EB8]">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            </div>
                            <h3 className="text-lg font-black font-display">Security Check</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-4 font-bold">
                            経営者モードへのアクセスにはパスワードが必要です。
                        </p>
                        <form onSubmit={handleAuthSubmit}>
                            <input 
                                type="password" 
                                autoFocus
                                value={authPassword}
                                onChange={(e) => setAuthPassword(e.target.value)}
                                placeholder="Enter Password"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#005EB8] mb-2 transition-all focus:bg-white"
                            />
                            {authError && <p className="text-[10px] text-red-500 font-bold mb-2">{authError}</p>}
                            <div className="flex gap-2 mt-4">
                                <button type="button" onClick={() => setIsAuthOpen(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl text-xs font-black hover:bg-gray-200 transition-colors btn-press">キャンセル</button>
                                <button type="submit" className="flex-1 py-2.5 bg-[#005EB8] text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 hover:bg-[#004a94] transition-colors btn-press">認証解除</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Sidebar Container */}
            <aside 
                className={`fixed top-0 left-0 h-full bg-[#1A1A1A] text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
                    isOpen || isPinned ? 'translate-x-0' : '-translate-x-full'
                }`}
                style={{ width: '260px' }}
            >
                {/* 1. Header Area */}
                <div className="p-6 flex items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#005EB8] rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tighter leading-none font-display">QB FORECAST</h1>
                            <p className="text-[9px] text-gray-400 font-bold tracking-widest mt-0.5">AI STRATEGY ENGINE</p>
                        </div>
                    </div>
                    {/* Pin/Close Button */}
                    <button 
                        onClick={() => {
                            playClick();
                            if (window.innerWidth >= 1024) {
                                setIsPinned(!isPinned);
                            } else {
                                setIsOpen(false);
                            }
                        }}
                        className={`text-gray-500 hover:text-white transition-colors ${isPinned ? 'text-[#005EB8]' : ''} btn-press`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isPinned ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path> // Chevron Left
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path> // X
                            )}
                        </svg>
                    </button>
                </div>

                {/* 2. Scrollable Content Area (Main Features) */}
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
                    <p className="px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 mt-2">Main Features</p>
                    {mainItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => handleViewChange(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative btn-press ${
                                currentView === item.id 
                                ? 'bg-[#005EB8] text-white shadow-lg shadow-blue-900/20' 
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            <svg className={`w-5 h-5 transition-colors ${currentView === item.id ? 'text-white' : 'text-gray-500 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}></path>
                            </svg>
                            <span className="text-xs font-bold tracking-wide">{item.label}</span>
                            {currentView === item.id && (
                                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                            )}
                        </button>
                    ))}
                </div>

                {/* 3. Fixed Bottom Area (System Resources & Settings) */}
                <div className="p-3 border-t border-gray-800 bg-[#1A1A1A]">
                    {/* Collapsible Header for System Menu */}
                    <button
                        onClick={() => setIsSystemOpen(!isSystemOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 mb-1 group"
                    >
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest group-hover:text-gray-400 transition-colors">System & Resources</span>
                        <svg 
                            className={`w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-transform duration-300 ${isSystemOpen ? 'rotate-180' : ''}`} 
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {/* Collapsible Menu Items */}
                    <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${isSystemOpen ? 'max-h-[300px] opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'}`}>
                        {systemItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleViewChange(item.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 group btn-press ${
                                    currentView === item.id 
                                    ? 'bg-gray-800 text-white' 
                                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                                }`}
                            >
                                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}></path>
                                </svg>
                                <span className="text-[10px] font-bold">{item.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Mode Switcher */}
                    <div className="bg-black/40 rounded-xl p-3 mb-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-gray-500">Operation Mode</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${userMode === 'executive' ? 'bg-purple-900 text-purple-200' : 'bg-blue-900 text-blue-200'}`}>
                                {userMode}
                            </span>
                        </div>
                        <div className="flex bg-gray-800 rounded-lg p-1 relative">
                            <button 
                                onClick={() => handleModeSwitch('manager')}
                                className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all z-10 ${userMode === 'manager' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                MGR
                            </button>
                            <button 
                                onClick={() => handleModeSwitch('executive')}
                                className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all z-10 ${userMode === 'executive' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                EXEC <i className={`fas fa-lock ml-1 ${userMode === 'executive' ? 'hidden' : 'inline opacity-50'}`}></i>
                            </button>
                            {/* Animated Background Slider */}
                            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#005EB8] rounded shadow transition-all duration-300 ${userMode === 'manager' ? 'left-1 bg-gray-600' : 'left-[calc(50%+2px)] bg-[#005EB8]'}`}></div>
                        </div>
                    </div>

                    {/* Fullscreen Button */}
                    <button 
                        onClick={toggleFullscreen}
                        className="w-full py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 btn-press"
                    >
                        <i className="fas fa-expand"></i> Full Screen Mode
                    </button>
                    
                    <div className="mt-3 text-center">
                        <p className="text-[8px] text-gray-700 font-mono">v15.2 / Powered by Gemini 1.5</p>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
