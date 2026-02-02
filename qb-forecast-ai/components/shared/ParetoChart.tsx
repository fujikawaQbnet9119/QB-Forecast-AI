import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ParetoDataPoint {
    name: string;
    value: number;
}

interface ParetoChartProps {
    data: ParetoDataPoint[];
    height?: number;
    barColor?: string;
    lineColor?: string;
    threshold?: number; // Highlight items above this cumulative percentage
}

const ParetoChart: React.FC<ParetoChartProps> = ({
    data,
    height = 400,
    barColor = '#3B82F6',
    lineColor = '#EF4444',
    threshold = 80
}) => {
    // Sort data by value descending
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    // Calculate cumulative percentage
    const total = sortedData.reduce((sum, item) => sum + item.value, 0);
    let cumulative = 0;

    const processedData = sortedData.map((item, index) => {
        cumulative += item.value;
        const cumulativePercentage = (cumulative / total) * 100;
        const isAboveThreshold = cumulativePercentage <= threshold;

        return {
            ...item,
            percentage: (item.value / total) * 100,
            cumulative: cumulativePercentage,
            isAboveThreshold,
            rank: index + 1
        };
    });

    // Find the 80/20 point
    const eightyTwentyIndex = processedData.findIndex(d => d.cumulative > threshold);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
                data={processedData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748B' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                />
                <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Value', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fontSize: 10 }}
                />
                <Tooltip
                    contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: number, name: string) => {
                        if (name === 'cumulative') return [`${value.toFixed(1)}%`, 'Cumulative'];
                        return [value.toLocaleString(), 'Value'];
                    }}
                />

                {/* Bars */}
                <Bar
                    yAxisId="left"
                    dataKey="value"
                    radius={[4, 4, 0, 0]}
                    barSize={30}
                >
                    {processedData.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.isAboveThreshold ? barColor : '#CBD5E1'}
                            opacity={entry.isAboveThreshold ? 1 : 0.5}
                        />
                    ))}
                </Bar>

                {/* Cumulative line */}
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke={lineColor}
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#fff', strokeWidth: 2 }}
                />

                {/* 80% reference line */}
                {eightyTwentyIndex > 0 && (
                    <text
                        x="50%"
                        y={15}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight="bold"
                        fill="#64748B"
                    >
                        {`Top ${eightyTwentyIndex} items = ${threshold}% of total`}
                    </text>
                )}
            </ComposedChart>
        </ResponsiveContainer>
    );
};

export default ParetoChart;
