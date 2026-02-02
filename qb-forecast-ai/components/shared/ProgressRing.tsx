import React from 'react';

interface ProgressRingProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
    color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
    showLabel?: boolean;
    label?: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
    percentage,
    size = 120,
    strokeWidth = 8,
    color = 'blue',
    showLabel = true,
    label
}) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const colorMap = {
        blue: '#3B82F6',
        green: '#10B981',
        red: '#EF4444',
        yellow: '#F59E0B',
        purple: '#8B5CF6'
    };

    const strokeColor = colorMap[color];

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#E5E7EB"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                />
            </svg>
            {showLabel && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-gray-800">{Math.round(percentage)}%</span>
                    {label && <span className="text-xs text-gray-400 font-bold mt-1">{label}</span>}
                </div>
            )}
        </div>
    );
};

export default ProgressRing;
