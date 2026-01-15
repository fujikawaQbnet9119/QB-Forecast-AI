
import React, { useState } from 'react';
import katex from 'katex';

const BlockMath = ({ math }: { math: string }) => {
    const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
    return <div dangerouslySetInnerHTML={{ __html: html }} className="overflow-x-auto overflow-y-hidden" />;
};

const InlineMath = ({ math }: { math: string }) => {
    const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('intro');

    const sections = [
        { id: 'intro', title: '0. イントロダクション & 基本思想' },
        { id: 'preprocessing', title: '1. データ前処理・外れ値検知' },
        { id: 'core_model', title: '2. コア・数理モデル定義' },
        { id: 'optimization', title: '3. パラメータ最適化とビジネス制約' },
        { id: 'structural_break', title: '4. 構造変化検知 (AICモデル選択)' },
        { id: 'cold_start', title: '5. コールドスタート問題 (新規店)' },
        { id: 'seasonality', title: '6. ロバスト季節性分解' },
        { id: 'nudge', title: '7. 適応型Nudge (直近補正)' },
        { id: 'synthesis', title: '8. 最終予測式の合成' }
    ];

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-slate-800 font-sans">
            <div className="flex flex-col md:flex-row min-h-full">
                {/* Fixed TOC Sidebar */}
                <div className="w-full md:w-72 bg-white border-r border-gray-200 p-6 flex-shrink-0 sticky top-0 h-auto md:h-screen overflow-y-auto z-10 shadow-sm">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 font-display">Technical Specification</div>
                    <nav className="space-y-1">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition-all border-l-4 ${activeSection === s.id ? 'bg-blue-50 border-[#005EB8] text-[#005EB8]' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                            >
                                {s.title}
                            </button>
                        ))}
                    </nav>
                    <div className="mt-8 pt-8 border-t border-gray-100">
                        <div className="text-[10px] font-black text-gray-400 uppercase mb-2">Engine Core</div>
                        <div className="text-xl font-black text-slate-800 font-display">QB-LGM v10.9</div>
                        <div className="space-y-2 mt-3">
                            <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Optimization</span>
                                <span className="font-mono font-bold">Nelder-Mead</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Estimator</span>
                                <span className="font-mono font-bold">MLE / AIC</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Constraints</span>
                                <span className="font-mono font-bold">Heuristic Cap (5.0x)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-8 md:p-16 max-w-5xl mx-auto">
                    
                    {/* Header */}
                    <header className="mb-12 border-b border-gray-200 pb-8">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 font-display uppercase tracking-tight mb-4">
                            QB-LGM アルゴリズム仕様書
                            <span className="block text-sm text-slate-500 font-medium normal-case mt-2 tracking-normal font-sans">
                                QB House Logistic Growth Model - Mathematical & Logic Specification
                            </span>
                        </h1>
                        <p className="text-sm text-slate-600 leading-loose max-w-3xl">
                            本ドキュメントは、本システムに実装されている需要予測エンジン（<code>analysisEngine.ts</code>）の内部ロジックを、数理的定義およびコード実装レベルで詳細に記述したものです。
                            本モデルは、理美容業界特有の「商圏キャパシティ（物理的上限）」を前提としたロジスティック成長モデルをカーネルとし、実務運用に耐えうる堅牢性（Robustness）を確保するための多数のヒューリスティック補正（Business Constraints）を包含しています。
                        </p>
                    </header>

                    {/* Content Renderer */}
                    <div className="space-y-20">

                        {/* 0. INTRO */}
                        <section id="intro" className={`scroll-mt-24 ${activeSection !== 'intro' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">0.</span> イントロダクション & 基本思想
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <h3 className="text-lg font-bold text-slate-800">なぜ時系列モデル（ARIMA/Prophet）ではないのか？</h3>
                                <p>
                                    一般的な時系列モデルは「過去のトレンドが未来も続く」という仮定に基づきます。しかし、店舗ビジネスには明確な物理的制約（席数、スタッフ数、商圏人口）が存在します。
                                    線形回帰やARIMAを単純適用すると、成長期において「無限に売上が伸びる」という非現実的な予測を出力するリスクがあります。
                                </p>
                                <p>
                                    本システムでは、生物学における個体数増加モデルである<strong>「ロジスティック方程式 (Verhulst Equation)」</strong>を採用しています。
                                    これにより、「成長はいずれ鈍化し、環境収容力（<InlineMath math="L" />）に収束する」という現実的な振る舞いを数学的に保証しています。
                                </p>
                                
                                <div className="my-6 p-6 bg-slate-50 rounded-xl border border-slate-200">
                                    <h4 className="font-bold text-slate-800 mb-3 text-xs uppercase">設計上の3つの優先順位</h4>
                                    <ol className="list-decimal pl-5 space-y-2">
                                        <li><strong>解釈可能性 (Explainability):</strong> なぜその予測になったのか、<InlineMath math="L" />（天井）や<InlineMath math="k" />（勢い）というパラメータで説明できること。</li>
                                        <li><strong>堅牢性 (Robustness):</strong> 台風、臨時休業、コロナ禍などの「異常値」によって、将来予測全体が歪まないこと。</li>
                                        <li><strong>現実性 (Reality):</strong> 数学的に正しい解であっても、ビジネス常識（例: 売上が100倍になる）から逸脱しないよう、強力な制約をかけること。</li>
                                    </ol>
                                </div>
                            </div>
                        </section>

                        {/* 1. PREPROCESSING */}
                        <section id="preprocessing" className={`scroll-mt-24 ${activeSection !== 'preprocessing' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">1.</span> データ前処理・外れ値検知
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    生の売上データには、台風による休業や、リニューアルオープン時の特需などのノイズが含まれます。
                                    これらをそのまま学習させるとモデルパラメータ（特に<InlineMath math="L" />）が不安定になるため、四分位範囲（IQR）を用いたフィルタリングを行います。
                                </p>

                                <div className="bg-slate-800 text-slate-200 p-6 rounded-xl font-mono text-xs my-4 shadow-lg">
                                    <p className="text-slate-400 mb-2">// Code Ref: services/analysisEngine.ts - calculateIQRStats</p>
                                    <div className="space-y-2">
                                        <div>Sorted Data <InlineMath math="D_{sorted} = \text{sort}(D_{raw})" /></div>
                                        <div>第1四分位数 <InlineMath math="Q1 = D_{sorted}[0.25 \times N]" /></div>
                                        <div>第3四分位数 <InlineMath math="Q3 = D_{sorted}[0.75 \times N]" /></div>
                                        <div>四分位範囲 <InlineMath math="IQR = Q3 - Q1" /></div>
                                        <div className="pt-2 text-green-400">// Acceptance Range</div>
                                        <div>Lower Bound = <InlineMath math="Q1 - 1.5 \times IQR" /></div>
                                        <div>Upper Bound = <InlineMath math="Q3 + 1.5 \times IQR" /></div>
                                        <div>Mask <InlineMath math="M_i = (\text{Lower} \le D_i \le \text{Upper})" /></div>
                                    </div>
                                </div>

                                <p>
                                    この範囲外のデータは「異常値」とみなされ、モデル推定（カーブフィッティング）の計算対象から除外されます（<code>mask=false</code>）。
                                    ただし、チャート上の「実績」としてはそのまま表示されます。
                                </p>
                            </div>
                        </section>

                        {/* 2. CORE MODEL */}
                        <section id="core_model" className={`scroll-mt-24 ${activeSection !== 'core_model' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">2.</span> コア・数理モデル定義
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    本システムにおける基底モデルは、以下の3パラメータを持つロジスティック関数です。
                                </p>

                                <div className="bg-white border-l-4 border-[#005EB8] p-6 my-6 shadow-sm">
                                    <div className="mb-4">
                                        <BlockMath math="y(t) = \frac{L}{1 + e^{-k(t - t_0)}}" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs mt-6">
                                        <div>
                                            <span className="font-black text-[#005EB8] block mb-1">L (Carrying Capacity)</span>
                                            潜在需要・飽和点。<br/><InlineMath math="t \to \infty" /> における売上の収束値。店舗の物理的上限を示唆する。
                                        </div>
                                        <div>
                                            <span className="font-black text-orange-500 block mb-1">k (Growth Rate)</span>
                                            成長速度係数。<br/>立ち上がりの鋭さ。<InlineMath math="0.1" /> 前後が標準的。大きいほど短期間で上限に達する。
                                        </div>
                                        <div>
                                            <span className="font-black text-slate-500 block mb-1">t0 (Midpoint)</span>
                                            変曲点。<br/>成長率が最大となる（売上の伸びが最も激しい）時期。
                                        </div>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 mt-8 mb-2">Shift Model (構造変化モデル)</h4>
                                <p>
                                    コロナ禍や近隣競合の出退店により、環境収容力（<InlineMath math="L" />）そのものが変化するケースに対応するため、
                                    特定の時点（<InlineMath math="t_{shock}" />）を境に<InlineMath math="L" />が遷移する拡張モデルを定義しています。
                                </p>
                                <div className="bg-slate-100 p-4 rounded-lg text-xs my-2 border border-slate-200">
                                    <BlockMath math="\text{IF } t < t_{shock} : y(t) = \frac{L_{pre}}{1 + e^{-k(t - t_0)}}" />
                                    <BlockMath math="\text{ELSE } : y(t) = \frac{L_{post}}{1 + e^{-k(t - t_0)}}" />
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    ※ <InlineMath math="t_{shock}" /> は「2020年4月」などの固定イベント、またはデータから自動検出されます。
                                </p>
                            </div>
                        </section>

                        {/* 3. OPTIMIZATION & BUSINESS CONSTRAINTS */}
                        <section id="optimization" className={`scroll-mt-24 ${activeSection !== 'optimization' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">3.</span> パラメータ最適化とビジネス制約
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    観測データに対し、モデルの予測誤差（残差平方和 SSE）を最小化するパラメータセット <InlineMath math="\theta = \{L, k, t_0\}" /> を探索します。
                                    探索アルゴリズムには、非線形かつ微分不要な <strong>Nelder-Mead法</strong> を採用しています。
                                </p>

                                <div className="p-6 bg-red-50 border-l-4 border-red-400 my-6">
                                    <h3 className="text-red-700 font-bold mb-2">課題: 「数学的な正解」と「ビジネスの正解」の乖離</h3>
                                    <p className="text-xs text-red-600 leading-relaxed">
                                        成長途中のデータ（Jカーブ）に対し、単純に誤差を最小化しようとすると、AIはしばしば<strong>「無限大の天井 (<InlineMath math="L=\infty" />) に向かって、直線的に成長する (<InlineMath math="k \approx 0" />)」</strong>というモデルを導き出します。
                                        これは数学的には誤差最小の正しい解ですが、店舗ビジネスとしては「ナンセンス（非現実的）」です。
                                    </p>
                                </div>

                                <p>
                                    この問題を解決するため、v10.9エンジンでは、理美容業界のドメイン知識を<strong>「ハード制約（Business Constraints）」</strong>として目的関数に組み込んでいます。
                                </p>

                                <div className="space-y-6 mt-6">
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="bg-[#005EB8] text-white px-2 py-1 rounded text-xs font-bold font-mono">Constraint 1</span>
                                            <h4 className="font-bold text-slate-800">潜在需要の上限キャップ (Max L Constraint)</h4>
                                        </div>
                                        <div className="text-xs font-mono bg-slate-100 p-3 rounded mb-3">
                                            <InlineMath math="L_{estimated} \le 5.0 \times \text{Max}(Sales_{historical})" />
                                        </div>
                                        <p className="text-xs text-slate-600">
                                            「どんなに成長余地があっても、過去最大実績の5倍以上にはならない」というルールです。
                                            過小評価になりがちな急成長店舗に対応するため、制約を大幅に緩和（4倍→5倍）しています。
                                        </p>
                                    </div>

                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="bg-[#005EB8] text-white px-2 py-1 rounded text-xs font-bold font-mono">Constraint 2</span>
                                            <h4 className="font-bold text-slate-800">成長速度の正値制約 (Positive k Constraint)</h4>
                                        </div>
                                        <div className="text-xs font-mono bg-slate-100 p-3 rounded mb-3">
                                            <InlineMath math="k \ge 0.0001" />
                                        </div>
                                        <p className="text-xs text-slate-600">
                                            成長速度 <InlineMath math="k" /> が負になると「衰退モデル」となり、0になると「計算不能」となります。
                                            商業施設などでの「極めて緩やかな成長（直線に近い推移）」も許容するため、下限値は事実上撤廃（微小な正の数）しています。
                                        </p>
                                    </div>

                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold font-mono">Technique</span>
                                            <h4 className="font-bold text-slate-800">初期値アンカリング (Anchoring Initialization)</h4>
                                        </div>
                                        <div className="text-xs font-mono bg-slate-100 p-3 rounded mb-3">
                                            <InlineMath math="InitialGuess(L) = 1.5 \times \text{Max}(Sales_{historical})" />
                                        </div>
                                        <p className="text-xs text-slate-600">
                                            最適化計算のスタート地点をランダムにせず、「現在の最大売上のちょっと上（1.5倍）」に設定します。
                                            これにより、AIは現実的な解の近傍から探索を始めることになり、突拍子もない局所解に陥る確率を激減させています。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 4. STRUCTURAL BREAK */}
                        <section id="structural_break" className={`scroll-mt-24 ${activeSection !== 'structural_break' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">4.</span> 構造変化検知 (AICモデル選択)
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    すべての店舗に対して「Shift Model（構造変化あり）」を適用すると、過剰適合（Overfitting）のリスクがあります。
                                    変化がない店舗にはシンプルな「Standard Model」を適用すべきです。
                                    この判断を自動化するために、<strong>AIC (赤池情報量基準)</strong> を用いています。
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
                                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                        <h4 className="font-bold text-slate-700 mb-2">Standard Model</h4>
                                        <p className="text-xs font-mono text-slate-500 mb-2">Params: 3 (<InlineMath math="L, k, t_0" />)</p>
                                        <div className="text-xs bg-white p-2 rounded border border-slate-200">
                                            <InlineMath math="AIC_{std} = N \ln(SSE/N) + 2 \times 3" />
                                        </div>
                                    </div>
                                    <div className="bg-purple-50 p-5 rounded-xl border border-purple-200">
                                        <h4 className="font-bold text-purple-700 mb-2">Shift Model</h4>
                                        <p className="text-xs font-mono text-purple-500 mb-2">Params: 4 (<InlineMath math="L_{pre}, L_{post}, k, t_0" />)</p>
                                        <div className="text-xs bg-white p-2 rounded border border-purple-100">
                                            <InlineMath math="AIC_{shift} = N \ln(SSE/N) + 2 \times 4" />
                                        </div>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 text-sm mb-2">採用ロジック</h4>
                                <div className="text-xs font-mono bg-slate-800 text-white p-4 rounded-lg">
                                    <BlockMath math="\text{IF } (AIC_{shift} < AIC_{std} - 2.0) : \text{ADOPT Shift Model}" />
                                    <BlockMath math="\text{ELSE } : \text{ADOPT Standard Model}" />
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    ※ AICの差が2未満の場合、統計的に有意な改善とは言えないため、より単純なStandardモデルを優先します（オッカムの剃刀）。
                                </p>
                            </div>
                        </section>

                        {/* 5. COLD START */}
                        <section id="cold_start" className={`scroll-mt-24 ${activeSection !== 'cold_start' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">5.</span> コールドスタート問題 (新規店)
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    データ数が少ない（<InlineMath math="N < 12" />）新規店において、0から立ち上がる従来のロジスティック曲線では、オープン直後の高い実績（発射台）を捉えきれず、非現実的な予測になりがちです。
                                    これを解決するため、v10.9より<strong>「ベースライン固定型・成長モデル (Baseline + Growth Model)」</strong>を採用しています。
                                </p>

                                <div className="space-y-6 my-6">
                                    <div className="bg-white p-6 rounded-xl border border-orange-200 bg-orange-50/30">
                                        <h4 className="font-bold text-orange-800 flex items-center gap-2">
                                            <span className="bg-orange-100 p-1 rounded">Model</span>
                                            <InlineMath math="y(t) = \text{Base} + \frac{L_{growth}}{1 + e^{-k(t-t_0)}}" />
                                        </h4>
                                        <div className="mt-4 space-y-4">
                                            <div className="flex gap-4">
                                                <div className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">A</div>
                                                <div>
                                                    <h5 className="font-bold text-slate-800 text-xs">ベースラインの固定 (Fix Base)</h5>
                                                    <p className="text-xs mt-1 text-slate-600">
                                                        オープン直後の実績データの平均値を「ベースライン (<InlineMath math="Base" />)」として固定定数化します。
                                                        予測モデルは「0」からではなく、この「ベースライン」からスタートするため、データ不足でも大外れしません。
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">B</div>
                                                <div>
                                                    <h5 className="font-bold text-slate-800 text-xs">上積み分の最適化 (Optimize Growth)</h5>
                                                    <p className="text-xs mt-1 text-slate-600">
                                                        ロジスティック曲線は、ベースラインからの「上積み分 (<InlineMath math="L_{growth}" />)」のみを担当します。
                                                        これにより、「初速は良かったが、そこからどれだけ伸びるか？」という問いに対して、安定的かつ保守的な予測が可能になります。
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 6. SEASONALITY */}
                        <section id="seasonality" className={`scroll-mt-24 ${activeSection !== 'seasonality' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">6.</span> ロバスト季節性分解 (Robust STL)
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    トレンド成分 <InlineMath math="T_t" /> が求まった後、季節成分 <InlineMath math="S_t" /> を抽出します。
                                    通常の手法では「平均値」を用いますが、本エンジンでは異常値の影響を排除するため<strong>「中央値 (Median)」</strong>を使用します。
                                </p>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm my-6">
                                    <h4 className="font-bold text-slate-800 text-xs uppercase mb-4">アルゴリズム詳細</h4>
                                    <ol className="list-decimal pl-5 space-y-3 text-xs">
                                        <li>
                                            <strong>比率計算:</strong> すべてのデータ点について、実績とトレンドの比率 <InlineMath math="R_t = y_{obs}[t] / y_{trend}[t]" /> を計算する。
                                        </li>
                                        <li>
                                            <strong>月別グルーピング:</strong> <InlineMath math="R_t" /> を1月〜12月の月ごとにバケット分けする。
                                        </li>
                                        <li>
                                            <strong>中央値抽出:</strong> 各月のバケットから中央値を取得する。<br/>
                                            <InlineMath math="S_{raw}[m] = \text{Median}(\{R_t \mid \text{month}(t) = m\})" />
                                        </li>
                                        <li>
                                            <strong>正規化:</strong> 12ヶ月の合計が12になるよう（平均1.0になるよう）スケーリングする。<br/>
                                            <InlineMath math="S_{final}[m] = S_{raw}[m] \times \frac{12}{\sum S_{raw}}" />
                                        </li>
                                    </ol>
                                </div>
                                <p className="text-xs text-slate-500">
                                    これにより、例えば「たまたま大雪で客が来なかった2月」のデータが1つあっても、毎年の「2月の季節指数」が不当に引き下げられることを防ぎます。
                                </p>
                            </div>
                        </section>

                        {/* 7. NUDGE (Updated Logic) */}
                        <section id="nudge" className={`scroll-mt-24 ${activeSection !== 'nudge' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">7.</span> 適応型Nudge (直近補正ロジック)
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    ロジスティック曲線は長期的な「あるべき姿」を描きますが、直近の売上トレンド（販促効果、競合影響など）を即座には反映しません。
                                    現場での実用性を高めるため、モデルと実績の乖離（残差）を<strong>「Nudge（補正項）」</strong>として将来予測に加算します。
                                    <code>analysisEngine.ts</code> では、データ蓄積量に応じて計算ロジックを厳密に切り替えています。
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                                    <div className="border-l-4 border-red-400 pl-4 py-2">
                                        <div className="text-[10px] font-black uppercase text-red-400">Phase 1: 萌芽期</div>
                                        <div className="text-sm font-bold text-slate-800"><InlineMath math="N < 6" /></div>
                                        <div className="text-xs mt-1 font-mono bg-slate-100 p-1">Nudge = Residual[last]</div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            データが少なすぎるため、トレンドなど読めない。理論値よりも「直近の実績」を正とし、強制的にグラフを接続する（Force Connect）。
                                        </p>
                                    </div>
                                    <div className="border-l-4 border-orange-400 pl-4 py-2">
                                        <div className="text-[10px] font-black uppercase text-orange-400">Phase 2: 成長期</div>
                                        <div className="text-sm font-bold text-slate-800"><InlineMath math="6 \le N < 12" /></div>
                                        <div className="text-xs mt-1 font-mono bg-slate-100 p-1">Nudge = Avg(Res[-3:])</div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            単月のノイズを緩和するため、直近3ヶ月の単純平均を採用する。
                                        </p>
                                    </div>
                                    <div className="border-l-4 border-blue-600 pl-4 py-2 bg-blue-50/50">
                                        <div className="text-[10px] font-black uppercase text-blue-600">Phase 3: 安定期</div>
                                        <div className="text-sm font-bold text-slate-800"><InlineMath math="N \ge 12" /></div>
                                        <div className="text-xs mt-1 font-mono bg-white border border-blue-200 p-1">
                                            Nudge = WeightedAvg(3)
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            直近のトレンド変化に追随するため、<strong>直近3ヶ月の加重平均（直近月50%、前月30%、前々月20%）</strong>を採用する。
                                            トリム平均は廃止し、直近実績へのアンカリングを強化。
                                        </p>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 text-sm mt-6 mb-2">減衰係数 (AR1 Decay)</h4>
                                <p>
                                    Nudgeの効果は永続しません。その持続性を測るため、直近12ヶ月の残差系列の<strong>自己相関係数 (Lag-1 Autocorrelation)</strong> を計算し、減衰率 <InlineMath math="d" /> とします（<InlineMath math="0 \le d \le 0.9" />）。
                                    これにより、予測値は時間とともに徐々に「本来のロジスティック曲線」へと回帰していきます。
                                </p>
                            </div>
                        </section>

                        {/* 8. SYNTHESIS */}
                        <section id="synthesis" className={`scroll-mt-24 ${activeSection !== 'synthesis' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">8. 最終予測式の合成</span>
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    以上の全コンポーネントを統合し、将来時点 <InlineMath math="t" /> における予測値 <InlineMath math="\hat{y}_t" /> は以下の式で算出されます。
                                </p>

                                <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl my-8 font-mono text-center text-lg md:text-xl">
                                    <BlockMath math="\hat{y}_t = \underbrace{f_{logistic}(t)}_{\text{Trend}} \times \underbrace{S_{m(t)}}_{\text{Season}} + \underbrace{\text{Nudge} \times d^t}_{\text{Adaptation}}" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-center">
                                    <div className="p-4 bg-white border border-slate-200 rounded-lg">
                                        <div className="font-bold text-[#005EB8] mb-1">Long-term Trend</div>
                                        店舗のポテンシャルと成長カーブに基づく、長期的・構造的な予測値。
                                    </div>
                                    <div className="p-4 bg-white border border-slate-200 rounded-lg">
                                        <div className="font-bold text-green-600 mb-1">Seasonal Cycle</div>
                                        月ごとの繁忙・閑散パターンによる補正。
                                    </div>
                                    <div className="p-4 bg-white border border-slate-200 rounded-lg">
                                        <div className="font-bold text-purple-600 mb-1">Short-term Adaptive</div>
                                        直近の好不調を反映し、時間とともに減衰する補正項。
                                    </div>
                                </div>
                            </div>
                        </section>

                    </div>

                    <div className="mt-24 pt-10 border-t border-slate-200 text-center">
                        <p className="text-xs text-slate-400 font-mono">
                            Specification generated based on source code: <code>services/analysisEngine.ts</code><br/>
                            Last Validated: v10.9 (Relaxed Constraints for Growth Potential)
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ModelLogicView;
