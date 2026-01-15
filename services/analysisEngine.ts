
import { StoreData } from '../types';

// --- Statistical Helper Functions ---

const calculateIQRStats = (data: number[]) => {
    const sorted = [...data].filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return { lower: -Infinity, upper: Infinity, median: 0 };
    
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const median = sorted[Math.floor(sorted.length * 0.5)];
    
    return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, median };
};

const calculateAutocorrelation = (data: number[]) => {
    if (data.length < 2) return 0;
    const n = data.length;
    const mean = data.reduce((s, x) => s + x, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n - 1; i++) {
        num += (data[i] - mean) * (data[i+1] - mean);
    }
    for (let i = 0; i < n; i++) {
        den += (data[i] - mean) ** 2;
    }
    return den === 0 ? 0 : num / den;
};

export const calculatePearsonCorrelation = (x: number[], y: number[]) => {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    
    const x_ = x.slice(0, n);
    const y_ = y.slice(0, n);
    
    const sumX = x_.reduce((a, b) => a + b, 0);
    const sumY = y_.reduce((a, b) => a + b, 0);
    
    const sumX2 = x_.reduce((a, b) => a + b * b, 0);
    const sumY2 = y_.reduce((a, b) => a + b * b, 0);
    
    const sumXY = x_.reduce((a, b, i) => a + b * y_[i], 0);
    
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
};

// --- New Advanced Stats Helpers ---

export const calculateAdvancedStats = (store: StoreData): StoreData => {
    const validData = store.raw.filter((_, i) => store.mask[i]);
    if (validData.length === 0) return store;

    // 1. Basic Sums for ABC / YoY
    const len = store.raw.length;
    const last12 = store.raw.slice(-12).reduce((a, b) => a + b, 0);
    const prev12 = len >= 24 ? store.raw.slice(-24, -12).reduce((a, b) => a + b, 0) : 0;
    const yoy = prev12 > 0 ? (last12 - prev12) / prev12 : 0;

    // 2. CAGR (3 Year)
    let cagr = 0;
    if (len >= 36) {
        const endVal = store.raw.slice(-12).reduce((a, b) => a + b, 0);
        const startVal = store.raw.slice(-36, -24).reduce((a, b) => a + b, 0);
        if (startVal > 0 && endVal > 0) {
            cagr = Math.pow(endVal / startVal, 1/3) - 1;
        }
    }

    // 3. CV (Coefficient of Variation) & Skewness
    const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
    const variance = validData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validData.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 0;
    
    const skewness = validData.reduce((a, b) => a + Math.pow((b - mean) / std, 3), 0) / validData.length;

    // 4. Z-Chart Data (Monthly, Cumulative, Moving Annual Total)
    const zChart = [];
    let cum = 0;
    // Calculate for FULL history to ensure alignment with dates in views
    for (let i = 0; i < len; i++) {
        const mVal = store.raw[i];
        cum += mVal;
        
        // MAT: Sum of last 12 months at this point
        let mat = 0;
        if (i >= 11) {
            for(let k=0; k<12; k++) mat += store.raw[i-k];
        }
        
        zChart.push({ monthly: mVal, cumulative: cum, mat });
    }

    return {
        ...store,
        stats: {
            totalSales: validData.reduce((a, b) => a + b, 0),
            lastYearSales: last12,
            prevYearSales: prev12,
            yoy,
            cagr,
            abcRank: 'C', // Placeholder, calculated globally later
            skewness,
            cv,
            zChart
        }
    };
};

export const calculateGlobalABC = (stores: StoreData[]) => {
    // Sort by Last Year Sales descending
    const sorted = [...stores].sort((a, b) => (b.stats?.lastYearSales || 0) - (a.stats?.lastYearSales || 0));
    const totalSales = sorted.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
    
    let currentSum = 0;
    sorted.forEach(s => {
        if (!s.stats) return;
        currentSum += s.stats.lastYearSales;
        const ratio = currentSum / totalSales;
        if (ratio <= 0.70) s.stats.abcRank = 'A';
        else if (ratio <= 0.90) s.stats.abcRank = 'B';
        else s.stats.abcRank = 'C';
    });
};

// --- Model Logic ---

export const logisticModel = (t: number, p: any, mode: string, tShock: number): number => {
    // Startup mode now uses the standard logistic formula but with constrained k
    if ((mode === 'shift' || mode === 'recovery') && t >= tShock) {
        return p.L_post / (1 + Math.exp(-p.k * (t - p.t0)));
    }
    if (mode === 'shift' || mode === 'recovery') {
        return p.L_pre / (1 + Math.exp(-p.k * (t - p.t0)));
    }
    return p.L / (1 + Math.exp(-p.k * (t - p.t0)));
};

