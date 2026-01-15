
import React, { useState, useRef, useEffect } from 'react';

interface HelpTooltipProps {
    title: string;
    content: React.ReactNode;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    return (
        <div className="relative inline-block ml-2 z-40" ref={wrapperRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all shadow-sm ${isOpen ? 'bg-[#005EB8] text-white' : 'bg-gray-200 text-gray-500 hover:bg-[#005EB8] hover:text-white'}`}
                title="解説を表示"
            >
                ?
            </button>

            {isOpen && (
                <div className="absolute left-1/2 transform -translate-x-1/2 mt-2 w-72 md:w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 animate-fadeIn z-50 text-left">
                    <div className="flex justify-between items-start mb-2 border-b border-gray-100 pb-2">
                        <h4 className="font-black text-sm text-[#005EB8] font-display">{title}</h4>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                        {content}
                    </div>
                    <div className="absolute top-[-6px] left-1/2 transform -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45"></div>
                </div>
            )}
        </div>
    );
};

export default HelpTooltip;
