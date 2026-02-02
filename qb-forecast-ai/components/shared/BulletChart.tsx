import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface BulletChartDataPoint {
    name: string;
    actual: number;
    target: number;
    budget?: number;
    ranges?: number[]; // [poor, satisfactory, good, excellent]
}

interface BulletChartProps {
    data: BulletChartDataPoint[];
    height?: number;
    orientation?: 'horizontal' | 'vertical';
}

const BulletChart: React.FC<BulletChartProps> = ({
    data,
    height = 400,
    orientation = 'horizontal'
}) => {
    const isHorizontal = orientation === 'horizontal';

    // Process data to add performance ranges
    const processedData = data.map(item => {
        const ranges = item.ranges || [
            item.target * 0.6,  // Poor
            item.target * 0.8,  // Satisfactory
            item.target * 1.0,  // Good
            item.target * 1.2   // Excellent
        ];

        return {
            ...item,
            poor: ranges[0],
            satisfactory: ranges[1] - ranges[0],
            good: ranges[2] - ranges[1],
            excellent: ranges[3] - ranges[2],
            actualValue: item.actual
        };
    });

    const CustomBar = (props: any) => {
        const { x, y, width, height, fill } = props;
        return (
            <rect
                x={x}
                y={y + height * 0.25}
                width={width}
                height={height * 0.5}
                fill={fill}
                rx={2}
            />
        );
    };

    const TargetMarker = (props: any) => {
        const { x, y, width, height, payload } = props;
        const markerX = x + (payload.target / payload.excellent) * width;

        return (
            <line
                x1={markerX}
                y1={y}
                x2={markerX}
                y2={y + height}
                stroke="#0F2540"
                strokeWidth={3}
            />
        );
    };

    if (isHorizontal) {
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart
                    data={processedData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                    <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748B' }}
                        width={90}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)'
                        }}
                    />

                    {/* Background ranges */}
                    <Bar dataKey="poor" stackId="range" fill="#FEE2E2" radius={[4, 0, 0, 4]} />
                    <Bar dataKey="satisfactory" stackId="range" fill="#FEF3C7" />
                    <Bar dataKey="good" stackId="range" fill="#D1FAE5" />
                    <Bar dataKey="excellent" stackId="range" fill="#DBEAFE" radius={[0, 4, 4, 0]} />

                    {/* Actual value bar */}
                    <Bar dataKey="actualValue" fill="#0F2540" barSize={16} radius={[0, 4, 4, 0]}>
                        {processedData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.actual >= entry.target ? '#10B981' : '#F59E0B'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={processedData} margin={{ top: 20, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748B' }}
                    angle={-45}
                    textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <Tooltip />

                <Bar dataKey="poor" stackId="range" fill="#FEE2E2" />
                <Bar dataKey="satisfactory" stackId="range" fill="#FEF3C7" />
                <Bar dataKey="good" stackId="range" fill="#D1FAE5" />
                <Bar dataKey="excellent" stackId="range" fill="#DBEAFE" />
                <Bar dataKey="actualValue" fill="#0F2540" barSize={20} />
            </BarChart>
        </ResponsiveContainer>
    );
};

export default BulletChart;
