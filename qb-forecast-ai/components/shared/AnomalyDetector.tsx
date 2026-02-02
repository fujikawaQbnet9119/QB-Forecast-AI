import React from 'react';

export interface Anomaly {
    id: string;
    type: 'spike' | 'drop' | 'trend_break' | 'outlier';
    severity: 'low' | 'medium' | 'high' | 'critical';
    storeName: string;
    metric: string;
    value: number;
    expectedValue: number;
    deviation: number;
    timestamp: Date;
    description: string;
}

interface AnomalyDetectorProps {
    anomalies: Anomaly[];
    onAnomalyClick?: (anomaly: Anomaly) => void;
}

const AnomalyDetector: React.FC<AnomalyDetectorProps> = ({
    anomalies,
    onAnomalyClick
}) => {
    // Group anomalies by severity
    const groupedAnomalies = {
        critical: anomalies.filter(a => a.severity === 'critical'),
        high: anomalies.filter(a => a.severity === 'high'),
        medium: anomalies.filter(a => a.severity === 'medium'),
        low: anomalies.filter(a => a.severity === 'low')
    };

    const getSeverityColor = (severity: Anomaly['severity']) => {
        switch (severity) {
            case 'critical': return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', icon: 'bg-red-500' };
            case 'high': return { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', icon: 'bg-orange-500' };
            case 'medium': return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', icon: 'bg-yellow-500' };
            case 'low': return { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: 'bg-blue-500' };
        }
    };

    const getTypeIcon = (type: Anomaly['type']) => {
        switch (type) {
            case 'spike': return 'fa-arrow-trend-up';
            case 'drop': return 'fa-arrow-trend-down';
            case 'trend_break': return 'fa-chart-line-down';
            case 'outlier': return 'fa-circle-exclamation';
        }
    };

    const formatDeviation = (deviation: number) => {
        const sign = deviation > 0 ? '+' : '';
        return `${sign}${deviation.toFixed(1)}%`;
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">異常検知</h3>
                    <p className="text-xs text-gray-500 mt-1">AIによる自動異常検出システム</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-gray-600">リアルタイム監視中</span>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                {Object.entries(groupedAnomalies).map(([severity, items]) => {
                    const colors = getSeverityColor(severity as Anomaly['severity']);
                    return (
                        <div key={severity} className={`${colors.bg} border ${colors.border} rounded-lg p-3`}>
                            <p className="text-xs font-bold text-gray-600 uppercase mb-1">
                                {severity === 'critical' ? '緊急' : severity === 'high' ? '高' : severity === 'medium' ? '中' : '低'}
                            </p>
                            <p className={`text-2xl font-black ${colors.text}`}>{items.length}</p>
                        </div>
                    );
                })}
            </div>

            {/* Anomaly List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {anomalies.length === 0 ? (
                    <div className="text-center py-8">
                        <i className="fas fa-check-circle text-4xl text-green-500 mb-3"></i>
                        <p className="text-sm font-bold text-gray-600">異常は検出されていません</p>
                        <p className="text-xs text-gray-400 mt-1">すべての指標が正常範囲内です</p>
                    </div>
                ) : (
                    anomalies.map((anomaly) => {
                        const colors = getSeverityColor(anomaly.severity);
                        const typeIcon = getTypeIcon(anomaly.type);

                        return (
                            <div
                                key={anomaly.id}
                                className={`${colors.bg} border ${colors.border} rounded-xl p-4 cursor-pointer transition-all hover:shadow-md`}
                                onClick={() => onAnomalyClick?.(anomaly)}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div className={`${colors.icon} w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0`}>
                                        <i className={`fas ${typeIcon}`}></i>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h4 className={`text-sm font-bold ${colors.text}`}>
                                                    {anomaly.storeName}
                                                </h4>
                                                <p className="text-xs text-gray-600 mt-0.5">{anomaly.metric}</p>
                                            </div>
                                            <span className={`text-xs font-bold ${colors.text} px-2 py-1 rounded-full ${colors.bg} border ${colors.border}`}>
                                                {formatDeviation(anomaly.deviation)}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-700 mb-2">{anomaly.description}</p>

                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <div>
                                                <span className="font-bold">実績:</span> {anomaly.value.toLocaleString()}
                                            </div>
                                            <div>
                                                <span className="font-bold">予測:</span> {anomaly.expectedValue.toLocaleString()}
                                            </div>
                                            <div className="ml-auto">
                                                <i className="fas fa-clock mr-1"></i>
                                                {new Date(anomaly.timestamp).toLocaleString('ja-JP', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default AnomalyDetector;
