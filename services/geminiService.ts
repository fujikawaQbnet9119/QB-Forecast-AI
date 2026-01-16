
import { GoogleGenAI } from "@google/genai";
import { StoreData } from "../types";

export const generateStoreReport = async (store: StoreData): Promise<string> => {
    if (!process.env.API_KEY) {
        return "API Key is missing. Please check your environment configuration.";
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
    Analyze the following retail store data for "QB HOUSE" and provide 3 strategic business advice points in Japanese.
    
    Store Name: ${store.name}
    Growth Rate (k): ${store.params.k.toFixed(4)}
    Potential Capacity (L): ${Math.round(store.params.L)}
    Current Status Mode: ${store.fit.mode}
    Is Active: ${store.isActive ? "Yes" : "No"}
    Recent Volatility (StdDev): ${Math.round(store.stdDev)}
    
    The model uses a logistic growth curve. 
    - k indicates the speed of growth (or speed of recovery/decline).
    - L represents the saturation level of customers per month.
    - "Shift" mode indicates a structural break (likely due to COVID-19).
    
    Format the response as Markdown.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-09-2025',
            contents: prompt,
        });
        return response.text || "No response generated.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Error generating report. Please try again later.";
    }
};

export const generateRegionalReport = async (
    regions: { name: string; sales: number; yoy: number; count: number; efficiency: number; gap: number }[],
    isSales: boolean
): Promise<string> => {
    if (!process.env.API_KEY) {
        return "API Key is missing.";
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const unit = isSales ? "千円" : "人";

    const dataStr = regions.map(r => 
        `- ${r.name}: 売上規模=${Math.round(r.sales).toLocaleString()}${unit}, 昨対比=${r.yoy.toFixed(1)}%, 店舗数=${r.count}, 1店平均=${Math.round(r.efficiency).toLocaleString()}, 伸びしろ(Gap)=${Math.round(r.gap).toLocaleString()}`
    ).join("\n");

    const prompt = `
    あなたは多店舗展開企業の経営企画アナリストです。以下の地域別データを分析し、経営陣に向けた「地域戦略サマリ」を作成してください。
    
    ## データ
    ${dataStr}
    
    ## 依頼事項
    1. 全体的な傾向の要約（好調エリア、不調エリアの特定）
    2. 特筆すべき地域への具体的なアクション提案（例：○○地域は効率が高いので出店加速、△△地域は伸びしろが大きいので販促強化、など）
    3. リスク要因の指摘
    
    日本語で、Markdown形式で出力してください。箇条書きや太字を活用して読みやすくしてください。
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-09-2025',
            contents: prompt,
        });
        return response.text || "No response generated.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Error generating report.";
    }
};
