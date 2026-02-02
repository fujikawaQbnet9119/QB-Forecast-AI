import React, { useState } from 'react';

interface QueryResult {
    answer: string;
    confidence: number;
    sources?: string[];
    relatedMetrics?: { label: string; value: string }[];
}

interface NaturalLanguageQueryProps {
    onQuery?: (query: string) => Promise<QueryResult>;
}

const NaturalLanguageQuery: React.FC<NaturalLanguageQueryProps> = ({
    onQuery
}) => {
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<QueryResult | null>(null);

    // Sample queries
    const sampleQueries = [
        '先月の売上トップ5店舗は？',
        '今月の予算達成率が低い店舗を教えて',
        '前年比で最も成長している地域は？',
        '客単価が下がっている店舗の特徴は？'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || !onQuery) return;

        setIsLoading(true);
        try {
            const response = await onQuery(query);
            setResult(response);
        } catch (error) {
            console.error('Query error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSampleClick = (sample: string) => {
        setQuery(sample);
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-2">自然言語クエリ</h3>
                <p className="text-xs text-gray-500">
                    質問を入力すると、AIがデータを分析して回答します
                </p>
            </div>

            {/* Query Input */}
            <form onSubmit={handleSubmit} className="mb-4">
                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="例: 今月の売上トップ5店舗は？"
                        className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !query.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500 text-white w-8 h-8 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                            <i className="fas fa-paper-plane"></i>
                        )}
                    </button>
                </div>
            </form>

            {/* Sample Queries */}
            <div className="mb-6">
                <p className="text-xs font-bold text-gray-600 mb-2">サンプルクエリ</p>
                <div className="flex flex-wrap gap-2">
                    {sampleQueries.map((sample, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSampleClick(sample)}
                            className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                        >
                            {sample}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm font-bold text-blue-700">AIが分析中...</p>
                    <p className="text-xs text-blue-600 mt-1">データを検索しています</p>
                </div>
            )}

            {/* Result */}
            {result && !isLoading && (
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-5">
                    {/* Answer */}
                    <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-robot text-blue-500"></i>
                            <p className="text-xs font-bold text-gray-600">AI回答</p>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">{result.answer}</p>
                    </div>

                    {/* Related Metrics */}
                    {result.relatedMetrics && result.relatedMetrics.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-bold text-gray-600 mb-2">関連データ</p>
                            <div className="grid grid-cols-2 gap-2">
                                {result.relatedMetrics.map((metric, idx) => (
                                    <div key={idx} className="bg-white rounded-lg p-2 border border-gray-200">
                                        <p className="text-xs text-gray-600">{metric.label}</p>
                                        <p className="text-sm font-bold text-gray-800">{metric.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sources */}
                    {result.sources && result.sources.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-bold text-gray-600 mb-2">データソース</p>
                            <div className="flex flex-wrap gap-1">
                                {result.sources.map((source, idx) => (
                                    <span key={idx} className="text-xs bg-white px-2 py-1 rounded-full text-gray-600 border border-gray-200">
                                        {source}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Confidence */}
                    <div className="pt-3 border-t border-blue-200">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>回答の信頼度</span>
                            <span className="font-bold">{result.confidence}%</span>
                        </div>
                        <div className="w-full bg-white rounded-full h-2">
                            <div
                                className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                                style={{ width: `${result.confidence}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!result && !isLoading && (
                <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
                    <i className="fas fa-comments text-4xl text-gray-300 mb-3"></i>
                    <p className="text-sm font-bold text-gray-600">質問を入力してください</p>
                    <p className="text-xs text-gray-400 mt-1">AIがデータを分析して回答します</p>
                </div>
            )}

            {/* Note */}
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex gap-2">
                    <i className="fas fa-lightbulb text-yellow-600 text-sm mt-0.5"></i>
                    <div>
                        <p className="text-xs font-bold text-yellow-800 mb-1">ヒント</p>
                        <p className="text-xs text-yellow-700">
                            具体的な質問をすると、より正確な回答が得られます。
                            期間、店舗名、指標名などを含めてみてください。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NaturalLanguageQuery;
