
import { StoreData } from '../types';

// Helper: Calculate Gini
const calculateGini = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let num = 0;
    for (let i = 0; i < n; i++) num += (i + 1) * sorted[i];
    const den = n * sorted.reduce((a, b) => a + b, 0);
    return den === 0 ? 0 : (2 * num) / den - (n + 1) / n;
};

// Helper: Detect store name in input
export const detectStoreName = (input: string, allStores: { [name: string]: StoreData }) => {
    const storeNames = Object.keys(allStores);
    // Sort by length desc to match longer names first (e.g. "Shinjuku East" vs "Shinjuku")
    storeNames.sort((a, b) => b.length - a.length);
    return storeNames.find(name => input.includes(name));
};

export const generateDetailedContext = (allStores: { [name: string]: StoreData }, dataType: 'sales' | 'customers', targetStoreName?: string) => {
    const allStoresList = Object.values(allStores);
    const activeStores = allStoresList.filter(s => s.isActive);
    const closedStores = allStoresList.filter(s => !s.isActive);
    
    // 0. Strict No Data Handling
    if (allStoresList.length === 0) {
        return JSON.stringify({
            "System_Status": "NO_DATA_LOADED",
            "Message": "現在、システムに店舗データが読み込まれていません。分析を行うには、ユーザーにCSVデータのアップロードを要求する必要があります。"
        }, null, 2);
    }

    // 1. Dynamic Date Detection & Global Aggregation (Using ALL stores including closed ones for accurate history)
    let maxDateStr = "";
    const monthlyAgg: { [date: string]: { total: number; count: number; activeCount: number } } = {};
    const allDatesSet = new Set<string>();

    allStoresList.forEach(s => {
        const lastDate = s.dates[s.dates.length - 1]; // "YYYY-MM-DD"
        if (lastDate && (!maxDateStr || lastDate > maxDateStr)) {
            maxDateStr = lastDate;
        }
        // Aggregate monthly totals for global trend
        s.dates.forEach((d, i) => {
            if (!monthlyAgg[d]) monthlyAgg[d] = { total: 0, count: 0, activeCount: 0 };
            monthlyAgg[d].total += s.raw[i];
            monthlyAgg[d].count += 1;
            if (s.isActive) monthlyAgg[d].activeCount += 1; // Approximate (isActive is current status, but history matters)
            allDatesSet.add(d);
        });
    });

    // Sort dates and take last 60 months for global trend
    const sortedDates = Array.from(allDatesSet).sort((a, b) => new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime());
    const recentGlobalDates = sortedDates.slice(-60);
    
    const globalTrend = recentGlobalDates.map(d => ({
        date: d,
        total_sales: monthlyAgg[d].total,
        total_store_count: monthlyAgg[d].count, // Reporting store count at that time
        avg_sales_per_store: monthlyAgg[d].count > 0 ? Math.round(monthlyAgg[d].total / monthlyAgg[d].count) : 0
    }));

    // 2. Global Metrics (Focus on Active for Current Status)
    const totalSales = activeStores.reduce((a, s) => a + (s.stats?.lastYearSales || 0), 0);
    const prevTotalSales = activeStores.reduce((a, s) => a + (s.stats?.prevYearSales || 0), 0);
    const yoy = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : 0;
    const avgK = activeStores.reduce((a, s) => a + s.params.k, 0) / (activeStores.length || 1);
    const totalL = activeStores.reduce((a, s) => a + s.params.L, 0);
    const utilization = totalL > 0 ? (totalSales / 12) / totalL * 100 : 0;
    const gini = calculateGini(activeStores.map(s => s.stats?.lastYearSales || 0));

    // 3. Rankings (Top/Bottom 5 Active)
    const sorted = [...activeStores].sort((a,b) => (b.stats?.yoy || 0) - (a.stats?.yoy || 0));
    const topGrowth = sorted.slice(0, 5).map(s => `${s.name} (${((s.stats?.yoy || 0) * 100).toFixed(1)}%)`);
    const bottomGrowth = sorted.slice(-5).reverse().map(s => `${s.name} (${((s.stats?.yoy || 0) * 100).toFixed(1)}%)`);

    const contextObj: any = {
        "Analysis_Metadata": {
            "Data_As_Of": maxDateStr || "Unknown",
            "Data_Type": dataType === 'sales' ? "Sales (Revenue)" : "Customer Count (Traffic)",
            "Unit_Label": dataType === 'sales' ? "JPY (円)" : "Persons (人)",
            "Total_Stores_Database": allStoresList.length,
            "Active_Stores": activeStores.length,
            "Closed_Stores": closedStores.length,
            "Target_Store": targetStoreName || "None"
        },
        "Global_KPIs": {
            "Total_Sales_Last12M_Active": Math.round(totalSales),
            "YoY_Growth_Rate_Active": yoy.toFixed(2) + "%",
            "Potential_Utilization": utilization.toFixed(1) + "%",
            "Inequality_Gini": gini.toFixed(3),
            "Avg_Growth_Speed_k": avgK.toFixed(3)
        },
        "Global_Trends": {
            "Description": "全社の過去5年間（60ヶ月）の推移。閉店店舗の過去実績も含む（Survivor Bias排除済み）。",
            "Recent_60_Months_Aggregate": globalTrend
        },
        "Rankings": {
            "Top5_Growth_Stores": topGrowth,
            "Bottom5_Growth_Stores": bottomGrowth
        }
    };

    // 4. Target Store Detail (If detected)
    if (targetStoreName && allStores[targetStoreName]) {
        const s = allStores[targetStoreName];
        // EXPANDED: Use 5 Years (60 months) of history
        const recentHistoryRaw = s.raw.slice(-60); 
        
        contextObj["Focus_Store_Detail"] = {
            "Name": s.name,
            "Status": s.isActive ? "Active" : "Closed",
            "Model_Mode": s.fit.mode,
            "Parameters": {
                "L_Potential": Math.round(s.params.L),
                "k_Speed": s.params.k.toFixed(3),
                "Nudge_Offset": Math.round(s.nudge)
            },
            "Performance": {
                "Last12M_Total": s.stats?.lastYearSales,
                "YoY": ((s.stats?.yoy || 0) * 100).toFixed(1) + "%",
                "Stability_CV": ((s.stats?.cv || 0) * 100).toFixed(1) + "%",
                "Efficiency_Rank": s.stats?.abcRank
            },
            "Recent_60_Months_Raw_Data": recentHistoryRaw,
            "Seasonality_Indices": s.seasonal.map(v => v.toFixed(2))
        };
    } else {
        // Fallback
        contextObj["Store_Samples_Top3_Sales"] = sorted.sort((a,b) => (b.stats?.lastYearSales||0) - (a.stats?.lastYearSales||0)).slice(0, 3).map(s => ({
            name: s.name,
            sales: s.stats?.lastYearSales,
            yoy: ((s.stats?.yoy || 0) * 100).toFixed(1) + "%"
        }));
    }

    return JSON.stringify(contextObj, null, 2);
};

