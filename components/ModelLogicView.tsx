
import React, { useState } from 'react';
import * as katexLib from 'katex';

// Handle potential ESM default export or CommonJS module.exports from esm.sh
const katex = (katexLib as any).default || katexLib;
const renderToString = katex.renderToString;

const BlockMath = ({ math }: { math: string }) => {
    const html = renderToString(math, { displayMode: true, throwOnError: false });
    return <div dangerouslySetInnerHTML={{ __html: html }} className="overflow-x-auto overflow-y-hidden my-4" />;
};

const InlineMath = ({ math }: { math: string }) => {
    const html = renderToString(math, { displayMode: false, throwOnError: false });
    return <span dangerouslySetInnerHTML={{ __html: html }} className="mx-1 font-mono text-sm bg-slate-100 px-1 rounded" />;
};

const SectionHeader = ({ number, title, sub }: { number: string, title: string, sub: string }) => (
    <div className="mb-8 border-b border-slate-200 pb-4 mt-12">
        <div className="flex items-center gap-3 mb-1">
            <span className="bg-[#005EB8] text-white font-display font-black text-lg w-8 h-8 rounded-lg flex items-center justify-center shadow-md shadow-blue-200">{number}</span>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h2>
        </div>
        <p className="text-sm text-slate-500 font-bold ml-11">{sub}</p>
    </div>
);

