
export type UserMode = 'manager' | 'executive';

export interface StoreData {
    name: string;
    region?: string; 
    prefecture?: string; 
    block?: string; 
    raw: number[];
    dates: string[];
    mask: boolean[];
    isActive: boolean;
    nudge: number;
    nudgeDecay: number; 
    seasonal: number[];
    components: { t: number[]; s: number[]; r: number[] };
    params: { L: number; k: number; t0: number; base: number; shift?: number; shift2?: number };
    fit: { params: any; mode: 'standard' | 'shift' | 'dual_shift' | 'recovery' | 'startup'; shockIdx: number; shockIdx2?: number; aic: number };
    stdDev: number;
    cv: { logistic: number };
    error?: boolean;
    msg?: string;
    
    // Budget Data (YYYY-MM -> Value)
    budget?: { [date: string]: number };

    stats?: {
        totalSales: number;     
        lastYearSales: number;  
        prevYearSales: number;  
        yoy: number;            
        cagr: number;           
        abcRank: 'A' | 'B' | 'C'; 
        skewness: number;       
        cv: number;             
        zChart: { monthly: number; cumulative: number; mat: number }[]; 
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
    period: string; 
    [cohortKey: string]: number | string | null; 
}

export interface BubblePoint {
    x: number; 
    y: number; 
    z: number; 
    name: string;
    cluster: number;
}
