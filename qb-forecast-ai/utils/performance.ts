// Performance optimization utilities

import { useCallback, useEffect, useRef } from 'react';

// Debounce function
export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

// Throttle function
export const throttle = <T extends (...args: any[]) => any>(
    func: T,
    limit: number
): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean = false;

    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
};

// Memoize expensive calculations
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
    const cache = new Map();

    return ((...args: Parameters<T>) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    }) as T;
};

// Lazy load images
export const lazyLoadImage = (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = reject;
        img.src = src;
    });
};

// Format large numbers efficiently
export const formatNumber = (num: number): string => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
};

// Format currency
export const formatCurrency = (amount: number, currency: string = 'JPY'): string => {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// Format percentage
export const formatPercentage = (value: number, decimals: number = 1): string => {
    return `${value.toFixed(decimals)}%`;
};

// Deep clone object (performance optimized)
export const deepClone = <T>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as any;
    if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;

    const clonedObj = {} as T;
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
};

// Batch updates to reduce re-renders
export const batchUpdates = (updates: (() => void)[]): void => {
    requestAnimationFrame(() => {
        updates.forEach(update => update());
    });
};

// Virtual scroll helper
export const calculateVisibleItems = (
    scrollTop: number,
    itemHeight: number,
    containerHeight: number,
    totalItems: number
): { startIndex: number; endIndex: number } => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
        Math.ceil((scrollTop + containerHeight) / itemHeight),
        totalItems
    );

    return { startIndex, endIndex };
};

// Intersection Observer hook helper
export const createIntersectionObserver = (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
): IntersectionObserver => {
    return new IntersectionObserver(callback, {
        threshold: 0.1,
        ...options
    });
};

// Local storage with expiry
export const setLocalStorageWithExpiry = (
    key: string,
    value: any,
    ttl: number // Time to live in milliseconds
): void => {
    const now = new Date();
    const item = {
        value: value,
        expiry: now.getTime() + ttl
    };
    localStorage.setItem(key, JSON.stringify(item));
};

export const getLocalStorageWithExpiry = (key: string): any | null => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;

    try {
        const item = JSON.parse(itemStr);
        const now = new Date();

        if (now.getTime() > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }

        return item.value;
    } catch {
        return null;
    }
};

// Chunk array for batch processing
export const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

// Request idle callback wrapper
export const runWhenIdle = (callback: () => void): void => {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(callback);
    } else {
        setTimeout(callback, 1);
    }
};

// Measure performance
export const measurePerformance = (name: string, fn: () => void): void => {
    const start = performance.now();
    fn();
    const end = performance.now();
    console.log(`${name} took ${(end - start).toFixed(2)}ms`);
};