function objectiveFunction(params: number[], data: number[], mask: boolean[], config: any) {
    let err = 0, n = 0;
    const mode = config.mode;
    
    let p;
    if (mode === 'shift' || mode === 'recovery') {
        p = { L_pre: params[0], L_post: params[1], k: params[2], t0: params[3] };
    } else if (mode === 'startup') {
        // Constrained Optimization: k is fixed to global median
        p = { L: params[0], k: config.fixedK, t0: params[1] };
    } else {
        p = { L: params[0], k: params[1], t0: params[2] };
    }
    
    // Constraints
    if (mode !== 'startup') {
        if (p.k < 0.001 || p.k > 5.0) return 1e15; 
    }
    if (mode !== 'standard' && mode !== 'startup' && (p.L_pre < 0 || p.L_post < 0)) return 1e15;
    if ((mode === 'standard' || mode === 'startup') && p.L < 0) return 1e15;

    for (let i = 0; i < data.length; i++) {
        if (!mask[i]) continue;
        const pred = logisticModel(i, p, mode, config.shockIdx);
        const res = data[i] - pred;
        err += res * res;
        n++;
    }
    
    return n > 0 ? err / n : 1e15;
}

function nelderMead(f: any, x0: number[], d: number[], m: boolean[], extra: any) {
    let dim = x0.length;
    let simplex = [x0];
    const step = 0.05; 
    
    for (let i = 0; i < dim; i++) {
        let x = [...x0];
        x[i] = x[i] === 0 ? 0.001 : x[i] * (1 + step);
        simplex.push(x);
    }
    
    for (let iter = 0; iter < 2000; iter++) { 
        simplex.sort((a, b) => f(a, d, m, extra) - f(b, d, m, extra));
        
        let bestScore = f(simplex[0], d, m, extra);
        let worstScore = f(simplex[dim], d, m, extra);
        
        if (Math.abs(worstScore - bestScore) < 1e-5) break;

        let ctr = new Array(dim).fill(0);
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) ctr[j] += simplex[i][j];
        }
        for (let j = 0; j < dim; j++) ctr[j] /= dim;
        
        // Reflection
        let xr = ctr.map((v, i) => v + 1.0 * (v - simplex[dim][i]));
        let fr = f(xr, d, m, extra);
        
        if (fr < bestScore) {
            // Expansion
            let xe = ctr.map((v, i) => v + 2.0 * (xr[i] - ctr[i]));
            simplex[dim] = f(xe, d, m, extra) < fr ? xe : xr;
        } else if (fr < f(simplex[dim - 1], d, m, extra)) {
            simplex[dim] = xr;
        } else {
            // Contraction
            let xc = ctr.map((v, i) => v + 0.5 * (simplex[dim][i] - ctr[i]));
            if (f(xc, d, m, extra) < worstScore) simplex[dim] = xc;
            else {
                // Shrink
                for (let i = 1; i <= dim; i++) simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
            }
        }
    }
    
    const mse = f(simplex[0], d, m, extra);
    const n = d.filter((_, i) => m[i]).length;
    const sse = mse * n;
    
    return { p: simplex[0], sse, n };
}

const calculateAIC = (sse: number, n: number, k: number) => {
    if (sse <= 0 || n <= 0) return Infinity;
    return n * Math.log(sse / n) + 2 * k;
};

// Global Stats Interface
export interface GlobalStats {
    medianK: number;
    medianSeasonality: number[];
}

