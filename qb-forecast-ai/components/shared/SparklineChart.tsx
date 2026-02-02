import React from 'react';

interface SparklineChartProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    showDots?: boolean;
    smooth?: boolean;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
    data,
    width = 100,
    height = 30,
    color = '#3B82F6',
    showDots = false,
    smooth = true
}) => {
    if (!data || data.length === 0) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Generate path points
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return { x, y };
    });

    // Generate SVG path
    let path = '';
    if (smooth && data.length > 2) {
        // Smooth curve using quadratic bezier
        path = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const midX = (prev.x + curr.x) / 2;
            path += ` Q ${prev.x},${prev.y} ${midX},${curr.y}`;
            if (i < points.length - 1) {
                path += ` T ${curr.x},${curr.y}`;
            }
        }
    } else {
        // Simple line
        path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    }

    return (
        <svg width={width} height={height} className="sparkline">
            {/* Line */}
            <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Dots */}
            {showDots && points.map((point, index) => (
                <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r="2"
                    fill={color}
                />
            ))}

            {/* Last point highlight */}
            <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="3"
                fill={color}
                className="animate-pulse"
            />
        </svg>
    );
};

export default SparklineChart;
