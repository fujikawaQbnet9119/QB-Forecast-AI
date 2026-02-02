import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import HelpTooltip from './HelpTooltip';
import { StoreData } from '../types';

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface TreeNode {
    id: string;
    text: string;
    children: TreeNode[];
    isTarget?: boolean;
    sourceId?: string;
}

interface Lever {
    id: string;
    category: string;
    detail: string;
}

interface MeasurePart {
    id: string;
    category: string;
    detail: string;
    target: string;
    pic: string;
}

interface MarketingProject {
    id: string;
    title: string;
    status: 'draft' | 'active' | 'completed';
    currentStep: StepId;
    updatedAt: string;
    data: {
        observationFacts: string;
        idealState: string;
        currentState: string;
        stopPoint: string;
        whyTree: TreeNode;
        rootCauseId: string;
        rootCauseEvidence: string;
        levers: Lever[];
        minimumLever: string;
        measures: MeasurePart[];
        kgi: string;
        kpi: string;
        measurePeriod: string;
        measureMethod: string;
        tasks: string;
    };
}

const STEP_HEADERS = {
    1: { title: "観測", desc: "計測された数値や事実データの入力" },
    2: { title: "歪み特定", desc: "理想と現実の差分・構造停止点" },
    3: { title: "構造分解", desc: "WHYツリーによる深掘り" },
    4: { title: "原因確定", desc: "裏取りと真因の断定" },
    5: { title: "可変レバー", desc: "打ち手候補の列挙" },
    6: { title: "最小レバー", desc: "施策の魂を1行で定義" },
    7: { title: "施策設計", desc: "具体的アクションパーツへの分解" },
    8: { title: "検証設計", desc: "成功の定義と計測指標" },
    9: { title: "計画化", desc: "決定事項サマリと実行タスク" }
};

const POINTS = ['認知', '興味', '比較', '来店', '待機', '施術', '会計', '再来'];
const LEVER_CATS = ["価格", "表示", "導線", "言葉", "保証", "限定性", "比較補助", "運用", "教育", "体験順序", "待ち時間", "選択肢数"];
const MEASURE_PARTS = ["POP/掲示", "導線変更", "接客文言", "SNS/Web", "什器/設備", "運用ルール", "教育/研修", "その他"];

// --- Helper Functions ---
const findNodeAndProcess = (node: TreeNode, id: string, process: (n: TreeNode) => TreeNode): TreeNode => {
    if (node.id === id) return process(node);
    return { ...node, children: node.children.map(c => findNodeAndProcess(c, id, process)) };
};

const collectCandidates = (node: TreeNode, list: { id: string, text: string }[]) => {
    if (node.text && node.id !== 'root') list.push({ id: node.id, text: node.text });
    node.children.forEach(c => collectCandidates(c, list));
};

// --- Sub-components for Form Items (Prevent focus loss) ---

const TreeRenderer: React.FC<{
    node: TreeNode;
    level: number;
    onUpdateText: (id: string, text: string) => void;
    onAddChild: (parentId: string) => void;
    onDelete: (id: string) => void;
    onAI: (id: string, text: string) => void;
}> = ({ node, level, onUpdateText, onAddChild, onDelete, onAI }) => (
    <div className="relative pl-6 py-2 border-l border-gray-200 ml-4 animate-fadeIn">
        <div className="flex items-center gap-2 mb-2 group">
            <div className={`w-2 h-2 rounded-full absolute -left-1.5 ${level === 0 ? 'bg-red-500' : 'bg-blue-400'}`}></div>
            <input 
                type="text" value={node.text} placeholder={level === 0 ? "構造停止点は？" : "なぜ？"}
                onChange={e => onUpdateText(node.id, e.target.value)}
                className="flex-1 p-2 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
            />
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => onAddChild(node.id)} className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>
                <button onClick={() => onAI(node.id, node.text)} className="p-1.5 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></button>
                {level > 0 && (
                    <button onClick={() => onDelete(node.id)} className="p-1.5 bg-red-50 text-red-500 rounded-md hover:bg-red-100"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                )}
            </div>
        </div>
        {node.children.map(c => <TreeRenderer key={c.id} node={c} level={level + 1} onUpdateText={onUpdateText} onAddChild={onAddChild} onDelete={onDelete} onAI={onAI} />)}
    </div>
);

