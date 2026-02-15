
import React, { useState, useRef, useCallback } from 'react';
import { SlideData } from '../types';
import { Trash2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';

interface SlidePanelProps {
    slides: SlideData[];
    activeSlideIdx: number;
    onSlideSelect: (index: number) => void;
    onSlideDelete: (index: number) => void;
    onSlideReorder: (fromIndex: number, toIndex: number) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const SlidePanel: React.FC<SlidePanelProps> = ({
    slides,
    activeSlideIdx,
    onSlideSelect,
    onSlideDelete,
    onSlideReorder,
    isCollapsed,
    onToggleCollapse,
}) => {
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggingIdx(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIdx(index);
    };

    const handleDragLeave = () => {
        setDragOverIdx(null);
    };

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        const fromIndex = Number(e.dataTransfer.getData('text/plain'));
        if (fromIndex !== toIndex) {
            onSlideReorder(fromIndex, toIndex);
        }
        setDragOverIdx(null);
        setDraggingIdx(null);
    };

    const handleDragEnd = () => {
        setDragOverIdx(null);
        setDraggingIdx(null);
    };

    const handleDelete = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        if (slides.length <= 1) {
            alert("마지막 슬라이드는 삭제할 수 없습니다.");
            return;
        }
        if (window.confirm(`슬라이드 ${index + 1}을(를) 삭제하시겠습니까?`)) {
            onSlideDelete(index);
        }
    };

    if (slides.length === 0) return null;

    return (
        <div className={`relative flex shrink-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0' : 'w-48'}`}>
            {/* Toggle Button */}
            <button
                onClick={onToggleCollapse}
                className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-4 h-10 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-r-md flex items-center justify-center transition-colors"
                title={isCollapsed ? "슬라이드 패널 열기" : "슬라이드 패널 닫기"}
            >
                {isCollapsed ? <ChevronRight size={12} className="text-slate-300" /> : <ChevronLeft size={12} className="text-slate-300" />}
            </button>

            {/* Panel Content */}
            <div className={`w-48 border-r border-slate-800 bg-[#111827] flex flex-col overflow-hidden ${isCollapsed ? 'hidden' : ''}`}>
                {/* Header */}
                <div className="px-3 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">슬라이드</span>
                    <span className="text-xs font-mono text-slate-500">{slides.length}장</span>
                </div>

                {/* Slide List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    {slides.map((slide, index) => (
                        <div
                            key={`slide-${index}-${slide.dataUrl.substring(0, 20)}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={handleDragEnd}
                            onClick={() => onSlideSelect(index)}
                            className={`
                group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-150
                ${activeSlideIdx === index
                                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#111827] shadow-lg shadow-blue-900/20'
                                    : 'ring-1 ring-slate-700 hover:ring-slate-500'}
                ${dragOverIdx === index ? 'ring-2 ring-yellow-400 scale-[1.02]' : ''}
                ${draggingIdx === index ? 'opacity-40' : 'opacity-100'}
              `}
                        >
                            {/* Slide Thumbnail */}
                            <div className="relative aspect-[16/9] bg-slate-900">
                                <img
                                    src={slide.dataUrl}
                                    alt={`Slide ${index + 1}`}
                                    className="w-full h-full object-contain"
                                    draggable={false}
                                />

                                {/* Overlay count badge */}
                                {slide.overlays.length > 0 && (
                                    <div className="absolute top-1 left-1 bg-blue-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                        {slide.overlays.length}
                                    </div>
                                )}

                                {/* Drag handle (top-left) */}
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <GripVertical size={14} className="text-slate-400" />
                                </div>

                                {/* Delete button (bottom-right) */}
                                {slides.length > 1 && (
                                    <button
                                        onClick={(e) => handleDelete(e, index)}
                                        className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-600/80 hover:bg-red-500 rounded text-white"
                                        title="슬라이드 삭제"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                )}
                            </div>

                            {/* Slide number */}
                            <div className={`text-center py-1 text-[10px] font-bold ${activeSlideIdx === index ? 'text-blue-400 bg-slate-800/50' : 'text-slate-500 bg-slate-900/50'
                                }`}>
                                {index + 1}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SlidePanel;
