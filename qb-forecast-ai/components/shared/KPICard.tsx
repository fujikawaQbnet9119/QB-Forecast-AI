import React from 'react';

interface KPICardProps {
    title: string;
    value: string | number;
    change?: number;
    changeLabel?: string;
    icon?: string;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray';
    sparklineData?: number[];
    subtitle?: string;
}

const KPICard: React.FC<KPICardProps> = ({
    title,
    value,
    change,
    changeLabel = 'vs 前月',
    icon = 'fa-chart-line',
    trend,
    color = 'blue',
    sparklineData,
    subtitle
}) => {
    // Color mapping
    const colorMap = {
        blue: {
            bg: 'bg-blue-50',
            icon: 'bg-blue-500',
            text: 'text-blue-600',
            border: 'border-blue-200'
        },
        green: {
            bg: 'bg-green-50',
            icon: 'bg-green-500',
            text: 'text-green-600',
            border: 'border-green-200'
        },
        red: {
            bg: 'bg-red-50',
            icon: 'bg-red-500',
            text: 'text-red-600',
            border: 'border-red-200'
        },
        yellow: {
            bg: 'bg-yellow-50',
            icon: 'bg-yellow-500',
            text: 'text-yellow-600',
            border: 'border-yellow-200'
        },
        purple: {
            bg: 'bg-purple-50',
            icon: 'bg-purple-500',
            text: 'text-purple-600',
            border: 'border-purple-200'
        },
        gray: {
            bg: 'bg-gray-50',
            icon: 'bg-gray-500',
            text: 'text-gray-600',
            border: 'border-gray-200'
        }
    };

    const colors = colorMap[color];

    // Determine trend automatically if not provided
    const determinedTrend = trend || (change && change > 0 ? 'up' : change && change < 0 ? 'down' : 'neutral');

    // Trend icon and color
    const trendConfig = {
        up: { icon: 'fa-arrow-up', color: 'text-green-500' },
        down: { icon: 'fa-arrow-down', color: 'text-red-500' },
        neutral: { icon: 'fa-minus', color: 'text-gray-400' }
    };

    const trendInfo = trendConfig[determinedTrend];

    return (
        <div className={`${colors.bg} border ${colors.border} rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] group`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
                    {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
                </div>
                <div className={`${colors.icon} w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform`}>
                    <i className={`fas ${icon} text-lg`}></i>
                </div>
            </div>

            {/* Main Value */}
            <div className="mb-3">
                <h3 className={`text-3xl font-black ${colors.text} tracking-tight`}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </h3>
            </div>

            {/* Change Indicator */}
            {change !== undefined && (
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 ${trendInfo.color} font-bold text-sm`}>
                        <i className={`fas ${trendInfo.icon} text-xs`}></i>
                        <span>{Math.abs(change)}%</span>
                    </div>
                    <span className="text-xs text-gray-400">{changeLabel}</span>
                </div>
            )}

            {/* Sparkline (placeholder for now) */}
            {sparklineData && sparklineData.length > 0 && (
                <div className="mt-4 h-12 flex items-end gap-1">
                    {sparklineData.map((val, idx) => {
                        const maxVal = Math.max(...sparklineData);
                        const height = (val / maxVal) * 100;
                        return (
                            <div
                                key={idx}
                                className={`flex-1 ${colors.icon} opacity-30 rounded-t transition-all hover:opacity-60`}
                                style={{ height: `${height}%` }}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default KPICard;