const Callout = ({ title, children, type = 'info' }: { title: string, children?: React.ReactNode, type?: 'info' | 'warning' | 'math' }) => {
    const colors = {
        info: 'bg-blue-50 border-blue-100 text-blue-900',
        warning: 'bg-orange-50 border-orange-100 text-orange-900',
        math: 'bg-slate-50 border-slate-200 text-slate-700'
    };
    return (
        <div className={`p-6 rounded-xl border ${colors[type]} my-6 shadow-sm`}>
            <h4 className="font-black text-xs uppercase tracking-widest mb-3 opacity-70 border-b border-current pb-1 inline-block">{title}</h4>
            <div className="text-sm leading-relaxed font-medium">
                {children}
            </div>
        </div>
    );
};

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('lifecycle');

    const sections = [
        { id: 'intro', title: '0. 予測エンジンの基本思想' },
        { id: 'lifecycle', title: '1. ライフサイクル制御 (3 Stages)' },
        { id: 'models', title: '2. 採用モデルの定義と違い' },
        { id: 'optimization', title: '3. パラメータ最適化と正則化' },
        { id: 'nudge', title: '4. Nudge & Decay (直近補正)' },
        { id: 'covid', title: '5. コロナ/構造変化の検知ロジック' }
    ];

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-slate-800 font-sans">
            <div className="flex flex-col lg:flex-row min-h-full">
                {/* Fixed TOC Sidebar */}
                <div className="w-full lg:w-80 bg-white border-r border-gray-200 p-6 flex-shrink-0 sticky top-0 h-auto lg:h-screen overflow-y-auto z-10 shadow-sm">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 font-display">Technical Whitepaper</div>
                    <nav className="space-y-2">
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
                        <div className="text-[10px] font-black text-gray-400 uppercase mb-2">Algorithm Version</div>
                        <div className="text-2xl font-black text-slate-800 font-display">QB-LGM v15.2</div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            Probabilistic Incremental Logistic Model<br/>
                            with 3-Stage Lifecycle Control.
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-8 lg:p-16 max-w-5xl mx-auto">
                    
                    <header className="mb-16">
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 font-display uppercase tracking-tight mb-4 leading-tight">
                            予測モデル仕様書 & アルゴリズム解説
                            <span className="block text-lg text-slate-500 font-medium normal-case mt-2 tracking-normal font-sans">
                                Technical Specification of Prediction Engine
                            </span>
                        </h1>
                        <p className="text-sm text-slate-600 leading-loose max-w-3xl">
                            本システムは、単なる時系列延長（ARIMA等）ではなく、店舗ビジネス特有の「成長の限界（商圏キャパシティ）」と「構造変化（Shift）」を数学的に記述する
                            <strong>「増分ロジスティック成長モデル (Incremental Logistic Growth Model)」</strong>を採用しています。
                            以下にその詳細なロジックを開示します。
                        </p>
                    </header>

                    <div className="space-y-24">

                        {/* SECTION 0: INTRO */}
                        <section id="intro" className={activeSection === 'intro' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="00" title="予測エンジンの基本思想" sub="物理的制約への準拠" />
                            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
                                <p>
                                    店舗売上は無限に伸びることはありません。席数、スタイリスト数、商圏人口による物理的な上限（<InlineMath math="L" />）が存在します。
                                    本エンジンは、この「S字カーブ（ロジスティック曲線）」を基本骨格とし、そこに現実世界のノイズや構造変化を組み込むアプローチをとっています。
                                </p>
                                <Callout title="基本方程式 (Logistic Function)" type="math">
                                    <BlockMath math="y(t) = \text{Base} + \frac{L}{1 + e^{-k(t - t_0)}}" />
                                    <ul className="list-disc pl-5 mt-4 space-y-1 text-slate-600">
                                        <li><InlineMath math="\text{Base}" />: オープン初期から存在する基礎需要。ゼロスタート問題を防ぐために導入。</li>
                                        <li><InlineMath math="L" /> (Carrying Capacity): 純増分のポテンシャル上限。</li>
                                        <li><InlineMath math="k" /> (Growth Rate): 成長速度。立ち上がりの鋭さ。</li>
                                        <li><InlineMath math="t_0" /> (Inflection Point): 成長の変曲点（ピーク時期）。</li>
                                    </ul>
                                </Callout>
                            </div>
                        </section>

                        {/* SECTION 1: LIFECYCLE (THE CORE REQUEST) */}
                        <section id="lifecycle" className={activeSection === 'lifecycle' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="01" title="ライフサイクル制御 (3 Stages)" sub="データ量に応じたモデル適用の段階的変化" />
                            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
                                <p>
                                    予測モデルにおいて最も重要なのは<strong>「データ不足時の過学習（Overfitting）を防ぐこと」</strong>です。
                                    オープン直後の店舗に複雑なモデルを当てはめると、わずかなノイズを「急成長」や「急減速」と誤認し、異常な予測値を叩き出します。
                                    これを防ぐため、本エンジンは店舗の稼働期間（データ点数 <InlineMath math="N" />）に応じて、適用するロジックを厳密に切り替えています。
                                </p>

                                <div className="space-y-8 mt-8">
                                    {/* STAGE 1 */}
                                    <div className="bg-white p-6 rounded-2xl border border-orange-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-2 h-full bg-orange-400"></div>
                                        <h3 className="text-lg font-black text-orange-600 mb-2">Stage 1: Startup Mode (立ち上げ期)</h3>
                                        <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">適用条件: データ数 &lt; 13ヶ月</p>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <p className="font-bold text-slate-700 mb-2">課題:</p>
                                                <p className="text-slate-600 mb-4">
                                                    S字カーブを描くには情報が足りなすぎます。ここで無理にフィッティングを行うと、<InlineMath math="L=\infty" />（無限成長）や <InlineMath math="k=0" />（成長なし）といった極端な解に陥ります。
                                                </p>
                                                <p className="font-bold text-slate-700 mb-2">解決策: <strong>ベイジアン的アプローチ (事前分布の利用)</strong></p>
                                                <p className="text-slate-600">
                                                    その店独自のパラメータ探索を行わず、<strong>「全社の標準的な成功モデル」</strong>を強制適用します。
                                                    具体的には、全既存店の統計データ（中央値）から導出された <InlineMath math="\hat{L}" /> と <InlineMath math="\hat{k}" /> を使用し、
                                                    その店の初期実績（Base）に合わせてカーブを平行移動させます。
                                                </p>
                                            </div>
                                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 text-xs">
                                                <div className="font-mono text-orange-800 font-bold mb-2">Fixed Parameters:</div>
                                                <ul className="space-y-1 list-disc pl-4 text-orange-700">
                                                    <li><InlineMath math="k = \text{Global Median } k" /> (約0.1)</li>
                                                    <li><InlineMath math="L = \text{Global Median } L" /> (約300万円)</li>
                                                    <li><InlineMath math="t_0 = 12" /> (標準的な変曲点)</li>
                                                </ul>
                                                <div className="mt-3 pt-3 border-t border-orange-200">
                                                    <strong>Nudge補正:</strong><br/>
                                                    直近の実績と標準モデルの乖離（Nudge）を計算し、将来に向けて減衰させながら加算します。これにより、足元の好不調を短期予測に反映させます。
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* STAGE 2 */}
                                    <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                                        <h3 className="text-lg font-black text-blue-600 mb-2">Stage 2: Growth Mode (成長期)</h3>
                                        <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">適用条件: 13ヶ月 &le; データ数 &lt; 36ヶ月</p>
                                        
                                        <p className="text-slate-600 mb-4">
                                            季節性（12ヶ月周期）のデータが揃い、トレンドと季節変動の分離が可能になります。
                                            ここで初めて<strong>Nelder-Mead法によるパラメータ最適化</strong>を解禁します。
                                            ただし、データは依然として少ないため、パラメータ <InlineMath math="k" /> が異常値（物理的にあり得ない急成長など）にならないよう、
                                            目的関数に<strong>「正則化項 (Penalty Term)」</strong>を加え、標準的な値から離れすぎないよう制約をかけます（Soft Constraints）。
                                        </p>
                                    </div>

                                    {/* STAGE 3 */}
                                    <div className="bg-white p-6 rounded-2xl border border-purple-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-2 h-full bg-purple-500"></div>
                                        <h3 className="text-lg font-black text-purple-600 mb-2">Stage 3: Mature / Shift Mode (成熟・構造変化期)</h3>
                                        <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">適用条件: データ数 &ge; 36ヶ月</p>
                                        
                                        <p className="text-slate-600 mb-4">
                                            十分なデータがあるため、制約を緩和し、その店独自のパラメータを自由に探索させます。
                                            さらに、この段階から<strong>「構造変化（Shift）」の検知</strong>が有効になります。
                                            AIC（赤池情報量規準）を用い、単一のS字カーブで説明するよりも、
                                            「途中で前提が変わった（Shiftした）」とみなした方がモデルの質が良い場合、自動的にShiftモデルが採用されます。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 2: MODEL DEFINITIONS */}
                        <section id="models" className={activeSection === 'models' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="02" title="採用モデルの定義と違い" sub="Standard vs Shift vs Recovery" />
                            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
                                <p>
                                    分析エンジンは、以下のモデルの中から、その店舗のデータに最も適合するもの（AICが最小になるもの）を自動選択します。
                                </p>

                                <div className="grid grid-cols-1 gap-6 mt-6">
                                    <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                                        <h4 className="text-base font-black text-[#005EB8] flex items-center gap-2">
                                            <i className="fas fa-chart-line"></i> Standard Model (標準モデル)
                                        </h4>
                                        <p className="text-xs text-gray-400 font-bold mb-2">モード名: 'standard'</p>
                                        <p className="text-slate-600 mb-3">
                                            最も基本的なS字カーブモデルです。
                                            「オープン → 成長 → 成熟」という単一のストーリーで説明できる店舗に適用されます。
                                            外部環境の劇的な変化がなく、順調に推移している店舗はこれになります。
                                        </p>
                                        <BlockMath math="y(t) = \text{Base} + \frac{L}{1 + e^{-k(t - t_0)}}" />
                                    </div>

                                    <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
                                        <h4 className="text-base font-black text-purple-600 flex items-center gap-2">
                                            <i className="fas fa-random"></i> Shift Model (構造変化モデル)
                                        </h4>
                                        <p className="text-xs text-gray-400 font-bold mb-2">モード名: 'shift'</p>
                                        <p className="text-slate-600 mb-3">
                                            ある時点（<InlineMath math="t_{shock}" />）を境に、売上のベースラインが階段状に変化したと仮定するモデルです。
                                            コロナ禍によるダウンシフトや、競合店の撤退によるアップシフトを表現します。
                                            「L（成長余地）が変わった」のではなく「Base（基礎需要）が変わった」と解釈することで、予測の安定性を保ちます。
                                        </p>
                                        <BlockMath math="y(t) = (\text{Base} + \text{Shift} \cdot \mathbb{I}_{t \ge t_{shock}}) + \frac{L}{1 + e^{-k(t - t_0)}}" />
                                        <p className="text-xs text-slate-500 mt-2">
                                            ※ <InlineMath math="\mathbb{I}" /> は指示関数。時刻 <InlineMath math="t" /> がショック発生後なら 1、そうでなければ 0。
                                        </p>
                                    </div>

                                    <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-green-50/50">
                                        <h4 className="text-base font-black text-green-700 flex items-center gap-2">
                                            <i className="fas fa-medkit"></i> Recovery / Rebound (回復・急成長)
                                        </h4>
                                        <p className="text-xs text-gray-400 font-bold mb-2">扱い: 'shift' または High-k 'standard'</p>
                                        <p className="text-slate-600 mb-3">
                                            よくある質問：「V字回復はどう予測されますか？」<br/>
                                            本システムでは、回復を以下の2パターンで認識します。
                                        </p>
                                        <ul className="list-disc pl-5 text-slate-600 space-y-2">
                                            <li>
                                                <strong>Positive Shift:</strong> コロナ明けなどで明確にレベルが上がった場合、プラスのShift項を持つShiftモデルとして扱われます。
                                            </li>
                                            <li>
                                                <strong>High-k Standard:</strong> 落ち込みからのリバウンドが滑らかな場合、新しいBaseからの「再成長（kが高い状態）」としてStandardモデルでフィッティングされます。
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 3: OPTIMIZATION */}
                        <section id="optimization" className={activeSection === 'optimization' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="03" title="パラメータ最適化と正則化" sub="Occam's Razorの実装" />
                            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
                                <p>
                                    パラメータ <InlineMath math="L, k, t_0" /> の決定には、<strong>Nelder-Mead法</strong>（滑降シンプレックス法）を使用しています。
                                    しかし、単に誤差（MSE）を最小化するだけでは、データフィッティングの罠（過学習）に陥ります。
                                    <br/>
                                    例えば、直近の売上がたまたま数ヶ月連続で上がっているだけで、「今後も垂直に伸び続け、月商1億円になる」というモデルが数学的には「誤差最小」になってしまうことがあります。
                                </p>
                                <p>
                                    これを防ぐため、目的関数（Cost Function）に以下の<strong>罰則項（Penalty）</strong>を加えています。
                                </p>

                                <Callout title="目的関数 (Cost Function)" type="math">
                                    <BlockMath math="J(\theta) = \frac{1}{N}\sum (y_{actual} - y_{pred})^2 + \lambda_1 (k)^2 + \lambda_2 \max(0, \frac{L}{L_{max}} - 1.2)^2" />
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                                        <div>
                                            <strong>k-Penalty:</strong><br/>
                                            成長率 <InlineMath math="k" /> が大きくなりすぎることを防ぎます。データが直線的でも、安易に「急成長モデル」を選ばせないようにします。
                                        </div>
                                        <div>
                                            <strong>L-Penalty:</strong><br/>
                                            潜在需要 <InlineMath math="L" /> が、過去の最大実績の1.2倍を大幅に超えることを防ぎます。「夢のような天井」を描かせないための物理的制約です。
                                        </div>
                                    </div>
                                </Callout>

                                <h4 className="font-bold text-slate-800 mt-6 mb-2">AICによるモデル選択</h4>
                                <p>
                                    StandardモデルとShiftモデルのどちらを採用すべきか？
                                    Shiftモデルはパラメータが1つ増えますが、それによるフィッティング精度の向上（SSEの減少）が
                                    AIC（赤池情報量規準）のペナルティ（2k）を上回る場合のみ、Shiftモデルが採用されます。
                                </p>
                                <Callout title="AIC (Akaike Information Criterion)" type="math">
                                    <BlockMath math="AIC = N \ln(\frac{SSE}{N}) + 2k" />
                                    <p className="mt-2 text-xs text-slate-600">
                                        <InlineMath math="k" /> はモデルの自由度（パラメータ数）。<br/>
                                        Shiftモデルは Standardモデルより <InlineMath math="k" /> が1つ大きいため、SSEが十分に小さくならない限り選ばれません。
                                    </p>
                                </Callout>
                            </div>
                        </section>

                        {/* SECTION 4 & 5 Omitted for brevity in this view, but logic is implemented in analysisEngine.ts */}
                        
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModelLogicView;
