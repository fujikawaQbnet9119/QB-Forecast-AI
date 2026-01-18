
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'marked';
import HelpTooltip from './HelpTooltip';

interface Persona {
    id: 'standard' | 'logic' | 'empathy' | 'devil';
    name: string;
    icon: string;
    prompt: string;
    color: string;
    description: string;
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

interface Session {
    id: string;
    title: string;
    history: ChatMessage[];
    timestamp: number;
}

const PERSONAS: Persona[] = [
    { 
        id: 'standard', 
        name: 'Standard', 
        icon: 'fa-robot', 
        color: 'bg-[#005EB8]', 
        prompt: 'QBハウスのマネジメントを支援する冷静で知的なコーチです。',
        description: '【標準モード】冷静かつ客観的に対話をリードし、思考の整理をサポートします。バランスの取れたコーチングを求める時に最適です。'
    },
    { 
        id: 'logic', 
        name: 'Logic', 
        icon: 'fa-brain', 
        color: 'bg-green-600', 
        prompt: '冷徹なデータ分析官です。事実と論理のみに基づき発言します。',
        description: '【論理モード】感情を排除し、事実とロジックのみで議論します。矛盾の指摘や、構造的な分析が必要な時に適しています。'
    },
    { 
        id: 'empathy', 
        name: 'Empathy', 
        icon: 'fa-heart', 
        color: 'bg-pink-500', 
        prompt: '受容的で優しいカウンセラーです。ユーザーの感情に寄り添います。',
        description: '【共感モード】判断を避け、話し手の感情や状況を丸ごと受け止めます。ストレスの発散や、まずは話を聞いてほしい時に選んでください。'
    },
    { 
        id: 'devil', 
        name: 'Devil', 
        icon: 'fa-fire', 
        color: 'bg-red-600', 
        prompt: '批判的なリスクマネージャーです。あえて欠点やリスクを指摘します。',
        description: '【悪魔の代弁者】あえて批判的な視点を持ち、見落としているリスクや意見の脆弱性を突きます。意思決定の「穴」を探すための壁打ちに。'
    }
];

const STORAGE_KEY = 'reflect_sessions_v3';

const ManagementCoachView: React.FC = () => {
    const [sessions, setSessions] = useState<Session[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    });

    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [personaIndex, setPersonaIndex] = useState(0);
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const currentPersona = PERSONAS[personaIndex];

