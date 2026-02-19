
import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { SlideData, Rect, TextOverlay } from './types';
import { convertPdfToImages, downloadAsPdf } from './services/pdfService';
import { downloadAsPpt } from './services/pptService';
import { removeAllTextFromSlide } from './services/geminiService';
import { readFileAsDataUrl } from './services/imageUtils';
import { createOverlayId } from './utils/id';
import { renderSlideToCanvas } from './services/slideRenderService';
import EditorCanvas from './components/EditorCanvas';
import Sidebar from './components/Sidebar';
import SlidePanel from './components/SlidePanel';
import {
  FileUp,
  Download,
  FileText,
  Presentation,
  Trash2,
  Undo2,
  Redo2,
  Image as ImageIcon,
  Plus,
  Eraser,
  Moon,
  Sun
} from 'lucide-react';
import { getKtCloudLogoByMode, getThemeByMode, toggleThemeMode, ThemeMode } from './theme';

const App: React.FC = () => {
  // History State
  const [history, setHistory] = useState<SlideData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [slidePanelCollapsed, setSlidePanelCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('stripe');

  // Draft overlay state for preview (lifted from Sidebar)
  const [draftOverlay, setDraftOverlay] = useState<Partial<TextOverlay> | null>(null);

  // Helper to access current slides from history
  const currentSlides = historyIndex >= 0 ? history[historyIndex] : [];
  const theme = getThemeByMode(themeMode);
  const ciLogoSrc = getKtCloudLogoByMode(themeMode);

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
        const imageDataUrl = await readFileAsDataUrl(file);
        const img = new Image();
        img.src = imageDataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load uploaded image."));
        });
        newSlides = [{
          index: 0,
          dataUrl: imageDataUrl,
          width: img.width,
          height: img.height,
          overlays: []
        }];
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
      const imageSrc = await readFileAsDataUrl(file);
      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for overlay."));
      });

      // Default to center of the slide
      const slide = currentSlides[activeSlideIdx];
      const width = 200;
      const height = (img.height / img.width) * width;
      const x = (slide.width - width) / 2;
      const y = (slide.height - height) / 2;

      const newOverlay: TextOverlay = {
        id: createOverlayId(),
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
      // Keep selection and advance to next slide for repeated application
      setSelectedOverlayId(null);
      if (activeSlideIdx < currentSlides.length - 1) {
        setActiveSlideIdx(prev => prev + 1);
        // selection is NOT cleared, so Sidebar will auto-detect and show the panel
      }
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
      idx === activeSlideIdx ? { ...s, overlays: [] } : s
    );
    updateHistory(newSlides);
    setSelectedOverlayId(null);
  };

  const handleDeleteSelectedOverlay = useCallback(() => {
    if (!selectedOverlayId) return;
    const slide = currentSlides[activeSlideIdx];
    if (!slide) return;

    const overlays = slide.overlays.filter((overlay) => overlay.id !== selectedOverlayId);
    const newSlides = currentSlides.map((s, idx) =>
      idx === activeSlideIdx ? { ...s, overlays } : s
    );
    updateHistory(newSlides);
    setSelectedOverlayId(null);
    setSelection(null);
  }, [selectedOverlayId, currentSlides, activeSlideIdx]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayId) {
        handleDeleteSelectedOverlay();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleDeleteSelectedOverlay, selectedOverlayId]);

  const handleDownloadImages = async () => {
    if (currentSlides.length === 0) return;
    setIsProcessing(true);

    try {
      const zip = new JSZip();

      for (let i = 0; i < currentSlides.length; i++) {
        const slide = currentSlides[i];
        const canvas = await renderSlideToCanvas(slide);

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

  const handleDownloadPdf = async () => {
    if (currentSlides.length === 0) return;
    setIsProcessing(true);
    try {
      await downloadAsPdf(currentSlides, 'edited_slides.pdf');
    } catch (error) {
      console.error(error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPpt = async () => {
    if (currentSlides.length === 0) return;
    setIsProcessing(true);
    try {
      await downloadAsPpt(currentSlides, 'edited_slides.pptx');
    } catch (error) {
      console.error(error);
      alert('PPT 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSlideDelete = (index: number) => {
    if (currentSlides.length <= 1) return;
    const newSlides = currentSlides.filter((_, i) => i !== index);
    updateHistory(newSlides);
    if (activeSlideIdx >= newSlides.length) {
      setActiveSlideIdx(newSlides.length - 1);
    } else if (activeSlideIdx > index) {
      setActiveSlideIdx(activeSlideIdx - 1);
    }
    setSelection(null);
    setSelectedOverlayId(null);
  };

  const handleSlideReorder = (fromIndex: number, toIndex: number) => {
    const newSlides = [...currentSlides];
    const [moved] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, moved);
    updateHistory(newSlides);
    // Update active index to follow the active slide
    if (activeSlideIdx === fromIndex) {
      setActiveSlideIdx(toIndex);
    } else if (activeSlideIdx > fromIndex && activeSlideIdx <= toIndex) {
      setActiveSlideIdx(activeSlideIdx - 1);
    } else if (activeSlideIdx < fromIndex && activeSlideIdx >= toIndex) {
      setActiveSlideIdx(activeSlideIdx + 1);
    }
  };

  const handleRemoveText = async () => {
    if (currentSlides.length === 0) return;
    if (!window.confirm("현재 슬라이드의 모든 텍스트를 제거하고 배경을 복원하시겠습니까?\n이 작업은 약 5~10초 정도 소요됩니다.")) return;

    setIsProcessing(true);
    try {
      const currentSlide = currentSlides[activeSlideIdx];
      const cleanImage = await removeAllTextFromSlide(currentSlide.dataUrl);

      if (cleanImage) {
        const newSlides = currentSlides.map((s, idx) =>
          idx === activeSlideIdx ? { ...s, dataUrl: cleanImage, overlays: [] } : s
        );
        updateHistory(newSlides);
        setSelection(null);
        setSelectedOverlayId(null);
      } else {
        alert("텍스트 제거에 실패했습니다. AI 모델 응답이 비어있습니다.");
      }
    } catch (error: any) {
      console.error(error);
      const errorMsg = error?.message || error?.toString() || '알 수 없는 오류';
      alert(`텍스트 제거에 실패했습니다.\n\n오류 상세: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="flex flex-col h-screen font-sans"
      style={{ backgroundColor: theme.appBg, color: theme.textPrimary }}
    >
      <header
        className="h-16 border-b flex items-center justify-between px-6 shrink-0"
        style={{ backgroundColor: theme.headerBg, borderColor: theme.headerBorder }}
      >
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
            src={ciLogoSrc}
            alt="KT Cloud Logo"
            className="h-3.5 w-auto object-contain"
          />

          {/* 3. Title */}
          <h1 className="text-lg font-bold tracking-tight ml-1" style={{ color: theme.textPrimary }}>Slide AI Editor</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setThemeMode(prev => toggleThemeMode(prev))}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{
              backgroundColor: themeMode === 'linearDark' ? '#e5e7eb' : '#111827',
              color: themeMode === 'linearDark' ? '#111827' : '#ffffff',
              borderColor: themeMode === 'linearDark' ? '#d1d5db' : '#111827'
            }}
          >
            {themeMode === 'linearDark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{themeMode === 'linearDark' ? '라이트모드' : '야간모드'}</span>
          </button>
          <label
            className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium border"
            style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.headerBorder }}
          >
            <FileUp size={18} /><span>파일 업로드</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <label
            className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium border"
            style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.headerBorder }}
          >
            <Plus size={18} /><span>이미지 추가</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} disabled={currentSlides.length === 0} />
          </label>

          <button
            onClick={handleRemoveText}
            disabled={currentSlides.length === 0 || isProcessing}
            className="flex items-center gap-2 px-4 py-2 disabled:opacity-50 rounded-lg text-sm font-medium border transition-colors"
            style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.headerBorder }}
          >
            <Eraser size={18} /><span>{isProcessing ? '처리 중...' : '텍스트 제거'}</span>
          </button>

          <div className="w-px h-6 mx-2" style={{ backgroundColor: theme.headerBorder }}></div>

          <button
            onClick={handleDownloadImages}
            disabled={currentSlides.length === 0}
            className="flex items-center gap-2 px-4 py-2 disabled:opacity-50 rounded-lg text-sm border transition-all"
            style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.headerBorder }}
          >
            <Download size={18} /><span>슬라이드 이미지 저장</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={currentSlides.length === 0}
            className="flex items-center gap-2 px-4 py-2 disabled:opacity-50 rounded-lg text-sm font-bold shadow-lg border"
            style={{ backgroundColor: theme.primaryButtonBg, color: theme.primaryButtonText, borderColor: theme.primaryButtonBg }}
          >
            <FileText size={18} /><span>PDF 다운로드</span>
          </button>
          <button
            onClick={handleDownloadPpt}
            disabled={currentSlides.length === 0}
            className="flex items-center gap-2 px-4 py-2 disabled:opacity-50 rounded-lg text-sm font-bold shadow-lg border"
            style={{ backgroundColor: '#a78bfa', color: '#ffffff', borderColor: '#a78bfa' }}
          >
            <Presentation size={18} /><span>PPT 다운로드</span>
          </button>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Left Slide Panel */}
        {currentSlides.length > 0 && (
          <SlidePanel
            slides={currentSlides}
            activeSlideIdx={activeSlideIdx}
            onSlideSelect={(idx) => { setActiveSlideIdx(idx); setSelection(null); setSelectedOverlayId(null); }}
            onSlideDelete={handleSlideDelete}
            onSlideReorder={handleSlideReorder}
            isCollapsed={slidePanelCollapsed}
            onToggleCollapse={() => setSlidePanelCollapsed(prev => !prev)}
            isDark={theme.isDark}
          />
        )}

        {/* Left Toolbar */}
        <aside
          className="w-14 border-r flex flex-col items-center py-4 gap-4 shrink-0 z-10"
          style={{ borderColor: theme.sidePanelBorder, backgroundColor: theme.toolbarBg }}
        >
          <div className="flex flex-col gap-2 w-full px-2">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2.5 rounded-lg disabled:opacity-30 border transition-all flex items-center justify-center"
              style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.sidePanelBorder }}
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo2 size={18} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2.5 rounded-lg disabled:opacity-30 border transition-all flex items-center justify-center"
              style={{ backgroundColor: theme.neutralButtonBg, color: theme.neutralButtonText, borderColor: theme.sidePanelBorder }}
              title="다시 실행 (Ctrl+Shift+Z)"
            >
              <Redo2 size={18} />
            </button>
          </div>
          <div className="w-6 h-px" style={{ backgroundColor: theme.sidePanelBorder }}></div>
          <button
            onClick={handleDeleteAll}
            disabled={!currentSlides[activeSlideIdx]?.overlays?.length}
            className="p-2.5 rounded-lg hover:bg-red-900/20 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            style={{ color: theme.textSecondary }}
            title="현재 슬라이드 초기화"
          >
            <Trash2 size={20} />
          </button>
        </aside>

        <div className="flex-1 flex flex-col relative" style={{ backgroundColor: theme.mainCanvasBg }}>
          {isProcessing ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-medium">AI가 슬라이드를 분석 및 복원 중입니다...</p>
            </div>
          ) : currentSlides.length > 0 ? (
            <EditorCanvas
              slide={currentSlides[activeSlideIdx]}
              selectedOverlayId={selectedOverlayId}
              draftOverlay={draftOverlay}
              isDark={theme.isDark}
              onSelectionChange={(rect) => { setSelection(rect); if (rect) setSelectedOverlayId(null); }}
              onOverlaySelect={setSelectedOverlayId}
              onUpdateOverlays={handleUpdateOverlays}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ color: theme.textSecondary }}>
              <div className="w-40 h-40 mb-10 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed" style={{ backgroundColor: theme.neutralButtonBg, borderColor: theme.sidePanelBorder }}><ImageIcon size={64} className="opacity-10" /></div>
              <h3 className="text-2xl font-black mb-3 tracking-tight" style={{ color: theme.textPrimary }}>Slide AI Editor</h3>
              <p className="max-w-xs mx-auto text-sm leading-relaxed mb-10" style={{ color: theme.textSecondary }}>PDF 또는 이미지를 업로드하여 지능형 텍스트 교체를 시작하세요.</p>
              <label className="px-10 py-4 text-white rounded-2xl font-black cursor-pointer shadow-2xl transition-all hover:scale-105 active:scale-95" style={{ backgroundColor: theme.primaryButtonBg }}>
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
          isDark={theme.isDark}
        />
      </main>
    </div>
  );
};

export default App;
