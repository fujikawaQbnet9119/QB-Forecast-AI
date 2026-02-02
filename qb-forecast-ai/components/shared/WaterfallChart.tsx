import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface WaterfallDataPoint {
    name: string;
    value: number;
    start?: number;
    end?: number;
    isTotal?: boolean;
}

interface WaterfallChartProps {
    data: WaterfallDataPoint[];
    height?: number;
    positiveColor?: string;
    negativeColor?: string;
    totalColor?: string;
}

const WaterfallChart: React.FC<WaterfallChartProps> = ({
    data,
    height = 400,
    positiveColor = '#10B981',
    negativeColor = '#EF4444',
    totalColor = '#0F2540'
}) => {
    // Calculate cumulative values for waterfall effect
    const processedData: Array<WaterfallDataPoint & { displayValue: number }> = data.map((item, index) => {
        if (index === 0) {
            return {
                ...item,
                start: 0,
                end: item.value,
                displayValue: item.value
            };
        }

        const prevEnd = processedData[index - 1].end || 0;

        if (item.isTotal) {
            return {
                ...item,
                start: 0,
                end: item.value,
                displayValue: item.value
            };
        }

        return {
            ...item,
            start: prevEnd,
            end: prevEnd + item.value,
            displayValue: item.value
        };
    });

    const CustomBar = (props: any) => {
        const { x, y, width, height, payload } = props;
        const isPositive = payload.displayValue >= 0;
        const isTotal = payload.isTotal;

        const fill = isTotal ? totalColor : isPositive ? positiveColor : negativeColor;

        return (
            <g>
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={fill}
                    opacity={isTotal ? 1 : 0.8}
                    rx={4}
                />
                {/* Connector line to next bar */}
                {!isTotal && props.index < processedData.length - 1 && (
                    <line
                        x1={x + width}
                        y1={y + height / 2}
                        x2={x + width + 10}
                        y2={y + height / 2}
                        stroke="#CBD5E1"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                    />
                )}
            </g>
        );
    };

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748B' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                />
                <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: number) => [
                        `${value >= 0 ? '+' : ''}${value.toLocaleString()}`,
                        'Change'
                    ]}
                />
                <ReferenceLine y={0} stroke="#CBD5E1" strokeWidth={2} />
                <Bar
                    dataKey="displayValue"
                    shape={<CustomBar />}
                    radius={[4, 4, 4, 4]}
                />
            </BarChart>
        </ResponsiveContainer>
    );
};

export default WaterfallChart;
