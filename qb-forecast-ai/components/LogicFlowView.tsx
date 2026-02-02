import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoreData } from '../types';
import { GoogleGenAI } from "@google/genai";
import HelpTooltip from './HelpTooltip';
import Papa from 'papaparse';

interface LogicFlowViewProps {
    allStores: { [name: string]: StoreData };
}

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface Group {
    id: string;
    name: string;
    color: string;
}

interface Issue {
    id: string;
    text: string;
    group: string; // Group ID
    imp: number; // 1-10
    urg: number; // 1-10
}

interface TreeNode {
    id: string;
    text: string;
    children: TreeNode[];
    isTarget?: boolean;
    sourceId?: string; 
}

interface ActionTask {
    id: string;
    action: string;
    who: string;
    when: string;
    kpi: string;
}

const PASTEL_COLORS = [
    '#E0F2FE', // light blue
    '#DCFCE7', // light green
    '#FFEDD5', // light orange
    '#F3E8FF', // light purple
    '#FCE7F3', // light pink
    '#FEF9C3', // light yellow
    '#D1FAE5', // light emerald
    '#E0E7FF', // light indigo
];

const INITIAL_GROUPS: Group[] = [
    { id: 'g1', name: '', color: PASTEL_COLORS[0] },
    { id: 'g2', name: '', color: PASTEL_COLORS[1] },
    { id: 'g3', name: '', color: PASTEL_COLORS[2] },
    { id: 'g4', name: '', color: PASTEL_COLORS[3] }
];

