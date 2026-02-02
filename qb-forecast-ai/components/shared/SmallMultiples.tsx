import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SmallMultipleData {
    name: string;
    data: Array<{ x: string | number; y: number }>;
    color?: string;
    highlight?: boolean;
}

interface SmallMultiplesProps {
    data: SmallMultipleData[];
    columns?: number;
    cellHeight?: number;
    showAxes?: boolean;
}

const SmallMultiples: React.FC<SmallMultiplesProps> = ({
    data,
    columns = 4,
    cellHeight = 120,
    showAxes = false
}) => {
    // Calculate global Y-axis range for consistent scaling
    const allValues = data.flatMap(d => d.data.map(point => point.y));
    const globalMin = Math.min(...allValues);
    const globalMax = Math.max(...allValues);
    const yDomain = [globalMin * 0.9, globalMax * 1.1];

    return (
        <div
            className="grid gap-4"
            style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
            }}
        >
            {data.map((series, index) => (
                <div
                    key={index}
                    className={`bg-white rounded-lg p-3 border transition-all ${series.highlight
                            ? 'border-blue-400 shadow-md ring-2 ring-blue-100'
                            : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                        }`}
                >
                    {/* Title */}
                    <div className="mb-2">
                        <h4 className={`text-xs font-bold truncate ${series.highlight ? 'text-blue-600' : 'text-gray-700'
                            }`}>
                            {series.name}
                        </h4>
                        {series.data.length > 0 && (
                            <p className="text-[10px] text-gray-400">
                                Latest: {series.data[series.data.length - 1].y.toLocaleString()}
                            </p>
                        )}
                    </div>

                    {/* Chart */}
                    <ResponsiveContainer width="100%" height={cellHeight}>
                        <LineChart data={series.data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            {showAxes && (
                                <>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis
                                        dataKey="x"
                                        tick={{ fontSize: 8, fill: '#94A3B8' }}
                                        hide={!showAxes}
                                    />
                                    <YAxis
                                        domain={yDomain}
                                        tick={{ fontSize: 8, fill: '#94A3B8' }}
                                        hide={!showAxes}
                                    />
                                </>
                            )}
                            <Tooltip
                                contentStyle={{
                                    fontSize: '10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="y"
                                stroke={series.color || '#3B82F6'}
                                strokeWidth={series.highlight ? 2.5 : 1.5}
                                dot={false}
                                animationDuration={300}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ))}
        </div>
    );
};

export default SmallMultiples;
