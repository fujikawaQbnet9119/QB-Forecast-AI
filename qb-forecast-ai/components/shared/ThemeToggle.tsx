import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            style={{
                backgroundColor: isDark ? '#1E293B' : '#E2E8F0'
            }}
            aria-label="Toggle theme"
        >
            {/* Toggle circle */}
            <div
                className="absolute top-0.5 w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center"
                style={{
                    left: isDark ? 'calc(100% - 26px)' : '2px',
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
            >
                {isDark ? (
                    <i className="fas fa-moon text-yellow-300 text-xs"></i>
                ) : (
                    <i className="fas fa-sun text-yellow-500 text-xs"></i>
                )}
            </div>
        </button>
    );
};

export default ThemeToggle;