    // 音声認識の初期化
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'ja-JP';
            recognition.interimResults = true;
            recognition.continuous = true;

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    setInputValue(prev => prev + finalTranscript);
                }
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    // 初回起動時: 最後に開いたセッションがあればロード
    useEffect(() => {
        if (sessions.length > 0 && !currentSessionId) {
            const latest = sessions[0];
            setCurrentSessionId(latest.id);
            setChatHistory(latest.history);
        } else if (chatHistory.length === 0) {
            setChatHistory([{ role: 'model', text: 'お疲れ様です。思考の整理を始めましょう。\nまずは、今感じている課題や、頭の中にあるモヤモヤを自由に教えてください。' }]);
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [chatHistory, isTyping]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }, [sessions]);

    const togglePersona = () => {
        setPersonaIndex((prev) => (prev + 1) % PERSONAS.length);
    };

    const startNewSession = () => {
        setChatHistory([{ role: 'model', text: '新しいセッションを開始しました。現在の状況からお話しください。' }]);
        setCurrentSessionId(null);
        setShowHistory(false);
    };

    const loadSession = (session: Session) => {
        setCurrentSessionId(session.id);
        setChatHistory(session.history);
        setShowHistory(false);
    };

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm("この対話履歴を削除しますか？")) return;
        const nextSessions = sessions.filter(s => s.id !== id);
        setSessions(nextSessions);
        if (currentSessionId === id) {
            startNewSession();
        }
    };

    const updateSessionStorage = (history: ChatMessage[]) => {
        if (currentSessionId) {
            setSessions(prev => prev.map(s => 
                s.id === currentSessionId 
                ? { ...s, history, timestamp: Date.now() } 
                : s
            ).sort((a, b) => b.timestamp - a.timestamp));
        } else {
            const firstUserMsg = history.find(m => m.role === 'user')?.text || "新規対話";
            const newId = Date.now().toString();
            const newSession: Session = {
                id: newId,
                title: firstUserMsg.substring(0, 15) + (firstUserMsg.length > 15 ? '...' : ''),
                history,
                timestamp: Date.now()
            };
            setSessions(prev => [newSession, ...prev]);
            setCurrentSessionId(newId);
        }
    };

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("お使いのブラウザは音声入力に対応していません。Chrome等の最新ブラウザをご利用ください。");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const sendMessage = async () => {
        const text = inputValue.trim();
        if (!text) return;

        if (isListening) {
            recognitionRef.current.stop();
        }

        const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: text }];
        setChatHistory(newHistory);
        setInputValue("");
        setIsTyping(true);
        
        updateSessionStorage(newHistory);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const systemInstruction = `
            あなたはQBハウスのマネジメント支援AIコーチ「Reflect」です。
            ユーザーは経営層やエリアマネージャーです。
            QBハウスの哲学（10分カット、高効率、衛生徹底）を理解し、対話を行ってください。
            
            【現在のペルソナ: ${currentPersona.name}】
            ${currentPersona.prompt}
            
            回答は簡潔かつ鋭く、相手の思考を深めることを目的としてください。
        `;

        try {
            const res = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: newHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                config: { systemInstruction: systemInstruction }
            });

            const aiResponse = res.text || "応答を生成できませんでした。";
            const finalHistory: ChatMessage[] = [...newHistory, { role: 'model', text: aiResponse }];
            setChatHistory(finalHistory);
            updateSessionStorage(finalHistory);
        } catch (e) {
            const errorHistory: ChatMessage[] = [...newHistory, { role: 'model', text: '通信エラーが発生しました。接続を確認してください。' }];
            setChatHistory(errorHistory);
            updateSessionStorage(errorHistory);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#F8FAFC] animate-fadeIn">
            {/* Header */}
            <div className="h-16 bg-white border-b border-gray-100 flex items-center justify-between pl-16 pr-6 z-30 shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowHistory(!showHistory)} className="p-2 text-gray-400 hover:text-[#005EB8] hover:bg-gray-50 rounded-lg transition-all" title="履歴を表示">
                        <i className={`fas ${showHistory ? 'fa-times' : 'fa-history'}`}></i>
                    </button>
                    
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-3 py-1.5 rounded-xl transition-all" onClick={togglePersona}>
                            <div className={`w-8 h-8 rounded-full ${currentPersona.color} flex items-center justify-center text-white text-xs shadow-sm`}>
                                <i className={`fas ${currentPersona.icon}`}></i>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-gray-800 font-display">Reflect</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border text-white shadow-sm ${currentPersona.color}`}>{currentPersona.name}</span>
                            </div>
                        </div>
                        <HelpTooltip 
                            title="ペルソナの違いについて" 
                            content={
                                <div className="space-y-3">
                                    {PERSONAS.map(p => (
                                        <div key={p.id} className="border-b border-gray-50 pb-2 last:border-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`w-2 h-2 rounded-full ${p.color}`}></span>
                                                <span className="font-black text-[11px]">{p.name} Mode</span>
                                            </div>
                                            <p className="text-[10px] leading-relaxed text-gray-500">{p.description}</p>
                                        </div>
                                    ))}
                                </div>
                            } 
                        />
                    </div>
                </div>

                <button onClick={startNewSession} className="bg-gray-800 text-white px-5 py-2 rounded-full text-[10px] font-black hover:bg-black transition-all flex items-center gap-2 shadow-md font-display">
                    <i className="fas fa-plus"></i> NEW SESSION
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Session Sidebar */}
                {showHistory && (
                    <div className="absolute inset-y-0 left-0 w-64 bg-white border-r border-gray-100 z-40 shadow-2xl animate-slideRight">
                        <div className="p-4 border-b border-gray-50 font-black text-[10px] text-gray-400 uppercase tracking-widest font-display">対話の履歴</div>
                        <div className="overflow-y-auto h-full p-2 space-y-1 pb-20 custom-scrollbar">
                            {sessions.map(s => (
                                <div key={s.id} onClick={() => loadSession(s)} className={`p-3 rounded-xl cursor-pointer text-xs font-bold transition-all group relative ${currentSessionId === s.id ? 'bg-blue-50 text-[#005EB8]' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    <div className="truncate pr-6">{s.title}</div>
                                    <div className="text-[9px] opacity-50">{new Date(s.timestamp).toLocaleString()}</div>
                                    <button onClick={(e) => deleteSession(e, s.id)} className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all">
                                        <i className="fas fa-trash text-[10px]"></i>
                                    </button>
                                </div>
                            ))}
                            {sessions.length === 0 && <div className="p-8 text-center text-xs text-gray-300 font-bold">履歴がありません</div>}
                        </div>
                    </div>
                )}

                {/* Chat Container */}
                <div className="flex-1 flex flex-col relative h-full">
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 scroll-smooth custom-scrollbar">
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex w-full animate-slideUp ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && (
                                    <div className={`w-10 h-10 rounded-full ${currentPersona.color} flex items-center justify-center text-white shadow-md shrink-0 mr-4`}>
                                        <i className={`fas ${currentPersona.icon}`}></i>
                                    </div>
                                )}
                                <div 
                                    className={`max-w-[85%] px-6 py-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                                        msg.role === 'user' 
                                        ? 'bg-[#005EB8] text-white rounded-tr-sm' 
                                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm prose prose-sm max-w-none'
                                    }`}
                                    dangerouslySetInnerHTML={msg.role === 'model' ? { __html: marked(msg.text) } : undefined}
                                >
                                    {msg.role === 'user' ? msg.text : undefined}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex w-full justify-start animate-slideUp">
                                <div className={`w-10 h-10 rounded-full ${currentPersona.color} flex items-center justify-center text-white shrink-0 mr-4 opacity-80`}>
                                    <i className="fas fa-ellipsis-h animate-pulse"></i>
                                </div>
                                <div className="bg-white border border-gray-100 px-5 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="shrink-0 p-4 md:p-8 bg-gradient-to-t from-white via-white to-transparent">
                        <div className="max-w-4xl mx-auto">
                            <div className="relative group">
                                <textarea 
                                    rows={1}
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                                    placeholder={isListening ? "お話しください..." : "ここから思考の整理を始めましょう..."}
                                    className={`w-full bg-white border-2 rounded-[2rem] pl-6 pr-32 py-5 focus:outline-none transition-all resize-none shadow-2xl text-base font-bold text-gray-700 ${isListening ? 'border-red-400 ring-4 ring-red-50' : 'border-gray-100 focus:border-[#005EB8] focus:ring-4 focus:ring-blue-50'}`}
                                    style={{ minHeight: '70px' }}
                                />
                                <div className="absolute right-4 bottom-4 flex items-center gap-2">
                                    <button 
                                        onClick={toggleListening}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse shadow-red-200 shadow-xl' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 shadow-lg'}`}
                                        title="音声入力"
                                    >
                                        <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'} text-lg`}></i>
                                    </button>
                                    <button 
                                        onClick={sendMessage}
                                        disabled={!inputValue.trim() || isTyping}
                                        className="bg-[#005EB8] text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:bg-gray-200 disabled:shadow-none disabled:scale-100"
                                    >
                                        <i className="fas fa-paper-plane text-lg"></i>
                                    </button>
                                </div>
                            </div>
                            <p className="text-center text-[9px] text-gray-400 font-bold mt-4 uppercase tracking-widest flex justify-center items-center gap-4 font-display">
                                <span>Shift + Enter to wrap</span>
                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                <span>Auto-saved to Cache</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes slideRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-slideRight { animation: slideRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                .animate-slideUp { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }
            `}} />
        </div>
    );
};

export default ManagementCoachView;
