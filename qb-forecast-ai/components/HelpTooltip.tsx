
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface HelpTooltipProps {
    title: string;
    content: React.ReactNode;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            // Default: bottom-left aligned
            let top = rect.bottom + 8;
            let left = rect.left;

            // Simple viewport boundary check
            const tooltipWidth = 320; // Approx width
            if (left + tooltipWidth > window.innerWidth) {
                left = window.innerWidth - tooltipWidth - 16;
            }
            if (left < 16) left = 16;

            setCoords({ top, left });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                tooltipRef.current && !tooltipRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold transition-all shadow-sm align-middle ml-1 z-10 ${isOpen ? 'bg-[#005EB8] text-white' : 'bg-gray-200 text-gray-500 hover:bg-[#005EB8] hover:text-white'}`}
                title="解説を表示"
            >
                ?
            </button>

            {isOpen && createPortal(
                <div 
                    ref={tooltipRef}
                    className="fixed z-[9999] w-72 md:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 animate-fadeIn text-left"
                    style={{ top: coords.top, left: coords.left }}
                >
                    <div className="flex justify-between items-start mb-2 border-b border-gray-100 pb-2">
                        <h4 className="font-black text-sm text-[#005EB8] font-display">{title}</h4>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div className="text-xs text-gray-600 leading-relaxed space-y-2 font-sans">
                        {content}
                    </div>
                    {/* Visual arrow pointing up (Optional, simplified for fixed pos) */}
                </div>,
                document.body
            )}
        </>
    );
};

export default HelpTooltip;
