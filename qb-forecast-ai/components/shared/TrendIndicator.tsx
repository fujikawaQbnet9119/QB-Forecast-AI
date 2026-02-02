import React from 'react';

interface TrendIndicatorProps {
    value: number;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    showPercentage?: boolean;
}

const TrendIndicator: React.FC<TrendIndicatorProps> = ({
    value,
    label,
    size = 'md',
    showIcon = true,
    showPercentage = true
}) => {
    const isPositive = value > 0;
    const isNeutral = value === 0;

    const sizeClasses = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base'
    };

    const iconSizes = {
        sm: 'text-[10px]',
        md: 'text-xs',
        lg: 'text-sm'
    };

    const colorClass = isNeutral
        ? 'text-gray-400'
        : isPositive
            ? 'text-green-500'
            : 'text-red-500';

    const icon = isNeutral
        ? 'fa-minus'
        : isPositive
            ? 'fa-arrow-up'
            : 'fa-arrow-down';

    return (
        <div className={`inline-flex items-center gap-1.5 ${colorClass} font-bold ${sizeClasses[size]}`}>
            {showIcon && <i className={`fas ${icon} ${iconSizes[size]}`}></i>}
            <span>
                {showPercentage && Math.abs(value)}
                {showPercentage && '%'}
                {!showPercentage && value > 0 && '+'}
                {!showPercentage && value}
            </span>
            {label && <span className="text-gray-400 font-normal ml-1">{label}</span>}
        </div>
    );
};

export default TrendIndicator;
