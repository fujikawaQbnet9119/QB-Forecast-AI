
import { StoreData } from '../types';

// --- Statistical Helper Functions ---

const calculateIQRStats = (data: number[]) => {
    const sorted = [...data].filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return { lower: -Infinity, upper: Infinity, median: 0 };
    
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const median = sorted[Math.floor(sorted.length * 0.5)];
    
    // Standard IQR limits (1.5x rule)
    let lower = q1 - 1.5 * iqr;
    let upper = q3 + 1.5 * iqr;

    return { lower, upper, median };
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
    const allData = store.raw; 
    
    if (allData.length === 0) return store;

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

    // 4. Z-Chart Data
    const zChart = [];
    let cum = 0;
    for (let i = 0; i < len; i++) {
        const mVal = store.raw[i];
        cum += mVal;
        let mat = 0;
        if (i >= 11) {
            for(let k=0; k<12; k++) mat += store.raw[i-k];
        }
        zChart.push({ monthly: mVal, cumulative: cum, mat });
    }

    return {
        ...store,
        stats: {
            totalSales: allData.reduce((a, b) => a + b, 0),
            lastYearSales: last12,
            prevYearSales: prev12,
            yoy,
            cagr,
            abcRank: 'C', 
            skewness,
            cv,
            zChart
        }
    };
};

export const calculateGlobalABC = (stores: StoreData[]) => {
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
    // Universal Base + Growth Model
    // y(t) = (Base + Shift) + (L_growth / (1 + exp(-k(t-t0))))
    const base = p.base || 0;

    if (mode === 'startup') {
        return base + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }
    
    if (mode === 'shift') {
        // Single Shift Mode
        const currentBase = t >= tShock ? (base + (p.shift || 0)) : base;
        return currentBase + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }

    if (mode === 'dual_shift') {
        // Dual Shift Mode: Support for COVID + One other structural change
        // tShock is primary (e.g., COVID), p.shockIdx2 is secondary (e.g., renovation/competitor)
        // Note: shockIdx2 is stored in params 'p' for this mode to avoid changing function signature everywhere
        const shock2 = p.shockIdx2 || -1;
        
        let currentBase = base;
        if (t >= tShock) currentBase += (p.shift || 0); // Primary shift
        if (shock2 !== -1 && t >= shock2) currentBase += (p.shift2 || 0); // Secondary shift
        
        return currentBase + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }
    
    // Standard Mode
    return base + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
};

