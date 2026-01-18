
import React from 'react';

interface ReleaseNote {
    version: string;
    date: string;
    title: string;
    description: string;
    features: string[];
    type: 'major' | 'minor' | 'patch';
}

const HISTORY_DATA: ReleaseNote[] = [
    {
        version: 'v15.6',
        date: '2024.06.10',
        title: 'Data Forensic & Integrity Audit',
        description: '「データの質」を担保するための監査モジュールを実装。ベンフォードの法則（Benford\'s Law）を応用し、財務・実績データに潜む「不自然な操作」や「作為的なバイアス」を確率論的に検知します。',
        features: [
            'ベンフォードの法則によるデータ自然性監査機能',
            '数値改ざん・異常検知アルゴリズム (MADスコア算出)',
            'Risk分析タブへの「データ信頼度」監査チャート追加',
            '実績データ vs 予算データの分布比較検証'
        ],
        type: 'minor'
    },
    {
        version: 'v15.5',
        date: '2024.06.05',
        title: 'Advanced Risk & Reliability Metrics',
        description: '予測の信頼性を評価する指標群を大幅拡充。予測区間の調整機能に加え、金融工学的なリスク指標(VaR/Beta)や生存分析を導入し、多角的な経営判断を支援します。',
        features: [
            '予測区間 (Confidence Interval) の可変設定機能 (80%/95%/99%)',
            '精度検証へのトラッキング・シグナル (TS) 追加によるバイアス検知',
            'VaR (95%) および β値によるポートフォリオリスク分析',
            'Kaplan-Meier法を用いた店舗生存率分析 (Survival Analysis)'
        ],
        type: 'minor'
    },
    {
        version: 'v15.4',
        date: '2024.06.01',
        title: 'Budget Validation Logic Refinement',
        description: '予算管理機能の信頼性を向上させるため、検証ロジックの判定基準を厳格化。また、予算データが不完全な場合の自動補完ロジックを実装し、ダッシュボードの安定性を強化しました。',
        features: [
            '予算精度検証：「高精度」判定基準を誤差10%未満から5%未満へ厳格化',
            '予算データ未登録時のフォールバック処理（実績・AI予測による自動補完）',
            'ダッシュボードKPIの計算ロジック最適化',
            '各種チャートのUI視認性向上'
        ],
        type: 'minor'
    },
    {
        version: 'v15.3',
        date: '2024.05.25',
        title: 'New Store Simulator Pro Upgrade',
        description: '新店シミュレーション機能を大幅アップデート。3つのシナリオ（保守・標準・楽観）同時予測と、参照店舗の軌跡（Ghost Lines）比較により、投資判断の確度を向上させました。',
        features: [
            '3シナリオ（Conservative/Standard/Optimistic）同時シミュレーション',
            'パラメータ設定のマトリクスUI化',
            '参照店舗の実績軌跡（Ghost Lines）表示機能',
            '投資回収（ROI）および純増効果（Net Impact）の試算機能'
        ],
        type: 'minor'
    },
    {
        version: 'v15.2',
        date: '2024.05.22',
        title: 'UI/UX Optimization & Menu Restructuring',
        description: 'ユーザーフィードバックに基づき、サイドバーメニューの構成と名称を最適化。高度分析機能をツールセクションへ移動し、経営戦略における視認性を向上。',
        features: [
            'サイドバーメニューの分離（Main / System Resource）',
            '「地域エリアスポット分析」を「地域単月スポット分析」へ名称変更',
            '「高度分析ラボ」を経営層向けエリアからツールエリアへ移動',
            'システム更新履歴画面の追加'
        ],
        type: 'patch'
    },
    {
        version: 'v15.1',
        date: '2024.05.20',
        title: 'Regional Strategy & Budget Simulation',
        description: '地域戦略の策定と予実管理機能を大幅に強化。予算策定シミュレーターにより、Global/Individual両視点での目標設定が可能に。',
        features: [
            '「地域戦略・予実分析」画面の実装',
            '「予算策定シミュレーター」の実装（全社一括/店舗個別設定）',
            '予実管理ダッシュボードの強化（Waterfall分析の追加）',
            '地域別ポートフォリオ分析機能の追加'
        ],
        type: 'minor'
    },
    {
        version: 'v15.0',
        date: '2024.05.15',
        title: 'Logic Flow & Marketing Design Pro',
        description: '思考整理とマーケティング施策立案を支援するクリエイティブツール群を実装。課題解決のプロセスをシステム化。',
        features: [
            '「思考改善ツール (LogicFlow)」の実装（ロジックツリー/ECRS）',
            '「マーケティング設計 (Marketing Design)」の実装',
            'Gemini Pro AIによる課題分解・アイデア出し支援機能',
            'プロジェクト保存・読込機能（JSON/Local Storage）'
        ],
        type: 'major'
    },
    {
        version: 'v14.5',
        date: '2024.05.10',
        title: 'Management Coach "Reflect"',
        description: 'AIコーチング機能を実装。異なるペルソナを持つAIとの対話を通じて、マネジメントの意思決定を支援。',
        features: [
            '「経営コーチング (Reflect)」の実装',
            '4つのAIペルソナ（Standard, Logic, Empathy, Devil）',
            '音声入力対応によるハンズフリー対話',
            '対話履歴の自動保存'
        ],
        type: 'minor'
    },
    {
        version: 'v14.0',
        date: '2024.05.01',
        title: 'Core Analytics Engine Upgrade (Gemini)',
        description: '予測エンジンの刷新。Google Gemini 1.5/Proモデルとの連携強化により、定性的な分析レポートの精度が向上。',
        features: [
            'Gemini API連携による自動分析レポート生成機能',
            '店舗別診断レポートの精度向上（AIC規準の導入）',
            '「高度分析ラボ」のKPI拡充（30+ Metrics）',
            'データ読み込み処理の高速化とクラウド連携'
        ],
        type: 'major'
    },
    {
        version: 'v13.5',
        date: '2024.04.25',
        title: 'Store Analysis Detail View',
        description: '店舗詳細分析画面の強化。STL分解やヒートマップによる深層分析が可能に。',
        features: [
            'STL分解（トレンド・季節性・残差）チャートの実装',
            '月次ヒートマップの実装',
            '類似店舗検索アルゴリズム（DNA Matching）の実装',
            'Zチャート（移動年計）の追加'
        ],
        type: 'minor'
    },
    {
        version: 'v13.0',
        date: '2024.04.15',
        title: 'Initial Dashboard Release',
        description: 'QB HOUSE向け次世代店舗予測システムの基本機能をリリース。',
        features: [
            '全社ダッシュボード（KPI/トレンド）',
            '単月スポット分析',
            '店舗詳細分析の基本機能',
            'CSVデータインポート機能'
        ],
        type: 'major'
    },
    {
        version: 'v12.0',
        date: '2024.03.20',
        title: 'Regional Analysis Module',
        description: 'エリア・ブロック単位での分析モジュールを追加。地理的な傾向把握が可能に。',
        features: [
            '地域別（Region/Prefecture/Block）集計機能',
            'エリア間格差（ジニ係数）の算出ロジック',
            'ヒートマップ表示機能',
            'ドミナント密度分析'
        ],
        type: 'minor'
    },
    {
        version: 'v11.1',
        date: '2024.03.05',
        title: 'Model Logic Update: Lifecycle Control',
        description: '予測モデルの安定性向上。店舗月齢に応じたパラメータ制御ロジックを導入。',
        features: [
            '「3段階ライフサイクル制御」の実装（Startup/Growth/Mature）',
            'データ不足時の過学習防止ロジック（標準モデル加算）',
            '新規店予測精度の向上',
            '外れ値除去アルゴリズムの改良'
        ],
        type: 'patch'
    },
    {
        version: 'v11.0',
        date: '2024.02.20',
        title: 'Model Logic Update: Incremental Model',
        description: '予測コアロジックの刷新。Base（基礎）とGrowth（成長）を分離する「増分ロジスティックモデル」を採用。',
        features: [
            '増分ロジスティック成長モデル (Incremental Logistic Model) の実装',
            'Nelder-Mead法によるパラメータ最適化エンジンの搭載',
            '構造変化（Shift）検知ロジックの実装',
            'Nudge & Decay（直近トレンド補正）の実装'
        ],
        type: 'major'
    },
    {
        version: 'v10.0',
        date: '2024.01.10',
        title: 'System Migration: Chat to App',
        description: 'Geminiチャットで行っていた分析プロセスを、Webアプリケーションとしてシステム化。専用UIによる可視化と自動化を実現。',
        features: [
            'React + Tailwind による専用ダッシュボード構築',
            'チャット上の「プロンプト」を「ロジックコード」へ移植',
            'CSVデータ読込機能の実装（コピペ作業からの解放）',
            'Rechartsによるグラフ描画の自動化'
        ],
        type: 'major'
    },
    {
        version: 'v9.5',
        date: '2023.12.28',
        title: 'Logic Finalization (in Chat)',
        description: 'アプリ開発に向けた最終ロジック確定。Geminiとの対話を通じて「ロジスティック回帰」のパラメータ定義（L, k, t0）を完了。',
        features: [
            '成長モデルの数式定義 (Logistic Function)',
            'コロナ影響による「Shift」概念の確立',
            'データクレンジング・ルールの策定'
        ],
        type: 'minor'
    },
    {
        version: 'v7.0',
        date: '2023.11.15',
        title: 'Prompt Engineering: "Consultant"',
        description: 'Geminiへの指示プロンプトを改良。単純な集計だけでなく、経営コンサルタント視点での定性コメントを出力させることに成功。',
        features: [
            '「あなたはプロのデータアナリストです」プロンプトの導入',
            'Markdown形式によるレポート出力の標準化',
            '課題（Gap）と対策（Action）の分離構造化'
        ],
        type: 'minor'
    },
    {
        version: 'v5.0',
        date: '2023.10.01',
        title: 'CSV Data Injection Test',
        description: 'POSデータのCSV出力を直接チャットに貼り付けて分析させる手法を確立。手入力の手間を削減。',
        features: [
            '生データ（Raw Data）の直接解析テスト',
            'トークン制限（Token Limit）への対策検討',
            '異常値（Outlier）検知のテスト'
        ],
        type: 'major'
    },
    {
        version: 'v3.0',
        date: '2023.09.10',
        title: 'Comparative Analysis (Chat)',
        description: '複数店舗のデータを同時に与え、店舗間の比較分析（ベンチマーク）をチャット上で試行。',
        features: [
            'A店 vs B店の比較プロンプト開発',
            '成功要因（Success Factor）の抽出テスト',
            '地域特性の言語化テスト'
        ],
        type: 'minor'
    },
    {
        version: 'v1.0',
        date: '2023.08.01',
        title: 'Gemini Analysis Pilot',
        description: 'Google Bard (現Gemini) を用いた店舗データ分析のPoC開始。対話型AIによる予実管理の可能性を検証。',
        features: [
            'テキストベースでの日次売上報告',
            '簡易的な昨対比計算とコメント生成',
            'AI活用の可能性探索'
        ],
        type: 'major'
    }
];

