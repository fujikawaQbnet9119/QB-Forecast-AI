
import React, { useState } from 'react';

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('intro');

    const sections = [
        { id: 'intro', title: '0. イントロダクション & 基本思想' },
        { id: 'preprocessing', title: '1. データ前処理・外れ値検知' },
        { id: 'core_model', title: '2. コア・数理モデル定義' },
        { id: 'optimization', title: '3. パラメータ最適化アルゴリズム' },
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
                        <div className="text-xl font-black text-slate-800 font-display">QB-LGM v10.8</div>
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
                                <span>Decomp</span>
                                <span className="font-mono font-bold">Median-STL</span>
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
                            本モデルは、理美容業界特有の「商圏キャパシティ（物理的上限）」を前提としたロジスティック成長モデルをカーネルとし、実務運用に耐えうる堅牢性（Robustness）を確保するための多数のヒューリスティック補正を包含しています。
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
                                    これにより、「成長はいずれ鈍化し、環境収容力（$L$）に収束する」という現実的な振る舞いを数学的に保証しています。
                                </p>
                                
                                <div className="my-6 p-6 bg-slate-50 rounded-xl border border-slate-200">
                                    <h4 className="font-bold text-slate-800 mb-3 text-xs uppercase">設計上の3つの優先順位</h4>
                                    <ol className="list-decimal pl-5 space-y-2">
                                        <li><strong>解釈可能性 (Explainability):</strong> なぜその予測になったのか、$L$（天井）や$k$（勢い）というパラメータで説明できること。</li>
                                        <li><strong>堅牢性 (Robustness):</strong> 台風、臨時休業、コロナ禍などの「異常値」によって、将来予測全体が歪まないこと。</li>
                                        <li><strong>即応性 (Responsiveness):</strong> 長期トレンドを守りつつも、直近のキャンペーン効果や競合出店の影響（Nudge）を適度に取り込むこと。</li>
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
                                    これらをそのまま学習させるとモデルパラメータ（特に$L$）が不安定になるため、四分位範囲（IQR）を用いたフィルタリングを行います。
                                </p>

                                <div className="bg-slate-800 text-slate-200 p-6 rounded-xl font-mono text-xs my-4 shadow-lg">
                                    <p className="text-slate-400 mb-2">// Code Ref: services/analysisEngine.ts - calculateIQRStats</p>
                                    <p>{`Sorted Data $D_{sorted} = \\text{sort}(D_{raw})$`}</p>
                                    <p>{`第1四分位数 $Q1 = D_{sorted}[0.25 \\times N]$`}</p>
                                    <p>{`第3四分位数 $Q3 = D_{sorted}[0.75 \\times N]$`}</p>
                                    <p>{`四分位範囲 $IQR = Q3 - Q1$`}</p>
                                    <br/>
                                    <p className="text-green-400">// Acceptance Range</p>
                                    <p>{`Lower Bound = $Q1 - 1.5 \\times IQR$`}</p>
                                    <p>{`Upper Bound = $Q3 + 1.5 \\times IQR$`}</p>
                                    <p>{`Mask $M_i = (\\text{Lower} \\le D_i \\le \\text{Upper})$`}</p>
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
                                    <div className="text-2xl font-black text-slate-800 font-display mb-4 text-center">
                                        {`$$ y(t) = \\frac{L}{1 + e^{-k(t - t_0)}} $$`}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs mt-6">
                                        <div>
                                            <span className="font-black text-[#005EB8] block mb-1">L (Carrying Capacity)</span>
                                            潜在需要・飽和点。<br/>{`$t \\to \\infty$ における売上の収束値。店舗の物理的上限を示唆する。`}
                                        </div>
                                        <div>
                                            <span className="font-black text-orange-500 block mb-1">k (Growth Rate)</span>
                                            成長速度係数。<br/>立ち上がりの鋭さ。$0.1$ 前後が標準的。大きいほど短期間で上限に達する。
                                        </div>
                                        <div>
                                            <span className="font-black text-slate-500 block mb-1">t0 (Midpoint)</span>
                                            変曲点。<br/>成長率が最大となる（売上の伸びが最も激しい）時期。
                                        </div>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 mt-8 mb-2">Shift Model (構造変化モデル)</h4>
                                <p>
                                    コロナ禍や近隣競合の出退店により、環境収容力（$L$）そのものが変化するケースに対応するため、
                                    特定の時点（{`$t_{shock}$`}）を境に $L$ が遷移する拡張モデルを定義しています。
                                </p>
                                <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs my-2 border border-slate-200">
                                    {`IF t < t_shock:`}<br/>
                                    &nbsp;&nbsp;{`y(t) = L_pre / (1 + e^(-k(t - t0)))`}<br/>
                                    ELSE:<br/>
                                    &nbsp;&nbsp;{`y(t) = L_post / (1 + e^(-k(t - t0)))`}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    ※ {`$t_{shock}$`} は「2020年4月」などの固定イベント、またはデータから自動検出されます。
                                </p>
                            </div>
                        </section>

                        {/* 3. OPTIMIZATION */}
                        <section id="optimization" className={`scroll-mt-24 ${activeSection !== 'optimization' ? 'hidden' : ''}`}>
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-[#005EB8] font-display">3.</span> パラメータ最適化アルゴリズム
                            </h2>
                            <div className="prose prose-sm max-w-none text-slate-600">
                                <p>
                                    観測データに対し、モデルの予測誤差（残差平方和 SSE）を最小化するパラメータセット {`$\\theta = \\{L, k, t_0\\}$`} を探索します。
                                    ロジスティック関数は非線形であり、単純な最小二乗法では解けません。また、勾配法（Gradient Descent）は局所解に陥りやすい問題があります。
                                </p>
                                <p>
                                    そのため、本エンジンでは微分不要で大域的な探索に強い<strong>Nelder-Mead法（滑降シンプレックス法）</strong>を実装して使用しています。
                                </p>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm my-6 space-y-4">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-xs uppercase mb-2">目的関数 (Objective Function)</h4>
                                        <div className="font-mono text-xs bg-slate-50 p-3 rounded">
                                            {`Minimize $J(\\theta) = \\frac{1}{N} \\sum_{i=1}^{N} (y_{obs}[i] - y_{model}(t_i, \\theta))^2$`}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-xs uppercase mb-2">制約条件 (Constraints)</h4>
                                        <p className="text-xs mb-2">{`探索空間において、以下の条件を満たさないパラメータは即座にペナルティ（$10^{15}$）を与え、解から除外します。`}</p>
                                        <ul className="list-disc pl-5 text-xs font-mono space-y-1">
                                            <li>{`$L > 0$ (売上が負になることはない)`}</li>
                                            <li>{`$0.001 < k < 5.0$ (現実的な成長速度の範囲内であること)`}</li>
                                        </ul>
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
                                        <p className="text-xs font-mono text-slate-500 mb-2">{`Params: 3 ($L, k, t_0$)`}</p>
                                        <div className="text-xs bg-white p-2 rounded border border-slate-200">
                                            {`$AIC_{std} = N \\ln(SSE/N) + 2 \\times 3$`}
                                        </div>
                                    </div>
                                    <div className="bg-purple-50 p-5 rounded-xl border border-purple-200">
                                        <h4 className="font-bold text-purple-700 mb-2">Shift Model</h4>
                                        <p className="text-xs font-mono text-purple-500 mb-2">{`Params: 4 ($L_{pre}, L_{post}, k, t_0$)`}</p>
                                        <div className="text-xs bg-white p-2 rounded border border-purple-100">
                                            {`$AIC_{shift} = N \\ln(SSE/N) + 2 \\times 4$`}
                                        </div>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 text-sm mb-2">採用ロジック</h4>
                                <p className="text-xs font-mono bg-slate-800 text-white p-4 rounded-lg">
                                    {`IF ($AIC_{shift} < AIC_{std} - 2.0$):`}<br/>
                                    &nbsp;&nbsp;ADOPT Shift Model<br/>
                                    ELSE:<br/>
                                    &nbsp;&nbsp;ADOPT Standard Model
                                </p>
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
                                    データ数が少ない（$N &lt; 12$）新規店において、3つのパラメータを同時に最適化しようとすると解が安定しません。
                                    特に $k$（成長率）が極端な値になり、非現実的な予測線を描く問題が発生します。
                                    これを防ぐため、<strong>「全社統計の注入（Global Prior Injection）」</strong>を行います。
                                </p>

                                <div className="space-y-6 my-6">
                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">A</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">全社標準 $k$ の算出 (75th Percentile)</h4>
                                            <p className="text-xs mt-1">
                                                <code>DataView.tsx</code> 内で、データ数が十分にある「成熟店舗」の $k$ を集計します。
                                                この際、平均値や中央値ではなく<strong>「75パーセンタイル値」</strong>を採用します。
                                                これは、生き残っている（分析対象となる）成熟店舗は、そもそも立ち上がりが成功した（$k$が高い）店舗であるという生存者バイアスを考慮し、
                                                新規店に対して「やや楽観的だが現実的」な期待値を設定するためです。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">B</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">制約付き最適化 (Constrained Optimization)</h4>
                                            <p className="text-xs mt-1">
                                                新規店に対しては、$k$ を上記の全社標準値に<strong>固定</strong>します。
                                                自由度を減らし、残りの $L$ と $t_0$ のみを最適化することで、わずか3〜4ヶ月のデータでも安定した予測カーブを描くことが可能になります。
                                            </p>
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
                                    トレンド成分 $T_t$ が求まった後、季節成分 $S_t$ を抽出します。
                                    通常の手法では「平均値」を用いますが、本エンジンでは異常値の影響を排除するため<strong>「中央値 (Median)」</strong>を使用します。
                                </p>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm my-6">
                                    <h4 className="font-bold text-slate-800 text-xs uppercase mb-4">アルゴリズム詳細</h4>
                                    <ol className="list-decimal pl-5 space-y-3 text-xs">
                                        <li>
                                            <strong>比率計算:</strong> {`すべてのデータ点について、実績とトレンドの比率 $R_t = y_{obs}[t] / y_{trend}[t]$ を計算する。`}
                                        </li>
                                        <li>
                                            <strong>月別グルーピング:</strong> {`$R_t$ を1月〜12月の月ごとにバケット分けする。`}
                                        </li>
                                        <li>
                                            <strong>中央値抽出:</strong> {`各月のバケットから中央値を取得する。`}<br/>
                                            {`$S_{raw}[m] = \\text{Median}(\\{R_t \\mid \\text{month}(t) = m\\})`}
                                        </li>
                                        <li>
                                            <strong>正規化:</strong> {`12ヶ月の合計が12になるよう（平均1.0になるよう）スケーリングする。`}<br/>
                                            {`$S_{final}[m] = S_{raw}[m] \\times \\frac{12}{\\sum S_{raw}}`}
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
                                        <div className="text-sm font-bold text-slate-800">{`N < 6`}</div>
                                        <div className="text-xs mt-1 font-mono bg-slate-100 p-1">Nudge = Residual[last]</div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            データが少なすぎるため、トレンドなど読めない。理論値よりも「直近の実績」を正とし、強制的にグラフを接続する（Force Connect）。
                                        </p>
                                    </div>
                                    <div className="border-l-4 border-orange-400 pl-4 py-2">
                                        <div className="text-[10px] font-black uppercase text-orange-400">Phase 2: 成長期</div>
                                        <div className="text-sm font-bold text-slate-800">{`6 <= N < 12`}</div>
                                        <div className="text-xs mt-1 font-mono bg-slate-100 p-1">Nudge = Avg(Res[-3:])</div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            単月のノイズを緩和するため、直近3ヶ月の単純平均を採用する。
                                        </p>
                                    </div>
                                    <div className="border-l-4 border-blue-600 pl-4 py-2 bg-blue-50/50">
                                        <div className="text-[10px] font-black uppercase text-blue-600">Phase 3: 安定期</div>
                                        <div className="text-sm font-bold text-slate-800">{`N >= 12`}</div>
                                        <div className="text-xs mt-1 font-mono bg-white border border-blue-200 p-1">Nudge = TrimmedMean(Res[-6:])</div>
                                        <p className="text-[10px] text-slate-500 mt-2">
                                            直近6ヶ月から最大値と最小値を除去し、残り4ヶ月の平均をとる。異常値の影響を完全に排除し、真の実力乖離を抽出する。
                                        </p>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 text-sm mt-6 mb-2">減衰係数 (AR1 Decay)</h4>
                                <p>
                                    Nudgeの効果は永続しません。その持続性を測るため、直近12ヶ月の残差系列の<strong>自己相関係数 (Lag-1 Autocorrelation)</strong> を計算し、減衰率 $d$ とします（{`$0 \\le d \\le 0.9$`}）。
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
                                    以上の全コンポーネントを統合し、将来時点 $t$ における予測値 {`$\\hat{y}_t$`} は以下の式で算出されます。
                                </p>

                                <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl my-8 font-mono text-center text-lg md:text-xl">
                                    {`$$ \\hat{y}_t = \\underbrace{f_{logistic}(t)}_{\\text{Trend}} \\times \\underbrace{S_{m(t)}}_{\\text{Season}} + \\underbrace{\\text{Nudge} \\times d^t}_{\\text{Adaptation}} $$`}
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
                            Last Validated: v10.8 (Trimmed-Mean Nudge Implementation)
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ModelLogicView;
