import React from 'react';
import TrendIndicator from './TrendIndicator';

interface RankingItem {
    name: string;
    value: number;
    change?: number;
    subtitle?: string;
}

interface RankingCardProps {
    title: string;
    items: RankingItem[];
    type?: 'top' | 'bottom';
    valueFormatter?: (value: number) => string;
    icon?: string;
    maxItems?: number;
}

const RankingCard: React.FC<RankingCardProps> = ({
    title,
    items,
    type = 'top',
    valueFormatter = (v) => v.toLocaleString(),
    icon = 'fa-trophy',
    maxItems = 5
}) => {
    const displayItems = items.slice(0, maxItems);
    const isTop = type === 'top';

    // Medal colors for top 3
    const medalColors = ['text-yellow-500', 'text-gray-400', 'text-orange-600'];

    return (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                <div className={`w-10 h-10 ${isTop ? 'bg-yellow-50' : 'bg-red-50'} rounded-xl flex items-center justify-center`}>
                    <i className={`fas ${icon} ${isTop ? 'text-yellow-500' : 'text-red-500'} text-lg`}></i>
                </div>
                <h3 className="text-lg font-black text-gray-800">{title}</h3>
            </div>

            {/* Ranking List */}
            <div className="space-y-3">
                {displayItems.map((item, index) => {
                    const rank = index + 1;
                    const showMedal = isTop && rank <= 3;

                    return (
                        <div
                            key={index}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                        >
                            {/* Rank */}
                            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                {showMedal ? (
                                    <i className={`fas fa-medal text-xl ${medalColors[index]}`}></i>
                                ) : (
                                    <span className="text-sm font-black text-gray-400">#{rank}</span>
                                )}
                            </div>

                            {/* Store Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-800 truncate">{item.name}</p>
                                {item.subtitle && (
                                    <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                                )}
                            </div>

                            {/* Value & Trend */}
                            <div className="text-right flex-shrink-0">
                                <p className="font-black text-sm text-gray-800">
                                    {valueFormatter(item.value)}
                                </p>
                                {item.change !== undefined && (
                                    <TrendIndicator value={item.change} size="sm" />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Show More */}
            {items.length > maxItems && (
                <div className="mt-4 pt-3 border-t border-gray-100 text-center">
                    <button className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors">
                        さらに{items.length - maxItems}件を表示
                    </button>
                </div>
            )}
        </div>
    );
};

export default RankingCard;
