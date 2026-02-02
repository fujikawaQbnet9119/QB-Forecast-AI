import React, { useEffect, useState } from 'react';
import { promptInstall, isAppInstalled } from '../utils/pwa';

const InstallPrompt: React.FC = () => {
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        setIsInstalled(isAppInstalled());

        // Listen for install prompt availability
        const handleInstallable = (e: Event) => {
            const customEvent = e as CustomEvent;
            setIsInstallable(customEvent.detail);
        };

        window.addEventListener('pwa-installable', handleInstallable);

        return () => {
            window.removeEventListener('pwa-installable', handleInstallable);
        };
    }, []);

    const handleInstall = async () => {
        const accepted = await promptInstall();
        if (accepted) {
            setIsInstallable(false);
            setIsInstalled(true);
        }
    };

    if (isInstalled || !isInstallable) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-2xl p-4 animate-slide-up">
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-download text-blue-600 text-xl"></i>
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-sm mb-1">アプリをインストール</h3>
                        <p className="text-xs opacity-90 mb-3">
                            ホーム画面に追加して、いつでも素早くアクセス
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleInstall}
                                className="flex-1 bg-white text-blue-600 font-bold text-xs py-2 px-4 rounded-lg hover:bg-opacity-90 transition-all"
                            >
                                インストール
                            </button>
                            <button
                                onClick={() => setIsInstallable(false)}
                                className="px-3 text-xs opacity-75 hover:opacity-100 transition-opacity"
                            >
                                後で
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsInstallable(false)}
                        className="text-white opacity-75 hover:opacity-100 transition-opacity"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
