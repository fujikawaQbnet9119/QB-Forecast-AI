// QB Forecast AI - Service Worker
// Version: 1.0.0
// Advanced PWA implementation with intelligent caching strategies

const CACHE_VERSION = 'qb-forecast-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to precache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/app-icon.png'
];

// Cache size limits
const CACHE_LIMITS = {
    images: 50,
    dynamic: 100,
    api: 30
};

// Cache duration (in seconds)
const CACHE_DURATION = {
    images: 30 * 24 * 60 * 60, // 30 days
    dynamic: 7 * 24 * 60 * 60,  // 7 days
    api: 5 * 60                 // 5 minutes
};

// ============================================================================
// INSTALL EVENT - Precache static assets
// ============================================================================
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[Service Worker] Precaching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete');
                return self.skipWaiting(); // Activate immediately
            })
            .catch((error) => {
                console.error('[Service Worker] Installation failed:', error);
            })
    );
});

// ============================================================================
// ACTIVATE EVENT - Clean up old caches
// ============================================================================
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            // Remove old version caches
                            return cacheName.startsWith('qb-forecast-') &&
                                cacheName !== STATIC_CACHE &&
                                cacheName !== DYNAMIC_CACHE &&
                                cacheName !== IMAGE_CACHE &&
                                cacheName !== API_CACHE;
                        })
                        .map((cacheName) => {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activation complete');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// ============================================================================
// FETCH EVENT - Intelligent caching strategies
// ============================================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Strategy selection based on request type
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
    } else if (isImage(url)) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE, CACHE_LIMITS.images));
    } else if (isAPIRequest(url)) {
        event.respondWith(networkFirstWithTimeout(request, API_CACHE, 5000));
    } else if (isDataFile(url)) {
        event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    } else {
        event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    }
});

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * Cache First Strategy
 * Best for: Static assets, images
 */
async function cacheFirst(request, cacheName, limit = null) {
    try {
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);

        if (cached) {
            // Check if cache is still valid
            if (isCacheValid(cached, cacheName)) {
                return cached;
            }
        }

        // Fetch from network
        const response = await fetch(request);

        if (response && response.status === 200) {
            const responseToCache = response.clone();

            // Limit cache size if specified
            if (limit) {
                await limitCacheSize(cacheName, limit);
            }

            cache.put(request, responseToCache);
        }

        return response;
    } catch (error) {
        console.error('[Service Worker] Cache First failed:', error);

        // Try to return cached version even if expired
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        if (cached) return cached;

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/offline.html');
        }

        throw error;
    }
}

/**
 * Network First Strategy
 * Best for: HTML pages, dynamic content
 */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);

        if (response && response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.log('[Service Worker] Network failed, trying cache:', request.url);

        const cached = await caches.match(request);
        if (cached) return cached;

        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/offline.html');
        }

        throw error;
    }
}

/**
 * Network First with Timeout
 * Best for: API requests
 */
async function networkFirstWithTimeout(request, cacheName, timeout = 5000) {
    try {
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), timeout)
        );

        const response = await Promise.race([networkPromise, timeoutPromise]);

        if (response && response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.log('[Service Worker] Network timeout/failed, trying cache:', request.url);

        const cached = await caches.match(request);
        if (cached) return cached;

        throw error;
    }
}

/**
 * Stale While Revalidate Strategy
 * Best for: Data files, frequently updated content
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    // Fetch in background
    const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    });

    // Return cached immediately if available, otherwise wait for network
    return cached || fetchPromise;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isStaticAsset(url) {
    return url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.json') ||
        url.pathname.endsWith('.woff') ||
        url.pathname.endsWith('.woff2') ||
        url.pathname.endsWith('.ttf');
}

function isImage(url) {
    return url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.jpeg') ||
        url.pathname.endsWith('.gif') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.webp');
}

function isAPIRequest(url) {
    return url.pathname.includes('/api/') ||
        url.hostname.includes('generativelanguage.googleapis.com');
}

function isDataFile(url) {
    return url.pathname.endsWith('.csv') ||
        url.pathname.endsWith('.xlsx');
}

function isCacheValid(response, cacheName) {
    const dateHeader = response.headers.get('date');
    if (!dateHeader) return true;

    const cachedDate = new Date(dateHeader).getTime();
    const now = Date.now();
    const age = (now - cachedDate) / 1000; // in seconds

    let maxAge = CACHE_DURATION.dynamic;
    if (cacheName.includes('images')) maxAge = CACHE_DURATION.images;
    if (cacheName.includes('api')) maxAge = CACHE_DURATION.api;

    return age < maxAge;
}

async function limitCacheSize(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > limit) {
        // Delete oldest entries
        const toDelete = keys.length - limit;
        for (let i = 0; i < toDelete; i++) {
            await cache.delete(keys[i]);
        }
    }
}

// ============================================================================
// BACKGROUND SYNC
// ============================================================================
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync:', event.tag);

    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    try {
        // Implement data synchronization logic here
        console.log('[Service Worker] Syncing data...');
        // This would sync any offline changes when connection is restored
    } catch (error) {
        console.error('[Service Worker] Sync failed:', error);
    }
}

// ============================================================================
// PUSH NOTIFICATIONS (Optional - for future enhancement)
// ============================================================================
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'QB Forecast AI';
    const options = {
        body: data.body || 'New update available',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: [200, 100, 200],
        data: data.url || '/'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});

console.log('[Service Worker] Script loaded');
