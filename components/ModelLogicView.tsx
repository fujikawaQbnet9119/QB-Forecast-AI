
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

const SectionHeader = ({ number, title, sub }: { number: string, title: string, sub: string }) => (
    <div className="mb-6 border-b border-gray-200 pb-4">
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
        <div className={`p-5 rounded-xl border ${colors[type]} my-4 shadow-sm`}>
            <h4 className="font-black text-sm uppercase tracking-widest mb-2 opacity-70">{title}</h4>
            <div className="text-sm leading-relaxed font-medium">
                {children}
            </div>
        </div>
    );
};

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('philosophy');

    const sections = [
        { id: 'philosophy', title: '1. なぜ ARIMA/SARIMA ではないのか？' },
        { id: 'logistic', title: '2. 生物学的成長モデル (Logistic Growth)' },
        { id: 'incremental', title: '3. ゼロスタート問題の解決 (Base + Growth)' },
        { id: 'fitting', title: '4. パラメータ最適化のメカニズム (Fitting)' },
        { id: 'lifecycle', title: '5. 3段階ライフサイクル制御 (New)' },
        { id: 'structure', title: '6. 構造変化と季節性 (Shift & Seasonality)' },
        { id: 'nudge', title: '7. 直近トレンド補正 (Nudge & Decay)' },
    ];

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-slate-800 font-sans">
            <div className="flex flex-col md:flex-row min-h-full">
                {/* Fixed TOC Sidebar */}
                <div className="w-full md:w-80 bg-white border-r border-gray-200 p-6 flex-shrink-0 sticky top-0 h-auto md:h-screen overflow-y-auto z-10 shadow-sm">
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
                        <div className="text-2xl font-black text-slate-800 font-display">QB-LGM v11.1</div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            Hybrid Incremental Logistic Model with Multi-Stage Constraints.
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-8 md:p-16 max-w-4xl mx-auto">
                    
                    <header className="mb-16">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 font-display uppercase tracking-tight mb-4 leading-tight">
                            予測アルゴリズム論理仕様書
                            <span className="block text-lg text-slate-500 font-medium normal-case mt-2 tracking-normal font-sans">
                                Why Logistic? The Mathematical Foundation of Store Forecasting
                            </span>
                        </h1>
                        <p className="text-sm text-slate-600 leading-loose">
                            本ドキュメントでは、QBハウスの店舗需要予測において、なぜ一般的な時系列解析手法（ARIMA/SARIMA等）を採用せず、
                            <strong>「増分ロジスティック成長モデル (Incremental Logistic Growth Model)」</strong>を採用したのか、その数理的背景と実装詳細を解説します。
                        </p>
                    </header>

                    <div className="space-y-24">

                        {/* SECTION 1: WHY NOT ARIMA? */}
                        <section id="philosophy" className={activeSection !== 'philosophy' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="01" title="なぜ ARIMA/SARIMA ではないのか？" sub="確率的プロセス vs 決定的プロセス" />
                            
                            <div className="prose prose-slate max-w-none">
                                <h3 className="text-lg font-bold text-slate-800 mt-6">従来の時系列モデルの限界</h3>
                                <p>
                                    一般的にビジネス需要予測では、ARIMA (AutoRegressive Integrated Moving Average) や Prophet といったモデルが利用されます。
                                    これらは「過去の変動パターンが将来も繰り返される」という前提に基づき、データの自己相関（Autocorrelation）をモデル化します。
                                    しかし、実店舗の売上予測において、これらの手法は致命的な欠陥を抱えています。
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
                                    <Callout title="ARIMAの弱点: 「天井」を知らない" type="warning">
                                        <p>
                                            ARIMAは線形トレンドを延長しようとします。
                                            成長期の店舗データ（右肩上がり）を与えると、<strong>「売上は無限に増え続ける」</strong>と予測してしまいます。
                                            しかし物理店舗には、席数・スタイリスト数・商圏人口という明確な<strong>「物理的上限 (Capacity)」</strong>が存在します。
                                        </p>
                                    </Callout>
                                    <Callout title="QBモデルの解答: 上限(L)の導入" type="info">
                                        <p>
                                            我々のモデルは、数式の中に最初から<strong>「上限パラメーター <InlineMath math="L" />」</strong>を組み込んでいます。
                                            どんなに勢いよく成長しても、<InlineMath math="L" /> に近づくにつれて成長は自然に鈍化し、収束します。
                                            これはデータサイエンス以前の、物理的制約への準拠です。
                                        </p>
                                    </Callout>
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 mt-6">説明可能性 (Explainability) の欠如</h3>
                                <p>
                                    LSTMやTransformerなどの深層学習モデルは、高い精度を出す可能性がありますが、「なぜその予測になったか」がブラックボックス化します。
                                    現場の店長やエリアマネージャーに対して、「AIがそう言っているから」では納得感を得られません。
                                    <br/><br/>
                                    本システムでは、すべての予測を以下の人間に理解可能なパラメータで説明できるように設計しています。
                                </p>
                                <ul className="list-disc pl-5 mt-4 space-y-2 text-sm font-bold text-slate-600">
                                    <li><span className="text-[#005EB8]">L (Limit):</span> この店はMAXでいくら売れるポテンシャルがあるのか？</li>
                                    <li><span className="text-orange-500">k (Growth):</span> 立ち上がりのスピードは速いか遅いか？</li>
                                    <li><span className="text-purple-600">Shift:</span> コロナ等の外部要因で、前提条件がどう変わったか？</li>
                                </ul>
                            </div>
                        </section>

                        {/* SECTION 2: LOGISTIC GROWTH */}
                        <section id="logistic" className={activeSection !== 'logistic' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="02" title="生物学的成長モデル" sub="店舗＝生き物として捉える" />
                            
                            <div className="prose prose-slate max-w-none">
                                <p>
                                    店舗の成長プロセスは、生物の個体数増加や細胞分裂のプロセス（S字カーブ）と極めて類似しています。
                                    <br/>
                                    1. <strong>導入期:</strong> 認知度が低く、緩やかに始まる。<br/>
                                    2. <strong>成長期:</strong> 口コミや認知拡大により、指数関数的に急増する。<br/>
                                    3. <strong>成熟期:</strong> エリア内需要を満たし、席数限界に達して安定する。
                                    <br/><br/>
                                    この現象を記述するのに最適なのが、以下の<strong>ロジスティック方程式</strong>です。
                                </p>

                                <Callout title="The Logistic Function" type="math">
                                    <BlockMath math="y(t) = \frac{L}{1 + e^{-k(t - t_0)}}" />
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                        <div>
                                            <span className="font-black text-[#005EB8] block mb-1 text-base">L (Carrying Capacity)</span>
                                            環境収容力。店舗における売上の理論的上限値。
                                        </div>
                                        <div>
                                            <span className="font-black text-orange-500 block mb-1 text-base">k (Growth Rate)</span>
                                            成長率。曲線の傾きの急峻さを決定する係数。
                                        </div>
                                        <div>
                                            <span className="font-black text-slate-500 block mb-1 text-base">t0 (Inflection Point)</span>
                                            変曲点。成長スピードが最大になり、鈍化に転じる時期。
                                        </div>
                                    </div>
                                </Callout>

                                <p className="mt-4">
                                    この数式を採用することで、たとえ現在のデータが直線的な急成長を示していても（ARIMAなら無限に発散する場面でも）、
                                    モデルは<strong>「いつか必ず上限 <InlineMath math="L" /> にぶつかって止まる」</strong>ことを前提に未来を描画します。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 3: INCREMENTAL MODEL */}
                        <section id="incremental" className={activeSection !== 'incremental' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="03" title="ゼロスタート問題の解決" sub="v11.0: Base + Growth アプローチ" />
                            
                            <div className="prose prose-slate max-w-none">
                                <h3 className="text-lg font-bold text-slate-800">標準ロジスティックモデルの欠点</h3>
                                <p>
                                    数式 <InlineMath math="y(0) \approx 0" /> が示す通り、標準的なロジスティックモデルは「ゼロからのスタート」を仮定します。
                                    しかし、QBハウスのような店舗ビジネスでは、オープン初月から一定の売上（例: 月商100万円）が存在します。
                                    <br/>
                                    無理やりゼロスタートのカーブを当てはめようとすると、数学的に <InlineMath math="t_0" />（開始時期）をマイナス方向に大きくずらす必要が生じ、<InlineMath math="k" />（成長率）の推定精度が著しく低下します。
                                </p>

                                <h3 className="text-lg font-bold text-slate-800 mt-6">解決策: 切片付きモデル (Incremental Model)</h3>
                                <p>
                                    v11.0より、売上を<strong>「基礎部分 (Base)」</strong>と<strong>「成長部分 (Growth)」</strong>に分離するアプローチを採用しました。
                                </p>

                                <Callout title="Incremental Logistic Model" type="math">
                                    <BlockMath math="y(t) = \text{Base} + \frac{L_{growth}}{1 + e^{-k(t - t_0)}}" />
                                    <div className="mt-2 text-xs text-slate-500">
                                        ここで、<InlineMath math="\text{Base}" /> はオープン直後（初期3ヶ月平均）の売上として固定します。
                                        最適化アルゴリズム（Nelder-Mead法）は、そこからの「上積み分（Growth）」のみを探索します。
                                    </div>
                                </Callout>

                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-4">
                                    <h4 className="font-bold text-sm mb-2 text-slate-700">メリット</h4>
                                    <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                                        <li>初期値が固定されるため、最適化計算が極めて安定する。</li>
                                        <li>「オープン景気で始まったが、その後伸び悩んだ」といったパターンも、Baseが高く <InlineMath math="L_{growth}" /> が小さいモデルとして正確に表現できる。</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 4: FITTING */}
                        <section id="fitting" className={activeSection !== 'fitting' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="04" title="パラメータ最適化のメカニズム" sub="Nelder-Mead 法による非線形回帰" />
                            
                            <div className="prose prose-slate max-w-none">
                                <p>
                                    「<InlineMath math="L" /> や <InlineMath math="k" /> をどうやって最適解に収束させるのか？」<br/>
                                    本エンジンは、勾配（微分）を用いない直接探索法である<strong>Nelder-Mead法（滑降シンプレックス法）</strong>を採用しています。
                                </p>
                                <p className="text-sm text-slate-500 mt-2">
                                    ※ 詳細は専門的すぎるため省略しますが、アメーバのような幾何学体がパラメータ空間を這い回り、誤差が最小になる「谷底」を探すアルゴリズムです。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 5: LIFECYCLE */}
                        <section id="lifecycle" className={activeSection !== 'lifecycle' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="05" title="3段階ライフサイクル制御" sub="データ不足時の過学習防止" />
                            
                            <div className="prose prose-slate max-w-none">
                                <p>
                                    データが少ない時期（成長期）に複雑なカーブを当てはめようとすると、過学習が発生します。
                                    特に、オープンから3年未満の店舗はデータが直線的に見えることが多く、モデルは「成長率 <InlineMath math="k" /> が極端に低く、上限 <InlineMath math="L" /> が無限大」という誤った解を導きがちです。
                                    <br/><br/>
                                    これを防ぐため、店舗の月齢に応じてパラメータの自由度を制限する「ステージング制御」を導入しました。
                                </p>
                                {/* Staging graphic omitted for brevity */}
                            </div>
                        </section>

                        {/* SECTION 6: SHIFT & SEASONALITY (UPDATED) */}
                        <section id="structure" className={activeSection !== 'structure' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="06" title="構造変化と季節性" sub="Base Shift & Dual Shift Logic" />
                            
                            <div className="prose prose-slate max-w-none">
                                <h3 className="text-lg font-bold text-slate-800">1. 外的要因：Base Shift Model（標準）</h3>
                                <p>
                                    競合店の出退店やコロナ禍のような「環境変化」は、店舗自体のポテンシャル（<InlineMath math="L" />）を変えるものではなく、<strong>基礎需要（Base）のレベルシフト</strong>として扱います。
                                </p>
                                
                                <Callout title="Base Shift Formula" type="math">
                                    <BlockMath math="y(t) = (\text{Base} + \text{Shift} \cdot \mathbb{I}_{t \ge t_{shock}}) + \frac{L}{1 + e^{-k(t - t_0)}}" />
                                    <div className="mt-4 text-xs text-slate-500">
                                        <p><strong>なぜこうするのか？</strong></p>
                                        <p>
                                            もし環境変化後に <InlineMath math="L" />（成長余地）自体を再計算させてしまうと、一時的な急増を「成長トレンドの加速」と誤認し、
                                            <strong>「無限に右肩上がり」</strong>の予測線を引いてしまうリスクがあるためです。
                                            「階段を一段登っただけ」と解釈させることで、変化後すぐに予測を安定させます。
                                        </p>
                                    </div>
                                </Callout>

                                <h3 className="text-lg font-bold text-slate-800 mt-8">2. 長期稼働店舗向け：Dual Shift Logic（コロナ対応）</h3>
                                <p>
                                    10年以上稼働している店舗では、「コロナショック（2020年4月）」と「その他の変化（競合・改装）」の両方を経験しているケースが多々あります。
                                    このような店舗に対しては、<strong>最大2回</strong>のレベルシフトを許容する「Dual Shift Mode」が自動適用されます。
                                </p>
                                
                                <Callout title="Dual Shift Formula" type="math">
                                    <BlockMath math="y(t) = \text{Base} + \text{Shift}_{covid} \cdot \mathbb{I}_{t \ge t_{covid}} + \text{Shift}_{other} \cdot \mathbb{I}_{t \ge t_{other}} + \text{Growth}(t)" />
                                    <div className="mt-2 text-xs text-slate-500">
                                        <p>
                                            <InlineMath math="t_{covid}" /> は2020年4月周辺に固定され、<InlineMath math="t_{other}" /> はその他の最大変化点を探索します。
                                            これにより、コロナの影響を分離しつつ、別の重要なイベント（リニューアル等）もモデルに組み込むことが可能になります。
                                        </p>
                                    </div>
                                </Callout>

                                <h3 className="text-lg font-bold text-slate-800 mt-8">3. ロバスト季節性分解 (Robust STL)</h3>
                                <p>
                                    トレンド成分（ロジスティック曲線）を除去した後の残差成分から、月ごとの季節性を抽出します。
                                    単純平均ではなく、外れ値に強い<strong>中央値 (Median)</strong> を採用することで、突発的なイベント（台風休業など）の影響を排除し、純粋な季節パターンのみを学習します。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 7: NUDGE & DECAY */}
                        <section id="nudge" className={activeSection !== 'nudge' ? 'hidden' : 'animate-fadeIn'}>
                            <SectionHeader number="07" title="直近トレンド補正" sub="Nudge & Decay Process" />
                            
                            <div className="prose prose-slate max-w-none">
                                <h3 className="text-lg font-bold text-slate-800">Nudge（ひと押し）と Decay（減衰）</h3>
                                <p>
                                    数理モデルの理想曲線と、直近の実績値の間の「乖離（Residual）」を埋める補正処理です。
                                    直近の勢い（Nudge）を将来の予測に加算し、それを時間とともに徐々にゼロに近づける（Decay）ことで、予測のスタート地点を実績に合わせます。
                                </p>
                            </div>
                        </section>

                    </div>

                    <div className="mt-24 pt-10 border-t border-slate-200 text-center">
                        <p className="text-xs text-slate-400 font-mono">
                            Document Generated by Analysis Engine Core<br/>
                            Last Updated: 2024-Q1 (v11.1 Release)
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ModelLogicView;
