import React, { useEffect, useState } from 'react';
import { isOnline, setupNetworkListeners } from '../utils/pwa';

const OfflineIndicator: React.FC = () => {
    const [online, setOnline] = useState(isOnline());

    useEffect(() => {
        const cleanup = setupNetworkListeners(
            () => setOnline(true),
            () => setOnline(false)
        );

        return cleanup;
    }, []);

    if (online) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-50">
            <div className="bg-yellow-500 text-white px-4 py-2 text-center">
                <div className="flex items-center justify-center gap-2">
                    <i className="fas fa-wifi-slash"></i>
                    <span className="text-sm font-bold">オフラインモード</span>
                    <span className="text-xs opacity-90">- キャッシュされたデータを表示中</span>
                </div>
            </div>
        </div>
    );
};

export default OfflineIndicator;
