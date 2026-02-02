
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DataView from './components/DataView';
import DashboardView from './components/DashboardView';
import SpotAnalysisView from './components/SpotAnalysisView';
import RegionalSpotAnalysisView from './components/RegionalSpotAnalysisView';
import VintageAnalysisView from './components/VintageAnalysisView';
import RegionalStrategyView from './components/RegionalStrategyView';
import StoreAnalysisView from './components/StoreAnalysisView';
import AnalyticsView from './components/AnalyticsView';
import ModelLogicView from './components/ModelLogicView';
import GuideView from './components/GuideView';
import ComparisonView from './components/ComparisonView';
import StoreTableView from './components/StoreTableView';
import ModelValidationView from './components/ModelValidationView';
import BudgetValidationView from './components/BudgetValidationView';
import SimulationView from './components/SimulationView';
import LogicFlowView from './components/LogicFlowView';
import MarketingDesignView from './components/MarketingDesignView';
import ManagementCoachView from './components/ManagementCoachView';
import BudgetBuilderView from './components/BudgetBuilderView';
import BudgetComparisonView from './components/BudgetComparisonView';
import VersionHistoryView from './components/VersionHistoryView';
import AIAnalystView from './components/AIAnalystView';
import { StoreData, UserMode } from './types';

type ViewType = 'data' | 'dashboard' | 'ai_analyst' | 'spot' | 'regional_spot' | 'vintage' | 'regional_strategy' | 'analytics' | 'bench' | 'store' | 'simulation' | 'table' | 'logic' | 'guide' | 'validate' | 'validate_budget' | 'logic_flow' | 'marketing_design' | 'coach' | 'budget' | 'budget_comparison' | 'version_history';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewType>('data');
    const [allStores, setAllStores] = useState<{ [name: string]: StoreData }>({});
    const [globalMaxDate, setGlobalMaxDate] = useState<Date>(new Date());
    const [forecastMonths, setForecastMonths] = useState(36);
    
    // Sidebar States
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarPinned, setIsSidebarPinned] = useState(false);
    
    // User Access Mode: Default is 'manager'
    const [userMode, setUserMode] = useState<UserMode>('manager');
    
    const [dataType, setDataType] = useState<'sales' | 'customers'>('sales');

    // Security Guard: Check if manager is trying to access executive views
    const isRestricted = (view: string) => {
        if (userMode === 'executive') return false;
        // Views restricted to Executive Mode
        const executiveOnly = ['ai_analyst', 'spot', 'vintage', 'regional_strategy', 'table', 'analytics', 'validate', 'validate_budget', 'logic', 'guide', 'budget', 'budget_comparison'];
        return executiveOnly.includes(view);
    };

    return (
        <div className="relative h-screen w-full bg-[#F8FAFC] text-[#0F2540] overflow-hidden">
            {/* Sidebar handles its own open/close logic based on props */}
            <Sidebar 
                currentView={currentView} 
                setCurrentView={(v) => !isRestricted(v) && setCurrentView(v as ViewType)} 
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                isPinned={isSidebarPinned}
                setIsPinned={setIsSidebarPinned}
                userMode={userMode}
                setUserMode={setUserMode}
            />
            
            {/* Main content shifts when pinned */}
            <main 
                className={`absolute inset-0 h-full overflow-hidden transition-all duration-300 ${
                    isSidebarPinned ? 'left-[260px] w-[calc(100%-260px)]' : 'left-0 w-full'
                }`}
            >
                <div className={`absolute top-4 left-4 z-40 transition-opacity duration-300 ${isSidebarOpen || isSidebarPinned ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        className="bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-md border border-gray-200 text-[#0F2540] hover:bg-white transition-transform hover:scale-105"
                        title="Show Menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                    </button>
                </div>

                {/* Restricted View fallback */}
                {isRestricted(currentView) && (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-white h-full">
                        <div className="w-20 h-20 bg-gray-100 text-[#0F2540] rounded-full flex items-center justify-center mb-6">
                            <i className="fas fa-lock text-3xl"></i>
                        </div>
                        <h2 className="text-3xl font-black text-[#0F2540] mb-2 font-display">Access Restricted</h2>
                        <p className="text-gray-500 font-bold mb-8">This module requires Executive clearance.</p>
                        <button onClick={() => setCurrentView('dashboard')} className="bg-[#0F2540] text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:shadow-lg transition-all">Back to Dashboard</button>
                    </div>
                )}

                {!isRestricted(currentView) && (
                    <>
                        {currentView === 'data' && (
                            <DataView 
                                setAllStores={setAllStores} 
                                setGlobalMaxDate={setGlobalMaxDate}
                                forecastMonths={forecastMonths}
                                setForecastMonths={setForecastMonths}
                                dataType={dataType}
                                setDataType={setDataType}
                                onComplete={() => setCurrentView('dashboard')}
                                setUserMode={setUserMode}
                            />
                        )}
                        {currentView === 'dashboard' && (
                            <DashboardView 
                                allStores={allStores}
                                forecastMonths={forecastMonths}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'ai_analyst' && (
                            <AIAnalystView 
                                allStores={allStores}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'spot' && (
                            <SpotAnalysisView 
                                allStores={allStores}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'regional_spot' && (
                            <RegionalSpotAnalysisView 
                                allStores={allStores}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'vintage' && (
                            <VintageAnalysisView 
                                allStores={allStores}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'regional_strategy' && <RegionalStrategyView allStores={allStores} dataType={dataType} />}
                        {currentView === 'analytics' && <AnalyticsView allStores={allStores} dataType={dataType} />}
                        {currentView === 'bench' && <ComparisonView allStores={allStores} dataType={dataType} />}
                        {currentView === 'store' && (
                            <StoreAnalysisView 
                                allStores={allStores}
                                forecastMonths={forecastMonths}
                                dataType={dataType}
                            />
                        )}
                        {currentView === 'simulation' && <SimulationView allStores={allStores} dataType={dataType} />}
                        {currentView === 'budget' && <BudgetBuilderView allStores={allStores} dataType={dataType} />}
                        {currentView === 'budget_comparison' && <BudgetComparisonView allStores={allStores} dataType={dataType} />}
                        {currentView === 'logic_flow' && <LogicFlowView allStores={allStores} />}
                        {currentView === 'marketing_design' && <MarketingDesignView allStores={allStores} />}
                        {currentView === 'coach' && <ManagementCoachView />}
                        {currentView === 'table' && <StoreTableView allStores={allStores} dataType={dataType} />}
                        {currentView === 'validate' && <ModelValidationView allStores={allStores} dataType={dataType} />}
                        {currentView === 'validate_budget' && <BudgetValidationView allStores={allStores} dataType={dataType} />}
                        {currentView === 'logic' && <ModelLogicView />}
                        {currentView === 'guide' && <GuideView />}
                        {currentView === 'version_history' && <VersionHistoryView />}
                    </>
                )}
            </main>
        </div>
    );
};

export default App;
