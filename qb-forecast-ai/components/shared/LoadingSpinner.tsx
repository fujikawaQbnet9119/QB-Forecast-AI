import React from 'react';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    color?: string;
    text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    color = 'blue',
    text
}) => {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
        xl: 'w-16 h-16'
    };

    const colorClasses = {
        blue: 'border-blue-500',
        green: 'border-green-500',
        purple: 'border-purple-500',
        gray: 'border-gray-500'
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            {/* Spinner */}
            <div className={`${sizeClasses[size]} border-4 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue} border-t-transparent rounded-full animate-spin`}></div>

            {/* Text */}
            {text && (
                <p className="text-sm font-bold text-gray-600 animate-pulse">{text}</p>
            )}
        </div>
    );
};

export default LoadingSpinner;
