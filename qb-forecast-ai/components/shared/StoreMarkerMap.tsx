import React, { useState } from 'react';

interface Store {
    id: string;
    name: string;
    lat: number;
    lng: number;
    value: number;
    status?: 'active' | 'inactive' | 'new';
    region?: string;
}

interface StoreMarkerMapProps {
    stores: Store[];
    center?: [number, number]; // [lat, lng]
    zoom?: number;
    width?: number;
    height?: number;
    onStoreClick?: (store: Store) => void;
}

const StoreMarkerMap: React.FC<StoreMarkerMapProps> = ({
    stores,
    center = [35.6762, 139.6503], // Tokyo default
    zoom = 10,
    width = 800,
    height = 600,
    onStoreClick
}) => {
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [hoveredStore, setHoveredStore] = useState<Store | null>(null);

    // Simple projection (Mercator-like) - in production, use a proper map library
    const projectToPixels = (lat: number, lng: number): [number, number] => {
        const scale = zoom * 100;
        const x = ((lng - center[1]) * scale) + (width / 2);
        const y = ((center[0] - lat) * scale) + (height / 2);
        return [x, y];
    };

    // Get marker color based on status
    const getMarkerColor = (store: Store) => {
        if (store.status === 'new') return '#10B981'; // Green
        if (store.status === 'inactive') return '#9CA3AF'; // Gray
        return '#3B82F6'; // Blue
    };

    // Get marker size based on value
    const getMarkerSize = (value: number) => {
        const maxValue = Math.max(...stores.map(s => s.value));
        const minSize = 6;
        const maxSize = 20;
        const normalized = value / maxValue;
        return minSize + (normalized * (maxSize - minSize));
    };

    const handleStoreClick = (store: Store) => {
        setSelectedStore(store);
        onStoreClick?.(store);
    };

    return (
        <div className="relative bg-white rounded-2xl p-6 border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">店舗マップ</h3>

            <div className="relative" style={{ width, height }}>
                <svg
                    width={width}
                    height={height}
                    className="border border-gray-200 rounded-lg"
                >
                    {/* Background */}
                    <rect width={width} height={height} fill="#F0F4F8" />

                    {/* Grid lines */}
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width={width} height={height} fill="url(#grid)" />

                    {/* Store markers */}
                    {stores.map((store) => {
                        const [x, y] = projectToPixels(store.lat, store.lng);
                        const size = getMarkerSize(store.value);
                        const color = getMarkerColor(store);
                        const isSelected = selectedStore?.id === store.id;
                        const isHovered = hoveredStore?.id === store.id;

                        return (
                            <g key={store.id}>
                                {/* Marker circle */}
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={size}
                                    fill={color}
                                    stroke="#FFFFFF"
                                    strokeWidth={isSelected ? 3 : 2}
                                    opacity={isHovered || isSelected ? 1 : 0.8}
                                    className="cursor-pointer transition-all duration-200"
                                    onClick={() => handleStoreClick(store)}
                                    onMouseEnter={() => setHoveredStore(store)}
                                    onMouseLeave={() => setHoveredStore(null)}
                                >
                                    <title>{`${store.name}: ${store.value.toLocaleString()}`}</title>
                                </circle>

                                {/* Pulse animation for selected */}
                                {isSelected && (
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r={size + 5}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth="2"
                                        opacity="0.5"
                                        className="animate-ping"
                                    />
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Tooltip for hovered store */}
                {hoveredStore && (
                    <div
                        className="absolute bg-white rounded-lg shadow-lg p-3 border border-gray-200 pointer-events-none z-10"
                        style={{
                            left: projectToPixels(hoveredStore.lat, hoveredStore.lng)[0] + 20,
                            top: projectToPixels(hoveredStore.lat, hoveredStore.lng)[1] - 10,
                        }}
                    >
                        <p className="text-xs font-bold text-gray-800">{hoveredStore.name}</p>
                        <p className="text-xs text-gray-600">売上: ¥{hoveredStore.value.toLocaleString()}</p>
                        {hoveredStore.region && (
                            <p className="text-xs text-gray-500">{hoveredStore.region}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-xs text-gray-600">通常店舗</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs text-gray-600">新規店舗</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span className="text-xs text-gray-600">休止中</span>
                </div>
            </div>

            {/* Selected store info */}
            {selectedStore && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-900 mb-2">{selectedStore.name}</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-gray-600">売上:</span>
                            <span className="ml-2 font-bold text-gray-800">¥{selectedStore.value.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="text-gray-600">ステータス:</span>
                            <span className="ml-2 font-bold text-gray-800">
                                {selectedStore.status === 'new' ? '新規' : selectedStore.status === 'inactive' ? '休止中' : '営業中'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Note */}
            <p className="text-xs text-gray-400 text-center mt-4">
                ※ 簡易版マップ。本番環境ではLeaflet/Mapbox等を使用してください。
            </p>
        </div>
    );
};

export default StoreMarkerMap;