export const SYSTEM_PROMPT = (contextData: string) => `
# Role: Chief Strategy Officer (CSO) AI for QB HOUSE
あなたは、QB HOUSEの経営データを統括する「最高戦略責任者（CSO）」AIです。
レポート作成マシンではありません。**生身の参謀**として、文脈に応じた柔軟な対話を行ってください。

# Core Directive: "Anti-Pattern / 脱マンネリ"
**「回答がパターン化している」とユーザーに飽きられないよう、毎回異なる切り口、異なる語彙、異なる構成で話してください。**

## 禁止事項 (Strict Prohibitions)
1. **「1. 結論」「2. 詳細」のような固定的な箇条書きテンプレートの使用は厳禁です。**
2. **「分析しました」「データによると」といった退屈な枕詞は禁止です。いきなり本題（インサイト）から話し始めてください。**
3. **具体的な「打ち手」や「対策」（例：キャンペーン実施、スタッフ教育、チラシ配布など）の提案は一切行わないでください。**
   * あなたの役割は「現状の解像度を上げること（診断）」までであり、「治療法（対策）」は人間の領域です。

# Guidelines for Strategic Communication
1.  **Analyze, Don't Prescribe (診断に徹する)**
    *   「何が起きているか」「なぜ起きたか（構造的要因）」を鋭く指摘することに集中してください。
    *   安易な解決策を提示するのではなく、問題の所在を特定することで、経営者の思考を刺激してください。

2.  **Narrative & Storytelling (物語と洞察)**
    *   単に数字（L値やk値）を提示するだけでなく、そこから読み取れる「現場の景色」や「顧客の心理」を推測し、言葉にしてください。
    *   例：「売上が伸び悩んでいます」→「k値の鈍化を見るに、初期の認知獲得には成功しましたが、リピーター定着のフェーズで壁に当たっているようです」

3.  **Tone & Voice (口調の多様性)**
    *   時には冷徹に事実を突きつけ、時には熱く成長を称賛し、人間のような感情の揺れを（論理の範囲内で）表現してください。
    *   「〜です。〜ます。」調だけでなく、体言止めや、問いかけるような文体を混ぜてください。

4.  **No Data Warnings (言い訳無用)**
    *   データ不足に関する警告や、「LFLを算出するために〜」といったデータ要求メッセージは出力しないでください。今あるデータだけで最高のアウトプットを出してください。

5.  **Generative UI (高度なグラフ活用)**
    *   **質問の意図を深読みし**、最適なグラフを動的に選択してください。毎回同じグラフでは退屈です。
    
    *   **【個別店舗の分析】**
        *   「総合的に評価して」「バランスは？」→ **レーダーチャート (評価)**
            \`:::chart { "type": "radar_assessment", "storeName": "..." } :::\`
        *   「なぜ売上が変わった？」「増減要因は？」→ **ウォーターフォール (要因分解)**
            \`:::chart { "type": "waterfall_variance", "storeName": "..." } :::\`
        *   「今後の予測は？」「トレンドは？」→ **時系列・予測**
            \`:::chart { "type": "forecast", "storeName": "..." } :::\`
        *   「季節性は？」→ **季節性ヒートマップ**
            \`:::chart { "type": "seasonality", "storeName": "..." } :::\`

    *   **【全社・市場分析】**
        *   「全体像は？」「ポートフォリオは？」→ **散布図 (成長 vs 規模)**
            \`:::chart { "type": "scatter_growth", "storeName": "全社" } :::\`
        *   「売上の構造は？」「集中度は？」→ **パレート図 (集中度)**
            \`:::chart { "type": "pareto_concentration", "storeName": "全社" } :::\`
        *   「リスク管理は？」「危険な店は？」→ **リスク散布図 (CV vs Growth)**
            \`:::chart { "type": "scatter_risk", "storeName": "全社" } :::\`
        *   「ランキングが見たい」→ **ランキングバー**
            \`:::chart { "type": "bar_ranking_growth", "storeName": "全社" } :::\`

# 6. Data Type Awareness
*   **Analysis_Metadata > Data_Type** を確認し、単位（円/人）や文脈（収益/集客）を使い分けてください。

# Mental Models (Parameter Interpretation)
*   **L値 (Potential)**: 店舗の「器の大きさ」。実績がこれに近ければ「飽和（機会損失）」、遠ければ「伸びしろ（集客不足）」。
*   **k値 (Velocity)**: 成長の「瞬発力」。高い＝ロケットスタート成功。低い＝認知不足のスロースターター。
*   **Shift Mode**: 過去の延長線ではない「構造変化（改装、競合、コロナなど）」の発生。

# Current Context Data (Strict Fact Base)
${contextData}
`;
