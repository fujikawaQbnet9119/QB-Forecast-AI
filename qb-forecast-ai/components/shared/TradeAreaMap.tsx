import React from 'react';

interface TradeArea {
    storeId: string;
    storeName: string;
    center: [number, number]; // [lat, lng]
    radius: number; // in km
    value: number;
    color?: string;
}

interface TradeAreaMapProps {
    tradeAreas: TradeArea[];
    width?: number;
    height?: number;
    showOverlap?: boolean;
}

const TradeAreaMap: React.FC<TradeAreaMapProps> = ({
    tradeAreas,
    width = 800,
    height = 600,
    showOverlap = true
}) => {
    // Simple projection - in production, use proper map library
    const projectToPixels = (lat: number, lng: number, center: [number, number]): [number, number] => {
        const scale = 5000;
        const x = ((lng - center[1]) * scale) + (width / 2);
        const y = ((center[0] - lat) * scale) + (height / 2);
        return [x, y];
    };

    // Convert km to pixels (approximate)
    const kmToPixels = (km: number): number => {
        return km * 10; // Simplified conversion
    };

    // Calculate map center from all trade areas
    const mapCenter: [number, number] = [
        tradeAreas.reduce((sum, ta) => sum + ta.center[0], 0) / tradeAreas.length,
        tradeAreas.reduce((sum, ta) => sum + ta.center[1], 0) / tradeAreas.length
    ];

    // Get color based on value
    const getColor = (value: number, alpha: number = 0.3) => {
        const maxValue = Math.max(...tradeAreas.map(ta => ta.value));
        const normalized = value / maxValue;

        if (normalized > 0.75) return `rgba(59, 130, 246, ${alpha})`; // Blue
        if (normalized > 0.5) return `rgba(16, 185, 129, ${alpha})`; // Green
        if (normalized > 0.25) return `rgba(245, 158, 11, ${alpha})`; // Yellow
        return `rgba(239, 68, 68, ${alpha})`; // Red
    };

    return (
        <div className="relative bg-white rounded-2xl p-6 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">商圏分析マップ</h3>

            <svg
                width={width}
                height={height}
                className="border border-gray-200 rounded-lg"
            >
                {/* Background */}
                <rect width={width} height={height} fill="#F9FAFB" />

                {/* Grid */}
                <defs>
                    <pattern id="trade-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
                    </pattern>
                </defs>
                <rect width={width} height={height} fill="url(#trade-grid)" />

                {/* Trade area circles */}
                {tradeAreas.map((tradeArea, index) => {
                    const [x, y] = projectToPixels(tradeArea.center[0], tradeArea.center[1], mapCenter);
                    const radius = kmToPixels(tradeArea.radius);
                    const color = tradeArea.color || getColor(tradeArea.value, 0.2);

                    return (
                        <g key={tradeArea.storeId}>
                            {/* Trade area circle */}
                            <circle
                                cx={x}
                                cy={y}
                                r={radius}
                                fill={color}
                                stroke={color.replace(/[\d.]+\)$/g, '0.6)')}
                                strokeWidth="2"
                                strokeDasharray="5,5"
                                className="transition-opacity duration-200 hover:opacity-80"
                            >
                                <title>{`${tradeArea.storeName}: ${tradeArea.radius}km圏内`}</title>
                            </circle>

                            {/* Store marker */}
                            <circle
                                cx={x}
                                cy={y}
                                r="6"
                                fill="#0F2540"
                                stroke="#FFFFFF"
                                strokeWidth="2"
                            />

                            {/* Store label */}
                            <text
                                x={x}
                                y={y - radius - 10}
                                fontSize="11"
                                fontWeight="bold"
                                fill="#1F2937"
                                textAnchor="middle"
                                className="pointer-events-none"
                            >
                                {tradeArea.storeName}
                            </text>

                            {/* Radius label */}
                            <text
                                x={x}
                                y={y + radius + 15}
                                fontSize="9"
                                fill="#6B7280"
                                textAnchor="middle"
                                className="pointer-events-none"
                            >
                                {tradeArea.radius}km
                            </text>
                        </g>
                    );
                })}

                {/* Overlap indicators */}
                {showOverlap && tradeAreas.map((ta1, i) =>
                    tradeAreas.slice(i + 1).map((ta2, j) => {
                        const [x1, y1] = projectToPixels(ta1.center[0], ta1.center[1], mapCenter);
                        const [x2, y2] = projectToPixels(ta2.center[0], ta2.center[1], mapCenter);
                        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                        const r1 = kmToPixels(ta1.radius);
                        const r2 = kmToPixels(ta2.radius);

                        // Check if circles overlap
                        if (distance < r1 + r2) {
                            return (
                                <line
                                    key={`overlap-${i}-${j}`}
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke="#EF4444"
                                    strokeWidth="2"
                                    strokeDasharray="3,3"
                                    opacity="0.5"
                                >
                                    <title>商圏重複</title>
                                </line>
                            );
                        }
                        return null;
                    })
                )}
            </svg>

            {/* Legend */}
            <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">パフォーマンス</h4>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.3)' }}></div>
                            <span className="text-xs text-gray-600">優秀</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.3)' }}></div>
                            <span className="text-xs text-gray-600">良好</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.3)' }}></div>
                            <span className="text-xs text-gray-600">普通</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.3)' }}></div>
                            <span className="text-xs text-gray-600">要改善</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">記号</h4>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#0F2540]"></div>
                            <span className="text-xs text-gray-600">店舗位置</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 border-t-2 border-dashed border-red-500"></div>
                            <span className="text-xs text-gray-600">商圏重複</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Statistics */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-gray-600">総店舗数</p>
                        <p className="text-lg font-bold text-blue-900">{tradeAreas.length}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-600">平均商圏</p>
                        <p className="text-lg font-bold text-blue-900">
                            {(tradeAreas.reduce((sum, ta) => sum + ta.radius, 0) / tradeAreas.length).toFixed(1)}km
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-600">重複数</p>
                        <p className="text-lg font-bold text-blue-900">
                            {/* Calculate overlaps */}
                            {tradeAreas.reduce((count, ta1, i) => {
                                return count + tradeAreas.slice(i + 1).filter(ta2 => {
                                    const [x1, y1] = projectToPixels(ta1.center[0], ta1.center[1], mapCenter);
                                    const [x2, y2] = projectToPixels(ta2.center[0], ta2.center[1], mapCenter);
                                    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                                    const r1 = kmToPixels(ta1.radius);
                                    const r2 = kmToPixels(ta2.radius);
                                    return distance < r1 + r2;
                                }).length;
                            }, 0)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Note */}
            <p className="text-xs text-gray-400 text-center mt-4">
                ※ 簡易版マップ。本番環境ではLeaflet/Mapbox等を使用してください。
            </p>
        </div>
    );
};

export default TradeAreaMap;
