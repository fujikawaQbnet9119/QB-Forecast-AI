import React from 'react';

export interface Recommendation {
    id: string;
    category: 'growth' | 'efficiency' | 'risk_mitigation' | 'cost_reduction';
    title: string;
    description: string;
    expectedImpact: {
        metric: string;
        value: string;
        timeframe: string;
    };
    effort: 'low' | 'medium' | 'high';
    priority: number; // 1-10
    steps?: string[];
    targetStores?: string[];
}

interface RecommendationEngineProps {
    recommendations: Recommendation[];
    onRecommendationSelect?: (recommendation: Recommendation) => void;
}

const RecommendationEngine: React.FC<RecommendationEngineProps> = ({
    recommendations,
    onRecommendationSelect
}) => {
    // Sort by priority
    const sortedRecommendations = [...recommendations].sort((a, b) => b.priority - a.priority);

    const getCategoryConfig = (category: Recommendation['category']) => {
        switch (category) {
            case 'growth':
                return {
                    icon: 'fa-rocket',
                    color: 'text-green-600',
                    bg: 'bg-green-50',
                    border: 'border-green-200',
                    label: '成長促進'
                };
            case 'efficiency':
                return {
                    icon: 'fa-gauge-high',
                    color: 'text-blue-600',
                    bg: 'bg-blue-50',
                    border: 'border-blue-200',
                    label: '効率化'
                };
            case 'risk_mitigation':
                return {
                    icon: 'fa-shield-halved',
                    color: 'text-orange-600',
                    bg: 'bg-orange-50',
                    border: 'border-orange-200',
                    label: 'リスク軽減'
                };
            case 'cost_reduction':
                return {
                    icon: 'fa-piggy-bank',
                    color: 'text-purple-600',
                    bg: 'bg-purple-50',
                    border: 'border-purple-200',
                    label: 'コスト削減'
                };
        }
    };

    const getEffortBadge = (effort: Recommendation['effort']) => {
        switch (effort) {
            case 'low':
                return <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded-full">低労力</span>;
            case 'medium':
                return <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded-full">中労力</span>;
            case 'high':
                return <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">高労力</span>;
        }
    };

    const getPriorityStars = (priority: number) => {
        const stars = Math.min(Math.ceil(priority / 2), 5);
        return (
            <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <i
                        key={i}
                        className={`fas fa-star text-xs ${i < stars ? 'text-yellow-500' : 'text-gray-300'}`}
                    ></i>
                ))}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">AI推奨アクション</h3>
                    <p className="text-xs text-gray-500 mt-1">データに基づく実行可能な提案</p>
                </div>
                <div className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1.5 rounded-full">
                    <i className="fas fa-brain text-sm"></i>
                    <span className="text-xs font-bold">{recommendations.length}件の提案</span>
                </div>
            </div>

            {/* Recommendations List */}
            <div className="space-y-4">
                {sortedRecommendations.length === 0 ? (
                    <div className="text-center py-8">
                        <i className="fas fa-robot text-4xl text-gray-300 mb-3"></i>
                        <p className="text-sm font-bold text-gray-600">推奨アクションはありません</p>
                        <p className="text-xs text-gray-400 mt-1">データ分析中です...</p>
                    </div>
                ) : (
                    sortedRecommendations.map((rec, index) => {
                        const config = getCategoryConfig(rec.category);

                        return (
                            <div
                                key={rec.id}
                                className={`${config.bg} border ${config.border} rounded-xl p-4 cursor-pointer transition-all hover:shadow-md`}
                                onClick={() => onRecommendationSelect?.(rec)}
                            >
                                {/* Header */}
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border-2 border-gray-200 flex-shrink-0">
                                        <span className="text-sm font-black text-gray-700">#{index + 1}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h4 className="text-sm font-bold text-gray-800">{rec.title}</h4>
                                            {getPriorityStars(rec.priority)}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-bold ${config.color} flex items-center gap-1`}>
                                                <i className={`fas ${config.icon}`}></i>
                                                {config.label}
                                            </span>
                                            {getEffortBadge(rec.effort)}
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-sm text-gray-700 mb-3">{rec.description}</p>

                                {/* Expected Impact */}
                                <div className="bg-white rounded-lg p-3 mb-3">
                                    <p className="text-xs font-bold text-gray-600 mb-2">期待される効果</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <p className="text-xs text-gray-500">指標</p>
                                            <p className="text-sm font-bold text-gray-800">{rec.expectedImpact.metric}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">改善幅</p>
                                            <p className="text-sm font-bold text-green-600">{rec.expectedImpact.value}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">期間</p>
                                            <p className="text-sm font-bold text-gray-800">{rec.expectedImpact.timeframe}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Steps */}
                                {rec.steps && rec.steps.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs font-bold text-gray-600 mb-2">実行ステップ</p>
                                        <ol className="space-y-1">
                                            {rec.steps.map((step, idx) => (
                                                <li key={idx} className="text-xs text-gray-700 flex gap-2">
                                                    <span className="font-bold text-gray-400">{idx + 1}.</span>
                                                    <span>{step}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}

                                {/* Target Stores */}
                                {rec.targetStores && rec.targetStores.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-gray-600 mb-1">対象店舗</p>
                                        <div className="flex flex-wrap gap-1">
                                            {rec.targetStores.slice(0, 3).map((store, idx) => (
                                                <span key={idx} className="text-xs bg-white px-2 py-1 rounded-full text-gray-700 border border-gray-200">
                                                    {store}
                                                </span>
                                            ))}
                                            {rec.targetStores.length > 3 && (
                                                <span className="text-xs bg-white px-2 py-1 rounded-full text-gray-500 border border-gray-200">
                                                    +{rec.targetStores.length - 3}店舗
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default RecommendationEngine;
