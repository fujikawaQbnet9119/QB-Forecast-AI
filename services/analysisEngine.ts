
import { StoreData } from '../types';

// --- Domain Constants (Grounded in QB HOUSE Reality) ---
const MAX_K_THRESHOLD = 2.0;         // Allow higher physical limit for search, but penalize heavily
const ABSOLUTE_MAX_L = 10000;        // 10 Million JPY is the hard physical ceiling
const RARE_L_THRESHOLD = 5000;       // 5 Million JPY is extremely rare

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
    const base = p.base || 0;

    if (mode === 'startup') {
        return base + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }
    
    if (mode === 'shift') {
        const currentBase = t >= tShock ? (base + (p.shift || 0)) : base;
        return currentBase + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }

    if (mode === 'dual_shift') {
        const shock2 = p.shockIdx2 || -1;
        let currentBase = base;
        if (t >= tShock) currentBase += (p.shift || 0); 
        if (shock2 !== -1 && t >= shock2) currentBase += (p.shift2 || 0); 
        return currentBase + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
    }
    
    return base + (p.L / (1 + Math.exp(-p.k * (t - p.t0))));
};

/**
 * OBJECTIVE FUNCTION
 * Implements "Occam's Razor" via Regularization.
 */
function objectiveFunction(params: number[], data: number[], mask: boolean[], config: any) {
    let errSqSum = 0, n = 0;
    const mode = config.mode;
    const base = config.base || 0;
    
    let p: any;
    if (mode === 'dual_shift') {
        p = { base: base, L: params[0], k: params[1], t0: params[2], shift: params[3], shift2: params[4], shockIdx2: config.shockIdx2 };
    } else if (mode === 'shift') {
        p = { base: base, L: params[0], k: params[1], t0: params[2], shift: params[3] };
    } else if (mode === 'startup') {
        p = { base: base, L: params[0], k: config.fixedK, t0: params[1] };
    } else {
        p = { base: base, L: params[0], k: params[1], t0: params[2] };
    }
    
    // --- 1. Hard Constraints (Physical Limits) ---
    const minK = 0.0001; 
    
    if (mode !== 'startup' && (p.k < minK || p.k > MAX_K_THRESHOLD)) return 1e15;
    
    const totalPotential = base + p.L;
    if (totalPotential > ABSOLUTE_MAX_L) return 1e15; 
    
    // Rare Case Penalty (> 5M)
    let hardPenalty = 0;
    if (totalPotential > RARE_L_THRESHOLD) {
        hardPenalty += Math.pow(totalPotential - RARE_L_THRESHOLD, 2) * 0.1;
    }

    // --- 2. Calculate MSE ---
    for (let i = 0; i < data.length; i++) {
        if (!mask[i]) continue;
        const pred = logisticModel(i, p, mode, config.shockIdx);
        const res = data[i] - pred;
        errSqSum += res * res;
        n++;
    }
    
    const mse = n > 0 ? (errSqSum / n) : 1e15;

    // --- 3. Regularization (Occam's Razor) ---
    
    const variance = config.variance && config.variance > 100 ? config.variance : (config.maxVal * config.maxVal * 0.01); 
    const normalizedError = mse / variance;

    const currentMax = config.maxVal || 1000;
    const lRatio = totalPotential / currentMax;
    // Quadratic penalty starts after 1.2x
    const regL = lRatio > 1.2 ? 0.1 * Math.pow(lRatio - 1.2, 2) : 0;

    const regK = 0.05 * (p.k * p.k);

    let regShift = 0;
    if (p.shift) regShift += 0.1 * Math.pow(p.shift / currentMax, 2);
    if (p.shift2) regShift += 0.1 * Math.pow(p.shift2 / currentMax, 2);

    return (normalizedError + hardPenalty + regL + regK + regShift);
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
    
    for (let iter = 0; iter < 2500; iter++) {
        simplex.sort((a, b) => f(a, d, m, extra) - f(b, d, m, extra));
        let bestScore = f(simplex[0], d, m, extra);
        let worstScore = f(simplex[dim], d, m, extra);
        if (Math.abs(worstScore - bestScore) < 1e-6) break;

        let ctr = new Array(dim).fill(0);
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) ctr[j] += simplex[i][j];
        }
        for (let j = 0; j < dim; j++) ctr[j] /= dim;
        
        let xr = ctr.map((v, i) => v + 1.0 * (v - simplex[dim][i]));
        let fr = f(xr, d, m, extra);
        if (fr < bestScore) {
            let xe = ctr.map((v, i) => v + 2.0 * (xr[i] - ctr[i]));
            simplex[dim] = f(xe, d, m, extra) < fr ? xe : xr;
        } else if (fr < f(simplex[dim - 1], d, m, extra)) {
            simplex[dim] = xr;
        } else {
            let xc = ctr.map((v, i) => v + 0.5 * (simplex[dim][i] - ctr[i]));
            if (f(xc, d, m, extra) < worstScore) simplex[dim] = xc;
            else {
                for (let i = 1; i <= dim; i++) simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
            }
        }
    }
    
    const bestParams = simplex[0];
    let pureMSE = 0;
    let n = 0;
    
    const mode = extra.mode;
    const base = extra.base;
    const config = extra;
    let p: any;
    if (mode === 'dual_shift') p = { base, L: bestParams[0], k: bestParams[1], t0: bestParams[2], shift: bestParams[3], shift2: bestParams[4], shockIdx2: config.shockIdx2 };
    else if (mode === 'shift') p = { base, L: bestParams[0], k: bestParams[1], t0: bestParams[2], shift: bestParams[3] };
    else if (mode === 'startup') p = { base, L: bestParams[0], k: config.fixedK, t0: bestParams[1] };
    else p = { base, L: bestParams[0], k: bestParams[1], t0: bestParams[2] };

    for(let i=0; i<d.length; i++) {
        if(m[i]) {
            const res = d[i] - logisticModel(i, p, mode, config.shockIdx);
            pureMSE += res*res;
            n++;
        }
    }
    pureMSE = n > 0 ? pureMSE / n : 0;

    return { p: bestParams, sse: pureMSE * n, n };
}

