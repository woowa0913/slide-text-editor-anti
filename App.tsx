
import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { SlideData, Rect, TextOverlay } from './types';
import { convertPdfToImages, downloadAsPdf } from './services/pdfService';
import { removeAllTextFromSlide } from './services/geminiService';
import EditorCanvas from './components/EditorCanvas';
import Sidebar from './components/Sidebar';
import { 
  FileUp, 
  Download, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Undo2, 
  Redo2, 
  Image as ImageIcon,
  Plus,
  Eraser
} from 'lucide-react';

const App: React.FC = () => {
  // History State
  const [history, setHistory] = useState<SlideData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Draft overlay state for preview (lifted from Sidebar)
  const [draftOverlay, setDraftOverlay] = useState<Partial<TextOverlay> | null>(null);

  // Helper to access current slides from history
  const currentSlides = historyIndex >= 0 ? history[historyIndex] : [];

  const updateHistory = (newSlides: SlideData[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSlides);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      let newSlides: SlideData[] = [];
      if (file.type === 'application/pdf') {
        newSlides = await convertPdfToImages(file);
      } else if (file.type.startsWith('image/')) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              newSlides = [{
                index: 0,
                dataUrl: ev.target?.result as string,
                width: img.width,
                height: img.height,
                overlays: []
              }];
              resolve();
            };
            img.src = ev.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
      }
      
      // Initialize History
      setHistory([newSlides]);
      setHistoryIndex(0);
      setActiveSlideIdx(0);
      setSelectedOverlayId(null);
    } catch (err) {
      console.error(err);
      alert('파일 변환 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || currentSlides.length === 0) return;

    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imageSrc = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
           // Default to center of the slide
           const slide = currentSlides[activeSlideIdx];
           const width = 200; // Default width
           const height = (img.height / img.width) * width;
           const x = (slide.width - width) / 2;
           const y = (slide.height - height) / 2;

           const newOverlay: TextOverlay = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'image',
              rect: { x, y, width, height },
              imageSrc: imageSrc,
              originalText: '',
              newText: '',
              fontSize: 0,
              fontWeight: 'normal',
              fontColor: 'transparent',
              fontFamily: 'sans-serif',
              backgroundColor: 'transparent',
              vAlign: 'top',
              hAlign: 'left'
           };
           handleApplyOverlay(newOverlay);
        };
        img.src = imageSrc;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert('이미지 추가 중 오류가 발생했습니다.');
    }
  };

  const handleApplyOverlay = (overlay: TextOverlay, keepSelection: boolean = false) => {
    const newSlides = currentSlides.map((s, idx) => 
      idx === activeSlideIdx ? { ...s, overlays: [...s.overlays, overlay] } : s
    );
    updateHistory(newSlides);
    
    if (keepSelection) {
      // Keep selection and just clear editing state (though new overlay is created)
      setSelectedOverlayId(null);
    } else {
      setSelection(null);
      setSelectedOverlayId(overlay.id);
    }
  };

  const handleUpdateOverlays = (overlays: TextOverlay[]) => {
    const newSlides = currentSlides.map((s, idx) => 
      idx === activeSlideIdx ? { ...s, overlays } : s
    );
    updateHistory(newSlides);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setSelectedOverlayId(null);
    }
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setSelectedOverlayId(null);
    }
  }, [historyIndex, history.length]);

  const handleDeleteAll = () => {
    const newSlides = currentSlides.map((s, idx) => 
      idx === activeSlideIdx ? {...s, overlays: []} : s
    );
    updateHistory(newSlides);
    setSelectedOverlayId(null);
  };

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleDownloadImages = async () => {
    if (currentSlides.length === 0) return;
    setIsProcessing(true);
    
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < currentSlides.length; i++) {
        const slide = currentSlides[i];
        const canvas = document.createElement('canvas');
        canvas.width = slide.width;
        canvas.height = slide.height;
        const ctx = canvas.getContext('2d')!;
        
        // 1. Draw Original Image
        const img = new Image();
        img.src = slide.dataUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        ctx.drawImage(img, 0, 0);
        
        // 2. Draw Overlays
        for (const ov of slide.overlays) {
          if (ov.type === 'image' && ov.imageSrc) {
             const uImg = new Image();
             uImg.src = ov.imageSrc;
             await new Promise((resolve) => {
                uImg.onload = resolve;
                uImg.onerror = resolve;
             });
             ctx.drawImage(uImg, ov.rect.x, ov.rect.y, ov.rect.width, ov.rect.height);
          } else {
            // Background (Color or AI Image)
            if (ov.backgroundImage) {
                const bgImg = new Image();
                bgImg.src = ov.backgroundImage;
                await new Promise((resolve) => {
                bgImg.onload = resolve;
                bgImg.onerror = resolve;
                });
                ctx.drawImage(bgImg, ov.rect.x, ov.rect.y, ov.rect.width, ov.rect.height);
            } else {
                ctx.fillStyle = ov.backgroundColor;
                ctx.fillRect(ov.rect.x, ov.rect.y, ov.rect.width, ov.rect.height);
            }
            
            // Text
            ctx.fillStyle = ov.fontColor;
            ctx.font = `${ov.fontWeight} ${ov.fontSize}px ${ov.fontFamily}, sans-serif`;
            
            if (ctx.letterSpacing !== undefined) {
                ctx.letterSpacing = `${ov.letterSpacing || 0}px`;
            }

            const lines = ov.newText.split('\n');
            const lineHeight = ov.fontSize * 1.2;
            const totalTextHeight = lines.length * lineHeight;

            ctx.textAlign = (ov.hAlign || 'left') as CanvasTextAlign;
            ctx.textBaseline = 'top';

            let tx = ov.rect.x;
            if (ov.hAlign === 'center') tx = ov.rect.x + ov.rect.width / 2;
            else if (ov.hAlign === 'right') tx = ov.rect.x + ov.rect.width;

            let ty = ov.rect.y;
            if (ov.vAlign === 'middle') ty = ov.rect.y + (ov.rect.height - totalTextHeight) / 2;
            else if (ov.vAlign === 'bottom') ty = ov.rect.y + ov.rect.height - totalTextHeight;

            lines.forEach((line, index) => {
                ctx.fillText(line, tx, ty + index * lineHeight);
            });
            
            if (ctx.letterSpacing !== undefined) {
                ctx.letterSpacing = '0px';
            }
          }
        }

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          zip.file(`slide_${i + 1}.png`, blob);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "slides_images.zip");
      
    } catch (error) {
      console.error(error);
      alert('이미지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPdf = () => {
    if (currentSlides.length === 0) return;
    downloadAsPdf(currentSlides, 'edited_slides.pdf');
  };

  const handleRemoveText = async () => {
    if (currentSlides.length === 0) return;
    if (!window.confirm("현재 슬라이드의 모든 텍스트를 제거하고 배경을 복원하시겠습니까?\n이 작업은 약 5~10초 정도 소요됩니다.")) return;

    setIsProcessing(true);
    try {
      const currentSlide = currentSlides[activeSlideIdx];
      // Note: Passing the original high-res image. geminiService will handle resizing.
      const cleanImage = await removeAllTextFromSlide(currentSlide.dataUrl);

      if (cleanImage) {
        // Create new slides array with updated dataUrl for the active slide
        const newSlides = currentSlides.map((s, idx) => 
          idx === activeSlideIdx ? { ...s, dataUrl: cleanImage, overlays: [] } : s
        );
        updateHistory(newSlides);
        // Also clear any current selections since the underlying image changed
        setSelection(null);
        setSelectedOverlayId(null);
      } else {
        alert("텍스트 제거에 실패했습니다.\n\n가능한 원인:\n1. 이미지에 제거할 텍스트가 명확하지 않음\n2. AI 모델 일시적 오류\n3. 안전 필터(Safety Filter) 작동");
      }
    } catch (error) {
      console.error(error);
      alert("오류가 발생했습니다. 콘솔을 확인해주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-100 font-sans">
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#1e293b] shrink-0">
        <div className="flex items-center gap-4">
          {/* 1. Square App Logo - Custom Icon */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20 ring-1 ring-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <rect width="18" height="14" x="3" y="3" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="m16 9-2.5 2.5-1.5-1.5-2.5 2.5" />
            </svg>
          </div>

          {/* 2. KT Cloud Logo (White) */}
          <img 
             src="https://lh3.googleusercontent.com/d/1cg9YBFIuZtsnn_oekcN121ks_JnJPiX-" 
             alt="KT Cloud Logo" 
             className="h-3.5 w-auto object-contain opacity-80"
          />

          {/* 3. Title */}
          <h1 className="text-lg font-bold tracking-tight text-slate-100 ml-1">Slide AI Editor</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors text-sm font-medium border border-slate-600">
            <FileUp size={18} /><span>파일 업로드</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors text-sm font-medium border border-slate-600">
            <Plus size={18} /><span>이미지 추가</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} disabled={currentSlides.length === 0} />
          </label>
          
          <button 
             onClick={handleRemoveText} 
             disabled={currentSlides.length === 0 || isProcessing}
             className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium border border-slate-600 transition-colors"
          >
             <Eraser size={18} /><span>{isProcessing ? '처리 중...' : '텍스트 제거'}</span>
          </button>

          <div className="w-px h-6 bg-slate-700 mx-2"></div>
          
          <button onClick={handleDownloadImages} disabled={currentSlides.length === 0} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm border border-slate-700 transition-all">
            <Download size={18} /><span>슬라이드 이미지 저장</span>
          </button>
          <button onClick={handleDownloadPdf} disabled={currentSlides.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-lg border border-blue-500/50">
            <FileText size={18} /><span>PDF 다운로드</span>
          </button>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Left Toolbar / Panel */}
        <aside className="w-20 border-r border-slate-800 bg-[#1e293b] flex flex-col items-center py-6 gap-6 shrink-0 z-10">
          <div className="flex flex-col gap-2 w-full px-4">
             <button 
               onClick={handleUndo} 
               disabled={historyIndex <= 0}
               className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all flex items-center justify-center" 
               title="실행 취소 (Ctrl+Z)"
             >
               <Undo2 size={20} />
             </button>
             <button 
               onClick={handleRedo} 
               disabled={historyIndex >= history.length - 1}
               className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all flex items-center justify-center" 
               title="다시 실행 (Ctrl+Shift+Z)"
             >
               <Redo2 size={20} />
             </button>
          </div>
          <div className="w-8 h-px bg-slate-700 my-2"></div>
          <button 
            onClick={handleDeleteAll} 
            disabled={!currentSlides[activeSlideIdx]?.overlays?.length}
            className="p-3 rounded-xl hover:bg-red-900/20 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 text-slate-400 transition-colors" 
            title="현재 슬라이드 초기화"
          >
            <Trash2 size={24} />
          </button>
        </aside>
        
        <div className="flex-1 flex flex-col bg-slate-950 relative">
          {isProcessing ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-medium">AI가 슬라이드를 분석 및 복원 중입니다...</p>
            </div>
          ) : currentSlides.length > 0 ? (
            <>
              <EditorCanvas 
                slide={currentSlides[activeSlideIdx]} 
                selectedOverlayId={selectedOverlayId}
                draftOverlay={draftOverlay}
                onSelectionChange={(rect) => { setSelection(rect); if (rect) setSelectedOverlayId(null); }} 
                onOverlaySelect={setSelectedOverlayId}
                onUpdateOverlays={handleUpdateOverlays} 
              />
              <div className="h-12 bg-[#1e293b] border-t border-slate-800 flex items-center justify-center gap-8 shrink-0">
                <button disabled={activeSlideIdx === 0} onClick={() => setActiveSlideIdx(prev => prev - 1)} className="p-1 hover:bg-slate-700 rounded-full disabled:opacity-20 transition-colors"><ChevronLeft /></button>
                <span className="text-sm font-black text-white">{activeSlideIdx + 1} / {currentSlides.length}</span>
                <button disabled={activeSlideIdx === currentSlides.length - 1} onClick={() => setActiveSlideIdx(prev => prev + 1)} className="p-1 hover:bg-slate-700 rounded-full disabled:opacity-20 transition-colors"><ChevronRight /></button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
              <div className="w-40 h-40 mb-10 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-slate-800"><ImageIcon size={64} className="opacity-10" /></div>
              <h3 className="text-2xl font-black text-slate-200 mb-3 tracking-tight">Slide AI Editor</h3>
              <p className="text-slate-500 max-w-xs mx-auto text-sm leading-relaxed mb-10">PDF 또는 이미지를 업로드하여 지능형 텍스트 교체를 시작하세요.</p>
              <label className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black cursor-pointer shadow-2xl transition-all hover:scale-105 active:scale-95">
                파일 선택
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </div>
        <Sidebar 
          activeSlide={currentSlides[activeSlideIdx]} 
          selection={selection} 
          selectedOverlayId={selectedOverlayId}
          onApplyOverlay={handleApplyOverlay} 
          onUpdateOverlays={handleUpdateOverlays}
          onDraftChange={setDraftOverlay}
        />
      </main>
    </div>
  );
};

export default App;
