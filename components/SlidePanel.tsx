
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
    isDark: boolean;
}

const SlidePanel: React.FC<SlidePanelProps> = ({
    slides,
    activeSlideIdx,
    onSlideSelect,
    onSlideDelete,
    onSlideReorder,
    isCollapsed,
    onToggleCollapse,
    isDark,
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
                className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-4 h-10 border rounded-r-md flex items-center justify-center transition-colors"
                style={{
                    backgroundColor: isDark ? '#1a1f2a' : '#eef0ff',
                    borderColor: isDark ? '#1f2430' : '#e5e7eb'
                }}
                title={isCollapsed ? "슬라이드 패널 열기" : "슬라이드 패널 닫기"}
            >
                {isCollapsed
                    ? <ChevronRight size={12} style={{ color: isDark ? '#d1d5db' : '#4b5563' }} />
                    : <ChevronLeft size={12} style={{ color: isDark ? '#d1d5db' : '#4b5563' }} />}
            </button>

            {/* Panel Content */}
            <div
                className={`w-48 border-r flex flex-col overflow-hidden ${isCollapsed ? 'hidden' : ''}`}
                style={{ borderColor: isDark ? '#1f2430' : '#e5e7eb', backgroundColor: isDark ? '#0f131a' : '#ffffff' }}
            >
                {/* Header */}
                <div className="px-3 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: isDark ? '#1f2430' : '#e5e7eb' }}>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>슬라이드</span>
                    <span className="text-xs font-mono" style={{ color: isDark ? '#6b7280' : '#9ca3af' }}>{slides.length}장</span>
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
                                    ? isDark
                                        ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#0f131a] shadow-lg shadow-indigo-950/20'
                                        : 'ring-2 ring-[#635bff] ring-offset-1 ring-offset-[#ffffff] shadow-lg shadow-indigo-200/40'
                                    : isDark
                                        ? 'ring-1 ring-slate-700 hover:ring-slate-500'
                                        : 'ring-1 ring-slate-300 hover:ring-slate-400'}
                ${dragOverIdx === index ? 'ring-2 ring-yellow-400 scale-[1.02]' : ''}
                ${draggingIdx === index ? 'opacity-40' : 'opacity-100'}
              `}
                        >
                            {/* Slide Thumbnail */}
                            <div className="relative aspect-[16/9]" style={{ backgroundColor: isDark ? '#151923' : '#f4f6ff' }}>
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
                                    <GripVertical size={14} style={{ color: isDark ? '#9ca3af' : '#6b7280' }} />
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
                            <div
                                className="text-center py-1 text-[10px] font-bold"
                                style={{
                                    color: activeSlideIdx === index
                                        ? (isDark ? '#a5b4fc' : '#635bff')
                                        : (isDark ? '#6b7280' : '#64748b'),
                                    backgroundColor: isDark ? 'rgba(15, 19, 26, 0.7)' : 'rgba(241, 245, 249, 0.9)'
                                }}
                            >
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
