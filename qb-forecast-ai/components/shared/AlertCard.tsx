import React from 'react';

interface AlertCardProps {
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    message: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    icon?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
}

const AlertCard: React.FC<AlertCardProps> = ({
    type,
    title,
    message,
    action,
    icon,
    dismissible = false,
    onDismiss
}) => {
    const typeConfig = {
        success: {
            bg: 'bg-green-50',
            border: 'border-green-200',
            icon: 'bg-green-500',
            iconDefault: 'fa-check-circle',
            text: 'text-green-800',
            button: 'bg-green-500 hover:bg-green-600'
        },
        warning: {
            bg: 'bg-yellow-50',
            border: 'border-yellow-200',
            icon: 'bg-yellow-500',
            iconDefault: 'fa-exclamation-triangle',
            text: 'text-yellow-800',
            button: 'bg-yellow-500 hover:bg-yellow-600'
        },
        danger: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            icon: 'bg-red-500',
            iconDefault: 'fa-exclamation-circle',
            text: 'text-red-800',
            button: 'bg-red-500 hover:bg-red-600'
        },
        info: {
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            icon: 'bg-blue-500',
            iconDefault: 'fa-info-circle',
            text: 'text-blue-800',
            button: 'bg-blue-500 hover:bg-blue-600'
        }
    };

    const config = typeConfig[type];
    const displayIcon = icon || config.iconDefault;

    return (
        <div className={`${config.bg} border ${config.border} rounded-xl p-4 transition-all duration-300 hover:shadow-md`}>
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`${config.icon} w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0`}>
                    <i className={`fas ${displayIcon} text-sm`}></i>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-sm ${config.text} mb-1`}>{title}</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">{message}</p>

                    {/* Action Button */}
                    {action && (
                        <button
                            onClick={action.onClick}
                            className={`mt-3 ${config.button} text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all hover:shadow-md`}
                        >
                            {action.label}
                        </button>
                    )}
                </div>

                {/* Dismiss Button */}
                {dismissible && (
                    <button
                        onClick={onDismiss}
                        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                )}
            </div>
        </div>
    );
};

export default AlertCard;