const LeverItem: React.FC<{ lever: Lever; onUpdate: (id: string, text: string) => void; onDelete: (id: string) => void }> = ({ lever, onUpdate, onDelete }) => (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 animate-fadeIn">
        <span className="bg-blue-100 text-[#005EB8] px-3 py-1 rounded-lg text-[10px] font-black uppercase w-24 text-center truncate">{lever.category}</span>
        <input 
            type="text" value={lever.detail} 
            onChange={e => onUpdate(lever.id, e.target.value)}
            placeholder={`${lever.category}をどう変えるか？`}
            className="flex-1 bg-transparent border-none text-sm font-bold focus:ring-0 outline-none"
        />
        <button onClick={() => onDelete(lever.id)} className="text-gray-300 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
    </div>
);

const MeasureItem: React.FC<{ item: MeasurePart; onUpdate: (id: string, field: keyof MeasurePart, val: string) => void; onDelete: (id: string) => void }> = ({ item, onUpdate, onDelete }) => (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm grid grid-cols-12 gap-4 items-center animate-fadeIn">
        <div className="col-span-2">
            <select value={item.category} onChange={e => onUpdate(item.id, 'category', e.target.value)} className="w-full p-2 bg-blue-50 text-[#005EB8] text-[10px] font-black border-none rounded-lg outline-none">
                {MEASURE_PARTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
        </div>
        <div className="col-span-4">
            <input type="text" value={item.detail} onChange={e => onUpdate(item.id, 'detail', e.target.value)} placeholder="実施内容" className="w-full text-xs font-bold border-b border-gray-100 outline-none pb-1" />
        </div>
        <div className="col-span-3">
            <input type="text" value={item.target} onChange={e => onUpdate(item.id, 'target', e.target.value)} placeholder="狙い" className="w-full text-xs font-bold text-gray-400 border-b border-gray-50 outline-none pb-1" />
        </div>
        <div className="col-span-2">
            <input type="text" value={item.pic} onChange={e => onUpdate(item.id, 'pic', e.target.value)} placeholder="担当/期限" className="w-full text-[10px] font-bold text-gray-500 bg-gray-50 p-2 rounded-lg outline-none" />
        </div>
        <div className="col-span-1 text-right">
            <button onClick={() => onDelete(item.id)} className="text-gray-300 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
        </div>
    </div>
);

// --- Main Component ---

interface MarketingDesignViewProps {
    allStores: { [name: string]: StoreData };
}

const MarketingDesignView: React.FC<MarketingDesignViewProps> = ({ allStores }) => {
    const [view, setView] = useState<'dashboard' | 'project'>('dashboard');
    const [projects, setProjects] = useState<MarketingProject[]>(() => {
        const saved = localStorage.getItem('qb_marketing_pro_projects');
        return saved ? JSON.parse(saved) : [];
    });
    const [currentProject, setCurrentProject] = useState<MarketingProject | null>(null);
    const [activeStep, setActiveStep] = useState<StepId>(1);
    const [aiLoading, setAiLoading] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProjInfo, setNewProjInfo] = useState({ storeName: '', staffName: '', summary: '' });
    const projectInputRef = useRef<HTMLInputElement>(null);

    // Sync currentProject to projects list and localStorage
    useEffect(() => {
        if (currentProject) {
            setProjects(prev => prev.map(p => 
                p.id === currentProject.id 
                ? { ...currentProject, currentStep: activeStep, updatedAt: new Date().toLocaleDateString() } 
                : p
            ));
        }
    }, [currentProject, activeStep]);

    useEffect(() => {
        localStorage.setItem('qb_marketing_pro_projects', JSON.stringify(projects));
    }, [projects]);

    // --- AI ---
    const callAI = async (prompt: string) => {
        if (!process.env.API_KEY) return null;
        setAiLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            return res.text;
        } catch (e) {
            return null;
        } finally {
            setAiLoading(false);
        }
    };

    // --- Data Update Handlers ---
    const updateProjectData = (key: string, value: any) => {
        setCurrentProject(prev => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
    };

    const handleTreeUpdateText = (id: string, text: string) => {
        setCurrentProject(prev => {
            if (!prev) return null;
            return { ...prev, data: { ...prev.data, whyTree: findNodeAndProcess(prev.data.whyTree, id, n => ({ ...n, text })) } };
        });
    };

    const handleTreeAddChild = (parentId: string) => {
        setCurrentProject(prev => {
            if (!prev) return null;
            return { ...prev, data: { ...prev.data, whyTree: findNodeAndProcess(prev.data.whyTree, parentId, n => ({ ...n, children: [...n.children, { id: Math.random().toString(36).substr(2, 9), text: '', children: [] }] })) } };
        });
    };

    const handleTreeDelete = (id: string) => {
        setCurrentProject(prev => {
            if (!prev) return null;
            const remover = (node: TreeNode): TreeNode => ({ ...node, children: node.children.filter(c => c.id !== id).map(remover) });
            return { ...prev, data: { ...prev.data, whyTree: remover(prev.data.whyTree) } };
        });
    };

    const handleTreeAI = async (nodeId: string, text: string) => {
        if (!text) return alert("項目を入力してください");
        const res = await callAI(`「${text}」の要因を3つ、日本語の箇条書き（マーカーなし）で3行以内で挙げてください。`);
        if (res) {
            const lines = res.split('\n').filter(l => l.trim()).slice(0, 3);
            setCurrentProject(prev => {
                if (!prev) return null;
                return { ...prev, data: { ...prev.data, whyTree: findNodeAndProcess(prev.data.whyTree, nodeId, n => ({ ...n, children: [...n.children, ...lines.map(l => ({ id: Math.random().toString(36).substr(2, 9), text: l.replace(/^[・\- \d.]+\s*/, ''), children: [] }))] })) } };
            });
        }
    };

    const handleLeverUpdate = (id: string, detail: string) => {
        setCurrentProject(prev => prev ? { ...prev, data: { ...prev.data, levers: prev.data.levers.map(l => l.id === id ? { ...l, detail } : l) } } : null);
    };

    const handleMeasureUpdate = (id: string, field: keyof MeasurePart, val: string) => {
        setCurrentProject(prev => prev ? { ...prev, data: { ...prev.data, measures: prev.data.measures.map(m => m.id === id ? { ...m, [field]: val } : m) } } : null);
    };

    const handleStopPointSelection = (point: string) => {
        setCurrentProject(prev => {
            if (!prev) return null;
            const newData = { ...prev.data, stopPoint: point };
            if (prev.data.whyTree.id === 'root' && (!prev.data.whyTree.text || prev.data.whyTree.text.includes('止まってしまうのか'))) {
                newData.whyTree = { id: 'root', text: `なぜ「${point}」で止まってしまうのか？`, children: prev.data.whyTree.children };
            }
            return { ...prev, data: newData };
        });
    };

    // --- Navigation ---
    const handleNext = () => {
        const d = currentProject?.data;
        if (!d) return;
        if (activeStep === 1 && !d.observationFacts) return alert("事実データを入力してください");
        if (activeStep === 2 && !d.stopPoint) return alert("停止点を特定してください");
        if (activeStep === 4 && !d.rootCauseId) return alert("原因を特定してください");
        if (activeStep === 6 && !d.minimumLever) return alert("最小レバーを定義してください");

        if (activeStep < 9) {
            setActiveStep((activeStep + 1) as StepId);
        } else {
            setView('dashboard');
        }
    };

    const handleNewProject = () => {
        if (!newProjInfo.storeName || !newProjInfo.staffName || !newProjInfo.summary) return alert("全て入力してください");
        const newProj: MarketingProject = {
            id: Math.random().toString(36).substr(2, 9),
            title: `${newProjInfo.staffName} / ${newProjInfo.storeName}：${newProjInfo.summary}`,
            status: 'draft', currentStep: 1, updatedAt: new Date().toLocaleDateString(),
            data: { observationFacts: '', idealState: '', currentState: '', stopPoint: '', whyTree: { id: 'root', text: '', children: [] }, rootCauseId: '', rootCauseEvidence: '', levers: [], minimumLever: '', measures: [], kgi: '', kpi: '', measurePeriod: '', measureMethod: '', tasks: '' }
        };
        setProjects([newProj, ...projects]);
        setIsCreateModalOpen(false);
        setNewProjInfo({ storeName: '', staffName: '', summary: '' });
        setCurrentProject(newProj);
        setActiveStep(1);
        setView('project');
    };

    // --- Global Operations (Import/Export/Reset) ---
    const exportProjects = () => {
        const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `MarketingPro_${new Date().toISOString().slice(0,10)}.mpro`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const importProjects = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (Array.isArray(data)) {
                    setProjects(data);
                    alert("データを正常に読み込みました。");
                }
            } catch (err) {
                alert("読み込みに失敗しました。形式を確認してください。");
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC]">
            {view === 'dashboard' ? (
                <div className="max-w-6xl mx-auto space-y-8 pb-32">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">Marketing Design Pro</h2>
                            <p className="text-xs text-gray-400 font-bold">構造改善プロジェクト一覧</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => { if(confirm("全案件を削除しますか？")) setProjects([]); }} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 shadow-sm transition-all">初期化</button>
                            <button onClick={exportProjects} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-700 shadow-md transition-all flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                保存 (Export)
                            </button>
                            <button onClick={() => projectInputRef.current?.click()} className="px-4 py-2 bg-white text-slate-800 border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                読込 (Import)
                            </button>
                            <input type="file" ref={projectInputRef} className="hidden" accept=".mpro,.json" onChange={importProjects} />
                            <button onClick={() => setIsCreateModalOpen(true)} className="bg-[#005EB8] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100 flex items-center gap-2 hover:bg-[#004a94] transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                新規案件
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map(p => (
                            <div key={p.id} onClick={() => { setCurrentProject(p); setActiveStep(p.currentStep); setView('project'); }} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all group relative border-t-8 border-t-[#005EB8]">
                                <button onClick={e => { e.stopPropagation(); if(confirm("削除しますか？")) setProjects(projects.filter(x => x.id !== p.id)); }} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                                <div className="text-[9px] font-black text-blue-500 uppercase mb-2">Step {p.currentStep} / 9</div>
                                <h4 className="font-black text-gray-800 mb-4 line-clamp-2 h-10">{p.title || "名称未設定"}</h4>
                                <div className="flex justify-between items-center text-[10px] text-gray-400 border-t border-gray-50 pt-4">
                                    <span>更新: {p.updatedAt}</span>
                                    <span className="font-black text-[#005EB8]">開く &rarr;</span>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setIsCreateModalOpen(true)} className="border-2 border-dashed border-gray-200 rounded-3xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:bg-blue-50/30 transition-all min-h-[160px]">
                            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            <span className="text-xs font-black">新しい案件をスタート</span>
                        </button>
                    </div>

                    {isCreateModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                            <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl space-y-6">
                                <h3 className="text-xl font-black text-gray-800 font-display">新規改善案件の作成</h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase">担当者名</label>
                                        <input type="text" value={newProjInfo.staffName} onChange={e => setNewProjInfo({...newProjInfo, staffName: e.target.value})} placeholder="例：山田 太郎" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase">対象店舗名</label>
                                        <div className="relative">
                                            <input 
                                                list="store-suggestions"
                                                type="text" 
                                                value={newProjInfo.storeName} 
                                                onChange={e => setNewProjInfo({...newProjInfo, storeName: e.target.value})} 
                                                placeholder="店舗名を入力または選択" 
                                                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" 
                                            />
                                            <datalist id="store-suggestions">
                                                {Object.keys(allStores).sort().map(name => <option key={name} value={name} />)}
                                            </datalist>
                                            <p className="text-[8px] text-blue-400 mt-1 font-bold">※読込済みの店舗データから自動補完されます</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-400 uppercase">改善案件の概要</label>
                                        <input type="text" value={newProjInfo.summary} onChange={e => setNewProjInfo({...newProjInfo, summary: e.target.value})} placeholder="例：平日午後の待機列解消" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none" />
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl text-xs font-black">キャンセル</button>
                                    <button onClick={handleNewProject} className="flex-2 py-3 bg-[#005EB8] text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100">作成を開始する &rarr;</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="max-w-[1400px] mx-auto grid grid-cols-12 gap-8 pb-40">
                    <div className="col-span-12 lg:col-span-3 space-y-6">
                        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-[#005EB8] transition-colors mb-4">&larr; 一覧に戻る</button>
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 sticky top-8">
                            <h3 className="font-black text-gray-400 text-[10px] uppercase tracking-widest mb-6 px-2">Design Process</h3>
                            <div className="space-y-1">
                                {(Object.entries(STEP_HEADERS) as any).map(([id, h]: any) => {
                                    const stepId = parseInt(id) as StepId;
                                    const isActive = activeStep === stepId;
                                    const isPast = activeStep > stepId;
                                    return (
                                        <div key={id} onClick={() => isPast ? setActiveStep(stepId) : null} className={`flex items-center p-3 rounded-2xl text-xs transition-all cursor-pointer ${isActive ? 'bg-blue-50 text-[#005EB8] font-black shadow-sm' : isPast ? 'text-gray-600 font-bold' : 'text-gray-300 opacity-50'}`}>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 text-[10px] flex-shrink-0 ${isActive ? 'bg-[#005EB8] text-white shadow-md' : isPast ? 'bg-green-100 text-green-600' : 'bg-gray-100'}`}>{isPast ? '✓' : id}</div>
                                            <div className="truncate">{h.title}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12 lg:col-span-9 space-y-6">
                        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden min-h-[650px] flex flex-col relative">
                            <div className="p-10 border-b border-gray-50 bg-slate-50/20">
                                <div className="flex items-start gap-6">
                                    <div className="w-14 h-14 bg-blue-100 text-[#005EB8] rounded-2xl flex items-center justify-center text-2xl font-black shadow-sm flex-shrink-0">{activeStep}</div>
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-800 tracking-tight">{STEP_HEADERS[activeStep].title}</h3>
                                        <p className="text-sm text-gray-400 font-bold mt-1">{STEP_HEADERS[activeStep].desc}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 p-10">
                                {activeStep === 1 && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">観測データ入力 (事実のみを記述)</label>
                                        <textarea value={currentProject?.data.observationFacts} onChange={e => updateProjectData('observationFacts', e.target.value)} className="w-full h-64 p-6 bg-gray-50 border-none rounded-3xl text-sm font-bold focus:ring-2 focus:ring-[#005EB8] outline-none shadow-inner" />
                                    </div>
                                )}

                                {activeStep === 2 && (
                                    <div className="space-y-10 animate-fadeIn">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="bg-green-50/50 p-8 rounded-3xl border border-green-100">
                                                <div className="text-[10px] font-black text-green-600 mb-4 uppercase tracking-widest text-center">理想の状態 (TO-BE)</div>
                                                <input type="text" value={currentProject?.data.idealState} onChange={e => updateProjectData('idealState', e.target.value)} placeholder="本来どうあるべきか？" className="w-full bg-white p-4 rounded-xl border-none font-bold text-sm outline-none shadow-sm text-center" />
                                            </div>
                                            <div className="bg-red-50/50 p-8 rounded-3xl border border-red-100">
                                                <div className="text-[10px] font-black text-red-600 mb-4 uppercase tracking-widest text-center">現状の形 (AS-IS)</div>
                                                <input type="text" value={currentProject?.data.currentState} onChange={e => updateProjectData('currentState', e.target.value)} placeholder="実際の状況は？" className="w-full bg-white p-4 rounded-xl border-none font-bold text-sm outline-none shadow-sm text-center" />
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap justify-center gap-3">
                                            {POINTS.map(p => (
                                                <button key={p} onClick={() => handleStopPointSelection(p)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all transform active:scale-95 ${currentProject?.data.stopPoint === p ? 'bg-[#005EB8] text-white shadow-xl shadow-blue-200 scale-110' : 'bg-white text-gray-400 border border-gray-100 hover:bg-gray-50'}`}>{p}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeStep === 3 && (
                                    <div className="bg-gray-50 rounded-[2rem] p-8 overflow-x-auto min-h-[450px] shadow-inner">
                                        <TreeRenderer node={currentProject!.data.whyTree} level={0} onUpdateText={handleTreeUpdateText} onAddChild={handleTreeAddChild} onDelete={handleTreeDelete} onAI={handleTreeAI} />
                                        {aiLoading && <div className="mt-8 text-center text-[10px] font-black text-purple-500 animate-pulse uppercase tracking-widest">AI Thinking...</div>}
                                    </div>
                                )}

                                {activeStep === 4 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase">原因候補</label>
                                            <div className="bg-white rounded-2xl border border-gray-100 h-64 overflow-y-auto p-2 space-y-1 shadow-sm">
                                                {(() => {
                                                    const list: any[] = [];
                                                    collectCandidates(currentProject!.data.whyTree, list);
                                                    return list.map(c => (
                                                        <button key={c.id} onClick={() => updateProjectData('rootCauseId', c.id)} className={`w-full text-left p-3 rounded-xl text-xs font-bold transition-all ${currentProject?.data.rootCauseId === c.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}>{c.text}</button>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase">裏取り・確証の根拠</label>
                                            <textarea value={currentProject?.data.rootCauseEvidence} onChange={e => updateProjectData('rootCauseEvidence', e.target.value)} className="w-full h-64 p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold outline-none shadow-inner" />
                                        </div>
                                    </div>
                                )}

                                {activeStep === 5 && (
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="flex flex-wrap gap-2 mb-6">
                                            {LEVER_CATS.map(cat => (
                                                <button key={cat} onClick={() => updateProjectData('levers', [...currentProject!.data.levers, { id: Math.random().toString(36).substr(2, 9), category: cat, detail: '' }])} className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-500 hover:border-blue-400 hover:text-blue-600 shadow-sm transition-all">+ {cat}</button>
                                            ))}
                                        </div>
                                        <div className="space-y-4">
                                            {currentProject?.data.levers.map(lever => (
                                                <LeverItem key={lever.id} lever={lever} onUpdate={handleLeverUpdate} onDelete={(id) => updateProjectData('levers', currentProject!.data.levers.filter(l => l.id !== id))} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeStep === 6 && (
                                    <div className="py-10 animate-fadeIn">
                                        <div className="bg-slate-800 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                                            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">最小レバー定義 (施策の芯を1行で)</h4>
                                            <input type="text" value={currentProject?.data.minimumLever} onChange={e => updateProjectData('minimumLever', e.target.value)} placeholder="例：看板に『待ち時間目安』を表示し、入店不安を解消する" className="w-full p-6 bg-white/10 border-2 border-white/20 rounded-2xl text-xl font-black text-white placeholder-white/20 outline-none focus:border-blue-400 transition-all" />
                                        </div>
                                    </div>
                                )}

                                {activeStep === 7 && (
                                    <div className="space-y-4 animate-fadeIn">
                                        {currentProject?.data.measures.map(m => (
                                            <MeasureItem key={m.id} item={m} onUpdate={handleMeasureUpdate} onDelete={(id) => updateProjectData('measures', currentProject!.data.measures.filter(x => x.id !== id))} />
                                        ))}
                                        <button onClick={() => updateProjectData('measures', [...currentProject!.data.measures, { id: Math.random().toString(36).substr(2, 9), category: 'その他', detail: '', target: '', pic: '' }])} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-3xl text-gray-300 font-black text-xs hover:border-blue-200 hover:bg-blue-50/20 transition-all">+ アクションを追加</button>
                                    </div>
                                )}

                                {activeStep === 8 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                                        <div className="space-y-6">
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                                <h4 className="text-[10px] font-black text-[#005EB8] uppercase mb-4 tracking-widest">最終成果 (KGI)</h4>
                                                <input type="text" value={currentProject?.data.kgi} onChange={e => updateProjectData('kgi', e.target.value)} placeholder="例：月商 500万円の達成" className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
                                            </div>
                                            <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm">
                                                <h4 className="text-[10px] font-black text-[#005EB8] uppercase mb-4 tracking-widest">構造指標 (KPI)</h4>
                                                <input type="text" value={currentProject?.data.kpi} onChange={e => updateProjectData('kpi', e.target.value)} placeholder="例：店頭離脱率を3%へ削減" className="w-full p-4 bg-blue-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">検証期間 (いつまで)</h4>
                                                <input type="text" value={currentProject?.data.measurePeriod} onChange={e => updateProjectData('measurePeriod', e.target.value)} placeholder="例：2024年4月末まで" className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
                                            </div>
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">計測方法 (どう測るか)</h4>
                                                <input type="text" value={currentProject?.data.measureMethod} onChange={e => updateProjectData('measureMethod', e.target.value)} placeholder="例：POSデータの『店頭通過客数』と照合" className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeStep === 9 && (
                                    <div className="space-y-8 animate-fadeIn">
                                        <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm space-y-6">
                                            <h4 className="text-xl font-black text-gray-800 border-b pb-4 mb-6">決定事項サマリ</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                                <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase">目的</label><p className="text-sm font-black">{currentProject?.data.idealState || "未入力"}</p></div>
                                                <div className="space-y-1"><label className="text-[9px] font-black text-red-400 uppercase">停止点</label><p className="text-sm font-black text-red-600">{currentProject?.data.stopPoint}</p></div>
                                                <div className="space-y-1"><label className="text-[9px] font-black text-blue-500 uppercase">施策の芯</label><p className="text-sm font-black">{currentProject?.data.minimumLever || "未入力"}</p></div>
                                                <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase">施策パーツ数</label><p className="text-sm font-black">{currentProject?.data.measures.length} 件</p></div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase px-4">実行時メモ・備考</label>
                                            <textarea value={currentProject?.data.tasks} onChange={e => updateProjectData('tasks', e.target.value)} placeholder="共有事項を入力..." className="w-full h-40 p-6 bg-white border border-gray-100 rounded-[2rem] text-xs font-bold outline-none shadow-sm" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 bg-slate-50/50 border-t border-gray-50 flex justify-between items-center">
                                <button onClick={() => setActiveStep(Math.max(1, activeStep - 1) as StepId)} disabled={activeStep === 1} className="px-8 py-2 text-xs font-black text-gray-400 hover:text-gray-800 disabled:opacity-0 transition-all flex items-center gap-2">&larr; 戻る</button>
                                <button onClick={handleNext} className="bg-[#005EB8] text-white px-12 py-3 rounded-2xl text-xs font-black shadow-xl shadow-blue-100 hover:bg-[#004a94] transition-all flex items-center gap-2">
                                    {activeStep === 9 ? 'プロジェクトを完了' : '次のステップへ'} &rarr;
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketingDesignView;