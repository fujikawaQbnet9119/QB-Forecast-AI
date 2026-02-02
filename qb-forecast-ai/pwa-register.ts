// PWA Registration and Lifecycle Management
// Handles Service Worker registration, updates, and install prompts

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PWAManager {
    private deferredPrompt: BeforeInstallPromptEvent | null = null;
    private registration: ServiceWorkerRegistration | null = null;

    constructor() {
        this.init();
    }

    private async init() {
        if ('serviceWorker' in navigator) {
            await this.registerServiceWorker();
            this.setupInstallPrompt();
            this.setupUpdateCheck();
        }
    }

    /**
     * Register Service Worker
     */
    private async registerServiceWorker() {
        try {
            this.registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });

            console.log('[PWA] Service Worker registered:', this.registration.scope);

            // Check for updates on page load
            this.registration.update();

            // Listen for updates
            this.registration.addEventListener('updatefound', () => {
                const newWorker = this.registration!.installing;

                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version available
                            this.notifyUpdate();
                        }
                    });
                }
            });

            // Check for updates every hour
            setInterval(() => {
                this.registration?.update();
            }, 60 * 60 * 1000);

        } catch (error) {
            console.error('[PWA] Service Worker registration failed:', error);
        }
    }

    /**
     * Setup install prompt handling
     */
    private setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e: Event) => {
            e.preventDefault();
            this.deferredPrompt = e as BeforeInstallPromptEvent;

            // Show custom install button
            this.showInstallPrompt();
        });

        // Track successful installation
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed successfully');
            this.deferredPrompt = null;
            this.hideInstallPrompt();

            // Track installation (analytics)
            this.trackEvent('pwa_installed');
        });
    }

    /**
     * Setup update notification
     */
    private setupUpdateCheck() {
        // Listen for controller change (new SW activated)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] New Service Worker activated');
            // Reload page to get new content
            window.location.reload();
        });
    }

    /**
     * Show install prompt UI
     */
    private showInstallPrompt() {
        // Create install prompt element
        const promptEl = document.createElement('div');
        promptEl.id = 'pwa-install-prompt';
        promptEl.className = 'fixed bottom-4 right-4 z-50 animate-entry';
        promptEl.innerHTML = `
      <div class="glass-card rounded-2xl p-4 shadow-2xl max-w-sm">
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 bg-gradient-to-br from-[#0F2540] to-[#1e3a8a] rounded-xl flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-[#0F2540] mb-1">アプリをインストール</h3>
            <p class="text-sm text-gray-600 mb-3">ホーム画面に追加して、より快適に使用できます</p>
            <div class="flex gap-2">
              <button id="pwa-install-btn" class="bg-[#0F2540] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#1e3a8a] transition-all btn-press">
                インストール
              </button>
              <button id="pwa-dismiss-btn" class="text-gray-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all">
                後で
              </button>
            </div>
          </div>
          <button id="pwa-close-btn" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

        document.body.appendChild(promptEl);

        // Setup event listeners
        document.getElementById('pwa-install-btn')?.addEventListener('click', () => {
            this.install();
        });

        document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
            this.hideInstallPrompt();
            // Show again in 7 days
            localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
        });

        document.getElementById('pwa-close-btn')?.addEventListener('click', () => {
            this.hideInstallPrompt();
        });
    }

    /**
     * Hide install prompt
     */
    private hideInstallPrompt() {
        const promptEl = document.getElementById('pwa-install-prompt');
        if (promptEl) {
            promptEl.remove();
        }
    }

    /**
     * Trigger install prompt
     */
    public async install() {
        if (!this.deferredPrompt) {
            console.log('[PWA] Install prompt not available');
            return;
        }

        // Show native install prompt
        this.deferredPrompt.prompt();

        // Wait for user choice
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log('[PWA] Install prompt outcome:', outcome);

        if (outcome === 'accepted') {
            this.trackEvent('pwa_install_accepted');
        } else {
            this.trackEvent('pwa_install_dismissed');
        }

        this.deferredPrompt = null;
        this.hideInstallPrompt();
    }

    /**
     * Show update notification
     */
    private notifyUpdate() {
        const updateEl = document.createElement('div');
        updateEl.id = 'pwa-update-notification';
        updateEl.className = 'fixed top-4 right-4 z-50 animate-entry';
        updateEl.innerHTML = `
      <div class="glass-card rounded-2xl p-4 shadow-2xl max-w-sm">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-[#EE4B2B] to-[#ff6b4a] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-[#0F2540] mb-1">新しいバージョン</h3>
            <p class="text-sm text-gray-600 mb-3">アプリの新しいバージョンが利用可能です</p>
            <button id="pwa-update-btn" class="bg-[#EE4B2B] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#ff6b4a] transition-all btn-press w-full">
              今すぐ更新
            </button>
          </div>
        </div>
      </div>
    `;

        document.body.appendChild(updateEl);

        document.getElementById('pwa-update-btn')?.addEventListener('click', () => {
            this.applyUpdate();
        });
    }

    /**
     * Apply update (reload page with new SW)
     */
    private applyUpdate() {
        if (this.registration?.waiting) {
            // Tell the waiting SW to activate
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }

    /**
     * Check if app is installed
     */
    public isInstalled(): boolean {
        return window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;
    }

    /**
     * Track events (can be integrated with analytics)
     */
    private trackEvent(eventName: string) {
        console.log('[PWA] Event:', eventName);
        // Integrate with Google Analytics or other analytics service
        if ((window as any).gtag) {
            (window as any).gtag('event', eventName, {
                event_category: 'PWA',
                event_label: 'QB Forecast AI'
            });
        }
    }

    /**
     * Clear all caches (for debugging)
     */
    public async clearCaches() {
        if (this.registration) {
            const sw = this.registration.active;
            sw?.postMessage({ type: 'CLEAR_CACHE' });
        }

        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[PWA] All caches cleared');
    }
}

// Export singleton instance
export const pwaManager = new PWAManager();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    (window as any).pwaManager = pwaManager;
}