function objectiveFunction(params: number[], data: number[], mask: boolean[], config: any) {
    let err = 0, n = 0;
    const mode = config.mode;
    const base = config.base || 0;
    
    let p: any;
    if (mode === 'dual_shift') {
        // Dual Shift: [L, k, t0, shift1, shift2]
        p = { 
            base: base, 
            L: params[0], 
            k: params[1], 
            t0: params[2], 
            shift: params[3], 
            shift2: params[4],
            shockIdx2: config.shockIdx2 
        };
    } else if (mode === 'shift') {
        // Shift Mode: [L, k, t0, shift]
        p = { base: base, L: params[0], k: params[1], t0: params[2], shift: params[3] };
    } else if (mode === 'startup') {
        p = { base: base, L: params[0], k: config.fixedK, t0: params[1] };
    } else {
        p = { base: base, L: params[0], k: params[1], t0: params[2] };
    }
    
    // Constraints
    if (mode !== 'startup') {
        // K Constraints
        const minK = config.minK || 0.0001;
        const maxK = config.maxK || 5.0;
        
        if (p.k < minK || p.k > maxK) return 1e15;
        
        // Cap growth component
        const maxVal = config.maxVal || 0;
        const maxGrowth = Math.max(0, maxVal - base);
        const limitL = maxGrowth > 0 ? maxGrowth * 10.0 : 1e9; 

        if (p.L < 0 || p.L > limitL) return 1e15;
    } else {
        if (p.L < 0) return 1e15; 
    }

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
    
    for (let iter = 0; iter < 2500; iter++) { // Increased iterations for complex models
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

// Updated signature to accept 'block', 'region', 'prefecture'
export function analyzeStore(
    name: string, 
    raw: number[], 
    dates: string[], 
    globalMaxDate: Date, 
    globalStats?: GlobalStats, 
    block?: string,
    region?: string,
    prefecture?: string
): StoreData {
    // 1. Determine Active Status
    const lastDateStr = dates[dates.length - 1]?.replace(/\//g, '-');
    const lastDate = new Date(lastDateStr);
    const isActive = !isNaN(lastDate.getTime()) && (globalMaxDate.getTime() - lastDate.getTime()) < (1000 * 60 * 60 * 24 * 60);

    // 2. Outlier Detection (Standard IQR)
    const stats = calculateIQRStats(raw.filter(v => v > 0));
    const mask = raw.map(v => v >= stats.lower && v <= stats.upper && v > 0);

    // --- MOVING AVERAGE RESCUE (Last 24 Months) ---
    const seqLength = raw.length;
    const rescueStart = Math.max(0, seqLength - 24);
    
    for (let i = rescueStart; i < seqLength; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < 12; j++) {
            const idx = i - j;
            if (idx >= 0 && raw[idx] > 0) {
                sum += raw[idx];
                count++;
            }
        }
        if (count >= 6) { 
            const ma = sum / count;
            const lowerBound = ma * (1 - 0.11);
            const upperBound = ma * (1 + 0.11);
            
            if (raw[i] >= lowerBound && raw[i] <= upperBound) {
                mask[i] = true;
            }
        }
    }

    const validCount = mask.filter(b => b).length;
    const maxVal = Math.max(...raw.filter((_, i) => mask[i]));

    // --- CALCULATE BASELINE (Incremental Model Support) ---
    // Use average of first 3 valid months as the "Base" level (Intercept)
    let base = 0;
    const firstValidPoints = raw.filter((_, i) => mask[i]).slice(0, 3);
    if (firstValidPoints.length > 0) {
        base = firstValidPoints.reduce((a, b) => a + b, 0) / firstValidPoints.length;
    }
    // Safety clamp: Base shouldn't exceed 80% of max to ensure L is positive/optimizable
    if (base > maxVal * 0.8) base = maxVal * 0.8; 
    
    let storeResult: StoreData;

    // =================================================================
    // STAGE 1: STARTUP (Data < 12) - Fixed K
    // =================================================================
    if (validCount < 12) {
        if (isActive) {
            if (globalStats && validCount >= 3) {
                // Startup Model: Use Global K, optimize L_growth and t0
                const fixedK = globalStats.medianK || 0.1;
                const initL_growth = Math.max((maxVal - base), base * 0.1); 
                const initT0 = 0; 
                
                const startParams = [initL_growth, initT0];
                const res = nelderMead(objectiveFunction, startParams, raw, mask, { mode: 'startup', fixedK, base, maxVal });
                
                const fitP = { base: base, L: res.p[0], k: fixedK, t0: res.p[1] };
                const finalSea = globalStats.medianSeasonality.length === 12 ? globalStats.medianSeasonality : Array(12).fill(1.0);
                
                const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
                const residuals: number[] = [];
                
                raw.forEach((v, i) => {
                    const tr = logisticModel(i, fitP, 'startup', -1);
                    const dO = new Date(dates[i].replace(/\//g, '-'));
                    const s = finalSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
                    comp.t.push(tr);
                    comp.s.push(s);
                    const realResidual = v - (tr * s);
                    comp.r.push(realResidual);
                    residuals.push(realResidual); 
                });

                let nudge = 0;
                const resLen = residuals.length;
                if (resLen > 0) nudge = residuals[resLen - 1];

                const nudgeDecay = 0.8; 
                const sseFinal = residuals.reduce((s, r) => s + r*r, 0);
                const stdDev = Math.sqrt(sseFinal / Math.max(1, residuals.length));

                storeResult = {
                    name, block, region, prefecture,
                    raw, dates, mask, isActive: true, 
                    nudge, nudgeDecay,
                    seasonal: finalSea,
                    components: comp,
                    params: { L: fitP.L, k: fitP.k, t0: fitP.t0, base: fitP.base }, // L here is Growth L
                    fit: { params: fitP, mode: 'startup', shockIdx: -1, aic: 0 },
                    stdDev,
                    cv: { logistic: stdDev }
                };

            } else {
                // Fallback
                const sea = Array(12).fill(1.0);
                storeResult = {
                    name, block, region, prefecture,
                    raw, dates, mask, isActive: true, 
                    nudge: 0, nudgeDecay: 0, seasonal: sea,
                    components: {t: raw.map(()=>base), s: sea, r: raw.map(v => v - base)},
                    params: { L: 0, k: 0.1, t0: 0, base: base },
                    fit: { params: {L: 0, k: 0.1, t0:0, base}, mode: 'startup', shockIdx: -1, aic: 0 },
                    stdDev: 0, cv: { logistic: 0 },
                    error: false 
                };
            }
        } else {
            storeResult = { name, block, region, prefecture, raw, dates, mask: [], isActive: false, nudge: 0, nudgeDecay: 0, seasonal: [], components: {t:[],s:[],r:[]}, params: {L:0,k:0,t0:0,base:0}, fit: {params:[],mode:'standard',shockIdx:0, aic:0}, stdDev:0, cv:{logistic:0}, error: true, msg: "Insuffient Data" };
        }
        return calculateAdvancedStats(storeResult);
    }

    // =================================================================
    // STAGE 2 & 3: GROWTH (12-36) & MATURE (36+)
    // =================================================================
    
    // --- 1. Detect COVID Shock (Fixed Search) ---
    // Specifically look for 2020-04 as the start of the COVID era
    let covidIdx = -1;
    let covidShiftGuess = 0;
    
    for (let i = 0; i < dates.length; i++) {
        if (dates[i]?.includes("2020-04") || dates[i]?.includes("2020/04")) { 
            // Valid if we have some data before and after
            if (i >= 5 && i < raw.length - 5) {
                covidIdx = i;
                const pre = raw.slice(i-3, i).reduce((a,b)=>a+b,0)/3;
                const post = raw.slice(i, i+3).reduce((a,b)=>a+b,0)/3;
                covidShiftGuess = post - pre;
            }
            break; 
        }
    }

    // --- 2. Detect General Maximum Shock ---
    let maxShockIdx = -1;
    let maxShiftGuess = 0;
    let maxShiftScore = 0;

    if (raw.length >= 24) {
        const margin = 6; 
        for (let i = margin; i < raw.length - margin; i++) {
            const w = 6;
            let preSum = 0, preCnt = 0;
            let postSum = 0, postCnt = 0;
            for(let j=1; j<=w; j++) {
                if(mask[i-j]) { preSum += raw[i-j]; preCnt++; }
                if(mask[i+j-1]) { postSum += raw[i+j-1]; postCnt++; }
            }
            if (preCnt >= 3 && postCnt >= 3) {
                const preMean = preSum / preCnt;
                const postMean = postSum / postCnt;
                const diff = Math.abs(postMean - preMean);
                const meanBase = Math.max(preMean, postMean, 1);
                const ratio = diff / meanBase;
                
                if (ratio > 0.15 && ratio > maxShiftScore) {
                    maxShiftScore = ratio;
                    maxShockIdx = i;
                    maxShiftGuess = postMean - preMean;
                }
            }
        }
    }

    // --- 3. Detect Secondary Shock (Distinct from COVID) ---
    let secondaryShockIdx = -1;
    let secondaryShiftGuess = 0;
    
    if (covidIdx !== -1 && raw.length >= 36) {
        // Look for another shock that is at least 12 months away from COVID
        let maxSecScore = 0;
        const margin = 6;
        for (let i = margin; i < raw.length - margin; i++) {
            // Skip COVID window (+/- 12 months)
            if (Math.abs(i - covidIdx) < 12) continue;

            const w = 6;
            let preSum = 0, preCnt = 0;
            let postSum = 0, postCnt = 0;
            for(let j=1; j<=w; j++) {
                if(mask[i-j]) { preSum += raw[i-j]; preCnt++; }
                if(mask[i+j-1]) { postSum += raw[i+j-1]; postCnt++; }
            }
            if (preCnt >= 3 && postCnt >= 3) {
                const preMean = preSum / preCnt;
                const postMean = postSum / postCnt;
                const diff = Math.abs(postMean - preMean);
                const meanBase = Math.max(preMean, postMean, 1);
                const ratio = diff / meanBase;
                
                if (ratio > 0.12 && ratio > maxSecScore) { // Slightly lower threshold for secondary
                    maxSecScore = ratio;
                    secondaryShockIdx = i;
                    secondaryShiftGuess = postMean - preMean;
                }
            }
        }
    }

    // Determine effective shock for Single Shift Mode (Prefer General Max)
    // If COVID was detected but max shock is elsewhere, max shock wins for "Single Shift"
    // If COVID is the max shock, it wins.
    let singleShockIdx = maxShockIdx !== -1 ? maxShockIdx : covidIdx;
    let singleShiftGuess = maxShockIdx !== -1 ? maxShiftGuess : covidShiftGuess;
    
    // Initial Guesses
    const growthL = Math.max((maxVal - base) * 1.2, maxVal * 0.2); 
    const initK = 0.1; 
    const initT0 = raw.length / 2;

    // --- CONSTRAINTS CONFIGURATION ---
    let minK = 0.0001;
    let maxK = 5.0;

    // Apply strict bounds for Growth Stage (12 <= N < 36) if global stats available
    if (validCount >= 12 && validCount < 36 && globalStats) {
        const centerK = globalStats.medianK;
        minK = centerK * 0.5;
        maxK = centerK * 1.5;
    }

    // --- OPTIMIZATION ROUNDS ---

    // 1. Standard Model (No Shift)
    const startParamsStd = [growthL, initK, initT0];
    const resStd = nelderMead(objectiveFunction, startParamsStd, raw, mask, { 
        mode: 'standard', shockIdx: -1, maxVal, base, minK, maxK 
    });
    const aicStd = calculateAIC(resStd.sse, resStd.n, 3);

    let bestRes = resStd;
    let bestMode: 'standard' | 'shift' | 'dual_shift' = 'standard';
    let bestAIC = aicStd;
    let fitP: any = { base: base, L: resStd.p[0], k: resStd.p[1], t0: resStd.p[2] };
    let bestShockIdx = -1;
    let bestShockIdx2 = -1;

    // 2. Single Shift Model
    const hasPreData = singleShockIdx > 5;
    const hasPostData = (raw.length - singleShockIdx) > 5;

    if (singleShockIdx !== -1 && hasPreData && hasPostData) {
        const startParamsShift = [resStd.p[0], resStd.p[1], resStd.p[2], singleShiftGuess];
        const resShift = nelderMead(objectiveFunction, startParamsShift, raw, mask, { 
            mode: 'shift', shockIdx: singleShockIdx, maxVal, base, minK, maxK 
        });
        const aicShift = calculateAIC(resShift.sse, resShift.n, 4);

        if (aicShift < bestAIC) {
            bestAIC = aicShift;
            bestRes = resShift;
            bestMode = 'shift';
            fitP = { base: base, L: resShift.p[0], k: resShift.p[1], t0: resShift.p[2], shift: resShift.p[3] };
            bestShockIdx = singleShockIdx;
        }
    }

    // 3. Dual Shift Model (COVID + Other)
    // Only attempt if we have COVID detected AND a distinct secondary shock
    if (covidIdx !== -1 && secondaryShockIdx !== -1) {
        const paramsDual = [
            resStd.p[0], // L
            resStd.p[1], // k
            resStd.p[2], // t0
            covidShiftGuess, // shift 1 (COVID)
            secondaryShiftGuess // shift 2 (Other)
        ];
        
        // Pass COVID as primary shockIdx, secondary as config param
        const resDual = nelderMead(objectiveFunction, paramsDual, raw, mask, { 
            mode: 'dual_shift', shockIdx: covidIdx, shockIdx2: secondaryShockIdx, maxVal, base, minK, maxK 
        });
        
        const aicDual = calculateAIC(resDual.sse, resDual.n, 5); // 5 params

        // Require decent improvement to justify complexity (AIC must drop by at least 2.0 to be worth adding param)
        // AIC formula penalizes params (2*k), so direct comparison is valid.
        if (aicDual < bestAIC) {
            bestAIC = aicDual;
            bestRes = resDual;
            bestMode = 'dual_shift';
            fitP = { 
                base: base, 
                L: resDual.p[0], 
                k: resDual.p[1], 
                t0: resDual.p[2], 
                shift: resDual.p[3], 
                shift2: resDual.p[4],
                shockIdx2: secondaryShockIdx
            };
            bestShockIdx = covidIdx;
            bestShockIdx2 = secondaryShockIdx;
        }
    }

    // Seasonality (Median Ratio)
    const seaBuckets: number[][] = Array.from({ length: 12 }, () => []);
    raw.forEach((v, i) => {
        if (!mask[i]) return;
        const tr = logisticModel(i, fitP, bestMode, bestShockIdx);
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

    // Decomposition & Residuals
    const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
    const residuals: number[] = [];

    raw.forEach((v, i) => {
        const tr = logisticModel(i, fitP, bestMode, bestShockIdx);
        const dO = new Date(dates[i].replace(/\//g, '-'));
        const s = finalSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
        const fitted = tr * s;
        comp.t.push(tr);
        comp.s.push(s);
        const res = v - fitted; 
        comp.r.push(res);
        residuals.push(res); 
    });

    // --- NUDGE & DECAY REVISION ---
    let nudge = 0;
    let nudgeDecay = 0;
    const resLen = residuals.length;
    
    if (resLen > 0) {
        if (resLen < 6) {
             nudge = residuals[resLen - 1];
             const ac = calculateAutocorrelation(residuals.slice(-12));
             nudgeDecay = Math.max(0, Math.min(0.9, ac));
        } else if (resLen < 12) {
             const last3 = residuals.slice(-3);
             nudge = last3.reduce((a, b) => a + b, 0) / last3.length;
             const ac = calculateAutocorrelation(residuals.slice(-12));
             nudgeDecay = Math.max(0, Math.min(0.9, ac));
        } else {
             const recentResiduals: number[] = [];
             for(let i = 1; i <= 12; i++) {
                 const idx = resLen - i;
                 if (idx >= 0 && raw[idx] > 0) {
                     recentResiduals.push(residuals[idx]);
                 }
             }

             if (recentResiduals.length > 0) {
                 recentResiduals.sort((a, b) => a - b);
                 const n = recentResiduals.length;
                 const trimCount = Math.floor(n * 0.2); 
                 
                 if (n > 2 && trimCount > 0) {
                     const trimmed = recentResiduals.slice(trimCount, n - trimCount);
                     nudge = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
                 } else {
                     nudge = recentResiduals.reduce((a, b) => a + b, 0) / n;
                 }
             }
             nudgeDecay = 1.0; 
        }
    }

    const sseFinal = residuals.reduce((s, r) => s + r*r, 0);
    const stdDev = Math.sqrt(sseFinal / Math.max(1, residuals.length));

    // Calculate effective base for return (Base + accumulated shifts)
    let effectiveBase = fitP.base;
    if (bestMode === 'shift') {
        effectiveBase += fitP.shift;
    } else if (bestMode === 'dual_shift') {
        effectiveBase += (fitP.shift || 0) + (fitP.shift2 || 0);
    }

    storeResult = {
        name, block, region, prefecture,
        raw, dates, mask, isActive, 
        nudge, 
        nudgeDecay,
        seasonal: finalSea, 
        components: comp,
        params: { 
            base: effectiveBase,
            L: fitP.L, 
            k: fitP.k, 
            t0: fitP.t0,
            shift: fitP.shift,
            shift2: fitP.shift2
        },
        fit: { params: fitP, mode: bestMode, shockIdx: bestShockIdx, shockIdx2: bestShockIdx2, aic: bestAIC },
        stdDev,
        cv: { logistic: stdDev }
    };

    return calculateAdvancedStats(storeResult);
}
