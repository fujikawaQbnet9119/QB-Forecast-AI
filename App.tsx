
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DataView from './components/DataView';
import DashboardView from './components/DashboardView';
import StoreAnalysisView from './components/StoreAnalysisView';
import AnalyticsView from './components/AnalyticsView';
import ModelLogicView from './components/ModelLogicView';
import GuideView from './components/GuideView';
import ComparisonView from './components/ComparisonView';
import StoreTableView from './components/StoreTableView';
import ModelValidationView from './components/ModelValidationView';
import { StoreData } from './types';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'data' | 'dashboard' | 'analytics' | 'bench' | 'store' | 'table' | 'logic' | 'guide' | 'validate'>('data');
    const [allStores, setAllStores] = useState<{ [name: string]: StoreData }>({});
    const [globalMaxDate, setGlobalMaxDate] = useState<Date>(new Date());
    const [forecastMonths, setForecastMonths] = useState(36);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="flex h-screen w-full bg-[#F8FAFC] text-[#1A1A1A] overflow-hidden">
            <Sidebar 
                currentView={currentView} 
                setCurrentView={setCurrentView} 
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
            />
            
            <main className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300">
                {/* Floating Menu Button (Visible when sidebar is closed) */}
                <div className={`absolute top-4 left-4 z-50 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        className="bg-white p-2 rounded-lg shadow-md border border-gray-200 text-[#005EB8] hover:bg-gray-50 transition-transform hover:scale-105"
                        title="Show Menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                    </button>
                </div>

                {currentView === 'data' && (
                    <DataView 
                        setAllStores={setAllStores} 
                        setGlobalMaxDate={setGlobalMaxDate}
                        forecastMonths={forecastMonths}
                        setForecastMonths={setForecastMonths}
                        onComplete={() => setCurrentView('dashboard')}
                    />
                )}
                {currentView === 'dashboard' && (
                    <DashboardView 
                        allStores={allStores}
                        forecastMonths={forecastMonths}
                    />
                )}
                {currentView === 'analytics' && (
                    <AnalyticsView 
                        allStores={allStores}
                    />
                )}
                {currentView === 'bench' && (
                    <ComparisonView 
                        allStores={allStores}
                    />
                )}
                {currentView === 'store' && (
                    <StoreAnalysisView 
                        allStores={allStores}
                        forecastMonths={forecastMonths}
                    />
                )}
                {currentView === 'table' && (
                    <StoreTableView 
                        allStores={allStores}
                    />
                )}
                {currentView === 'validate' && (
                    <ModelValidationView 
                        allStores={allStores}
                    />
                )}
                {currentView === 'logic' && (
                    <ModelLogicView />
                )}
                {currentView === 'guide' && (
                    <GuideView />
                )}
            </main>
        </div>
    );
};

export default App;
