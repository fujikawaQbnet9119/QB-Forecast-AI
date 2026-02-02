
import React, { useState } from 'react';
import katex from 'katex';
import { marked } from 'marked';

const BlockMath = ({ math }: { math: string }) => {
    const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
    return <div dangerouslySetInnerHTML={{ __html: html }} className="overflow-x-auto overflow-y-hidden my-8 bg-white p-8 rounded-3xl shadow-inner border border-slate-100" />;
};

const InlineMath = ({ math }: { math: string }) => {
    const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
    return <span dangerouslySetInnerHTML={{ __html: html }} className="mx-1 font-mono text-sm bg-slate-100 px-2 py-0.5 rounded text-[#005EB8] border border-slate-200" />;
};

const SectionHeader = ({ number, title, sub }: { number: string, title: string, sub: string }) => (
    <div className="mb-16 border-b border-slate-200 pb-10 mt-32">
        <div className="flex items-center gap-6 mb-4">
            <span className="bg-[#005EB8] text-white font-display font-black text-3xl w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-200">{number}</span>
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{title}</h2>
        </div>
        <p className="text-xl text-slate-500 font-bold ml-20">{sub}</p>
    </div>
);

const Callout = ({ title, children, type = 'info' }: { title: string, children?: React.ReactNode, type?: 'info' | 'warning' | 'math' | 'expert' | 'beginner' }) => {
    const configs = {
        info: { color: 'bg-blue-50 border-blue-100 text-blue-900', icon: 'fa-info-circle' },
        warning: { color: 'bg-orange-50 border-orange-100 text-orange-900', icon: 'fa-exclamation-triangle' },
        math: { color: 'bg-slate-50 border-slate-200 text-slate-700', icon: 'fa-square-root-variable' },
        expert: { color: 'bg-purple-50 border-purple-100 text-purple-900', icon: 'fa-user-tie' },
        beginner: { color: 'bg-emerald-50 border-emerald-100 text-emerald-900', icon: 'fa-lightbulb' }
    };
    const config = configs[type];
    return (
        <div className={`p-8 rounded-[2.5rem] border-2 ${config.color} my-12 shadow-sm relative overflow-hidden transition-all hover:shadow-md`}>
            <div className="flex items-center gap-4 mb-6">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color} bg-white/50 border border-current opacity-80`}>
                    <i className={`fas ${config.icon} text-sm`}></i>
                </div>
                <h4 className="font-black text-sm uppercase tracking-[0.2em] opacity-90 border-b-2 border-current pb-1">{title}</h4>
            </div>
            <div className="text-base leading-[1.8] font-medium prose prose-slate max-w-none">
                {children}
            </div>
        </div>
    );
};

const SECTIONS = [
    { id: 'philosophy', title: '0. 予測エンジンの哲学' },
    { id: 'math_core', title: '1. 増分ロジスティック数学' },
    { id: 'modes', title: '2. 5つの戦略的モデル定義' },
    { id: 'shock', title: '3. 構造変化(Shock)の検知' },
    { id: 'nudge', title: '4. 永続ナッジ(Persistent Nudge)' },
    { id: 'optimization', title: '5. Nelder-Mead 最適化アルゴリズム' },
    { id: 'regularization', title: '6. 正則化とオッカムの剃刀' },
    { id: 'aic', title: '7. AICによる自動モデル選択' },
    { id: 'seasonality', title: '8. 季節性DNAの抽出' },
    { id: 'business', title: '9. 経営管理への応用ガイド' }
];

const ModelLogicView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('philosophy');

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-slate-800 font-sans">
            <div className="flex flex-col lg:flex-row min-h-full">
                {/* Sidebar Navigation */}
                <div className="w-full lg:w-96 bg-white border-r border-gray-200 p-10 flex-shrink-0 sticky top-0 h-auto lg:h-screen overflow-y-auto z-20 shadow-sm">
                    <div className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mb-12 font-display flex items-center gap-3">
                        <span className="w-5 h-5 bg-[#005EB8] rounded-full shadow-lg shadow-blue-200"></span>
                        Technical Specification v15.5
                    </div>
                    <nav className="space-y-4">
                        {SECTIONS.map(s => (
                            <button
                                key={s.id}
                                onClick={() => {
                                    setActiveSection(s.id);
                                    document.getElementById('spec-content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className={`w-full text-left px-6 py-4 rounded-2xl text-xs font-black transition-all border-l-4 ${activeSection === s.id ? 'bg-blue-50 border-[#005EB8] text-[#005EB8] shadow-sm translate-x-2' : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                            >
                                {s.title}
                            </button>
                        ))}
                    </nav>
                    <div className="mt-20 p-6 bg-slate-900 rounded-3xl text-white">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Developed for</p>
                        <p className="text-sm font-black font-display tracking-tight">QB HOUSE Strategic Intelligence Group</p>
                    </div>
                </div>

                {/* Main Content Area */}
                <div id="spec-content-area" className="flex-1 p-8 lg:p-24 max-w-5xl mx-auto overflow-y-auto custom-scrollbar">
                    <header className="mb-32 relative">
                        <h1 className="text-6xl lg:text-8xl font-black text-slate-900 font-display uppercase tracking-tighter mb-10 leading-[0.85]">
                            店舗予測モデル<br/><span className="text-[#005EB8]">論理仕様書</span>
                        </h1>
                        <div className="h-3 w-48 bg-[#005EB8] rounded-full mb-16 shadow-xl shadow-blue-100"></div>
                        <p className="text-2xl text-slate-500 font-bold leading-relaxed max-w-3xl">
                            「増分ロジスティック成長」と「永続ナッジ」を統合した次世代店舗分析エンジンの完全な数理・ロジックの定義。
                        </p>
                    </header>

                    <div className="space-y-60 pb-64">
                        
                        {/* SECTION 0: Philosophy */}
                        <section id="philosophy" className={activeSection === 'philosophy' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="00" title="予測エンジンの設計思想" sub="物理的制約への準拠と経営の直感" />
                            <div className="space-y-12 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    店舗売上は、自然界の生物の成長と同じように<strong>「上限のある成長」</strong>を辿ります。
                                    従来の線形回帰や単純な時系列予測では、この物理的な限界を無視してしまい、過大な期待や的外れな目標設定を招いてきました。
                                </p>
                                <p>
                                    本エンジンは、店舗ビジネスが持つ「席数」「スタッフ数」「商圏人口」という物理的制約を<strong>「飽和点（Saturation Point）」</strong>として定義し、
                                    そこに至るまでの「加速度」と「減速度」を数学的に記述することを目的としています。
                                </p>
                                <Callout title="初心者のためのポイント" type="beginner">
                                    このAIは「お店の売上は無限には増えない」という当たり前の事実を前提にしています。
                                    「今は伸びているけれど、あとどれくらいで一杯いっぱいになるのか？」を予測するのが得意です。
                                </Callout>
                            </div>
                        </section>

                        {/* SECTION 1: Math Core */}
                        <section id="math_core" className={activeSection === 'math_core' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="01" title="増分ロジスティック数学" sub="売上の構造を3つの変数に分解する" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    本エンジンのコアとなる数式は、以下の「増分ロジスティック成長関数」です。
                                </p>
                                <BlockMath math="y(t) = \text{Base} + \frac{L}{1 + e^{-k(t - t_0)}}" />
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                        <div className="text-3xl font-black text-[#005EB8] mb-2">L</div>
                                        <div className="text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">Potential Limit</div>
                                        <p className="text-sm">その店舗が到達可能な<strong>「最大伸び代」</strong>。店舗の基礎体力を示します。</p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                        <div className="text-3xl font-black text-orange-500 mb-2">k</div>
                                        <div className="text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">Growth Rate</div>
                                        <p className="text-sm">成長の<strong>「鋭さ（アクセル）」</strong>。認知が広まるスピードを指します。</p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                        <div className="text-3xl font-black text-purple-600 mb-2">t₀</div>
                                        <div className="text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">Inflection Point</div>
                                        <p className="text-sm">成長が最も激しい<strong>「転換期」</strong>。いつ爆発したかを示します。</p>
                                    </div>
                                </div>

                                <Callout title="専門家向けの解説" type="expert">
                                    通常のロジスティック曲線と異なり、<InlineMath math="\text{Base}" />（開業初期値）を分離することで、
                                    モデルの柔軟性を確保しています。これにより、既存店における「テコ入れによる追加成長」の記述にも対応しています。
                                </Callout>
                            </div>
                        </section>

                        {/* SECTION 2: Modes */}
                        <section id="modes" className={activeSection === 'modes' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="02" title="5つの戦略的モデル定義" sub="店舗のフェーズに合わせてAIが物語を選択する" />
                            <div className="space-y-12">
                                <p className="text-lg leading-loose text-slate-600 font-medium">
                                    全店舗に同じ数式を当てはめることは不可能です。AIは各店舗の履歴をスキャンし、最も適合する「モード」を自動選択します。
                                </p>
                                
                                <div className="space-y-8">
                                    {[
                                        { title: 'Standard (標準モデル)', desc: '開業から現在まで、大きな波がなく順調に成長している店舗。最も信頼性の高い予測が可能です。', color: 'border-l-blue-500' },
                                        { title: 'Startup (新規店モデル)', desc: 'データが13ヶ月未満の店舗。自店舗のデータだけでは予測不能なため、全社の「平均的な成長カーブ」を強制合成します。', color: 'border-l-orange-500' },
                                        { title: 'Shift (構造変化モデル)', desc: '増席、改装、競合出現、または価格改定など。過去の延長線上にはない「段差」を検知し、新しい基準で予測をリセットします。', color: 'border-l-purple-500' },
                                        { title: 'Dual Shift (二段階変化)', desc: 'コロナによる下落とその後の回復など、二度の大きな環境変化を乗り越えた成熟店向けの高度なモデルです。', color: 'border-l-indigo-600' },
                                        { title: 'Recovery (特殊回帰)', desc: '一時的なショック（商業施設の臨時休業など）から、元の売上水準へ「自律反発」しようとする力を測定します。', color: 'border-l-emerald-500' }
                                    ].map((m, i) => (
                                        <div key={i} className={`bg-white p-8 rounded-3xl shadow-sm border border-slate-100 border-l-8 ${m.color} hover:shadow-md transition-all`}>
                                            <h4 className="text-xl font-black text-slate-800 mb-3">{m.title}</h4>
                                            <p className="text-slate-500 font-bold leading-relaxed">{m.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* SECTION 3: Shock Detection */}
                        <section id="shock" className={activeSection === 'shock' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="03" title="構造変化(Shock)の検知" sub="「例外的な出来事」を見逃さない仕組み" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    AIは全期間のデータを移動平均でスキャンし、前後の期間で売上の「平均レベル」が統計的に有意に変化した地点（Shock Index）を探します。
                                </p>
                                <Callout title="検知のアルゴリズム" type="math">
                                    前後6ヶ月ずつの窓（ウィンドウ）を設定し、その平均の差分比率が 12% を超えた場合に「構造変化の疑い」としてフラグを立てます。
                                    その後、Nelder-Mead法によるパラメータ探索を行い、その地点で「Shift」を発生させた方が全体の誤差（AIC）が小さくなる場合のみ、この構造変化を採用します。
                                </Callout>
                                <p>
                                    これにより、「単なる月ごとのバラつき」と「店長交代や改装などの本質的な変化」を峻別しています。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 4: Persistent Nudge */}
                        <section id="nudge" className={activeSection === 'nudge' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="04" title="Persistent Nudge (永続ナッジ)" sub="最新の勢いを「一時的なもの」で終わらせない" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    予測理論における最大の難問は「足元の絶好調（または不調）を、将来の予測にどう織り込むか」です。
                                    理論値（ロジスティック曲線）と直近の実績には必ず乖離（残差）が生じます。
                                </p>
                                <p>
                                    旧来のモデル（v15.0以前）では、直近の乖離を「一過性のノイズ」とみなし、24ヶ月かけて徐々にゼロに戻る（減衰させる）ように設計していました。
                                    しかし、最新の <strong>v15.5</strong> では、この減衰ロジックを完全に撤廃しました。
                                </p>
                                <Callout title="永続ナッジの数理定義" type="math">
                                    <BlockMath math="\text{Final Forecast}(t) = \text{Logistic}(t) + \text{Nudge} \times (1.0)^{\Delta t}" />
                                    <p className="text-sm font-black text-center opacity-70 mt-4">
                                        ※ 指数項（Decay Factor）を 1.0 に固定。直近12ヶ月の平均乖離（Nudge）を、そのまま将来の「一定のオフセット」として永続的に加算し続けます。
                                    </p>
                                </Callout>
                                <p>
                                    これは、<strong>「今の勢い（乖離）は、現場の努力によって勝ち取った『新しい実力値（ベースライン）』である」</strong>という経営的な信頼を数式に反映したものです。
                                    「いずれ元に戻るだろう」という悲観的な予測を排除し、現場の「今」を肯定する、より攻撃的で実務的なロジックへと進化しました。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 5: Optimization */}
                        <section id="optimization" className={activeSection === 'optimization' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="05" title="Nelder-Mead 最適化" sub="数億通りの組み合わせから正解を見つける" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    ロジスティック曲線の係数（L, k, t0）を決定するために、本エンジンは<strong>「ネルダー・ミード法（シンプレックス法）」</strong>という最適化アルゴリズムを使用しています。
                                </p>
                                <p>
                                    微分が困難な複雑な評価関数に対しても、パラメータ空間に「三角形（多面体）」を作り、それを「反転」「拡大」「縮小」させることで、誤差が最小となる「谷底」へ確実に滑り降ります。
                                </p>
                                <div className="bg-slate-900 p-10 rounded-[3rem] text-slate-300 font-mono text-sm leading-relaxed">
                                    <p className="text-white font-black mb-4">// アルゴリズムの挙動イメージ</p>
                                    1. パラメータの初期推定値をセット<br/>
                                    2. 誤差の大きい点を捨て、反対側へ移動（反転）<br/>
                                    3. そっちの方向が良さそうなら、さらに足を伸ばす（拡大）<br/>
                                    4. 行き過ぎたら、中心へ向かってギュッと縮む（縮小）<br/>
                                    5. 最大2,500回の試行で収束...
                                </div>
                            </div>
                        </section>

                        {/* SECTION 6: Regularization */}
                        <section id="regularization" className={activeSection === 'regularization' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="06" title="正則化とオッカムの剃刀" sub="AIの「嘘」や「過学習」を防ぐペナルティ" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    数学的に「最も誤差が少ない」答えが、経営的に「正しい」とは限りません。
                                    例えば、月商300万円の店のポテンシャル(L)を「1,000万円」と予測すれば、当面の誤差は減りますが、それは「物理的に不可能」な答えです。
                                </p>
                                <Callout title="物理的制約ペナルティ" type="expert">
                                    本エンジンは以下の制約を厳格に課しています：
                                    <ul className="list-disc pl-6 mt-4 space-y-2">
                                        <li><InlineMath math="L" /> が 5,000k（500万円）を超える場合、指数関数的にペナルティ（MSEの加算）を発生させます。</li>
                                        <li>成長率 <InlineMath math="k" /> が異常に高い場合、不自然な「急騰」として抑制します。</li>
                                    </ul>
                                </Callout>
                                <p>
                                    「真実は、常にシンプルな構造の中にある」というオッカムの剃刀（Occam's Razor）をプログラムとして実装しています。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 7: AIC */}
                        <section id="aic" className={activeSection === 'aic' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="07" title="AICによる自動モデル選択" sub="複雑さと精度のトレードオフ" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    「複雑な数式を使えば実績に合わせることは簡単だが、将来の予測には役立たない」――これを防ぐのが <strong>AIC（赤池情報量規準）</strong> です。
                                </p>
                                <BlockMath math="\text{AIC} = n \ln(\text{SSE}/n) + 2k" />
                                <p>
                                    数式のパラメータ数（複雑さ）をペナルティとして加算します。
                                    構造変化（Shift）を1回認めるためには、その「複雑さのコスト」を上回るほどの圧倒的な「予測誤差の減少」が証明されなければなりません。
                                </p>
                                <p>
                                    本エンジンはこの計算を店舗ごとに瞬時に行い、「今は何も起きていないと判断すべきか」「変化を認めるべきか」を論理的に決着させています。
                                </p>
                            </div>
                        </section>

                        {/* SECTION 8: Seasonality */}
                        <section id="seasonality" className={activeSection === 'seasonality' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="08" title="季節性DNAの抽出" sub="真のトレンドをノイズから分離する" />
                            <div className="space-y-10 text-lg leading-loose text-slate-600 font-medium">
                                <p>
                                    QBハウスの売上には、強力な季節変動（3月の繁盛、2月の閑散など）が存在します。
                                    これらをトレンド（Lやk）と混同すると予測が狂います。
                                </p>
                                <p>
                                    AIは各店舗の過去データを「実績 ÷ モデル理論値」で逆算し、各月ごとの「変動倍率（インデックス）」を算出します。
                                </p>
                                <Callout title="DNAマッチング" type="math">
                                    各月のインデックスの合計が 12.0 になるように正規化されます。
                                    データ不足の店舗に対しては、全店舗の平均的な「季節性DNA」を適用することで、季節による短期的な変動を予言します。
                                </Callout>
                            </div>
                        </section>

                        {/* SECTION 9: Business Guide */}
                        <section id="business" className={activeSection === 'business' ? 'animate-fadeIn' : 'hidden'}>
                            <SectionHeader number="09" title="経営管理への応用ガイド" sub="数字を「アクション」に変える" />
                            <div className="space-y-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-white p-8 rounded-3xl border-2 border-blue-100 shadow-lg shadow-blue-50">
                                        <h5 className="font-black text-[#005EB8] mb-4 flex items-center gap-2">
                                            <i className="fas fa-search-dollar"></i> L (実力値) の活用
                                        </h5>
                                        <p className="text-sm text-slate-600 leading-loose">
                                            Lの値が実績より遥かに大きい店舗は「宝の山」です。販促やスタッフ教育による改善の余地が巨大です。
                                            逆に実績がLに近い店舗は「飽和状態」です。これ以上期待せず、改装や増席、近隣への新店を検討すべきです。
                                        </p>
                                    </div>
                                    <div className="bg-white p-8 rounded-3xl border-2 border-orange-100 shadow-lg shadow-orange-50">
                                        <h5 className="font-black text-orange-600 mb-4 flex items-center gap-2">
                                            <i className="fas fa-tachometer-alt"></i> k (成長速度) の活用
                                        </h5>
                                        <p className="text-sm text-slate-600 leading-loose">
                                            kの値が極端に低い店舗は、オープン時の周知が失敗した可能性があります。
                                            kは「信頼の積み上げ速度」です。この値が低い場合は、店頭看板の視認性や接客の再点検を急いでください。
                                        </p>
                                    </div>
                                </div>
                                <Callout title="最後に" type="info">
                                    このシステムは「予言」ではなく「地図」を提供します。
                                    数学が示した方向性と、皆さんの「現場の感性」を掛け合わせることで、初めて意味のある経営判断が生まれます。
                                </Callout>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn { animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
            `}} />
        </div>
    );
};

export default ModelLogicView;