const VersionHistoryView: React.FC = () => {
    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-12 animate-fadeIn bg-[#F8FAFC]">
            <div className="max-w-4xl mx-auto pb-20">
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-black text-gray-800 uppercase tracking-tighter font-display mb-4">
                        System Version History
                    </h1>
                    <p className="text-sm font-bold text-gray-400">
                        QB Forecast AI 更新履歴・リリースノート
                    </p>
                </div>

                <div className="relative border-l-2 border-gray-200 ml-4 md:ml-12 space-y-12">
                    {HISTORY_DATA.map((item, index) => (
                        <div key={item.version} className="relative pl-8 md:pl-12">
                            {/* Marker */}
                            <div className={`absolute -left-[9px] top-0 w-5 h-5 rounded-full border-4 border-[#F8FAFC] ${index === 0 ? 'bg-[#005EB8] w-6 h-6 -left-[11px]' : 'bg-gray-300'}`}></div>
                            
                            <div className={`bg-white p-8 rounded-3xl border transition-all hover:shadow-lg ${index === 0 ? 'shadow-xl border-blue-100 ring-4 ring-blue-50/50' : 'shadow-sm border-gray-100'}`}>
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-2xl font-black font-display ${index === 0 ? 'text-[#005EB8]' : 'text-gray-700'}`}>
                                            {item.version}
                                        </span>
                                        {index === 0 && (
                                            <span className="bg-blue-100 text-[#005EB8] text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest">Latest</span>
                                        )}
                                        <span className={`text-[10px] font-black px-2 py-1 rounded border uppercase tracking-wider ${item.type === 'major' ? 'bg-purple-50 text-purple-600 border-purple-100' : item.type === 'minor' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                            {item.type} Update
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-400 font-mono">
                                        {item.date}
                                    </span>
                                </div>

                                <h3 className="text-lg font-black text-gray-800 mb-2">{item.title}</h3>
                                <p className="text-xs font-medium text-gray-500 leading-relaxed mb-6">
                                    {item.description}
                                </p>

                                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                    <ul className="space-y-2">
                                        {item.features.map((feat, i) => (
                                            <li key={i} className="text-xs font-bold text-gray-700 flex items-start gap-2">
                                                <span className="text-[#005EB8] mt-0.5">•</span>
                                                {feat}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-20 text-center text-xs text-gray-300 font-bold font-mono">
                    System Architecture: React 19 / Tailwind / Recharts / Gemini 1.5 Pro<br/>
                    Powered by QB Forecast AI Engine v15.6
                </div>
            </div>
        </div>
    );
};

export default VersionHistoryView;
