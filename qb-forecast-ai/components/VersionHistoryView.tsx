
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
        date: '2024.06.20',
        title: 'Adaptive Nudge Control & UX Refinement',
        description: '予測モデルの柔軟性を飛躍的に高める「Adaptive Nudge（適応型ナッジ）」機能を実装しました。直近の実績乖離を将来予測にどの程度反映させるか（永続的な構造変化か、一時的なノイズか）をユーザーが直感的に制御可能となり、現場の肌感覚に即した予測線の修正が可能になりました。また、分析画面のコントロールパネルを刷新し、操作性を向上させました。',
        features: [
            'Adaptive Nudge機能の実装（Structural/Trend/Eventの3モード切替）',
            'ナッジ減衰係数（Decay Factor）の動的制御による予測線のリアルタイム補正',
            '店舗詳細分析画面（Store Analysis）のヘッダーUI刷新とコントロール配置の最適化',
            'シミュレーションモード（L/k倍率調整）のUI視認性向上'
        ],
        type: 'minor'
    },
    {
        version: 'v15.5',
        date: '2024.06.15',
        title: 'Gemini 3 Engine Integration & Persistent Nudge Std.',
        description: 'AIエンジンを最新の Gemini 3 Flash Preview へ完全移行し、推論速度と文脈理解精度を飛躍的に向上させました。また、数理予測モデルにおいて「永続ナッジ（Persistent Nudge）」を全モジュールで標準化。直近のトレンド乖離を「一過性のノイズ」ではなく「構造的な実力変化」として捉え、減衰なしで将来予測に反映させる攻撃的なロジックへ変更しました。',
        features: [
            'AI診断エンジンの Gemini 3 Flash Preview へのアップグレード（Thinking Processの高速化）',
            '永続ナッジ（Persistent Nudge）ロジックの全予測モジュールへの適用（Decay Factor = 1.0固定）',
            '戦略ツール（LogicFlow / Marketing Design）とコア分析データのリアルタイム連携強化',
            '地理分析マップのレンダリングパフォーマンス最適化とアニメーションの滑らかさ向上'
        ],
        type: 'minor'
    },
    {
        version: 'v15.4',
        date: '2024.06.01',
        title: 'Budget Validation Logic Refinement',
        description: '予算管理機能の信頼性を極限まで高めるため、検証ロジック（Backtest）の判定基準を厳格化しました。また、予算データが不完全な場合でも、過去の実績トレンドとAI予測を用いて欠損値を自動補完するフォールバックロジックを実装し、ダッシュボードの安定性を強化しました。',
        features: [
            '予算精度検証：「高精度」判定基準をMAPE（平均絶対誤差率）10%未満から5%未満へ厳格化',
            '予算データ未登録時のフォールバック処理（実績・AI予測による自動補完生成）',
            'ダッシュボードKPI（Landing Prediction）の計算ロジックにおける季節性調整の精緻化',
            '各種チャートのUI視認性向上（カラーパレットのユニバーサルデザイン調整）'
        ],
        type: 'minor'
    },
    {
        version: 'v15.3',
        date: '2024.05.25',
        title: 'New Store Simulator Pro Upgrade',
        description: '新店シミュレーション機能を大幅にアップデートしました。従来の単一予測に加え、3つのシナリオ（保守・標準・楽観）を同時に算出・比較可能に。さらに、類似した参照店舗の成長軌跡（Ghost Lines）を背景に重ねて表示することで、投資判断の確度を劇的に向上させました。',
        features: [
            '3シナリオ（Conservative/Standard/Optimistic）同時シミュレーション機能',
            'パラメータ設定のマトリクスUI化と参照店舗データの自動インポート',
            '参照店舗の実績軌跡（Ghost Lines）オーバーレイ表示機能',
            '投資回収（ROI）およびカニバリゼーションを考慮した純増効果（Net Impact）の試算機能'
        ],
        type: 'minor'
    },
    {
        version: 'v15.2',
        date: '2024.05.22',
        title: 'UI/UX Optimization & Menu Restructuring',
        description: 'ユーザーからのフィードバックに基づき、サイドバーメニューの構成と名称を全面的に最適化しました。「高度分析ラボ」などの専門的な機能をツールセクションへ移動し、日常的な経営管理と戦略的な深掘り分析の導線を明確に分離することで、視認性と操作性を向上させました。',
        features: [
            'サイドバーメニューのグループ分離（Main Features / System Resource）',
            '「地域エリアスポット分析」を「地域単月スポット分析」へ名称変更し、機能の粒度を明確化',
            '「高度分析ラボ」を経営層向けエリアからツールエリアへ移動',
            'システム更新履歴画面（Release Note）の追加'
        ],
        type: 'patch'
    },
    {
        version: 'v15.1',
        date: '2024.05.20',
        title: 'Regional Strategy & Budget Simulation',
        description: '地域戦略の策定プロセスと予実管理機能を大幅に強化しました。新実装の「予算策定シミュレーター」により、全社一括のトップダウン設定と、店舗個別のボトムアップ調整をシームレスに行き来することが可能になり、Global/Individual両視点での精緻な目標設定を実現しました。',
        features: [
            '「地域戦略・予実分析」画面の実装（地域ごとのL消化率と成長余地の可視化）',
            '「予算策定シミュレーター」の実装（ストレッチ率による一括設定/個別調整）',
            '予実管理ダッシュボードの強化（Waterfall分析による乖離要因の可視化）',
            '地域別ポートフォリオ分析機能（Growth vs Efficiency）の追加'
        ],
        type: 'minor'
    },
    {
        version: 'v15.0',
        date: '2024.05.15',
        title: 'Logic Flow & Marketing Design Pro',
        description: '数値分析だけでなく、定性的な思考整理とマーケティング施策立案を支援するクリエイティブツール群を実装しました。課題の構造化（LogicFlow）から具体的な施策への落とし込み（Marketing Design）まで、問題解決のプロセス全体をシステム上で完結させることが可能になりました。',
        features: [
            '「思考改善ツール (LogicFlow)」の実装（ロジックツリー/ECRS/マトリクス分析）',
            '「マーケティング設計 (Marketing Design)」の実装（観測から施策立案までの9ステップ）',
            'Gemini Pro AIによる課題分解・アイデア出し・壁打ち支援機能',
            'プロジェクト保存・読込機能（JSON形式/Local Storage対応）'
        ],
        type: 'major'
    },
    {
        version: 'v14.5',
        date: '2024.05.10',
        title: 'Management Coach "Reflect"',
        description: 'AIによる経営コーチング機能を実装しました。異なる4つのペルソナ（Standard, Logic, Empathy, Devil）を持つAIとの対話を通じて、マネジメント層の孤独な意思決定を多角的に支援します。音声入力にも対応し、ハンズフリーでの思考整理を実現しました。',
        features: [
            '「経営コーチング (Reflect)」の実装',
            '4つのAIペルソナ（Standard, Logic, Empathy, Devil）による多角的アドバイス',
            'Web Speech APIを用いた音声入力対応によるハンズフリー対話',
            '対話履歴の自動保存とセッション管理機能'
        ],
        type: 'minor'
    },
    {
        version: 'v14.0',
        date: '2024.05.01',
        title: 'Core Analytics Engine Upgrade (Gemini)',
        description: '予測エンジンのコアを刷新しました。Google Gemini 1.5/Proモデルとの連携を強化し、単なる数値予測だけでなく、その背景にある定性的な要因分析や、店舗ごとの具体的な改善提案レポートの自動生成が可能になりました。',
        features: [
            'Gemini API連携による店舗別・地域別自動分析レポート生成機能',
            '店舗別診断レポートの精度向上（AIC規準によるモデル選択の自動化）',
            '「高度分析ラボ」のKPI拡充（30以上の経営指標を網羅）',
            'データ読み込み処理の高速化とクラウドデータソースとの連携強化'
        ],
        type: 'major'
    },
    {
        version: 'v13.5',
        date: '2024.04.15',
        title: 'Performance Tuning & Caching',
        description: 'データ処理速度のボトルネックを解消するため、バックグラウンド処理の見直しを行いました。非同期処理の最適化と計算結果のメモ化（キャッシュ）により、1000店舗規模のデータセットでもUIがフリーズすることなく快適に動作するようパフォーマンスチューニングを実施しました。',
        features: [
            '分析エンジンの非同期処理化（Async/Awaitパターンの最適化）',
            '計算結果のメモ化（Memoization）による不要な再計算の抑制',
            '大量データ読み込み時のプログレスバー表示機能の実装',
            'メモリリークの解消とガベージコレクション効率の向上'
        ],
        type: 'patch'
    },
    {
        version: 'v13.0',
        date: '2024.04.01',
        title: 'Logistic Growth Model (Alpha)',
        description: '従来の線形トレンド予測に加え、生物学的なS字成長カーブ（ロジスティック回帰）を用いた新予測モデルを試験的に導入しました。店舗には物理的な売上上限（席数・商圏）が存在するという前提に基づき、「飽和点」を意識したより現実的な長期予測が可能になりました。',
        features: [
            'ロジスティック成長モデルの実験的実装（L, kパラメータの導入）',
            'Nelder-Mead法によるパラメータ最適化エンジンのプロトタイプ搭載',
            '予測期間の延長（最大36ヶ月先までのシミュレーション）',
            '成長フェーズ（導入期・成長期・成熟期）の自動判定ロジック'
        ],
        type: 'major'
    },
    {
        version: 'v12.0',
        date: '2024.03.10',
        title: 'Dashboard UI Overhaul',
        description: '全社ダッシュボードのデザインを全面的に刷新しました。「情報の密度」と「視認性」の両立を目指し、Bento Gridシステムを採用したカード型レイアウトに変更。経営判断に必要な重要KPIがひと目で把握できるよう、UI/UXを大幅に改善しました。',
        features: [
            'Bento Gridレイアウトの採用による情報整理',
            'KPIカードのデザイン統一と視覚的階層構造の明確化',
            'ダークモード/ライトモードの基盤整備（現在はライトテーマのみ提供）',
            'レスポンシブ対応の強化（タブレット端末での表示最適化）'
        ],
        type: 'major'
    },
    {
        version: 'v11.5',
        date: '2024.02.20',
        title: 'CSV Export Functionality',
        description: '分析結果の二次利用を促進するため、各分析画面でのデータエクスポート機能を強化しました。画面上でフィルタリングやソートを行った状態のデータを、そのままCSV形式でダウンロードできるようになり、Excel等での報告書作成業務を支援します。',
        features: [
            '全店舗リストおよび分析結果のCSVダウンロード機能',
            'マトリクス表示データのCSV出力対応',
            '文字コード選択機能（UTF-8 / Shift-JIS）の実装による互換性確保',
            'エクスポートファイル名の自動生成（日付・分析種別入り）'
        ],
        type: 'minor'
    },
    {
        version: 'v11.0',
        date: '2024.02.01',
        title: 'Advanced Filtering System',
        description: '管理店舗数の増加に伴い、目的の店舗や問題店舗を素早く見つけるためのフィルタリング機能を強化しました。単純な名称検索だけでなく、エリア、売上規模、成長率、ABCランクなどの複合条件による絞り込みが可能になりました。',
        features: [
            '複合条件検索機能（エリア × 売上規模 × 成長率など）',
            'ABC分析結果に基づくランクフィルタの実装',
            '検索結果のリアルタイムソート機能（昇順/降順）',
            'フィルタ条件の保持機能'
        ],
        type: 'minor'
    },
    {
        version: 'v10.0',
        date: '2024.01.01',
        title: 'Core System Migration (React)',
        description: 'システムの将来性と拡張性を確保するため、フロントエンド基盤をレガシーなjQuery/Vanilla JSベースから最新のReact 18へと完全移行しました。SPA（シングルページアプリケーション）化により、ページ遷移時の読み込み待ち時間を解消し、アプリのような軽快な操作性を実現しました。',
        features: [
            'フロントエンドフレームワークの React 18 への完全移行',
            'TypeScriptの導入によるコードの堅牢性と保守性の向上',
            'コンポーネントベース設計へのアーキテクチャ刷新',
            'Tailwind CSSの導入によるスタイリング効率化'
        ],
        type: 'major'
    },
    {
        version: 'v9.0',
        date: '2023.11.15',
        title: 'Seasonality Analysis Module',
        description: '月ごとの売上変動パターン（季節性）を分析・分離する機能を実装しました。単純な昨対比だけでなく、トレンド（実力値）と季節要因（外部要因）を分けて考えることで、より正確な現状分析と将来予測が可能になります。',
        features: [
            '季節性指数（Seasonality Index）の算出ロジック実装',
            'STL分解（Seasonal-Trend decomposition）の導入によるトレンド抽出',
            'Zチャート（移動年計）の表示対応',
            '季節調整済み数値の算出'
        ],
        type: 'minor'
    },
    {
        version: 'v8.0',
        date: '2023.10.01',
        title: 'Correlation Matrix & Heatmap',
        description: '店舗間の類似性を発見するための相関分析機能を追加しました。売上推移の波形が似ている「兄弟店舗」を探し出すことで、ドミナント戦略の検証や、成功事例（ノウハウ）の横展開先選定に科学的根拠を持たせることができます。',
        features: [
            'ピアソンの積率相関係数による店舗間類似度の算出',
            '相関マトリクス・ヒートマップの描画機能',
            '類似店舗レコメンデーション機能（k-Nearest Neighbors的アプローチ）'
        ],
        type: 'minor'
    },
    {
        version: 'v7.5',
        date: '2023.09.10',
        title: 'Regional Block Analysis',
        description: '組織体制に合わせた分析を可能にするため、エリアマネージャー向けにブロック単位・都道府県単位での集計機能を追加しました。管轄エリアごとの予実管理や、地域特性の比較分析が容易になりました。',
        features: [
            'エリア階層別（地方・都道府県・ブロック）のドリルダウン集計ビュー',
            'エリア別昨対比ランキング機能',
            '地域別ヒートマップ（簡易版）のプロトタイプ実装'
        ],
        type: 'patch'
    },
    {
        version: 'v7.0',
        date: '2023.08.01',
        title: 'Multi-Store Comparison View',
        description: '複数の店舗を同一グラフ上で重ねて比較できる「ベンチマーク機能」を実装しました。新店と既存店の立ち上がりスピードの比較や、キャンペーン実施店と未実施店の効果測定などが直感的に行えるようになりました。',
        features: [
            '複数店舗選択と比較チャート描画機能',
            '基準点合わせ（カレンダー基準 vs オープン月基準）の切替機能',
            '正規化チャートによる成長率比較',
            '比較対象店舗のハイライト機能'
        ],
        type: 'minor'
    },
    {
        version: 'v6.0',
        date: '2023.06.15',
        title: 'Statistical Engine v1',
        description: '単純な集計だけでなく、統計的な指標（標準偏差、変動係数など）を自動計算する分析エンジンを初搭載。データの「平均」だけでなく「バラつき」や「リスク」を数値化し、安定した運営ができているかを客観的に評価できるようになりました。',
        features: [
            '基本統計量（平均、中央値、分散、標準偏差）の自動計算',
            '変動係数（CV）による売上安定性評価指標の導入',
            '四分位範囲（IQR）を用いた外れ値（Outlier）の自動検知'
        ],
        type: 'major'
    },
    {
        version: 'v5.5',
        date: '2023.05.01',
        title: 'Mobile Responsive Layout',
        description: '現場のSV（スーパーバイザー）が店舗巡回中にもデータを確認できるよう、タブレットやスマートフォンでの閲覧に完全対応しました。移動中でも手元のデバイスで主要KPIや日次推移をチェック可能です。',
        features: [
            'レスポンシブデザインの適用（Flex/Gridレイアウト）',
            'タッチ操作に最適化されたUIコンポーネントとボタンサイズ調整',
            'モバイル用ハンバーガーメニューの実装'
        ],
        type: 'patch'
    },
    {
        version: 'v5.0',
        date: '2023.04.01',
        title: 'Interactive Chart Engine',
        description: '従来の静的な画像グラフから、インタラクティブなチャートライブラリ（Recharts）へ移行しました。グラフ上のポイントにマウスを合わせることで詳細な数値をツールチップで確認したり、凡例クリックで表示系列を切り替えたりすることが可能になりました。',
        features: [
            'Rechartsライブラリの採用によるチャート描画エンジンの刷新',
            'マウスオーバー時の詳細データツールチップ表示',
            'ズーム・パン操作への対応（一部チャート）',
            '凡例クリックによる系列の表示/非表示トグル機能'
        ],
        type: 'major'
    },
    {
        version: 'v4.0',
        date: '2023.02.15',
        title: 'Data Import Validation',
        description: 'CSV取り込み時のエラーチェック機能を大幅に強化しました。フォーマット不正、欠損値、異常値が含まれている場合に即座にアラートを表示し、分析結果の信頼性を担保するための自動補完ロジックも追加しました。',
        features: [
            'CSVフォーマットの厳格なバリデーションチェック',
            '欠損データの線形補間（Linear Interpolation）処理',
            'データ型（数値/文字列）の自動判定精度の向上',
            '取り込みエラー行の特定と通知機能'
        ],
        type: 'minor'
    },
    {
        version: 'v3.0',
        date: '2023.01.01',
        title: 'Sales/Customer Mode Switch',
        description: '「売上（金額）」だけでなく「客数」ベースでの分析モードを追加しました。価格改定などの単価変動要因を除外した、純粋な来店需要（ポテンシャル）の分析が可能になり、マーケティング施策の効果測定に適しています。',
        features: [
            '売上モード/客数モードのグローバル切替スイッチ',
            '各モードごとの専用KPI計算とチャート表示',
            '客単価（売上÷客数）の簡易分析機能'
        ],
        type: 'minor'
    },
    {
        version: 'v2.0',
        date: '2022.10.01',
        title: 'Basic Forecasting (Linear)',
        description: '過去のトレンドに基づいた単純な線形予測機能を初めて実装しました。直近3ヶ月〜6ヶ月の平均成長率を用いて、向こう半年間の着地見込みを簡易的に試算し、予算策定の基礎資料として活用できるようになりました。',
        features: [
            '最小二乗法による線形回帰（Linear Regression）予測',
            '移動平均線（SMA）のオーバーレイ表示',
            '前年同月比（YoY）の自動計算と表示'
        ],
        type: 'major'
    },
    {
        version: 'v1.0',
        date: '2022.06.01',
        title: 'Initial Release',
        description: '「QB Forecast AI」の記念すべき初期バージョンリリース。CSVデータをブラウザ上で読み込み、店舗ごとの売上推移を可視化するシンプルかつ高速なデータビューアとして誕生しました。ローカル処理によるセキュリティの高さが特徴です。',
        features: [
            'CSVデータのドラッグ＆ドロップ読み込み機能',
            '店舗別売上推移グラフの描画',
            '基本的な店舗属性情報（名称、地域、オープン日）の表示',
            '完全クライアントサイド処理（サーバーへのデータ送信なし）'
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
                    System Architecture: React 19 / Tailwind / Recharts / Gemini 3.0<br/>
                    Powered by QB Forecast AI Engine v15.5
                </div>
            </div>
        </div>
    );
};

export default VersionHistoryView;
