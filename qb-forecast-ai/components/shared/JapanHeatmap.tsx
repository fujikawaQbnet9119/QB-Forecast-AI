import React from 'react';

interface Prefecture {
    name: string;
    code: string;
    value: number;
    coordinates?: [number, number]; // [lat, lng]
}

interface JapanHeatmapProps {
    data: Prefecture[];
    colorScale?: {
        low: string;
        medium: string;
        high: string;
        veryHigh: string;
    };
    width?: number;
    height?: number;
    onPrefectureClick?: (prefecture: Prefecture) => void;
}

const JapanHeatmap: React.FC<JapanHeatmapProps> = ({
    data,
    colorScale = {
        low: '#DBEAFE',
        medium: '#93C5FD',
        high: '#3B82F6',
        veryHigh: '#1E40AF'
    },
    width = 800,
    height = 600,
    onPrefectureClick
}) => {
    // Get value range for color scaling
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const getColor = (value: number) => {
        if (value === 0) return '#F1F5F9';

        const normalized = (value - minValue) / (maxValue - minValue);

        if (normalized < 0.25) return colorScale.low;
        if (normalized < 0.5) return colorScale.medium;
        if (normalized < 0.75) return colorScale.high;
        return colorScale.veryHigh;
    };

    // Create data lookup map
    const dataMap = new Map(data.map(d => [d.code, d]));

    // Simplified Japan prefecture paths (SVG paths for each prefecture)
    // This is a simplified version - in production, use actual GeoJSON data
    const prefecturePaths: Record<string, string> = {
        '01': 'M 650,50 L 700,60 L 710,100 L 680,110 L 650,90 Z', // Hokkaido (simplified)
        '13': 'M 580,320 L 600,320 L 600,340 L 580,340 Z', // Tokyo (simplified)
        '27': 'M 420,360 L 450,360 L 450,390 L 420,390 Z', // Osaka (simplified)
        // Add more prefectures as needed...
    };

    // Prefecture labels with approximate positions
    const prefectureLabels: Record<string, { x: number; y: number; name: string }> = {
        '01': { x: 680, y: 80, name: '北海道' },
        '13': { x: 590, y: 330, name: '東京' },
        '27': { x: 435, y: 375, name: '大阪' },
        // Add more labels...
    };

    return (
        <div className="relative bg-white rounded-2xl p-6 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">都道府県別パフォーマンス</h3>

            <svg
                width={width}
                height={height}
                viewBox="0 0 800 600"
                className="mx-auto"
            >
                {/* Background */}
                <rect width="800" height="600" fill="#F9FAFB" />

                {/* Prefecture paths */}
                {Object.entries(prefecturePaths).map(([code, path]) => {
                    const prefData = dataMap.get(code);
                    const value = prefData?.value || 0;
                    const color = getColor(value);

                    return (
                        <g key={code}>
                            <path
                                d={path}
                                fill={color}
                                stroke="#FFFFFF"
                                strokeWidth="2"
                                className="transition-all duration-200 hover:opacity-80 cursor-pointer"
                                onClick={() => prefData && onPrefectureClick?.(prefData)}
                            >
                                <title>{`${prefData?.name || code}: ${value.toLocaleString()}`}</title>
                            </path>
                        </g>
                    );
                })}

                {/* Labels */}
                {Object.entries(prefectureLabels).map(([code, label]) => {
                    const prefData = dataMap.get(code);
                    if (!prefData) return null;

                    return (
                        <text
                            key={`label-${code}`}
                            x={label.x}
                            y={label.y}
                            fontSize="10"
                            fontWeight="bold"
                            fill="#1F2937"
                            textAnchor="middle"
                            className="pointer-events-none"
                        >
                            {label.name}
                        </text>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-6">
                <span className="text-xs font-bold text-gray-500">低</span>
                <div className="flex gap-1">
                    <div style={{ width: 20, height: 20, backgroundColor: colorScale.low }} className="rounded" />
                    <div style={{ width: 20, height: 20, backgroundColor: colorScale.medium }} className="rounded" />
                    <div style={{ width: 20, height: 20, backgroundColor: colorScale.high }} className="rounded" />
                    <div style={{ width: 20, height: 20, backgroundColor: colorScale.veryHigh }} className="rounded" />
                </div>
                <span className="text-xs font-bold text-gray-500">高</span>
            </div>

            {/* Note about simplified map */}
            <p className="text-xs text-gray-400 text-center mt-4">
                ※ 簡易版マップ。本番環境ではGeoJSONデータを使用してください。
            </p>
        </div>
    );
};

export default JapanHeatmap;
