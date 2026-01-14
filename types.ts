
export interface StoreData {
    name: string;
    raw: number[];
    dates: string[];
    mask: boolean[];
    isActive: boolean;
    nudge: number;
    nudgeDecay: number; // AR(1) autocorrelation coefficient
    seasonal: number[];
    components: { t: number[]; s: number[]; r: number[] };
    params: { L: number; k: number; t0: number };
    fit: { params: any; mode: 'standard' | 'shift' | 'recovery' | 'startup'; shockIdx: number; aic: number };
    stdDev: number;
    cv: { logistic: number };
    error?: boolean;
    msg?: string;
    
    // New Advanced Stats
    stats?: {
        totalSales: number;     // Total sales in data
        lastYearSales: number;  // Sum of last 12 months
        prevYearSales: number;  // Sum of 13-24 months ago
        yoy: number;            // Year over Year growth
        cagr: number;           // 3-year CAGR
        abcRank: 'A' | 'B' | 'C'; // Pareto analysis
        skewness: number;       // Distribution shape
        cv: number;             // Coefficient of Variation (Stability)
        zChart: { monthly: number; cumulative: number; mat: number }[]; // For Z-Chart
    };
}

export interface ChartDataPoint {
    date: string;
    actual: number | null;
    forecast: number | null;
    upper?: number | null;
    lower?: number | null;
    range?: [number, number] | null;
}

export interface VintageDataPoint {
    period: string; // "1ヶ月", "2ヶ月"...
    [cohortKey: string]: number | string | null; // "2015s組": 1200
}

export interface BubblePoint {
    x: number; // growth rate k
    y: number; // potential L
    z: number; // size
    name: string;
    cluster: number;
}
