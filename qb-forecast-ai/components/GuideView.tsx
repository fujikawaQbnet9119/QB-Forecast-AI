
import React, { useState } from 'react';

const GuideView: React.FC = () => {
    const [activeSection, setActiveSection] = useState<'basics' | 'dashboard' | 'analytics' | 'glossary'>('basics');

    const navClass = (id: string) => `px-6 py-3 rounded-full text-sm font-bold transition-all ${activeSection === id ? 'bg-[#005EB8] text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`;

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-slate-800 font-sans">
            <div className="max-w-6xl mx-auto p-4 md:p-12 pb-32">
                
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-black text-[#005EB8] tracking-tighter font-display uppercase leading-none mb-4">
                        QB Forecast Master Guide
                    </h1>
                    <p className="text-sm md:text-base font-bold text-slate-500">
                        「数字が苦手」でも大丈夫。データを見て「次に何をすべきか」を決めるための完全攻略マニュアル。
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex flex-wrap justify-center gap-4 mb-12 font-display">
                    <button onClick={() => setActiveSection('basics')} className={navClass('basics')}>1. AI予測の基礎 (S字カーブ)</button>
                    <button onClick={() => setActiveSection('dashboard')} className={navClass('dashboard')}>2. 全社経営の見方</button>
                    <button onClick={() => setActiveSection('analytics')} className={navClass('analytics')}>3. 分析ラボの見方</button>
                    <button onClick={() => setActiveSection('glossary')} className={navClass('glossary')}>4. 全指標・用語辞典 (30+)</button>
                </div>

                {/* --- SECTION 1: BASICS --- */}
                {activeSection === 'basics' && (
                    <div className="animate-fadeIn space-y-12">
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3 border-b pb-4">
                                <span className="bg-[#005EB8] text-white w-8 h-8 rounded-lg flex items-center justify-center text-lg">1</span>
                                なぜ「S字カーブ」なのか？
                            </h2>
                            <div className="flex flex-col md:flex-row gap-8 items-center">
                                <div className="md:w-1/2">
                                    <p className="leading-loose text-slate-600 font-medium mb-4">
                                        お店の売上は、永遠に右肩上がりにはなりません。<br/>
                                        オープン直後は知名度が上がって急激に伸びますが（成長期）、いずれエリアのお客様に行き渡り、席数やスタッフ数の限界が来て、売上は一定のラインで止まります（安定期）。
                                    </p>
                                    <p className="leading-loose text-slate-600 font-medium">
                                        この<strong>「成長 → 限界 → 安定」</strong>という自然な流れを数式にしたのが、本システムで採用している「ロジスティック曲線（S字カーブ）」です。
                                        無理な目標を立てず、店舗の「実力（上限）」を正しく見極めるために使います。
                                    </p>
                                </div>
                                <div className="md:w-1/2 bg-blue-50 p-6 rounded-2xl border border-blue-100">
                                    <div className="text-center text-[#005EB8] font-black text-lg mb-2">重要：3つのキーワード</div>
                                    <ul className="space-y-4">
                                        <li className="bg-white p-4 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-xl text-[#005EB8]">L (Limit)</span>
                                                <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">潜在能力</span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                <strong>「この店はMAXでこれくらい売れる」という天井。</strong><br/>
                                                現在の売上がLに近ければ、もう「満員」です。これ以上伸ばすには改装が必要です。
                                            </p>
                                        </li>
                                        <li className="bg-white p-4 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-xl text-orange-500">k (Growth)</span>
                                                <span className="text-xs font-bold bg-orange-100 text-orange-800 px-2 py-1 rounded">成長速度</span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                <strong>「天井(L)に到達するまでの速さ」。</strong><br/>
                                                車のアクセルです。数値が大きいほどロケットスタート、小さいほどスロースターターです。
                                            </p>
                                        </li>
                                        <li className="bg-white p-4 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-xl text-purple-600">Shift (構造変化)</span>
                                                <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2 py-1 rounded">事件発生</span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                <strong>「道が変わった瞬間」。</strong><br/>
                                                コロナ禍や競合店の出現で、売上のレベルがガクッと変わること。過去の栄光を忘れて、新しい基準で評価するために使います。
                                            </p>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* --- SECTION 2: DASHBOARD --- */}
                {activeSection === 'dashboard' && (
                    <div className="animate-fadeIn space-y-12">
                         <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-center mb-8">
                             <h2 className="text-xl font-black text-[#005EB8] mb-2">経営者・エリアマネージャー向け</h2>
                             <p className="text-sm text-slate-600">「全社ダッシュボード」にある複雑なグラフの見方を解説します。</p>
                         </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">ポートフォリオ分析 (4象限マップ)</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    全店舗を「成長スピード(k)」と「規模(L)」で4つのグループに分けます。<br/>
                                    <strong>「どの店に投資し、どの店を整理すべきか」</strong>が一目でわかります。
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                    <div className="bg-orange-50 p-4 rounded border border-orange-200">
                                        <div className="font-black text-orange-600 text-lg">Star (右上)</div>
                                        <div className="font-bold mb-2">花形店舗</div>
                                        <p className="text-slate-500">規模もデカくて成長も早い。<br/><span className="text-red-500 font-bold">最優先で人・カネを投資せよ。</span></p>
                                    </div>
                                    <div className="bg-blue-50 p-4 rounded border border-blue-200">
                                        <div className="font-black text-blue-600 text-lg">Cash Cow (左上)</div>
                                        <div className="font-bold mb-2">金のなる木</div>
                                        <p className="text-slate-500">成長は止まったが規模はデカい。<br/><span className="text-blue-500 font-bold">効率よく利益を回収し続けろ。</span></p>
                                    </div>
                                    <div className="bg-slate-100 p-4 rounded border border-slate-200">
                                        <div className="font-black text-slate-600 text-lg">Dog (左下)</div>
                                        <div className="font-bold mb-2">負け犬</div>
                                        <p className="text-slate-500">規模も小さく成長もしない。<br/><span className="text-slate-700 font-bold">撤退・業態転換を検討せよ。</span></p>
                                    </div>
                                    <div className="bg-purple-50 p-4 rounded border border-purple-200">
                                        <div className="font-black text-purple-600 text-lg">Question (右下)</div>
                                        <div className="font-bold mb-2">問題児</div>
                                        <p className="text-slate-500">急成長中だが規模が小さい。<br/><span className="text-purple-700 font-bold">化けるか終わるか見極めよ。</span></p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">Vintage分析 (5年開業組グラフ)</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    「オープンしてから1ヶ月目、2ヶ月目…」と横軸を揃えて、世代ごとの成績を比較します。<br/>
                                    <strong>「最近の新店は、昔に比べて弱くなっていないか？」</strong>をチェックします。
                                </p>
                                <ul className="space-y-4 text-sm">
                                    <li className="flex gap-3">
                                        <span className="text-2xl">📈</span>
                                        <div>
                                            <span className="font-bold text-slate-700">線がどんどん上に来ている</span>
                                            <p className="text-xs text-slate-500">素晴らしい傾向です。新しい店ほど初速が良く、出店戦略が成功しています。</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="text-2xl">📉</span>
                                        <div>
                                            <span className="font-bold text-slate-700">線がどんどん下に来ている</span>
                                            <p className="text-xs text-red-500 font-bold">危険信号です。新しい店の立地が悪くなっているか、ブランド力が落ちています。</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- SECTION 3: ANALYTICS --- */}
                {activeSection === 'analytics' && (
                    <div className="animate-fadeIn space-y-12">
                        <div className="bg-green-50 p-6 rounded-2xl border border-green-100 text-center mb-8">
                             <h2 className="text-xl font-black text-green-700 mb-2">データアナリスト・戦略担当向け</h2>
                             <p className="text-sm text-slate-600">「高度分析ラボ」にある専門的なグラフの読み解き方です。</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">ウォーターフォール (増減要因分析)</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    昨年に比べて売上がどう変わったか、その犯人捜しをします。<br/>
                                    左側の緑が「増収の立役者」、右側の赤が「足を引っ張った戦犯」です。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-lg text-xs">
                                    <p className="font-bold mb-2 text-slate-700">現場のアクション:</p>
                                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                                        <li><strong>右側の赤いバーが長い店舗:</strong> なぜ減ったのか？（競合？工事？スタッフ不足？）即座にヒアリングしてください。</li>
                                        <li><strong>その他を削除した理由:</strong> 全体のノイズを消し、インパクトの大きい「上位・下位」だけに集中するためです。</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">ローレンツ曲線 & ジニ係数</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    「売上の格差」を見ます。一部の超繁盛店だけで会社が持っている状態（一本足打法）かどうかを判断します。
                                </p>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm border-b border-dashed pb-1">
                                        <span className="font-mono bg-slate-200 px-2 rounded">0.3 未満</span>
                                        <span className="font-bold text-green-500">健全 (みんな頑張ってる)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm border-b border-dashed pb-1">
                                        <span className="font-mono bg-slate-200 px-2 rounded">0.4 以上</span>
                                        <span className="font-bold text-orange-500">格差あり (一部に依存)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-mono bg-slate-200 px-2 rounded">0.5 以上</span>
                                        <span className="font-bold text-red-500">危険 (繁盛店がコケたら終わる)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">ライフサイクル分析 (散布図)</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    「店の年齢（横軸）」と「売上（縦軸）」の関係です。
                                    通常、店は古くなるほど売上が上がりますが、ある時点で頭打ちになります。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-lg text-xs">
                                    <p className="font-bold mb-2 text-slate-700">読み解き方:</p>
                                    <p className="text-slate-600">
                                        点が右（高齢）に行くほど下がっている場合、<strong>「店舗の老朽化（陳腐化）」</strong>が起きています。
                                        リニューアルやリロケーション（移転）のタイミングを示唆します。
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-black text-lg text-slate-800 mb-4 border-b pb-2">伸びしろランキング (Gap)</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    AIが「この店、本当はもっと売れるはずだよ」と判定した店舗のランキングです。
                                    実力(L)に対して、現在の実績が低い順に並んでいます。
                                </p>
                                <div className="bg-purple-50 p-4 rounded-lg text-xs text-purple-800 font-bold border border-purple-100">
                                    <span className="text-lg mr-2">💡</span>
                                    ここは「宝の山」です。<br/>
                                    このリストの店長に「何か困ってることない？」と聞くだけで、売上が伸びる可能性があります。
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- SECTION 4: GLOSSARY (THE BIG TABLE) --- */}
                {activeSection === 'glossary' && (
                    <div className="animate-fadeIn">
                        <div className="bg-slate-800 text-white p-8 rounded-3xl shadow-lg mb-8">
                            <h2 className="text-2xl font-black mb-2">全指標・用語辞典 (Dictionary)</h2>
                            <p className="text-slate-300">
                                QB Forecast AIに登場する30以上の指標を完全網羅。<br/>
                                意味だけでなく「目安（合格ライン）」と「アクション」を確認してください。
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                                <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-black font-display">
                                    <tr>
                                        <th className="py-4 px-6 text-left w-1/4">指標名 (Metric)</th>
                                        <th className="py-4 px-6 text-left w-1/4">わかりやすい意味</th>
                                        <th className="py-4 px-6 text-left w-1/6">目安・基準値</th>
                                        <th className="py-4 px-6 text-left w-1/3">現場でのアクション</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-slate-100">
                                    {/* Fundamental */}
                                    <tr className="bg-blue-50/30"><td colSpan={4} className="py-2 px-6 font-black text-[#005EB8] text-xs uppercase tracking-widest">基本・予測パラメータ</td></tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">L (Limit / Potential)</td>
                                        <td>店舗の「基礎体力」「売上の天井」。</td>
                                        <td>-</td>
                                        <td>現在売上がLに近いなら、販促しても無駄。改装か増員が必要。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">k (Growth Rate)</td>
                                        <td>立ち上がりの「瞬発力」。</td>
                                        <td>0.1前後が標準<br/>0.2以上は優秀</td>
                                        <td>kが低い店は、オープン前の認知活動（チラシ等）が不足していた可能性。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">t0 (Inflection)</td>
                                        <td>成長のピーク時期。</td>
                                        <td>-</td>
                                        <td>-</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Shift Mode</td>
                                        <td>コロナ等で「売上基準が変わった」状態。</td>
                                        <td>-</td>
                                        <td>過去データと比較せず、シフト後の「新しいL」を基準に目標を立て直す。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Nudge Decay</td>
                                        <td>直近のブームが「どれくらい続くか」。</td>
                                        <td>0.7前後</td>
                                        <td>高い(0.9~)なら今の好調は続く。低い(0.3)ならすぐ元に戻る（一過性）。</td>
                                    </tr>

                                    {/* Stats & KPIs */}
                                    <tr className="bg-blue-50/30"><td colSpan={4} className="py-2 px-6 font-black text-[#005EB8] text-xs uppercase tracking-widest">経営指標・分析KPI</td></tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">CAGR (年平均成長率)</td>
                                        <td>「ならして見ると」毎年何%伸びてるか。</td>
                                        <td>プラスならOK</td>
                                        <td>単年のブレに惑わされず、長期トレンドを見る時に使う。マイナスなら撤退検討。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">YoY (昨対比)</td>
                                        <td>去年の同じ時期より増えたか？</td>
                                        <td>100%以上</td>
                                        <td>100%割れが続くなら、何か構造的な問題（競合、劣化）がある。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">CV (変動係数)</td>
                                        <td>売上の「不安定さ」。ギザギザ具合。</td>
                                        <td>0.1以下: 安定<br/>0.2以上: 不安定</td>
                                        <td>高い店はシフトが組みにくい。店長の実力不足か、天候の影響を受けやすい立地。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">ABC Rank</td>
                                        <td>売上貢献度のランク。</td>
                                        <td>A: 上位70%<br/>C: 下位10%</td>
                                        <td>Aランク店の店長はエース。絶対に辞めさせてはいけない。Cランクはテコ入れ対象。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Efficiency (Sales/L)</td>
                                        <td>キャパシティに対する稼働率。</td>
                                        <td>90%以上: 満杯</td>
                                        <td>低すぎる(50%以下)なら、家賃の無駄。広すぎるか、客が来ていない。</td>
                                    </tr>
                                    
                                    {/* Advanced Analysis */}
                                    <tr className="bg-blue-50/30"><td colSpan={4} className="py-2 px-6 font-black text-[#005EB8] text-xs uppercase tracking-widest">高度分析・チャート用語</td></tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Gini (ジニ係数)</td>
                                        <td>店舗間の「不平等さ」。</td>
                                        <td>0.4以上で警戒</td>
                                        <td>高い場合、一部の店に頼りすぎている。新規出店でリスク分散が必要。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Correlation (相関係数)</td>
                                        <td>2つの店の動きが「似ているか」。</td>
                                        <td>0.7以上: 兄弟</td>
                                        <td>似ている店同士は、同じキャンペーンが効く可能性が高い。ドミナント戦略に活用。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Residual (残差)</td>
                                        <td>AI予測と実績の「ズレ」。</td>
                                        <td>0に近いほど良い</td>
                                        <td>プラスのズレが続くなら、AIが知らない「何か良いこと」が現場で起きている。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">AIC</td>
                                        <td>AIモデルの「自信のなさ」。</td>
                                        <td>低いほど良い</td>
                                        <td>この値が異常に高い店の予測は、話半分で聞くこと（AIが迷っている）。</td>
                                    </tr>
                                    <tr>
                                        <td className="py-4 px-6 font-bold">Z-Chart</td>
                                        <td>季節性を除いた実力推移グラフ。</td>
                                        <td>右肩上がりが正義</td>
                                        <td>青い線（移動年計）が下がっていたら、言い訳無用で対策が必要。</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="mt-12 text-center text-xs text-gray-400 border-t pt-8">
                    © QB FORECAST AI ENGINE / MASTER GUIDE v2.0
                </div>
            </div>
        </div>
    );
};

export default GuideView;
