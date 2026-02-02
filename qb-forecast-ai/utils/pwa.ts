// PWA utilities for service worker registration and management

// Register service worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });

            console.log('Service Worker registered:', registration);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available
                            showUpdateNotification();
                        }
                    });
                }
            });

            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            return null;
        }
    }
    return null;
};

// Unregister service worker
export const unregisterServiceWorker = async (): Promise<boolean> => {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        return registration.unregister();
    }
    return false;
};

// Show update notification
const showUpdateNotification = () => {
    if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
        window.location.reload();
    }
};

// Check if app is installed
export const isAppInstalled = (): boolean => {
    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
};

// Install prompt
let deferredPrompt: any = null;

export const setupInstallPrompt = () => {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        console.log('PWA installed');
        deferredPrompt = null;
        hideInstallButton();
    });
};

export const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) {
        return false;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response: ${outcome}`);
    deferredPrompt = null;

    return outcome === 'accepted';
};

// Show/hide install button (implement in your UI)
const showInstallButton = () => {
    const event = new CustomEvent('pwa-installable', { detail: true });
    window.dispatchEvent(event);
};

const hideInstallButton = () => {
    const event = new CustomEvent('pwa-installable', { detail: false });
    window.dispatchEvent(event);
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if ('Notification' in window) {
        return await Notification.requestPermission();
    }
    return 'denied';
};

// Send notification
export const sendNotification = (title: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            ...options
        });
    }
};

// Background sync
export const registerBackgroundSync = async (tag: string): Promise<void> => {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
    }
};

// Check online status
export const isOnline = (): boolean => {
    return navigator.onLine;
};

// Setup online/offline listeners
export const setupNetworkListeners = (
    onOnline: () => void,
    onOffline: () => void
) => {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
    };
};

// Cache management
export const clearCache = async (): Promise<void> => {
    if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
};

// Get cache size
export const getCacheSize = async (): Promise<number> => {
    if ('caches' in window) {
        const cacheNames = await caches.keys();
        let totalSize = 0;

        for (const name of cacheNames) {
            const cache = await caches.open(name);
            const requests = await cache.keys();

            for (const request of requests) {
                const response = await cache.match(request);
                if (response) {
                    const blob = await response.blob();
                    totalSize += blob.size;
                }
            }
        }

        return totalSize;
    }
    return 0;
};

// Format cache size
export const formatCacheSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