export function analyzeStore(name: string, raw: number[], dates: string[], globalMaxDate: Date, globalStats?: GlobalStats): StoreData {
    // 1. Determine Active Status
    const lastDateStr = dates[dates.length - 1]?.replace(/\//g, '-');
    const lastDate = new Date(lastDateStr);
    const isActive = !isNaN(lastDate.getTime()) && (globalMaxDate.getTime() - lastDate.getTime()) < (1000 * 60 * 60 * 24 * 60);

    // 2. Outlier Detection
    const stats = calculateIQRStats(raw.filter(v => v > 0));
    const mask = raw.map(v => v >= stats.lower && v <= stats.upper && v > 0);
    const validCount = mask.filter(b => b).length;
    const maxVal = Math.max(...raw.filter((_, i) => mask[i]));

    let storeResult: StoreData;

    // 3. Handle Insufficient Data (Startup Mode)
    if (validCount < 12) {
        if (isActive) {
            if (globalStats && validCount >= 3) {
                // --- STARTUP ANALYSIS WITH GLOBAL K ---
                const fixedK = globalStats.medianK || 0.1;
                const initL = maxVal * 1.2; // Assume some growth potential
                const initT0 = 0; // Assume start of curve
                
                // Optimize only L and t0 (2 params), with fixed K
                const startParams = [initL, initT0];
                const res = nelderMead(objectiveFunction, startParams, raw, mask, { mode: 'startup', fixedK });
                
                const fitP = { L: res.p[0], k: fixedK, t0: res.p[1] };
                
                // Use Global Seasonality if local data is too sparse to detect it
                const finalSea = globalStats.medianSeasonality.length === 12 ? globalStats.medianSeasonality : Array(12).fill(1.0);
                
                // Decomposition
                const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
                const residuals: number[] = [];
                raw.forEach((v, i) => {
                    const tr = logisticModel(i, fitP, 'startup', -1);
                    const dO = new Date(dates[i].replace(/\//g, '-'));
                    const s = finalSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
                    const fitted = tr * s;
                    comp.t.push(tr);
                    comp.s.push(s);
                    const r = mask[i] ? v - fitted : 0;
                    comp.r.push(r);
                    if(mask[i]) residuals.push(r);
                });

                // --- NUDGE CALCULATION (Startup Logic) ---
                // For young stores, we want to connect firmly to recent data.
                let nudge = 0;
                const resLen = residuals.length;
                if (resLen > 0) {
                     if (resLen < 6) {
                        // < 6 months: Use latest single point (Force connect)
                        nudge = residuals[resLen - 1];
                     } else {
                        // 6 <= len < 12: Average of last 3 months
                        const last3 = residuals.slice(-3);
                        nudge = last3.reduce((a, b) => a + b, 0) / last3.length;
                     }
                }

                const sseFinal = residuals.reduce((s, r) => s + r*r, 0);
                const stdDev = Math.sqrt(sseFinal / Math.max(1, residuals.length));

                storeResult = {
                    name, raw, dates, mask, isActive: true,
                    nudge: nudge, 
                    nudgeDecay: 1.0, // UPDATED: Parallel Shift (Launchpad Theory)
                                     // Initial scale differences are structural potential, so we maintain the gap (Decay 1.0).
                    seasonal: finalSea,
                    components: comp,
                    params: fitP,
                    fit: { params: fitP, mode: 'startup', shockIdx: -1, aic: 0 },
                    stdDev,
                    cv: { logistic: stdDev }
                };

            } else {
                // Fallback: Simple Average (if no global stats or very few points)
                const validVals = raw.filter((_, i) => mask[i]);
                const avg = validVals.length > 0 ? validVals.reduce((a,b)=>a+b,0)/validVals.length : 0;
                const sea = Array(12).fill(1.0);
                storeResult = {
                    name, raw, dates, mask, isActive: true, 
                    nudge: 0, nudgeDecay: 0, seasonal: sea,
                    components: {t: raw.map(()=>avg), s: sea, r: raw.map(v => v - avg)},
                    params: { L: avg, k: 0.1, t0: 0 },
                    fit: { params: {L: avg, k: 0.1, t0:0}, mode: 'startup', shockIdx: -1, aic: 0 },
                    stdDev: 0, cv: { logistic: 0 },
                    error: false 
                };
            }
        } else {
            storeResult = { name, raw, dates, mask: [], isActive: false, nudge: 0, nudgeDecay: 0, seasonal: [], components: {t:[],s:[],r:[]}, params: {L:0,k:0,t0:0}, fit: {params:[],mode:'standard',shockIdx:0, aic:0}, stdDev:0, cv:{logistic:0}, error: true, msg: "Insuffient Data" };
        }
        return calculateAdvancedStats(storeResult); // Calculate stats even for startups
    }

    // --- Full Logistic Analysis (Standard/Shift) for N >= 12 ---
    
    // Shock Detection
    let shockIdx = -1;
    for (let i = 0; i < dates.length; i++) {
        if (dates[i]?.includes("2020-04") || dates[i]?.includes("2020/04")) { shockIdx = i; break; }
    }
    
    const initL = maxVal; 
    const initK = 0.1; 
    const initT0 = raw.length / 2;

    // Model Selection via AIC
    const startParamsStd = [initL, initK, initT0];
    const resStd = nelderMead(objectiveFunction, startParamsStd, raw, mask, { mode: 'standard', shockIdx });
    const aicStd = calculateAIC(resStd.sse, resStd.n, 3);

    let bestRes = resStd;
    let bestMode: 'standard' | 'shift' | 'recovery' = 'standard';
    let bestAIC = aicStd;
    let fitP: any = { L: resStd.p[0], k: resStd.p[1], t0: resStd.p[2] };

    const hasPreData = shockIdx > 5;
    const hasPostData = (raw.length - shockIdx) > 5;

    if (shockIdx !== -1 && hasPreData && hasPostData) {
        const startParamsShift = [initL, initL, initK, initT0];
        const resShift = nelderMead(objectiveFunction, startParamsShift, raw, mask, { mode: 'shift', shockIdx });
        const aicShift = calculateAIC(resShift.sse, resShift.n, 4);

        if (aicShift < aicStd - 2) {
            bestAIC = aicShift;
            bestRes = resShift;
            if (resShift.p[1] > resShift.p[0] * 0.95 && resShift.p[1] < resShift.p[0] * 1.05) {
                 bestMode = 'shift';
            } else if (resShift.p[1] < resShift.p[0]) {
                 bestMode = 'shift';
            } else {
                 bestMode = 'recovery'; 
            }
            fitP = { L_pre: resShift.p[0], L_post: resShift.p[1], k: resShift.p[2], t0: resShift.p[3] };
        }
    }

    // Seasonality (Median Ratio)
    const seaBuckets: number[][] = Array.from({ length: 12 }, () => []);
    raw.forEach((v, i) => {
        if (!mask[i]) return;
        const tr = logisticModel(i, fitP, bestMode, shockIdx);
        if (tr > 1) {
            const ratio = v / tr;
            const dO = new Date(dates[i].replace(/\//g, '-'));
            const m = isNaN(dO.getTime()) ? 0 : dO.getMonth();
            seaBuckets[m].push(ratio);
        }
    });

    const sea = seaBuckets.map(bucket => {
        if (bucket.length === 0) return 1.0;
        bucket.sort((a, b) => a - b);
        return bucket[Math.floor(bucket.length / 2)];
    });
    
    const seaAvg = sea.reduce((a, b) => a + b, 0) / 12;
    const finalSea = sea.map(v => v / seaAvg);

    // Decomposition
    const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
    const residuals: number[] = [];

    raw.forEach((v, i) => {
        const tr = logisticModel(i, fitP, bestMode, shockIdx);
        const dO = new Date(dates[i].replace(/\//g, '-'));
        const s = finalSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
        const fitted = tr * s;
        comp.t.push(tr);
        comp.s.push(s);
        const res = mask[i] ? v - fitted : 0;
        comp.r.push(res);
        if (mask[i]) residuals.push(res);
    });

    // --- NUDGE & DECAY REVISION (Logic Restoration) ---
    // Instead of relying purely on autocorrelation for the magnitude of the nudge,
    // we use explicit averages based on data length, as requested.
    
    let nudge = 0;
    const resLen = residuals.length;
    
    if (resLen > 0) {
        if (resLen < 6) {
             // Should essentially not happen in this block (handled in startup), but for safety:
             // < 6 months: Force connect to latest
             nudge = residuals[resLen - 1];
        } else if (resLen < 12) {
             // 6 <= len < 12: Average of last 3 months
             const last3 = residuals.slice(-3);
             nudge = last3.reduce((a, b) => a + b, 0) / last3.length;
        } else {
             // >= 12 months: Trimmed Mean of last 6 months (exclude min and max)
             const last6 = residuals.slice(-6).sort((a, b) => a - b);
             // Remove index 0 (min) and index 5 (max), average the middle 4
             // If variance is 0, they are all equal, so just averaging is fine.
             if (last6.length >= 3) {
                 const trimmed = last6.slice(1, -1);
                 nudge = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
             } else {
                 nudge = last6.reduce((a, b) => a + b, 0) / last6.length;
             }
        }
    }

    // Determine Decay: We still use Autocorrelation for the *rate* of decay,
    // but the *magnitude* (nudge) is now fixed by the logic above.
    const ac = calculateAutocorrelation(residuals.slice(-12));
    const nudgeDecay = Math.max(0, Math.min(0.9, ac));

    const sseFinal = residuals.reduce((s, r) => s + r*r, 0);
    const stdDev = Math.sqrt(sseFinal / Math.max(1, residuals.length));

    storeResult = {
        name, raw, dates, mask, isActive, 
        nudge, 
        nudgeDecay,
        seasonal: finalSea, 
        components: comp,
        params: { 
            L: (bestMode === 'shift' || bestMode === 'recovery') ? fitP.L_post : fitP.L, 
            k: fitP.k, 
            t0: fitP.t0 
        },
        fit: { params: fitP, mode: bestMode, shockIdx, aic: bestAIC },
        stdDev,
        cv: { logistic: stdDev }
    };

    return calculateAdvancedStats(storeResult);
}