const calculateAIC = (sse: number, n: number, k: number) => {
    if (sse <= 0 || n <= 0) return Infinity;
    return n * Math.log(sse / n) + 2 * k;
};

export interface GlobalStats {
    medianK: number; 
    standardGrowthL: number; 
    medianSeasonality: number[];
}

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
    const lastDateStr = dates[dates.length - 1]?.replace(/\//g, '-');
    const lastDate = new Date(lastDateStr);
    const isActive = !isNaN(lastDate.getTime()) && (globalMaxDate.getTime() - lastDate.getTime()) < (1000 * 60 * 60 * 24 * 60);

    const stats = calculateIQRStats(raw.filter(v => v > 0));
    const mask = raw.map(v => v >= stats.lower && v <= stats.upper && v > 0);

    const seqLength = raw.length;
    const rescueStart = Math.max(0, seqLength - 24);
    for (let i = rescueStart; i < seqLength; i++) {
        let sum = 0, count = 0;
        for (let j = 0; i - j >= 0 && j < 12; j++) {
            const idx = i - j;
            if (raw[idx] > 0) { sum += raw[idx]; count++; }
        }
        if (count >= 6) { 
            const ma = sum / count;
            const lowerBound = ma * 0.89;
            const upperBound = ma * 1.11;
            if (raw[i] >= lowerBound && raw[i] <= upperBound) mask[i] = true;
        }
    }

    const validCount = mask.filter(b => b).length;
    const validValues = raw.filter((_, i) => mask[i]);
    const maxVal = Math.max(...validValues);
    
    const meanVal = validValues.reduce((a,b)=>a+b,0) / Math.max(1, validValues.length);
    const variance = validValues.reduce((a,b)=>a+Math.pow(b-meanVal,2), 0) / Math.max(1, validValues.length);

    let base = 0;
    const firstValidPoints = validValues.slice(0, 3);
    if (firstValidPoints.length > 0) {
        base = firstValidPoints.reduce((a, b) => a + b, 0) / firstValidPoints.length;
    }
    
    let storeResult: StoreData;

    // --- STARTUP MODE (<13 months) ---
    if (validCount < 13) {
        if (isActive) {
            const fixedK = globalStats ? Math.min(globalStats.medianK, MAX_K_THRESHOLD) : 0.1;
            const fixedSea = (globalStats && globalStats.medianSeasonality.length === 12) 
                ? globalStats.medianSeasonality 
                : Array(12).fill(1.0);
            
            let calcBase = 0;
            if (raw.length >= 2) {
                const d2 = new Date(dates[1].replace(/\//g, '-'));
                const m2 = isNaN(d2.getTime()) ? 0 : d2.getMonth();
                const s2 = fixedSea[m2] || 1.0;
                calcBase = raw[1] / s2;
            } else if (raw.length === 1) {
                const d1 = new Date(dates[0].replace(/\//g, '-'));
                const m1 = isNaN(d1.getTime()) ? 0 : d1.getMonth();
                const s1 = fixedSea[m1] || 1.0;
                calcBase = raw[0] / s1;
            }
            if (calcBase <= 0) calcBase = base;

            const fixedGrowthL = globalStats ? globalStats.standardGrowthL : 3000;
            const fixedT0 = 12;

            const fitP = { base: calcBase, L: fixedGrowthL, k: fixedK, t0: fixedT0 };
            
            const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
            const residuals: number[] = [];
            
            const lastIdx = raw.length - 1;
            const lastSea = fixedSea[isNaN(new Date(dates[lastIdx].replace(/\//g, '-')).getTime()) ? 0 : new Date(dates[lastIdx].replace(/\//g, '-')).getMonth()] || 1.0;
            const lastActualDeSea = raw[lastIdx] / lastSea;
            const modelAtLast = logisticModel(lastIdx, fitP, 'startup', -1);
            
            const nudge = lastActualDeSea - modelAtLast;

            raw.forEach((v, i) => {
                const tr = logisticModel(i, fitP, 'startup', -1);
                const dO = new Date(dates[i].replace(/\//g, '-'));
                const s = fixedSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
                comp.t.push(tr); comp.s.push(s);
                const fittedVal = (tr + nudge) * s; 
                const realResidual = v - fittedVal;
                comp.r.push(realResidual); residuals.push(realResidual); 
            });

            const stdDev = Math.sqrt(residuals.reduce((s, r) => s + r*r, 0) / Math.max(1, residuals.length));

            storeResult = {
                name, block, region, prefecture, raw, dates, mask, isActive: true, 
                nudge, nudgeDecay: 0.8, seasonal: fixedSea, components: comp,
                params: { L: fitP.L, k: fitP.k, t0: fitP.t0, base: fitP.base },
                fit: { params: fitP, mode: 'startup', shockIdx: -1, aic: 0 },
                stdDev, cv: { logistic: stdDev }
            };
        } else {
            storeResult = { name, block, region, prefecture, raw, dates, mask: [], isActive: false, nudge: 0, nudgeDecay: 0, seasonal: [], components: {t:[],s:[],r:[]}, params: {L:0,k:0,t0:0,base:0}, fit: {params:[],mode:'standard',shockIdx:0, aic:0}, stdDev:0, cv:{logistic:0}, error: true, msg: "Insuffient Data" };
        }
        return calculateAdvancedStats(storeResult);
    }

    // --- GROWTH & MATURE MODES ---
    let covidIdx = -1, covidShiftGuess = 0;
    for (let i = 0; i < dates.length; i++) {
        if (dates[i]?.match(/2020[-/](03|04|05)/)) { 
            if (i >= 5 && i < raw.length - 6) {
                covidIdx = i;
                const pre = raw.slice(i-3, i).reduce((a,b)=>a+b,0)/3;
                const post = raw.slice(i+3, i+6).reduce((a,b)=>a+b,0)/3;
                covidShiftGuess = post - pre;
            }
            break; 
        }
    }

    let maxShockIdx = -1, maxShiftGuess = 0, maxShiftScore = 0;
    if (raw.length >= 24) {
        const margin = 6; 
        for (let i = margin; i < raw.length - margin; i++) {
            let preSum = 0, preCnt = 0, postSum = 0, postCnt = 0;
            for(let j=1; j<=6; j++) {
                if(mask[i-j]) { preSum += raw[i-j]; preCnt++; }
                if(mask[i+j-1]) { postSum += raw[i+j-1]; postCnt++; }
            }
            if (preCnt >= 3 && postCnt >= 3) {
                const preMean = preSum / preCnt, postMean = postSum / postCnt;
                const ratio = Math.abs(postMean - preMean) / Math.max(preMean, postMean, 1);
                if (ratio > 0.15 && ratio > maxShiftScore) {
                    maxShiftScore = ratio; maxShockIdx = i; maxShiftGuess = postMean - preMean;
                }
            }
        }
    }

    let singleShockIdx = maxShockIdx !== -1 ? maxShockIdx : covidIdx;
    let singleShiftGuess = maxShockIdx !== -1 ? maxShiftGuess : covidShiftGuess;
    
    const growthL = Math.max(3000, maxVal * 0.2); 
    const initK = 0.1; 
    const initT0 = raw.length / 2;

    // 1. Standard Model
    const resStd = nelderMead(objectiveFunction, [growthL, initK, initT0], raw, mask, { 
        mode: 'standard', shockIdx: -1, maxVal, base, variance
    });
    let bestRes = resStd, bestMode: any = 'standard', bestAIC = calculateAIC(resStd.sse, resStd.n, 3);
    let fitP: any = { base, L: resStd.p[0], k: resStd.p[1], t0: resStd.p[2] };
    let bestShockIdx = -1;

    // 2. Single Shift Model
    if (singleShockIdx !== -1 && singleShockIdx > 5 && (raw.length - singleShockIdx) > 5) {
        const resShift = nelderMead(objectiveFunction, [resStd.p[0], resStd.p[1], resStd.p[2], singleShiftGuess], raw, mask, { 
            mode: 'shift', shockIdx: singleShockIdx, maxVal, base, variance 
        });
        const aicShift = calculateAIC(resShift.sse, resShift.n, 4);
        
        if (aicShift < bestAIC - 2.5) { 
            bestAIC = aicShift; bestRes = resShift; bestMode = 'shift';
            fitP = { base, L: resShift.p[0], k: resShift.p[1], t0: resShift.p[2], shift: resShift.p[3] };
            bestShockIdx = singleShockIdx;
        }
    }

    // Finalize Components
    const seaBuckets: number[][] = Array.from({ length: 12 }, () => []);
    raw.forEach((v, i) => {
        if (!mask[i]) return;
        const tr = logisticModel(i, fitP, bestMode, bestShockIdx);
        if (tr > 1) {
            const dO = new Date(dates[i].replace(/\//g, '-'));
            seaBuckets[isNaN(dO.getTime()) ? 0 : dO.getMonth()].push(v / tr);
        }
    });
    const sea = seaBuckets.map(b => b.length === 0 ? 1.0 : b.sort((a,b)=>a-b)[Math.floor(b.length/2)]);
    const seaAvg = sea.reduce((a, b) => a + b, 0) / 12;
    const finalSea = sea.map(v => v / seaAvg);

    const comp = { t: [] as number[], s: [] as number[], r: [] as number[] };
    const residuals: number[] = [];
    raw.forEach((v, i) => {
        const tr = logisticModel(i, fitP, bestMode, bestShockIdx);
        const dO = new Date(dates[i].replace(/\//g, '-'));
        const s = finalSea[isNaN(dO.getTime()) ? 0 : dO.getMonth()];
        comp.t.push(tr); comp.s.push(s);
        const res = v - (tr * s); comp.r.push(res); residuals.push(res); 
    });

    // Calculate Nudge
    let nudge = 0, nudgeDecay = 1.0, resLen = residuals.length;
    if (resLen > 0) {
        if (resLen < 12) {
             nudge = residuals.slice(-3).reduce((a,b)=>a+b,0)/Math.min(resLen,3);
             nudgeDecay = 0.7;
        } else {
             const recent = residuals.slice(-12).sort((a,b)=>a-b);
             nudge = recent[Math.floor(recent.length/2)];
             nudgeDecay = 0.8;
        }
    }

    let effectiveBase = fitP.base + (bestMode === 'shift' ? (fitP.shift || 0) : 0);
    storeResult = {
        name, block, region, prefecture, raw, dates, mask, isActive, nudge, nudgeDecay,
        seasonal: finalSea, components: comp,
        params: { base: effectiveBase, L: fitP.L, k: fitP.k, t0: fitP.t0, shift: fitP.shift },
        fit: { params: fitP, mode: bestMode, shockIdx: bestShockIdx, aic: bestAIC },
        stdDev: Math.sqrt(residuals.reduce((s,r)=>s+r*r,0)/Math.max(1,resLen)),
        cv: { logistic: 0 }
    };
    return calculateAdvancedStats(storeResult);
}