const LogicFlowView: React.FC<LogicFlowViewProps> = ({ allStores }) => {
    // --- State Management ---
    const [currentStep, setCurrentStep] = useState<StepId>(1);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS);
    const [problemDef, setProblemDef] = useState({ toBe: '', asIs: '', gap: '' });
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [showPopupId, setShowPopupId] = useState<string | null>(null);
    
    // Zoom State
    const [zoom, setZoom] = useState(1.0);

    // Trees
    const [whatTree, setWhatTree] = useState<TreeNode>({ id: 'root-what', text: 'ターゲット課題', children: [] });
    const [whyTree, setWhyTree] = useState<TreeNode>({ id: 'root-why', text: '要因分析', children: [] });
    const [howTree, setHowTree] = useState<TreeNode>({ id: 'root-how', text: '対策立案', children: [] });
    
    // ECRS & Plan
    const [ecrsItems, setEcrsItems] = useState<{id: string, text: string, status: 'keep' | 'drop' | 'refine', refinedText: string}[]>([]);
    const [tasks, setTasks] = useState<ActionTask[]>([]);

    // UI States
    const [newIssueText, setNewIssueText] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
    const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
    const matrixRef = useRef<HTMLDivElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);

    // --- Global Operations ---
    const resetLogicFlow = () => {
        if (!window.confirm("全てのデータを消去してリセットしますか？この操作は取り消せません。")) return;
        setIssues([]);
        setGroups(INITIAL_GROUPS);
        setProblemDef({ toBe: '', asIs: '', gap: '' });
        setSelectedIssueId(null);
        setWhatTree({ id: 'root-what', text: 'ターゲット課題', children: [] });
        setWhyTree({ id: 'root-why', text: '要因分析', children: [] });
        setHowTree({ id: 'root-how', text: '対策立案', children: [] });
        setEcrsItems([]);
        setTasks([]);
        setCurrentStep(1);
        setZoom(1.0);
    };

    const saveProject = () => {
        const state = { issues, groups, problemDef, selectedIssueId, whatTree, whyTree, howTree, ecrsItems, tasks, version: '15.4' };
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `LogicFlow_${new Date().toISOString().slice(0,10)}.logicflow`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const state = JSON.parse(event.target?.result as string);
                if (state.issues) setIssues(state.issues);
                if (state.groups) setGroups(state.groups);
                if (state.problemDef) setProblemDef(state.problemDef);
                if (state.selectedIssueId) setSelectedIssueId(state.selectedIssueId);
                if (state.whatTree) setWhatTree(state.whatTree);
                if (state.whyTree) setWhyTree(state.whyTree);
                if (state.howTree) setHowTree(state.howTree);
                if (state.ecrsItems) setEcrsItems(state.ecrsItems);
                if (state.tasks) setTasks(state.tasks);
                alert("プロジェクトを正常に読み込みました。");
            } catch (err) {
                alert("ファイルの形式が正しくありません。");
            }
        };
        reader.readAsText(file);
    };

    // --- Zoom Logic ---
    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2.0));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
    const handleZoomReset = () => setZoom(1.0);
    const handleDoubleClick = () => setZoom(prev => prev === 1.0 ? 1.5 : 1.0);

    // --- AI Logic ---
    const aiAction = async (prompt: string, context: string) => {
        if (!process.env.API_KEY) return null;
        setAiLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `${context}\n\n質問: ${prompt}\n\n回答は日本語で、構造的なJSON配列（文字列のみ）で返してください。マーカー等は不要です。`,
                config: { responseMimeType: "application/json" }
            });
            return JSON.parse(response.text || "[]");
        } catch (e) {
            console.error(e);
            return null;
        } finally {
            setAiLoading(false);
        }
    };

    // --- Handlers ---
    const addIssue = (text: string) => {
        if (!text) return;
        setIssues(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), text, group: 'uncategorized', imp: 5, urg: 5 }]);
        setNewIssueText("");
    };

    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                const newItems = results.data.map((row: any) => row[0]).filter((text: any) => typeof text === 'string' && text.trim());
                const mapped = newItems.map((text: string) => ({
                    id: Math.random().toString(36).substr(2, 9), text, group: 'uncategorized', imp: 5, urg: 5
                }));
                setIssues(prev => [...prev, ...mapped]);
            }
        });
    };

    const addGroup = () => {
        const newGroupId = Math.random().toString(36).substr(2, 9);
        const newColor = PASTEL_COLORS[groups.length % PASTEL_COLORS.length] || PASTEL_COLORS[0];
        setGroups([...groups, { id: newGroupId, name: '', color: newColor }]);
    };

    const renameGroup = (id: string, newName: string) => {
        setGroups(groups.map(g => g.id === id ? { ...g, name: newName } : g));
    };

    const deleteGroup = (id: string) => {
        if (groups.length <= 1) {
            alert("少なくとも1つのグループが必要です。");
            return;
        }
        setGroups(groups.filter(g => g.id !== id));
        setIssues(issues.map(i => i.group === id ? { ...i, group: 'uncategorized' } : i));
    };

    const handleMatrixMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!draggingPinId || !matrixRef.current) return;
        const rect = matrixRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        let x = (clientX - rect.left) / rect.width;
        let y = (rect.bottom - clientY) / rect.height;

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        const urg = Math.round(x * 9 + 1);
        const imp = Math.round(y * 9 + 1);

        setIssues(issues.map(i => i.id === draggingPinId ? { ...i, urg, imp } : i));
    };

    // --- Tree Logic ---
    const addTreeNode = (tree: 'what' | 'why' | 'how', parentId: string) => {
        const updater = (node: TreeNode): TreeNode => {
            if (node.id === parentId) {
                const isFirstExpansion = node.children.length === 0;
                const branchCount = isFirstExpansion ? 3 : 1;
                const newChildren = Array.from({ length: branchCount }, (_, i) => ({
                    id: `${Date.now()}-${i}`,
                    text: isFirstExpansion ? `項目 ${i + 1}` : '新規項目',
                    children: []
                }));
                return { ...node, children: [...node.children, ...newChildren] };
            }
            return { ...node, children: node.children.map(updater) };
        };
        if (tree === 'what') setWhatTree(updater(whatTree));
        if (tree === 'why') setWhyTree(updater(whyTree));
        if (tree === 'how') setHowTree(updater(howTree));
    };

    const deleteTreeNode = (tree: 'what' | 'why' | 'how', id: string) => {
        if (id.startsWith('root-')) return; // Root cannot be deleted
        const updater = (node: TreeNode): TreeNode => ({
            ...node,
            children: node.children.filter(c => c.id !== id).map(updater)
        });
        if (tree === 'what') setWhatTree(updater(whatTree));
        if (tree === 'why') setWhyTree(updater(whyTree));
        if (tree === 'how') setHowTree(updater(howTree));
    };

    const toggleTarget = (tree: 'what' | 'why' | 'how', id: string) => {
        const updater = (node: TreeNode): TreeNode => {
            if (node.id === id) return { ...node, isTarget: !node.isTarget };
            return { ...node, children: node.children.map(updater) };
        };
        if (tree === 'what') setWhatTree(updater(whatTree));
        if (tree === 'why') setWhyTree(updater(whyTree));
        if (tree === 'how') setHowTree(updater(howTree));
    };

    // --- Propagation Effect ---
    useEffect(() => {
        if (currentStep === 4) {
            const rootText = problemDef.gap || (selectedIssueId ? issues.find(i => i.id === selectedIssueId)?.text : 'ターゲット課題');
            if (rootText) setWhatTree(prev => ({ ...prev, text: rootText }));
            setZoom(1.0);
        }
        if (currentStep === 5) {
            const targets: TreeNode[] = [];
            const collect = (n: TreeNode) => { if (n.isTarget) targets.push(n); n.children.forEach(collect); };
            collect(whatTree);
            setWhyTree(prev => {
                const nextChildren = targets.map(t => {
                    const found = prev.children.find(e => e.sourceId === t.id);
                    return found ? { ...found, text: t.text } : { id: `why-${t.id}`, sourceId: t.id, text: t.text, children: [] };
                });
                return { ...prev, children: nextChildren };
            });
            setZoom(1.0);
        }
        if (currentStep === 6) {
            const targets: TreeNode[] = [];
            const collect = (n: TreeNode) => { if (n.isTarget) targets.push(n); n.children.forEach(collect); };
            collect(whyTree);
            setHowTree(prev => {
                const nextChildren = targets.map(t => {
                    const found = prev.children.find(e => e.sourceId === t.id);
                    return found ? { ...found, text: t.text } : { id: `how-${t.id}`, sourceId: t.id, text: t.text, children: [] };
                });
                return { ...prev, children: nextChildren };
            });
            setZoom(1.0);
        }
        if (currentStep === 7) {
            const candidates: any[] = [];
            const walk = (n: TreeNode) => {
                if (n.children.length === 0 && n.id !== 'root-how') candidates.push(n);
                n.children.forEach(walk);
            };
            walk(howTree);
            setEcrsItems(candidates.map(c => {
                const ex = ecrsItems.find(e => e.id === c.id);
                return ex ? ex : { id: c.id, text: c.text, status: 'keep', refinedText: c.text };
            }));
        }
        if (currentStep === 8) {
            const refined = ecrsItems.filter(i => i.status !== 'drop').map(i => {
                const ex = tasks.find(t => t.id === i.id);
                return ex ? { ...ex, action: i.status === 'refine' ? i.refinedText : i.text } : {
                    id: i.id, action: i.status === 'refine' ? i.refinedText : i.text, who: '', when: '', kpi: ''
                };
            });
            setTasks(refined);
        }
        if (currentStep === 9) setZoom(1.0);
    }, [currentStep]);

    // --- UI Components ---
    const TreeRenderer: React.FC<{ node: TreeNode, treeType: 'what' | 'why' | 'how', depth?: number }> = ({ node, treeType, depth = 0 }) => (
        <div className="flex items-start gap-8 relative select-none">
            <div className="flex flex-col items-center">
                <div className={`relative group p-4 rounded-2xl border-2 transition-all w-64 shadow-sm ${depth === 0 ? 'bg-[#005EB8] text-white border-[#005EB8]' : (node.isTarget ? 'bg-red-50 border-red-400 ring-4 ring-red-100' : 'bg-white text-gray-800 border-gray-100 hover:border-blue-300')}`}>
                    {node.isTarget && (
                        <div className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg z-10 animate-bounce">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    )}
                    <input 
                        type="text" value={node.text} onChange={e => {
                            const updater = (n: TreeNode): TreeNode => n.id === node.id ? { ...n, text: e.target.value } : { ...n, children: n.children.map(updater) };
                            if(treeType === 'what') setWhatTree(updater(whatTree));
                            if(treeType === 'why') setWhyTree(updater(whyTree));
                            if(treeType === 'how') setHowTree(updater(howTree));
                        }}
                        className="w-full bg-transparent font-bold text-sm text-center outline-none focus:ring-0"
                    />
                    <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button onClick={() => addTreeNode(treeType, node.id)} className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform" title="子要素を追加"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg></button>
                        <button onClick={() => toggleTarget(treeType, node.id)} className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform ${node.isTarget ? 'bg-red-500 text-white' : 'bg-white text-red-500 border border-red-200'}`} title="重要項目としてマーク"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.5-8c0 2.48-2.02 4.5-4.5 4.5S7.5 14.48 7.5 12 9.52 7.5 12 7.5s4.5 2.02 4.5 4.5z"/></svg></button>
                        {depth > 0 && (
                            <button onClick={() => deleteTreeNode(treeType, node.id)} className="w-8 h-8 bg-white text-gray-400 border border-gray-200 rounded-full flex items-center justify-center shadow-md hover:scale-110 hover:text-red-500 hover:border-red-200 transition-all" title="削除"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                        )}
                    </div>
                </div>
            </div>
            {node.children.length > 0 && (
                <div className="flex flex-col gap-4 border-l-2 border-gray-100 pl-8 py-2 relative">
                    {node.children.map(child => <TreeRenderer key={child.id} node={child} treeType={treeType} depth={depth + 1} />)}
                </div>
            )}
        </div>
    );

    const ZoomControls = () => (
        <div className="fixed bottom-8 right-8 flex flex-col gap-2 z-[100] animate-fadeIn">
            <button onClick={handleZoomIn} className="w-12 h-12 bg-white/90 backdrop-blur shadow-xl border border-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:text-[#005EB8] hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
            </button>
            <button onClick={handleZoomOut} className="w-12 h-12 bg-white/90 backdrop-blur shadow-xl border border-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:text-[#005EB8] hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M20 12H4"></path></svg>
            </button>
            <button onClick={handleZoomReset} className="w-12 h-12 bg-[#005EB8] text-white shadow-xl rounded-full flex items-center justify-center hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
            <div className="text-[10px] font-black text-gray-400 text-center uppercase bg-white/50 py-1 rounded-full">{Math.round(zoom * 100)}%</div>
        </div>
    );

    return (
        <div 
            className={`absolute inset-0 overflow-y-auto p-4 md:p-8 animate-fadeIn bg-[#F8FAFC] select-none ${draggingPinId ? 'cursor-grabbing' : ''}`}
            onMouseMove={handleMatrixMove}
            onTouchMove={handleMatrixMove}
            onMouseUp={() => setDraggingPinId(null)}
            onTouchEnd={() => setDraggingPinId(null)}
        >
            <div className="w-full px-4 md:px-8 space-y-4 pb-32">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter font-display">思考改善ツール <span className="text-[#005EB8]">LogicFlow</span></h2>
                        <p className="text-xs text-gray-400 font-bold">ズーム・プレゼン対応版 v15.4</p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <button onClick={resetLogicFlow} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 shadow-sm transition-all flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            リセット
                        </button>
                        <button onClick={saveProject} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-700 shadow-md transition-all flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                            保存
                        </button>
                        <button onClick={() => projectInputRef.current?.click()} className="px-4 py-2 bg-white text-slate-800 border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                            読込
                        </button>
                        <input type="file" ref={projectInputRef} className="hidden" accept=".logicflow,.json" onChange={loadProject} />
                    </div>
                </div>

                <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {(['1.課題抽出', '2.優先順位', '3.問題定義', '4.所在特定', '5.原因分析', '6.施策立案', '7.施策精査', '8.計画策定', '9.ロードマップ'] as string[]).map((label, idx) => (
                        <button key={idx} onClick={() => setCurrentStep((idx + 1) as StepId)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${currentStep === idx + 1 ? 'bg-[#005EB8] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${currentStep === idx + 1 ? 'border-white bg-white/20' : 'border-gray-200'}`}>{idx + 1}</span>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Step 1: KJ */}
                {currentStep === 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn h-[650px]">
                        <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display">1. インボックス</h3>
                                <button onClick={() => csvInputRef.current?.click()} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg></button>
                                <input type="file" ref={csvInputRef} className="hidden" accept=".csv,.txt" onChange={handleCSVUpload} />
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={newIssueText} onChange={e => setNewIssueText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIssue(newIssueText)} placeholder="課題を入力..." className="flex-1 p-3 bg-gray-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-[#005EB8] font-bold" />
                                <button onClick={() => addIssue(newIssueText)} className="p-3 bg-[#005EB8] text-white rounded-xl shadow-md hover:bg-[#004a94]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg></button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {issues.filter(i => i.group === 'uncategorized').map(i => (
                                    <div key={i.id} draggable onDragStart={() => setDraggingIssueId(i.id)} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 group relative shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing border-l-4 border-l-slate-300">
                                        <p className="text-xs font-bold text-gray-700 leading-relaxed pr-6">{i.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-full overflow-y-auto custom-scrollbar">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest font-display">2. グルーピング</h3>
                                <button onClick={addGroup} className="px-4 py-2 bg-blue-50 text-[#005EB8] rounded-xl text-[10px] font-black uppercase hover:bg-blue-100 border border-blue-100">グループ追加</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {groups.map(group => (
                                    <div key={group.id} onDragOver={e => e.preventDefault()} onDrop={() => draggingIssueId && setIssues(issues.map(i => i.id === draggingIssueId ? { ...i, group: group.id } : i))} className="p-4 rounded-3xl min-h-[250px] flex flex-col shadow-sm" style={{ backgroundColor: group.color }}>
                                        <div className="flex justify-between items-center mb-4 gap-2">
                                            <input 
                                                type="text" 
                                                value={group.name} 
                                                onChange={e => renameGroup(group.id, e.target.value)} 
                                                placeholder="グループ名を入力..."
                                                className="bg-white/50 text-[10px] font-black text-gray-800 uppercase tracking-tighter w-full outline-none rounded px-2 py-1 placeholder-gray-400" 
                                            />
                                            <button onClick={() => deleteGroup(group.id)} className="text-gray-400 hover:text-red-500 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            {issues.filter(i => i.group === group.id).map(i => (
                                                <div key={i.id} draggable onDragStart={() => setDraggingIssueId(i.id)} className="bg-white p-3 rounded-xl border border-gray-50 shadow-sm text-[11px] font-bold text-gray-600 group cursor-grab active:scale-105 transition-transform border-l-4 border-l-[#005EB8]">
                                                    {i.text}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Matrix */}
                {currentStep === 2 && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn h-[650px]">
                        <div ref={matrixRef} className="lg:col-span-8 bg-white p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5">
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                                <div className="w-0.5 h-full bg-slate-400 opacity-40"></div>
                                <div className="h-0.5 w-full bg-slate-400 opacity-40 absolute"></div>
                            </div>
                            <div className="relative h-full w-full z-10">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-black text-[#005EB8] uppercase tracking-[0.2em] bg-white px-4 py-1 rounded-full border border-gray-100 shadow-sm z-20">重要度 High ↑</div>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#005EB8] uppercase tracking-[0.2em] bg-white px-4 py-1 rounded-full border border-gray-100 shadow-sm z-20 rotate-90 translate-x-8">緊急度 High →</div>
                                {issues.filter(i => i.group !== 'uncategorized').map(i => {
                                    const groupColor = groups.find(g => g.id === i.group)?.color || '#F1F5F9';
                                    return (
                                        <div key={i.id} className="absolute transition-transform" style={{ left: `${((i.urg - 1) / 9) * 90 + 5}%`, bottom: `${((i.imp - 1) / 9) * 90 + 5}%`, transform: 'translate(-50%, 50%)' }}>
                                            <div onMouseDown={() => { setDraggingPinId(i.id); setSelectedIssueId(i.id); setShowPopupId(i.id === showPopupId ? null : i.id); }} className={`w-12 h-12 rounded-full flex items-center justify-center text-xs font-black shadow-xl border-2 border-white cursor-grab active:cursor-grabbing transition-all ${selectedIssueId === i.id ? 'scale-125 z-40 ring-4 ring-[#005EB8]/20' : 'hover:scale-110 z-30'}`} style={{ backgroundColor: groupColor, color: '#1A1A1A' }}>
                                                {i.id.substr(-2)}
                                            </div>
                                            {showPopupId === i.id && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 p-3 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[100] animate-fadeIn">
                                                    <div className="w-full h-1 rounded-full mb-2" style={{ backgroundColor: groupColor }}></div>
                                                    <p className="text-[10px] font-black text-gray-800 leading-tight">{i.text}</p>
                                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-gray-100 rotate-45"></div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="lg:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 font-display">プロット詳細</h3>
                            {issues.filter(i => i.group !== 'uncategorized').map(i => (
                                <div key={i.id} onClick={() => {setSelectedIssueId(i.id); setShowPopupId(i.id);}} className={`p-4 rounded-2xl border transition-all cursor-pointer ${selectedIssueId === i.id ? 'border-[#005EB8] ring-2 ring-blue-100' : 'bg-gray-50 border-gray-100'}`} style={{ backgroundColor: selectedIssueId === i.id ? undefined : groups.find(g => g.id === i.group)?.color + '40' }}>
                                    <p className="text-[10px] font-black text-gray-700 mb-2 truncate">#{i.id.substr(-2)}: {i.text}</p>
                                    <div className="flex gap-4 text-[8px] font-black text-gray-400 uppercase"><span>重要度: {i.imp}</span><span>緊急度: {i.urg}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3: Gap Analysis */}
                {currentStep === 3 && (
                    <div className="max-w-4xl mx-auto animate-fadeIn space-y-8">
                        <div className="text-center">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 font-display">ターゲット課題の定義</h3>
                            <div className="inline-block px-6 py-2 rounded-full text-lg font-black font-display shadow-lg" style={{ backgroundColor: groups.find(g => g.id === issues.find(x => x.id === selectedIssueId)?.group)?.color || '#005EB8', color: '#1A1A1A' }}>
                                {selectedIssueId ? issues.find(i => i.id === selectedIssueId)?.text : '課題を選択してください'}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[300px]">
                                <h4 className="text-[10px] font-black text-green-500 uppercase tracking-widest mb-4">理想の状態 (To-Be)</h4>
                                <textarea value={problemDef.toBe} onChange={e => setProblemDef({ ...problemDef, toBe: e.target.value })} placeholder="本来どうあるべきですか？" className="flex-1 w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-green-400 resize-none" />
                            </div>
                            <div className="flex flex-col items-center gap-2 text-gray-300">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                <span className="text-[10px] font-black uppercase tracking-widest">GAP</span>
                            </div>
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[300px]">
                                <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4">現状 (As-Is)</h4>
                                <textarea value={problemDef.asIs} onChange={e => setProblemDef({ ...problemDef, asIs: e.target.value })} placeholder="実際の状況は？" className="flex-1 w-full bg-gray-50 border-none rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                            </div>
                        </div>
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 border-t-8 border-t-[#005EB8]">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-black text-gray-600 uppercase tracking-widest">解決すべき核心的な課題</h4>
                                <button onClick={async () => {
                                    const res = await aiAction(`理想:${problemDef.toBe}、現状:${problemDef.asIs}。この差分を解決すべき1文の課題として定義してください。JSON形式 {"gap": "..."} で。`, "経営コンサルタント");
                                    if(res && res.gap) setProblemDef({ ...problemDef, gap: res.gap });
                                }} className="text-[9px] font-black text-purple-600 uppercase flex items-center gap-1">AIで定義を最適化</button>
                            </div>
                            <input type="text" value={problemDef.gap} onChange={e => setProblemDef({ ...problemDef, gap: e.target.value })} placeholder="何が本当の問題ですか？" className="w-full p-4 bg-blue-50 border-none rounded-2xl text-lg font-black text-[#005EB8] outline-none focus:ring-2 focus:ring-[#005EB8]" />
                        </div>
                    </div>
                )}

                {/* Steps 4, 5, 6: Trees */}
                {(currentStep === 4 || currentStep === 5 || currentStep === 6) && (
                    <div className="animate-fadeIn h-full flex flex-col items-center">
                        <div className="bg-white/50 p-4 rounded-full border border-gray-100 mb-8 flex items-center gap-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            <span className={currentStep === 4 ? 'text-[#005EB8] font-black underline' : ''}>4. WHAT</span>
                            <span className={currentStep === 5 ? 'text-[#005EB8] font-black underline' : ''}>5. WHY</span>
                            <span className={currentStep === 6 ? 'text-[#005EB8] font-black underline' : ''}>6. HOW</span>
                        </div>
                        <div 
                            onDoubleClick={handleDoubleClick}
                            className="w-full flex-1 overflow-auto p-12 min-h-[700px] border-2 border-dashed border-gray-200 rounded-[3rem] bg-white/20 flex items-center justify-center relative cursor-zoom-in"
                        >
                            <div 
                                style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', transformOrigin: 'center center' }}
                                className="w-full h-full flex items-center justify-center"
                            >
                                {currentStep === 4 && <TreeRenderer node={whatTree} treeType="what" />}
                                {currentStep === 5 && <TreeRenderer node={whyTree} treeType="why" />}
                                {currentStep === 6 && <TreeRenderer node={howTree} treeType="how" />}
                            </div>
                            <ZoomControls />
                        </div>
                    </div>
                )}

                {/* Step 7: ECRS */}
                {currentStep === 7 && (
                    <div className="max-w-5xl mx-auto animate-fadeIn space-y-6">
                        <div className="bg-[#1A1A1A] text-white p-8 rounded-3xl shadow-xl">
                            <h3 className="text-3xl font-black font-display uppercase tracking-tighter">ECRS <span className="text-blue-400">Refinement</span></h3>
                            <p className="text-xs text-gray-400 mt-1">「なくせないか(E)」「一緒にできないか(C)」「交換できないか(R)」「簡素化できないか(S)」</p>
                        </div>
                        <div className="space-y-4">
                            {ecrsItems.map((item, idx) => (
                                <div key={item.id} className={`bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 transition-all ${item.status === 'drop' ? 'opacity-50' : 'hover:shadow-md'}`}>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-[10px] font-black text-gray-300">Item #{idx+1}</span>
                                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                                {(['keep', 'refine', 'drop'] as const).map(st => (
                                                    <button key={st} onClick={() => setEcrsItems(ecrsItems.map(x => x.id === item.id ? { ...x, status: st } : x))} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${item.status === st ? 'bg-white text-[#005EB8] shadow-sm' : 'text-gray-400'}`}>
                                                        {st === 'keep' ? '保持' : st === 'refine' ? '改良' : '削除'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-gray-800 mb-4">{item.text}</p>
                                        {item.status === 'refine' && (
                                            <input type="text" value={item.refinedText} onChange={e => setEcrsItems(ecrsItems.map(x => x.id === item.id ? { ...x, refinedText: e.target.value } : x))} className="w-full bg-blue-50 p-4 rounded-2xl border-none font-bold text-blue-900 outline-none focus:ring-0" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 8: Action Plan */}
                {currentStep === 8 && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 animate-fadeIn overflow-hidden flex flex-col">
                        <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-8 font-display border-l-8 border-[#005EB8] pl-4">8. 実行計画策定</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-[10px] font-black text-gray-400 uppercase">
                                    <tr><th className="p-4">Action Item</th><th className="p-4">担当</th><th className="p-4">期日</th><th className="p-4">KPI</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-bold text-sm text-slate-700">
                                    {tasks.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50">
                                            <td className="p-4 w-1/3">{t.action}</td>
                                            <td className="p-4"><input type="text" value={t.who} onChange={e => setTasks(tasks.map(x => x.id === t.id ? { ...x, who: e.target.value } : x))} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs" /></td>
                                            <td className="p-4"><input type="date" value={t.when} onChange={e => setTasks(tasks.map(x => x.id === t.id ? { ...x, when: e.target.value } : x))} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs" /></td>
                                            <td className="p-4"><input type="text" value={t.kpi} onChange={e => setTasks(tasks.map(x => x.id === t.id ? { ...x, kpi: e.target.value } : x))} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Step 9: Roadmap */}
                {currentStep === 9 && (
                    <div className="animate-fadeIn p-8 flex flex-col h-[700px] items-center justify-center relative">
                         <div 
                            onDoubleClick={handleDoubleClick}
                            className="flex-1 overflow-x-auto whitespace-nowrap pb-12 flex items-center scrollbar-hide w-full cursor-zoom-in"
                        >
                            <div 
                                style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', transformOrigin: 'center center' }}
                                className="flex items-center min-w-max px-12 relative h-64"
                            >
                                <div className="absolute left-0 right-0 h-1 bg-gray-200 top-1/2 -translate-y-1/2 z-0"></div>
                                <div className="bg-slate-800 text-white w-20 h-20 rounded-full flex flex-col items-center justify-center font-black shadow-xl z-10 border-4 border-white relative"><span className="text-[10px] uppercase opacity-50">START</span><span className="text-sm">現在</span></div>
                                {tasks.sort((a,b) => new Date(a.when).getTime() - new Date(b.when).getTime()).map((t, i) => (
                                    <React.Fragment key={t.id}>
                                        <div className="w-24 h-1 bg-blue-400 z-0"></div>
                                        <div className="relative z-10 w-72 h-48 bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col justify-between hover:scale-105 transition-transform"><div className="absolute top-0 left-0 w-2 h-full bg-[#005EB8] rounded-l-[2rem]"></div><div><div className="text-[10px] font-black text-[#005EB8] uppercase mb-1">Step {i+1}</div><h4 className="text-sm font-black text-gray-800 leading-tight whitespace-normal line-clamp-2">{t.action}</h4></div><div className="space-y-1 border-t border-gray-50 pt-3 text-[10px] text-gray-500 font-bold"><div>期日: {t.when || '時期未定'}</div><div>担当: {t.who || '担当未定'}</div></div></div>
                                    </React.Fragment>
                                ))}
                                <div className="w-24 h-1 bg-gray-200 z-0"></div>
                                <div className="bg-[#005EB8] text-white w-24 h-24 rounded-full flex flex-col items-center justify-center font-black shadow-xl z-10 border-4 border-white animate-pulse"><span className="text-[10px] uppercase opacity-70 tracking-widest">GOAL</span><span className="text-lg">達成</span></div>
                            </div>
                         </div>
                         <ZoomControls />
                    </div>
                )}
            </div>
        </div>
    );
};

export default LogicFlowView;