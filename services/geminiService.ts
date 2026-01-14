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
