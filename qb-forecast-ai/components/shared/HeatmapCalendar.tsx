import React from 'react';

interface HeatmapCell {
    date: string;
    value: number;
    label?: string;
}

interface HeatmapCalendarProps {
    data: HeatmapCell[];
    startDate?: Date;
    endDate?: Date;
    colorScale?: {
        low: string;
        medium: string;
        high: string;
        veryHigh: string;
    };
    cellSize?: number;
    gap?: number;
}

const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({
    data,
    startDate,
    endDate,
    colorScale = {
        low: '#DBEAFE',
        medium: '#93C5FD',
        high: '#3B82F6',
        veryHigh: '#1E40AF'
    },
    cellSize = 12,
    gap = 2
}) => {
    // Calculate date range
    const dates = data.map(d => new Date(d.date));
    const minDate = startDate || new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = endDate || new Date(Math.max(...dates.map(d => d.getTime())));

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

    // Generate calendar grid (7 rows for days of week, columns for weeks)
    const weeks: Date[][] = [];
    let currentDate = new Date(minDate);
    currentDate.setDate(currentDate.getDate() - currentDate.getDay()); // Start from Sunday

    while (currentDate <= maxDate) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) {
            week.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(week);
    }

    // Create data lookup map
    const dataMap = new Map(data.map(d => [d.date, d]));

    const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
    };

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return (
        <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
                {/* Month labels */}
                <div className="flex mb-2" style={{ marginLeft: '30px' }}>
                    {weeks.map((week, weekIdx) => {
                        const firstDay = week[0];
                        const showMonth = firstDay.getDate() <= 7 || weekIdx === 0;

                        return (
                            <div
                                key={weekIdx}
                                style={{ width: cellSize + gap }}
                                className="text-[9px] font-bold text-gray-400"
                            >
                                {showMonth && monthLabels[firstDay.getMonth()]}
                            </div>
                        );
                    })}
                </div>

                {/* Calendar grid */}
                <div className="flex">
                    {/* Day labels */}
                    <div className="flex flex-col mr-2">
                        {dayLabels.map((day, idx) => (
                            <div
                                key={day}
                                style={{ height: cellSize + gap }}
                                className="flex items-center text-[9px] font-bold text-gray-400 w-6"
                            >
                                {idx % 2 === 1 && day}
                            </div>
                        ))}
                    </div>

                    {/* Heatmap cells */}
                    <div className="flex gap-[2px]">
                        {weeks.map((week, weekIdx) => (
                            <div key={weekIdx} className="flex flex-col gap-[2px]">
                                {week.map((date, dayIdx) => {
                                    const dateStr = formatDate(date);
                                    const cellData = dataMap.get(dateStr);
                                    const value = cellData?.value || 0;
                                    const isInRange = date >= minDate && date <= maxDate;

                                    return (
                                        <div
                                            key={dayIdx}
                                            style={{
                                                width: cellSize,
                                                height: cellSize,
                                                backgroundColor: isInRange ? getColor(value) : '#F9FAFB'
                                            }}
                                            className="rounded-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer"
                                            title={`${dateStr}: ${value.toLocaleString()}`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
                    <span className="font-bold">Less</span>
                    <div className="flex gap-1">
                        <div style={{ width: 12, height: 12, backgroundColor: '#F1F5F9' }} className="rounded-sm" />
                        <div style={{ width: 12, height: 12, backgroundColor: colorScale.low }} className="rounded-sm" />
                        <div style={{ width: 12, height: 12, backgroundColor: colorScale.medium }} className="rounded-sm" />
                        <div style={{ width: 12, height: 12, backgroundColor: colorScale.high }} className="rounded-sm" />
                        <div style={{ width: 12, height: 12, backgroundColor: colorScale.veryHigh }} className="rounded-sm" />
                    </div>
                    <span className="font-bold">More</span>
                </div>
            </div>
        </div>
    );
};

export default HeatmapCalendar;
