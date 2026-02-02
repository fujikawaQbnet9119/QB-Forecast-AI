import React from 'react';

export interface Insight {
    id: string;
    type: 'opportunity' | 'risk' | 'trend' | 'comparison';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
    confidence: number; // 0-100
    relatedStores?: string[];
    metrics?: { label: string; value: string }[];
    actionable?: boolean;
}

interface InsightCardProps {
    insight: Insight;
    onActionClick?: (insight: Insight) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({
    insight,
    onActionClick
}) => {
    const getTypeConfig = (type: Insight['type']) => {
        switch (type) {
            case 'opportunity':
                return {
                    icon: 'fa-lightbulb',
                    bg: 'bg-green-50',
                    border: 'border-green-200',
                    iconBg: 'bg-green-500',
                    text: 'text-green-700',
                    label: '機会'
                };
            case 'risk':
                return {
                    icon: 'fa-triangle-exclamation',
                    bg: 'bg-red-50',
                    border: 'border-red-200',
                    iconBg: 'bg-red-500',
                    text: 'text-red-700',
                    label: 'リスク'
                };
            case 'trend':
                return {
                    icon: 'fa-chart-line',
                    bg: 'bg-blue-50',
                    border: 'border-blue-200',
                    iconBg: 'bg-blue-500',
                    text: 'text-blue-700',
                    label: 'トレンド'
                };
            case 'comparison':
                return {
                    icon: 'fa-scale-balanced',
                    bg: 'bg-purple-50',
                    border: 'border-purple-200',
                    iconBg: 'bg-purple-500',
                    text: 'text-purple-700',
                    label: '比較'
                };
        }
    };

    const getPriorityBadge = (priority: Insight['priority']) => {
        switch (priority) {
            case 'high':
                return <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">高優先</span>;
            case 'medium':
                return <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded-full">中優先</span>;
            case 'low':
                return <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-700 rounded-full">低優先</span>;
        }
    };

    const config = getTypeConfig(insight.type);

    return (
        <div className={`${config.bg} border ${config.border} rounded-2xl p-5 transition-all hover:shadow-lg`}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
                <div className={`${config.iconBg} w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0`}>
                    <i className={`fas ${config.icon} text-lg`}></i>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`text-sm font-bold ${config.text}`}>{insight.title}</h4>
                        {getPriorityBadge(insight.priority)}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${config.text} px-2 py-0.5 rounded ${config.bg} border ${config.border}`}>
                            {config.label}
                        </span>
                        <span className="text-xs text-gray-500">
                            信頼度: {insight.confidence}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-700 mb-3 leading-relaxed">{insight.description}</p>

            {/* Impact */}
            <div className="bg-white bg-opacity-60 rounded-lg p-3 mb-3">
                <p className="text-xs font-bold text-gray-600 mb-1">予想される影響</p>
                <p className="text-sm font-bold text-gray-800">{insight.impact}</p>
            </div>

            {/* Metrics */}
            {insight.metrics && insight.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                    {insight.metrics.map((metric, idx) => (
                        <div key={idx} className="bg-white bg-opacity-60 rounded-lg p-2">
                            <p className="text-xs text-gray-600">{metric.label}</p>
                            <p className="text-sm font-bold text-gray-800">{metric.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Related Stores */}
            {insight.relatedStores && insight.relatedStores.length > 0 && (
                <div className="mb-3">
                    <p className="text-xs font-bold text-gray-600 mb-2">関連店舗</p>
                    <div className="flex flex-wrap gap-1">
                        {insight.relatedStores.slice(0, 5).map((store, idx) => (
                            <span key={idx} className="text-xs bg-white bg-opacity-60 px-2 py-1 rounded-full text-gray-700">
                                {store}
                            </span>
                        ))}
                        {insight.relatedStores.length > 5 && (
                            <span className="text-xs bg-white bg-opacity-60 px-2 py-1 rounded-full text-gray-500">
                                +{insight.relatedStores.length - 5}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Action Button */}
            {insight.actionable && (
                <button
                    onClick={() => onActionClick?.(insight)}
                    className={`w-full ${config.iconBg} text-white font-bold text-sm py-2 px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
                >
                    <i className="fas fa-bolt"></i>
                    アクションを実行
                </button>
            )}

            {/* Confidence Bar */}
            <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>AI信頼度</span>
                    <span className="font-bold">{insight.confidence}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                        className={`h-1.5 rounded-full ${config.iconBg}`}
                        style={{ width: `${insight.confidence}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
};

export default InsightCard;
