// Local storage utilities for user preferences and settings

const STORAGE_PREFIX = 'qb_dashboard_';

// Storage keys
export const STORAGE_KEYS = {
    THEME: `${STORAGE_PREFIX}theme`,
    FAVORITE_VIEWS: `${STORAGE_PREFIX}favorite_views`,
    DASHBOARD_LAYOUT: `${STORAGE_PREFIX}dashboard_layout`,
    USER_PREFERENCES: `${STORAGE_PREFIX}user_preferences`,
    RECENT_SEARCHES: `${STORAGE_PREFIX}recent_searches`,
    CHART_SETTINGS: `${STORAGE_PREFIX}chart_settings`
} as const;

// User preferences interface
export interface UserPreferences {
    defaultView?: string;
    chartType?: string;
    dateRange?: string;
    autoRefresh?: boolean;
    refreshInterval?: number;
    compactMode?: boolean;
    showAnimations?: boolean;
}

// Save to localStorage
export const saveToStorage = <T>(key: string, value: T): void => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
};

// Load from localStorage
export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return defaultValue;
    }
};

// Remove from localStorage
export const removeFromStorage = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }
};

// Clear all dashboard storage
export const clearAllStorage = (): void => {
    try {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (error) {
        console.error('Error clearing localStorage:', error);
    }
};

// Favorite views management
export const saveFavoriteViews = (views: string[]): void => {
    saveToStorage(STORAGE_KEYS.FAVORITE_VIEWS, views);
};

export const loadFavoriteViews = (): string[] => {
    return loadFromStorage<string[]>(STORAGE_KEYS.FAVORITE_VIEWS, []);
};

export const addFavoriteView = (view: string): void => {
    const favorites = loadFavoriteViews();
    if (!favorites.includes(view)) {
        saveFavoriteViews([...favorites, view]);
    }
};

export const removeFavoriteView = (view: string): void => {
    const favorites = loadFavoriteViews();
    saveFavoriteViews(favorites.filter(v => v !== view));
};

// User preferences management
export const saveUserPreferences = (preferences: UserPreferences): void => {
    saveToStorage(STORAGE_KEYS.USER_PREFERENCES, preferences);
};

export const loadUserPreferences = (): UserPreferences => {
    return loadFromStorage<UserPreferences>(STORAGE_KEYS.USER_PREFERENCES, {
        autoRefresh: false,
        refreshInterval: 60000,
        compactMode: false,
        showAnimations: true
    });
};

export const updateUserPreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
): void => {
    const preferences = loadUserPreferences();
    preferences[key] = value;
    saveUserPreferences(preferences);
};

// Recent searches management
export const saveRecentSearch = (search: string, maxItems: number = 10): void => {
    const recent = loadFromStorage<string[]>(STORAGE_KEYS.RECENT_SEARCHES, []);
    const updated = [search, ...recent.filter(s => s !== search)].slice(0, maxItems);
    saveToStorage(STORAGE_KEYS.RECENT_SEARCHES, updated);
};

export const loadRecentSearches = (): string[] => {
    return loadFromStorage<string[]>(STORAGE_KEYS.RECENT_SEARCHES, []);
};

export const clearRecentSearches = (): void => {
    removeFromStorage(STORAGE_KEYS.RECENT_SEARCHES);
};

// Dashboard layout management
export interface DashboardLayout {
    widgets: {
        id: string;
        position: { x: number; y: number };
        size: { width: number; height: number };
    }[];
}

export const saveDashboardLayout = (layout: DashboardLayout): void => {
    saveToStorage(STORAGE_KEYS.DASHBOARD_LAYOUT, layout);
};

export const loadDashboardLayout = (): DashboardLayout | null => {
    return loadFromStorage<DashboardLayout | null>(STORAGE_KEYS.DASHBOARD_LAYOUT, null);
};

// Chart settings management
export interface ChartSettings {
    showLegend?: boolean;
    showGrid?: boolean;
    animationDuration?: number;
    colorScheme?: string;
}

export const saveChartSettings = (settings: ChartSettings): void => {
    saveToStorage(STORAGE_KEYS.CHART_SETTINGS, settings);
};

export const loadChartSettings = (): ChartSettings => {
    return loadFromStorage<ChartSettings>(STORAGE_KEYS.CHART_SETTINGS, {
        showLegend: true,
        showGrid: true,
        animationDuration: 300,
        colorScheme: 'default'
    });
};
