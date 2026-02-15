
import React, { useState, useEffect, useCallback } from 'react';
import { Rect, SlideData, TextOverlay, OCRResult, VerticalAlign, HorizontalAlign } from '../types';
import { analyzeTextInImage, generateTextSuggestion, removeTextFromImage } from '../services/geminiService';
import { 
  Loader2, 
  Type as TypeIcon, 
  Info, 
  CheckCircle2, 
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  MoveHorizontal,
  Wand2,
  CopyPlus,
  Eraser,
  Image as ImageIcon,
  Trash2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Scaling,
  Save
} from 'lucide-react';

interface SidebarProps {
  activeSlide: SlideData | undefined;
  selection: Rect | null;
  selectedOverlayId: string | null;
  onApplyOverlay: (overlay: TextOverlay, keepSelection?: boolean) => void;
  onUpdateOverlays: (overlays: TextOverlay[]) => void;
  onDraftChange: (draft: Partial<TextOverlay> | null) => void; // Sync state to parent for preview
}

const FONTS = [
  { name: 'Inter', value: 'Inter' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Roboto', value: 'Roboto' },
  { name: 'Times New Roman', value: 'serif' },
  { name: 'Courier New', value: 'monospace' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
  activeSlide, 
  selection, 
  selectedOverlayId,
  onApplyOverlay,
  onUpdateOverlays,
  onDraftChange
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  
  const [replacementText, setReplacementText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontColor, setFontColor] = useState('#000000');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [vAlign, setVAlign] = useState<VerticalAlign>('middle'); // Changed default to middle
  const [hAlign, setHAlign] = useState<HorizontalAlign>('left');
  const [letterSpacing, setLetterSpacing] = useState(0);

  // 배경 관련 상태
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [backgroundImage, setBackgroundImage] = useState<string | undefined>(undefined);
  const [isTransparent, setIsTransparent] = useState(false);

  const selectedOverlay = activeSlide?.overlays.find(o => o.id === selectedOverlayId);
  const isImageOverlay = selectedOverlay?.type === 'image';

  // Sync draft state for live preview when selection exists but not editing
  useEffect(() => {
    if (selection && !selectedOverlayId) {
       onDraftChange({
         newText: replacementText,
         fontSize,
         fontWeight,
         fontColor,
         fontFamily,
         backgroundColor: isTransparent ? 'rgba(0,0,0,0)' : backgroundColor,
         backgroundImage,
         vAlign,
         hAlign,
         letterSpacing
       });
    } else {
       onDraftChange(null);
    }
  }, [
    selection, selectedOverlayId, replacementText, fontSize, fontWeight, fontColor, 
    fontFamily, backgroundColor, backgroundImage, isTransparent, vAlign, hAlign, letterSpacing, 
    onDraftChange
  ]);

  // Reset state when selection changes (Issue: Previous selection state persisted)
  useEffect(() => {
    if (selection && !selectedOverlayId) {
      // New Selection Made: Reset everything to defaults or estimates
      setOcrResult(null);
      setReplacementText('');
      
      // Heuristic: Font size is often ~75% of the selection height for tight boxes
      const estimatedFontSize = Math.max(12, Math.round(selection.height * 0.75));
      setFontSize(estimatedFontSize);
      
      setFontWeight('normal');
      setFontColor('#000000');
      setFontFamily('Inter');
      setVAlign('middle'); // Default to middle for new text
      setHAlign('left');
      setLetterSpacing(0);
      
      // Background resets are handled by the detectBackgroundColor effect below
      setBackgroundImage(undefined);
      setIsTransparent(false);
    } else if (!selection && !selectedOverlayId) {
      // No selection, no edit
      setOcrResult(null);
      setReplacementText('');
      setBackgroundColor('#ffffff');
      setBackgroundImage(undefined);
      setIsTransparent(false);
    }
  }, [selection, selectedOverlayId]);

  // Load existing overlay data when editing
  useEffect(() => {
    if (selectedOverlay) {
      setReplacementText(selectedOverlay.newText);
      setFontSize(selectedOverlay.fontSize);
      setFontWeight(selectedOverlay.fontWeight);
      setFontColor(selectedOverlay.fontColor);
      setFontFamily(selectedOverlay.fontFamily);
      setVAlign(selectedOverlay.vAlign || 'middle');
      setHAlign(selectedOverlay.hAlign || 'left');
      setLetterSpacing(selectedOverlay.letterSpacing || 0);
      setBackgroundImage(selectedOverlay.backgroundImage);
      
      const bg = selectedOverlay.backgroundColor;
      if (bg === 'rgba(0,0,0,0)' || bg === 'transparent') {
        setIsTransparent(true);
        setBackgroundColor('#ffffff');
      } else {
        setIsTransparent(false);
        setBackgroundColor(bg || '#ffffff');
      }
    }
  }, [selectedOverlayId, selectedOverlay]);

  // 로컬 캔버스에서 주변 배경색 추출 (Mode 알고리즘 사용)
  const detectBackgroundColor = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number): string => {
    try {
      const data = ctx.getImageData(0, 0, width, height).data;
      const colorCounts: { [key: string]: { count: number, r: number, g: number, b: number } } = {};
      
      const addPixel = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        if (a < 50) return;

        const bucket = 10;
        const key = `${Math.round(r / bucket)},${Math.round(g / bucket)},${Math.round(b / bucket)}`;

        if (!colorCounts[key]) {
          colorCounts[key] = { count: 0, r: 0, g: 0, b: 0 };
        }
        colorCounts[key].count++;
        colorCounts[key].r += r;
        colorCounts[key].g += g;
        colorCounts[key].b += b;
      };

      const depth = 5; 
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < Math.min(depth, height); y++) addPixel(x, y);
        for (let y = Math.max(0, height - depth); y < height; y++) addPixel(x, y);
      }
      for (let y = depth; y < height - depth; y++) {
        for (let x = 0; x < Math.min(depth, width); x++) addPixel(x, y);
        for (let x = Math.max(0, width - depth); x < width; x++) addPixel(x, y);
      }

      let maxCount = 0;
      let dominantColor = null;

      for (const key in colorCounts) {
        if (colorCounts[key].count > maxCount) {
          maxCount = colorCounts[key].count;
          dominantColor = {
            r: Math.round(colorCounts[key].r / maxCount),
            g: Math.round(colorCounts[key].g / maxCount),
            b: Math.round(colorCounts[key].b / maxCount)
          };
        }
      }

      if (!dominantColor) return '#ffffff';

      const toHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };

      return `#${toHex(dominantColor.r)}${toHex(dominantColor.g)}${toHex(dominantColor.b)}`;
    } catch (e) {
      console.error("Color detection failed", e);
      return '#ffffff';
    }
  }, []);

  const getCroppedCanvas = async (usePadding = false) => {
    // If editing, use the overlay rect. If selecting, use selection rect.
    const targetRect = selectedOverlay?.rect || selection;

    if (!targetRect || !activeSlide) return null;

    const padding = usePadding ? 10 : 0;
    
    const startX = Math.max(0, Math.floor(targetRect.x - padding));
    const startY = Math.max(0, Math.floor(targetRect.y - padding));
    const endX = Math.min(activeSlide.width, Math.ceil(targetRect.x + targetRect.width + padding));
    const endY = Math.min(activeSlide.height, Math.ceil(targetRect.y + targetRect.height + padding));
    
    const width = endX - startX;
    const height = endY - startY;

    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = new Image();
    img.src = activeSlide.dataUrl;
    await new Promise(resolve => img.onload = resolve);

    ctx.drawImage(img, startX, startY, width, height, 0, 0, width, height);
    return { canvas, ctx, width, height };
  };

  useEffect(() => {
    if (selection && activeSlide && !selectedOverlayId) {
      const detect = async () => {
        try {
          const result = await getCroppedCanvas(true);
          if (!result) return;
          const detectedBg = detectBackgroundColor(result.ctx, result.width, result.height);
          setBackgroundColor(detectedBg);
          setIsTransparent(false); 
        } catch (e) {
          console.error(e);
        }
      };
      detect();
    }
  }, [selection, activeSlide, selectedOverlayId, detectBackgroundColor]);

  const handleAnalyze = async () => {
    if ((!selection && !selectedOverlayId) || !activeSlide) return;
    setIsAnalyzing(true);
    try {
      const bgResult = await getCroppedCanvas(true);
      if (bgResult) {
        const detectedBg = detectBackgroundColor(bgResult.ctx, bgResult.width, bgResult.height);
        setBackgroundColor(detectedBg);
        setIsTransparent(false);
      }

      const ocrResultCanvas = await getCroppedCanvas(false);
      if (!ocrResultCanvas) return;

      const cropDataUrl = ocrResultCanvas.canvas.toDataURL('image/png');
      const result = await analyzeTextInImage(cropDataUrl);
      
      setOcrResult(result);
      setReplacementText(result.text);

      // CRITICAL: Font Size Estimation Logic
      // If AI returns small default (16) but box is big, use box height estimate.
      const boxHeight = selection ? selection.height : (selectedOverlay?.rect.height || 0);
      const estimatedSize = Math.round(boxHeight * 0.75); 
      
      // Use the larger of AI result or heuristic to avoid tiny text in large boxes
      if (result.fontSize < estimatedSize * 0.8) {
         setFontSize(estimatedSize);
      } else {
         setFontSize(result.fontSize);
      }
      
      setFontWeight(result.fontWeight);
      setFontColor(result.fontColor);
      setFontFamily(result.fontFamily);
      
      setVAlign('middle');
      setHAlign('center');
      setLetterSpacing(0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!replacementText && !ocrResult?.text) return;
    setIsSuggesting(true);
    try {
      const textToImprove = replacementText || ocrResult?.text || "";
      const suggestion = await generateTextSuggestion(textToImprove);
      setReplacementText(suggestion);
      // Update active overlay if editing
      if (isEditing) updateSelectedOverlay({ newText: suggestion });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAiBackgroundRestore = async () => {
    if ((!selection && !selectedOverlayId) || !activeSlide) return;
    setIsGeneratingBg(true);
    try {
      // 1. Get exact crop of original image
      const result = await getCroppedCanvas(false);
      if (!result) return;
      const cropDataUrl = result.canvas.toDataURL('image/png');

      // 2. Call AI to remove text and inpaint
      const inpaintedImage = await removeTextFromImage(cropDataUrl);
      
      if (inpaintedImage) {
        setBackgroundImage(inpaintedImage);
        
        if (isEditing) {
          updateSelectedOverlay({ 
            backgroundImage: inpaintedImage,
          });
        }
      }
    } catch (error) {
      console.error(error);
      alert("배경 생성에 실패했습니다.");
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const updateSelectedOverlay = (updates: Partial<TextOverlay>) => {
    if (!selectedOverlayId || !activeSlide) return;
    const newOverlays = activeSlide.overlays.map(ov => 
      ov.id === selectedOverlayId ? { ...ov, ...updates } : ov
    );
    onUpdateOverlays(newOverlays);
  };

  const handleApply = (keepSelection: boolean = false) => {
    if (!selection) return;
    onApplyOverlay({
      id: Math.random().toString(36).substr(2, 9),
      rect: { ...selection },
      originalText: ocrResult?.text || '',
      newText: replacementText,
      fontSize,
      fontWeight,
      fontColor,
      fontFamily,
      backgroundColor: isTransparent ? 'rgba(0,0,0,0)' : backgroundColor,
      backgroundImage,
      vAlign,
      hAlign,
      letterSpacing,
      type: 'text',
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false
    }, keepSelection);
  };
  
  const handleUpdate = () => {
      if (!selectedOverlayId) return;
      updateSelectedOverlay({
          newText: replacementText,
          fontSize,
          fontWeight,
          fontColor,
          fontFamily,
          backgroundColor: isTransparent ? 'rgba(0,0,0,0)' : backgroundColor,
          backgroundImage,
          vAlign,
          hAlign,
          letterSpacing
      });
      // Clear selection after update if needed, but usually we keep it selected
  };

  const isEditing = !!selectedOverlayId;
  const hasSelectionOrEditing = !!selection || isEditing;

  if (isImageOverlay && selectedOverlay) {
     return (
        <div className="w-80 h-full bg-[#1e293b] border-l border-slate-700 flex flex-col p-6 overflow-y-auto">
             <div className="mb-6 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <ImageIcon size={16} className="text-purple-400" />
                    이미지 편집
                </h2>
                <button onClick={() => updateSelectedOverlay({})} className="text-xs text-slate-500 hover:text-white">초기화</button>
            </div>
            
            <div className="space-y-6">
                <div className="bg-slate-900 rounded-lg p-4 flex flex-col items-center gap-2 border border-slate-800">
                     <div className="w-full h-32 flex items-center justify-center overflow-hidden">
                         <img 
                           src={selectedOverlay.imageSrc} 
                           className="max-w-full max-h-full object-contain" 
                           style={{ 
                               transform: `rotate(${selectedOverlay.rotation || 0}deg) scaleX(${selectedOverlay.flipHorizontal ? -1 : 1}) scaleY(${selectedOverlay.flipVertical ? -1 : 1})`
                           }}
                           alt="Preview"
                        />
                     </div>
                     <p className="text-[10px] text-slate-500">미리보기</p>
                </div>

                {/* Transform Controls */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <RotateCw size={12} /> 회전 (각도)
                        </label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="range" 
                                min="0" 
                                max="360" 
                                value={selectedOverlay.rotation || 0} 
                                onChange={(e) => updateSelectedOverlay({ rotation: parseInt(e.target.value) })}
                                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <span className="text-xs w-8 text-right font-mono">{selectedOverlay.rotation || 0}°</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => updateSelectedOverlay({ flipHorizontal: !selectedOverlay.flipHorizontal })}
                            className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${selectedOverlay.flipHorizontal ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                        >
                            <FlipHorizontal size={16} /> <span className="text-xs font-medium">좌우 반전</span>
                        </button>
                        <button 
                            onClick={() => updateSelectedOverlay({ flipVertical: !selectedOverlay.flipVertical })}
                            className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition-all ${selectedOverlay.flipVertical ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                        >
                            <FlipVertical size={16} /> <span className="text-xs font-medium">상하 반전</span>
                        </button>
                    </div>
                </div>

                {/* Size Controls */}
                <div className="space-y-2 pt-4 border-t border-slate-800">
                     <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <Scaling size={12} /> 크기 (px)
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <span className="text-[10px] text-slate-500">너비 (W)</span>
                            <input 
                                type="number" 
                                value={Math.round(selectedOverlay.rect.width)} 
                                onChange={(e) => {
                                    const w = parseInt(e.target.value) || 10;
                                    updateSelectedOverlay({ rect: { ...selectedOverlay.rect, width: w } });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                            />
                        </div>
                        <div className="space-y-1">
                             <span className="text-[10px] text-slate-500">높이 (H)</span>
                             <input 
                                type="number" 
                                value={Math.round(selectedOverlay.rect.height)} 
                                onChange={(e) => {
                                    const h = parseInt(e.target.value) || 10;
                                    updateSelectedOverlay({ rect: { ...selectedOverlay.rect, height: h } });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
     )
  }

  return (
    <div className="w-80 h-full bg-[#1e293b] border-l border-slate-700 flex flex-col p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <TypeIcon size={16} className="text-blue-400" />
          {isEditing ? '텍스트 수정' : '텍스트 교체'}
        </h2>
      </div>

      {!selection && !isEditing ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
          <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
            <Info size={32} className="opacity-50" />
          </div>
          <p className="text-sm">텍스트 교체 영역을 선택하거나<br/>교체된 텍스트를 클릭하세요</p>
        </div>
      ) : (
        <div className="space-y-6">
          {!isEditing && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">AI 텍스트 분석</h3>
              {isAnalyzing ? (
                <div className="flex items-center gap-3 py-4 text-blue-400">
                  <Loader2 className="animate-spin" size={18} />
                  <span className="text-sm">분석 중...</span>
                </div>
              ) : ocrResult ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-900 rounded text-sm text-slate-300 italic border border-slate-800">"{ocrResult.text}"</div>
                </div>
              ) : (
                <button 
                  onClick={handleAnalyze} 
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  <Sparkles size={14} className="text-blue-400" /> AI 분석 (OCR) 실행
                </button>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">내용</label>
                <button 
                  onClick={handleAiSuggest}
                  disabled={isSuggesting || (!replacementText && !ocrResult)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                >
                  {isSuggesting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  AI 추천
                </button>
              </div>
              <textarea 
                value={replacementText} 
                onChange={(e) => {
                  setReplacementText(e.target.value);
                  if (isEditing) updateSelectedOverlay({ newText: e.target.value });
                }} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:border-blue-500 text-slate-200 placeholder-slate-600"
                placeholder={ocrResult ? "텍스트를 입력하세요" : "OCR 분석을 먼저 실행하세요"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">수평 정렬</label>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button onClick={() => { setHAlign('left'); if (isEditing) updateSelectedOverlay({ hAlign: 'left' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'left' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignLeft size={16} /></button>
                  <button onClick={() => { setHAlign('center'); if (isEditing) updateSelectedOverlay({ hAlign: 'center' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'center' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignCenter size={16} /></button>
                  <button onClick={() => { setHAlign('right'); if (isEditing) updateSelectedOverlay({ hAlign: 'right' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'right' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignRight size={16} /></button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">수직 정렬</label>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button onClick={() => { setVAlign('top'); if (isEditing) updateSelectedOverlay({ vAlign: 'top' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'top' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="위쪽"><AlignVerticalJustifyStart size={16} /></button>
                  <button onClick={() => { setVAlign('middle'); if (isEditing) updateSelectedOverlay({ vAlign: 'middle' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'middle' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="가운데"><AlignVerticalJustifyCenter size={16} /></button>
                  <button onClick={() => { setVAlign('bottom'); if (isEditing) updateSelectedOverlay({ vAlign: 'bottom' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'bottom' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="아래쪽"><AlignVerticalJustifyEnd size={16} /></button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">글꼴</label>
              <select 
                value={fontFamily}
                onChange={(e) => {
                  setFontFamily(e.target.value);
                  if (isEditing) updateSelectedOverlay({ fontFamily: e.target.value });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">크기</label>
                <input 
                  type="number" 
                  value={fontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFontSize(val);
                    if (isEditing) updateSelectedOverlay({ fontSize: val });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">글자 색상</label>
                <div className="flex gap-2 items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                  <input 
                    type="color" 
                    value={fontColor} 
                    onChange={(e) => {
                      setFontColor(e.target.value);
                      if (isEditing) updateSelectedOverlay({ fontColor: e.target.value });
                    }}
                    className="w-8 h-8 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400 uppercase">{fontColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
               <label className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                 <span>배경 (Background)</span>
                 <div className="flex items-center gap-2">
                    <button 
                      onClick={handleAiBackgroundRestore}
                      disabled={isGeneratingBg || !hasSelectionOrEditing}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                      title="현재 영역의 텍스트를 AI로 지우고 자연스러운 배경을 생성합니다"
                    >
                      {isGeneratingBg ? <Loader2 size={10} className="animate-spin" /> : <Eraser size={10} />}
                      AI 배경 복원
                    </button>
                    {backgroundImage && (
                      <button
                        onClick={() => {
                          setBackgroundImage(undefined);
                          setIsTransparent(false);
                          setBackgroundColor('#ffffff');
                          if (isEditing) {
                            updateSelectedOverlay({ backgroundImage: undefined, backgroundColor: '#ffffff' });
                          }
                        }}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="배경 이미지 삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                 </div>
               </label>
               
               {backgroundImage && (
                 <div 
                   className="mb-2 relative w-full h-12 rounded-lg border border-slate-700 overflow-hidden bg-slate-900 cursor-pointer hover:ring-1 hover:ring-blue-500 transition-all"
                   onClick={() => {
                     // Clicking thumbnail ensures background image is active (redundant but gives feedback)
                     if (backgroundImage) setBackgroundImage(backgroundImage);
                   }}
                 >
                   <img src={backgroundImage} alt="AI Background" className="w-full h-full object-cover" />
                 </div>
               )}

               <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                 <div className="flex items-center gap-3">
                   <div className="relative flex items-center">
                     <input 
                       type="color" 
                       value={backgroundColor}
                       disabled={isTransparent}
                       onChange={(e) => {
                         setBackgroundColor(e.target.value);
                         // If manually changing color, remove image
                         setBackgroundImage(undefined);
                         if (isEditing) updateSelectedOverlay({ backgroundColor: e.target.value, backgroundImage: undefined });
                       }}
                       className={`w-6 h-6 bg-transparent border-none p-0 cursor-pointer ${isTransparent ? 'opacity-20 cursor-not-allowed' : ''}`}
                     />
                     {isTransparent && <div className="absolute inset-0 bg-slate-900/50 pointer-events-none" />}
                   </div>
                   <span className={`text-xs font-mono uppercase ${isTransparent ? 'text-slate-600' : 'text-slate-300'}`}>
                     {backgroundColor}
                   </span>
                 </div>
                 
                 <label className="flex items-center gap-2 cursor-pointer group select-none">
                   <input 
                     type="checkbox" 
                     checked={isTransparent}
                     onChange={(e) => {
                       const checked = e.target.checked;
                       setIsTransparent(checked);
                       if (isEditing) {
                         // If checking off transparency, just ensure correct alpha, do not delete image
                         updateSelectedOverlay({ backgroundColor: checked ? 'rgba(0,0,0,0)' : backgroundColor });
                       }
                     }}
                     className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 transition-colors group-hover:border-slate-500"
                   />
                   <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">투명</span>
                 </label>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">두께</label>
                <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button 
                    onClick={() => { setFontWeight('normal'); if (isEditing) updateSelectedOverlay({ fontWeight: 'normal' }); }}
                    className={`flex-1 py-1.5 text-xs rounded transition-all ${fontWeight === 'normal' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
                  >
                    Normal
                  </button>
                  <button 
                    onClick={() => { setFontWeight('bold'); if (isEditing) updateSelectedOverlay({ fontWeight: 'bold' }); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${fontWeight === 'bold' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
                  >
                    Bold
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">자간 (Spacing)</label>
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2">
                  <MoveHorizontal size={14} className="text-slate-500 mr-2" />
                  <input 
                    type="number" 
                    step="0.1"
                    value={letterSpacing} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setLetterSpacing(val);
                      if (isEditing) updateSelectedOverlay({ letterSpacing: val });
                    }}
                    className="w-full bg-transparent py-2 text-sm focus:outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* Buttons: Show 'Apply' when creating new, 'Update' when editing */}
            <div className="space-y-2 mt-4">
              {!isEditing ? (
                <>
                  <button 
                    onClick={() => handleApply(false)} 
                    disabled={!selection} 
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                  >
                    <CheckCircle2 size={18} /> 텍스트 적용
                  </button>
                  <button 
                    onClick={() => handleApply(true)} 
                    disabled={!selection} 
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all border border-slate-600"
                    title="적용 후 선택 영역 유지 (워터마크 제거 등 반복 작업용)"
                  >
                    <CopyPlus size={18} /> 반복 적용
                  </button>
                </>
              ) : (
                <button 
                   onClick={handleUpdate}
                   className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                   <Save size={18} /> 수정 완료
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
