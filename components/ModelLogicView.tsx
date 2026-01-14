
import React, { useState } from 'react';

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('intro');

    const sections = [
        { id: 'intro', title: '0. はじめに' },
        { id: 'core', title: '1. コア・アルゴリズム' },
        { id: 'startup', title: '2. 新規店推定ロジック' },
        { id: 'nudge', title: '3. 直近接続・補正 (Nudge)' },
        { id: 'seasonality', title: '4. 季節性・構造変化' },
        { id: 'stats', title: '5. 統計的評価指標' },
    ];

    return (
        <div className="absolute inset-0 overflow-y-auto bg-slate-50 text-slate-800 font-sans">
            <div className="flex flex-col md:flex-row min-h-full">
                {/* TOC Sidebar */}
                <div className="w-full md:w-64 bg-white border-r border-gray-200 p-6 flex-shrink-0 sticky top-0 h-auto md:h-screen overflow-y-auto z-10">
                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 font-display">Contents</div>
                    <nav className="space-y-1">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-xs font-bold transition-all ${activeSection === s.id ? 'bg-[#005EB8] text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                {s.title}
                            </button>
                        ))}
                    </nav>
                    <div className="mt-8 pt-8 border-t border-gray-100">
                        <div className="text-[10px] font-black text-gray-400 uppercase mb-2">Algorithm Version</div>
                        <div className="text-xl font-black text-slate-800 font-display">v10.7.2</div>
                        <div className="text-[10px] text-slate-500 mt-1">Enterprise Stable<br/>Trimmed-Mean Nudge</div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-8 md:p-16 max-w-5xl">
                    
                    {/* Header */}
                    <header className="mb-16 border-b-4 border-[#005EB8] pb-8">
                        <h1 className="text-3xl md:text-4xl font-black text-[#005EB8] font-display uppercase tracking-tight mb-4">
                            QB-LGM 予測モデル仕様書
                            <span className="block text-lg text-slate-500 font-medium normal-case mt-2 tracking-normal">QB House Logistic Growth Model Specification</span>
                        </h1>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                            本ドキュメントは、QB HOUSEの店舗売上予測システムに搭載された独自アルゴリズム「QB-LGM」の数理的詳細、パラメータ定義、および例外処理ロジックを定義するものです。<br/>
                            本モデルは、理美容業界特有の「商圏飽和（Capacity）」と「S字成長（Sigmoid Growth）」を前提とし、統計的アプローチとヒューリスティックな補正を組み合わせたハイブリッドモデルです。
                        </p>
                    </header>

                    {/* 0. INTRO */}
                    {activeSection === 'intro' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-[#005EB8]">0.</span> 設計思想と適用範囲
                                </h2>
                                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <h3 className="font-bold text-slate-800 mb-2 border-l-4 border-[#005EB8] pl-3">なぜ「時系列SARIMA」ではないのか？</h3>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                一般的な時系列モデル（ARIMAなど）は、「過去の変動が未来も続く」という前提に立ちますが、店舗ビジネスには物理的な限界（席数・商圏人口）が存在します。<br/>
                                                単純な時系列モデルでは、成長期に「無限に売上が伸びる」誤った予測をしがちです。<br/>
                                                本システムでは、生物の個体数増加などで用いられる<strong>「ロジスティック成長モデル」</strong>をベースに採用することで、「成長はいずれ鈍化し、飽和点(L)に達する」という現実的な予測を実現しています。
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 mb-2 border-l-4 border-orange-500 pl-3">エンタープライズ要件への対応</h3>
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                学術的な正確さよりも、ビジネス現場での「納得感」と「安全性」を優先しています。<br/>
                                                特に、データ不足時の暴走を防ぐための<strong>制約付き最適化</strong>や、直近トレンドへの追従性を高めるための<strong>適応型Nudge（ナッジ）ロジック</strong>など、実運用に特化したカスタマイズが施されています。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* 1. CORE ALGORITHM */}
                    {activeSection === 'core' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-[#005EB8]">1.</span> コア・アルゴリズム (数理モデル)
                                </h2>

                                {/* Formula Card */}
                                <div className="bg-slate-800 text-white p-8 rounded-2xl shadow-lg mb-8 font-mono">
                                    <div className="text-xs text-slate-400 mb-2 uppercase tracking-widest">Base Formula</div>
                                    <div className="text-xl md:text-2xl font-bold mb-6 overflow-x-auto">
                                        y(t) = L / (1 + exp(-k * (t - t0)))
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                                        <div>
                                            <span className="text-blue-400 font-bold">L (Limit)</span>
                                            <p className="text-slate-300 mt-1">潜在需要・飽和点。<br/>店舗が到達しうる売上の上限値。</p>
                                        </div>
                                        <div>
                                            <span className="text-orange-400 font-bold">k (Growth Rate)</span>
                                            <p className="text-slate-300 mt-1">成長速度係数。<br/>立ち上がりの鋭さを決定する。</p>
                                        </div>
                                        <div>
                                            <span className="text-green-400 font-bold">t0 (Midpoint)</span>
                                            <p className="text-slate-300 mt-1">成長変曲点。<br/>成長率が最大となる時期。</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 mb-4">パラメータ最適化プロセス (Optimization)</h3>
                                        <p className="text-sm text-slate-600 mb-4">
                                            観測データ y<sub>obs</sub> とモデル予測値 y<sub>pred</sub> の二乗誤差和 (SSE) を最小化するパラメータセット (L, k, t<sub>0</sub>) を探索します。<br/>
                                            探索アルゴリズムには、微分不可能な局面でも堅牢に動作する<strong>Nelder-Mead法（滑降シンプレックス法）</strong>を採用しています。
                                        </p>
                                        <div className="bg-slate-50 p-4 rounded border border-slate-200 font-mono text-xs text-slate-600">
                                            Objective: Minimize Σ (y_obs[t] - y_pred[t])^2<br/>
                                            Subject to:<br/>
                                            &nbsp;&nbsp;L {'>'} 0 (売上は正の値)<br/>
                                            &nbsp;&nbsp;0.001 {'<'} k {'<'} 5.0 (現実的な成長速度の範囲)
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 mb-4">ロバスト化のための外れ値除去</h3>
                                        <p className="text-sm text-slate-600 mb-4">
                                            最適化を行う前に、四分位範囲 (IQR) を用いた外れ値除去を実行します。<br/>
                                            これにより、台風や突発的な休業などによる異常値が、全体のトレンドライン（特にLの推定）を歪めることを防ぎます。
                                        </p>
                                        <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                                            <li>Lower Bound: Q1 - 1.5 * IQR</li>
                                            <li>Upper Bound: Q3 + 1.5 * IQR</li>
                                        </ul>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* 2. STARTUP LOGIC */}
                    {activeSection === 'startup' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-orange-500">2.</span> 新規店・データ不足時の推定ロジック
                                </h2>
                                
                                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl mb-8">
                                    <h3 className="font-bold text-orange-800 mb-2 flex items-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                        「少数の法則」の回避
                                    </h3>
                                    <p className="text-sm text-orange-900 leading-relaxed">
                                        データ数が12ヶ月未満の店舗において、単独のデータだけで3つのパラメータ(L, k, t0)を最適化しようとすると、過学習（Overfitting）が発生し、非現実的な成長率(k)が算出されるリスクがあります。<br/>
                                        本システムでは、これを防ぐために<strong>「アンサンブル学習的アプローチ（集合知）」</strong>を採用しています。
                                    </p>
                                </div>

                                <div className="space-y-8">
                                    <div className="flex gap-4 items-start">
                                        <div className="bg-slate-800 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">全社標準成長率 (Global K) の算出</h4>
                                            <p className="text-sm text-slate-600 mt-2">
                                                まず、データが十分にある全既存店（稼働中かつ12ヶ月以上）に対してモデル適合を行い、それぞれの成長率 $k$ を算出します。<br/>
                                                これらの $k$ の分布から<strong>中央値 (Median)</strong> を抽出し、これを「QB HOUSEにおける標準的な成長速度」と定義します。
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 items-start">
                                        <div className="bg-slate-800 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">制約付き最適化 (Constrained Optimization)</h4>
                                            <p className="text-sm text-slate-600 mt-2">
                                                新規店に対しては、$k$ を上記の「全社標準値」に固定します。<br/>
                                                自由度を減らし、残りのパラメータ $L$（その店の規模ポテンシャル）と $t_0$（開始時期）のみを最適化することで、
                                                データが少ない状態でも安定的かつ納得感のある予測カーブを描きます。
                                            </p>
                                            <div className="bg-slate-100 p-3 mt-3 rounded border border-slate-200 font-mono text-xs text-slate-600">
                                                Startups (N {'<'} 12):<br/>
                                                k = fixed (Global Median K)<br/>
                                                Optimize only (L, t0)
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* 3. NUDGE LOGIC (Updated) */}
                    {activeSection === 'nudge' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-[#005EB8]">3.</span> 直近接続・補正ロジック (The Nudge)
                                </h2>
                                
                                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8">
                                    <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                                        ロジスティック曲線は「滑らかな理想線」を描くため、直近の急激な変化（販促効果や競合出店など）にすぐには反応しません。<br/>
                                        実務上は「直近の売上」を起点に予測してほしいため、モデル値と実績値の乖離（残差）を<strong>「Nudge（補正項）」</strong>として将来予測に加算します。<br/>
                                        v10.7では、データの蓄積期間に応じてNudgeの算出方法を厳密に切り分けるロジックを導入しました。
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Phase 1 */}
                                        <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                                            <div className="text-xs font-black text-slate-400 uppercase mb-2">Phase 1: 萌芽期</div>
                                            <div className="font-black text-lg text-slate-800 mb-1">Force Connect</div>
                                            <div className="text-xs font-bold text-slate-500 mb-3">データ数 6ヶ月未満</div>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                <strong>「最新月の残差」をそのまま採用。</strong><br/>
                                                データが少なすぎてトレンドが読めないため、理論値よりも「直近の実績」を正として、強制的にグラフを接続します。
                                            </p>
                                            <div className="mt-3 bg-white p-2 rounded border border-slate-200 font-mono text-[10px] text-blue-600">
                                                Nudge = Residual[last]
                                            </div>
                                        </div>

                                        {/* Phase 2 */}
                                        <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                                            <div className="text-xs font-black text-slate-400 uppercase mb-2">Phase 2: 成長期</div>
                                            <div className="font-black text-lg text-slate-800 mb-1">Recent Average</div>
                                            <div className="text-xs font-bold text-slate-500 mb-3">データ数 6〜11ヶ月</div>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                <strong>「直近3ヶ月の単純平均」を採用。</strong><br/>
                                                単月のブレ（ノイズ）を少し均しつつ、直近のトレンドを反映させます。
                                            </p>
                                            <div className="mt-3 bg-white p-2 rounded border border-slate-200 font-mono text-[10px] text-blue-600">
                                                Nudge = Avg(Res[-3]...Res[-1])
                                            </div>
                                        </div>

                                        {/* Phase 3 */}
                                        <div className="border-2 border-[#005EB8] rounded-xl p-5 bg-blue-50 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 bg-[#005EB8] text-white text-[9px] px-2 py-1 font-bold">Recommended</div>
                                            <div className="text-xs font-black text-blue-400 uppercase mb-2">Phase 3: 安定期</div>
                                            <div className="font-black text-lg text-[#005EB8] mb-1">Trimmed Mean</div>
                                            <div className="text-xs font-bold text-blue-500 mb-3">データ数 12ヶ月以上</div>
                                            <p className="text-xs text-slate-700 leading-relaxed">
                                                <strong>「直近6ヶ月のトリム平均」を採用。</strong><br/>
                                                直近6ヶ月の残差から「最大値」と「最小値」を除外し、残る4ヶ月分の平均をとります。
                                                突発的な異常値の影響を完全に排除し、真の実力値を抽出します。
                                            </p>
                                            <div className="mt-3 bg-white p-2 rounded border border-blue-200 font-mono text-[10px] text-blue-600">
                                                Nudge = Avg(ExcludeMinMax(Res[-6:]))
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-2">自己相関による減衰 (AR1 Decay)</h3>
                                    <p className="text-sm text-slate-600">
                                        Nudge（補正値）は未来永劫続くわけではありません。キャンペーン効果などは時間とともに薄れます。<br/>
                                        その「効果の持続性」を測るために、残差系列の<strong>ラグ1の自己相関係数 (Autocorrelation)</strong> を計算します。<br/>
                                        この係数を減衰率として乗算することで、予測値は時間とともに徐々に「本来のロジスティック曲線（実力値）」へと収束していきます。
                                    </p>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* 4. SEASONALITY & STRUCTURE */}
                    {activeSection === 'seasonality' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-[#005EB8]">4.</span> 季節性分解と構造変化検知
                                </h2>

                                <div className="space-y-8">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-3 border-l-4 border-green-500 pl-3">ロバストな季節指数の抽出 (Median Decomposition)</h3>
                                        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                                            通常のSTL分解では平均値を使いますが、本モデルでは異常値に強い<strong>中央値 (Median)</strong> を採用しています。<br/>
                                            各月（1月〜12月）について、「実績値 ÷ トレンド値」の比率を計算し、その中央値を季節指数とします。
                                            これにより、例えば「たまたま大雪で客が来なかった2月」のデータがあっても、毎年の「2月の季節指数」が不当に下がることを防ぎます。
                                        </p>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-3 border-l-4 border-purple-500 pl-3">構造変化の自動検知 (Structural Break Detection)</h3>
                                        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                                            COVID-19（2020年4月前後）などの外部ショックにより、店舗のポテンシャル(L)自体が変化してしまうケースがあります。<br/>
                                            本システムでは、以下の2つのモデルを作成し、<strong>AIC (赤池情報量基準)</strong> が低い（より当てはまりの良い）方を自動採用します。
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="font-bold text-slate-700 mb-1">Standard Model</div>
                                                <div className="text-xs text-slate-500 mb-2">変化なし</div>
                                                <p className="text-xs text-slate-600">全期間を通じて1つの $L$ で説明するモデル。</p>
                                            </div>
                                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 shadow-sm">
                                                <div className="font-bold text-purple-700 mb-1">Shift Model</div>
                                                <div className="text-xs text-purple-500 mb-2">構造変化あり</div>
                                                <p className="text-xs text-slate-600">
                                                    ショック時点を境に、L<sub>pre</sub> と L<sub>post</sub> の2つの上限値を持つモデル。<br/>
                                                    AICが Standard より2以上低い場合にのみ採用され、過剰な複雑化を防ぎます。
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* 5. STATS */}
                    {activeSection === 'stats' && (
                        <div className="animate-fadeIn space-y-12">
                            <section>
                                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                    <span className="text-[#005EB8]">5.</span> 統計的評価指標
                                </h2>
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="px-6 py-3">指標</th>
                                                <th className="px-6 py-3">定義・数式</th>
                                                <th className="px-6 py-3">ビジネス上の解釈</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr>
                                                <td className="px-6 py-4 font-bold text-slate-800">AIC</td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500">n * ln(SSE/n) + 2k</td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">モデルの当てはまりの良さと複雑さのバランス。「低いほど良い」。</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-4 font-bold text-slate-800">Residual StdDev</td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500">sqrt(SSE / n)</td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">予測誤差の標準偏差。信頼区間（グレーの帯）の幅を決定する。</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-4 font-bold text-slate-800">Trimmed Mean</td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500">Avg(sort(x)[1:-1])</td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">最大値・最小値を除外した平均。外れ値に強い中心傾向の指標。</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-4 font-bold text-slate-800">CV (Coeff. of Variation)</td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500">StdDev / Mean</td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">変動係数。売上の「ブレ」の大きさ。0.1以下なら安定、0.2以上なら不安定。</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    )}

                    <div className="mt-16 pt-8 border-t border-slate-200 text-center">
                        <p className="text-xs text-slate-400 font-mono">
                            Document Generated by QB Forecast AI Engine v10.7.2<br/>
                            Mathematical logic validated for enterprise deployment.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ModelLogicView;
