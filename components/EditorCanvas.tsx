
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SlideData, Rect, Point, HandleType, TextOverlay, ErasePath } from '../types';
import { COLORS, HANDLE_SIZE, MIN_RECT_SIZE, ZOOM_STEP, MAX_ZOOM, MIN_ZOOM, PAN_STEP } from '../constants';

interface EditorCanvasProps {
  slide: SlideData;
  selectedOverlayId: string | null;
  draftOverlay: Partial<TextOverlay> | null; // New prop for live preview
  isDark: boolean;
  isEraseMode: boolean;
  eraseTool: 'add' | 'remove';
  eraseBrushSize: number;
  erasePaths: ErasePath[];
  onErasePathCommit: (path: ErasePath) => void;
  onSelectionChange: (rect: Rect | null) => void;
  onOverlaySelect: (id: string | null) => void;
  onUpdateOverlays: (overlays: TextOverlay[]) => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ 
  slide, 
  selectedOverlayId,
  draftOverlay,
  isDark,
  isEraseMode,
  eraseTool,
  eraseBrushSize,
  erasePaths,
  onErasePathCommit,
  onSelectionChange, 
  onOverlaySelect,
  onUpdateOverlays 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgImageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const userImageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [selection, setSelection] = useState<Rect | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizingSelection, setIsResizingSelection] = useState(false);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [currentErasePath, setCurrentErasePath] = useState<ErasePath | null>(null);
  
  const [dragType, setDragType] = useState<'move' | HandleType | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [initialRotation, setInitialRotation] = useState(0);
  
  // State for draft image loading
  const [draftImage, setDraftImage] = useState<HTMLImageElement | null>(null);

  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.code === 'Space') {
        if (isInput) return;
        setIsSpacePressed(e.type === 'keydown');
        if (e.type === 'keydown') e.preventDefault();
        return;
      }

      if (e.type === 'keydown' && !isInput) {
        if (e.code === 'ArrowUp') {
          setOffset(prev => ({ ...prev, y: prev.y + PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowDown') {
          setOffset(prev => ({ ...prev, y: prev.y - PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowLeft') {
          setOffset(prev => ({ ...prev, x: prev.x + PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowRight') {
          setOffset(prev => ({ ...prev, x: prev.x - PAN_STEP }));
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = slide.dataUrl;
    img.onload = () => {
      setImage(img);
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const scale = Math.min(
          (clientWidth - 80) / img.width,
          (clientHeight - 80) / img.height
        );
        setZoom(scale);
        setOffset({
          x: (clientWidth - img.width * scale) / 2,
          y: (clientHeight - img.height * scale) / 2
        });
      }
    };
  }, [slide.dataUrl]);

  // Preload images for overlays
  useEffect(() => {
    slide.overlays.forEach(overlay => {
      if (overlay.backgroundImage && !bgImageCache.current.has(overlay.id)) {
        const img = new Image();
        img.src = overlay.backgroundImage;
        img.onload = () => {
           bgImageCache.current.set(overlay.id, img);
           draw();
        };
      }
      if (overlay.type === 'image' && overlay.imageSrc && !userImageCache.current.has(overlay.id)) {
        const img = new Image();
        img.src = overlay.imageSrc;
        img.onload = () => {
           userImageCache.current.set(overlay.id, img);
           draw();
        };
      }
    });
  }, [slide.overlays]);

  useEffect(() => {
    if (draftOverlay?.backgroundImage) {
      const img = new Image();
      img.src = draftOverlay.backgroundImage;
      img.onload = () => {
        setDraftImage(img);
      };
    } else {
      setDraftImage(null);
    }
  }, [draftOverlay?.backgroundImage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || isSpacePressed) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = delta > 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP);
        setZoom(prevZoom => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return prevZoom;
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          setOffset(prevOffset => {
            const wx = (mouseX - prevOffset.x) / prevZoom;
            const wy = (mouseY - prevOffset.y) / prevZoom;
            return { x: mouseX - wx * newZoom, y: mouseY - wy * newZoom };
          });
          return newZoom;
        });
      } else {
        setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelNative);
  }, [zoom, isSpacePressed]);

  // Helper to draw overlays with rotation support
  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, overlay: Partial<TextOverlay> & { rect: Rect }, isSelected: boolean) => {
    ctx.save();
    
    // Rotate/Transform context
    const cx = overlay.rect.x + overlay.rect.width / 2;
    const cy = overlay.rect.y + overlay.rect.height / 2;
    
    ctx.translate(cx, cy);
    if (overlay.rotation) ctx.rotate((overlay.rotation * Math.PI) / 180);
    if (overlay.flipHorizontal) ctx.scale(-1, 1);
    if (overlay.flipVertical) ctx.scale(1, -1);
    ctx.translate(-cx, -cy);

    // Draw Content
    if (overlay.type === 'image' && overlay.id && userImageCache.current.has(overlay.id)) {
      const uImg = userImageCache.current.get(overlay.id);
      if (uImg) ctx.drawImage(uImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
    } 
    else if (overlay.type === 'image' && overlay.imageSrc) {
       // Fallback/Direct draw for draft or non-cached
       const img = new Image();
       img.src = overlay.imageSrc;
       ctx.drawImage(img, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
    }
    else {
      // Text Overlay
      if (overlay.backgroundImage && overlay.id && bgImageCache.current.has(overlay.id)) {
        const bgImg = bgImageCache.current.get(overlay.id);
        if (bgImg) ctx.drawImage(bgImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      } else if (overlay.backgroundImage) {
         const img = new Image();
         img.src = overlay.backgroundImage;
         ctx.drawImage(img, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      } else {
        ctx.fillStyle = overlay.backgroundColor || 'transparent';
        ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      }

      // Text
      if (overlay.newText) {
         ctx.fillStyle = overlay.fontColor || '#000000';
         const fSize = overlay.fontSize || 16;
         ctx.font = `${overlay.fontWeight || 'normal'} ${fSize}px ${overlay.fontFamily || 'sans-serif'}, sans-serif`;
         if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${overlay.letterSpacing || 0}px`;
         
         const lines = overlay.newText.split('\n');
         const lineHeight = fSize * 1.2;
         const totalTextHeight = lines.length * lineHeight;

         // Visual adjustment: push text down slightly because standard baseline 'top' is very high
         // Adding 15% of font size as a downward nudge.
         const yNudge = fSize * 0.15;

         ctx.textAlign = (overlay.hAlign || 'left') as CanvasTextAlign;
         ctx.textBaseline = 'top';

         let tx = overlay.rect.x;
         if (overlay.hAlign === 'center') tx = overlay.rect.x + overlay.rect.width / 2;
         else if (overlay.hAlign === 'right') tx = overlay.rect.x + overlay.rect.width;

         let ty = overlay.rect.y;
         if (overlay.vAlign === 'middle') ty = overlay.rect.y + (overlay.rect.height - totalTextHeight) / 2;
         else if (overlay.vAlign === 'bottom') ty = overlay.rect.y + overlay.rect.height - totalTextHeight;

         // Apply the nudge
         ty += yNudge;

         lines.forEach((line, index) => {
            ctx.fillText(line, tx, ty + index * lineHeight);
         });
         if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
      }
    }

    // Draw Selection Box & Handles if selected
    if (isSelected) {
       ctx.strokeStyle = COLORS.primary;
       ctx.lineWidth = 2 / zoom;
       ctx.strokeRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);

       // Handles
       const handleSize = HANDLE_SIZE / zoom;
       const handles: Point[] = [
          { x: overlay.rect.x, y: overlay.rect.y },
          { x: overlay.rect.x + overlay.rect.width / 2, y: overlay.rect.y },
          { x: overlay.rect.x + overlay.rect.width, y: overlay.rect.y },
          { x: overlay.rect.x + overlay.rect.width, y: overlay.rect.y + overlay.rect.height / 2 },
          { x: overlay.rect.x + overlay.rect.width, y: overlay.rect.y + overlay.rect.height },
          { x: overlay.rect.x + overlay.rect.width / 2, y: overlay.rect.y + overlay.rect.height },
          { x: overlay.rect.x, y: overlay.rect.y + overlay.rect.height },
          { x: overlay.rect.x, y: overlay.rect.y + overlay.rect.height / 2 },
       ];

       ctx.fillStyle = COLORS.handle;
       handles.forEach(h => {
          ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
       });

       // Rotation Handle (Top Stick)
       ctx.beginPath();
       ctx.moveTo(overlay.rect.x + overlay.rect.width / 2, overlay.rect.y);
       ctx.lineTo(overlay.rect.x + overlay.rect.width / 2, overlay.rect.y - (30 / zoom));
       ctx.stroke();
       
       ctx.beginPath();
       ctx.arc(overlay.rect.x + overlay.rect.width / 2, overlay.rect.y - (30 / zoom), handleSize, 0, Math.PI * 2);
       ctx.fillStyle = COLORS.handle;
       ctx.fill();
    }

    ctx.restore();
  }, [userImageCache, bgImageCache, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    ctx.drawImage(image, 0, 0);

    slide.overlays.forEach(overlay => {
       const isSelected = overlay.id === selectedOverlayId;
       drawOverlay(ctx, overlay, isSelected);
    });

    if (isEraseMode) {
      const previewPaths = currentErasePath ? [...erasePaths, currentErasePath] : erasePaths;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = slide.width;
      maskCanvas.height = slide.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        previewPaths.forEach((path) => {
          if (path.points.length === 0) return;
          maskCtx.save();
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';
          maskCtx.lineWidth = path.size;
          maskCtx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
          maskCtx.globalCompositeOperation = path.mode === 'add' ? 'source-over' : 'destination-out';
          maskCtx.beginPath();
          maskCtx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) {
            maskCtx.lineTo(path.points[i].x, path.points[i].y);
          }
          if (path.points.length === 1) {
            maskCtx.arc(path.points[0].x, path.points[0].y, path.size / 2, 0, Math.PI * 2);
          }
          maskCtx.stroke();
          maskCtx.restore();
        });
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.restore();
      }
    }

    // Draw Drawing Selection (Blue Box)
    if (selection) {
       // Standard Selection Box for new areas
       ctx.strokeStyle = COLORS.primary;
       ctx.lineWidth = 2 / zoom;
       ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
       
       if (draftOverlay) {
          // If we have a draft (live preview of text/bg being added), draw it
          // Note: New selections generally don't have rotation yet.
          drawOverlay(ctx, { ...draftOverlay, rect: selection } as any, false);
       } else {
          ctx.fillStyle = COLORS.overlay;
          ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
       }
       
       // Handles for selection
       const handleSize = HANDLE_SIZE / zoom;
       const handles: Point[] = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width / 2, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height / 2 },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x + selection.width / 2, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height / 2 },
      ];

      ctx.fillStyle = COLORS.handle;
      handles.forEach(h => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      });
    }

    ctx.restore();
  }, [image, slide, slide.overlays, selection, zoom, offset, selectedOverlayId, draftOverlay, drawOverlay, isEraseMode, erasePaths, currentErasePath]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasCoords = (e: React.MouseEvent | any): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offset.x) / zoom,
      y: (e.clientY - rect.top - offset.y) / zoom
    };
  };

  const getScreenCoords = (e: React.MouseEvent | any): Point => ({ x: e.clientX, y: e.clientY });

  const normalizeRect = (rect: Rect): Rect => {
    let { x, y, width, height } = rect;
    if (width < 0) {
      x += width;
      width = Math.abs(width);
    }
    if (height < 0) {
      y += height;
      height = Math.abs(height);
    }
    return {
      x,
      y,
      width: Math.max(width, MIN_RECT_SIZE),
      height: Math.max(height, MIN_RECT_SIZE),
    };
  };

  // Rotate a point around a center
  const rotatePoint = (point: Point, center: Point, angle: number): Point => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + (dx * cos - dy * sin),
      y: center.y + (dx * sin + dy * cos)
    };
  };

  // Check point in rect accounting for rotation
  const isPointInRotatedRect = (p: Point, rect: Rect, rotation: number = 0): boolean => {
    if (!rotation) {
       return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    }
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    // Rotate point backwards to align with axis-aligned rect
    const unrotatedP = rotatePoint(p, center, -rotation);
    return unrotatedP.x >= rect.x && unrotatedP.x <= rect.x + rect.width && unrotatedP.y >= rect.y && unrotatedP.y <= rect.y + rect.height;
  };

  const getHandleAt = (p: Point, rect: Rect, rotation: number = 0): HandleType | null => {
    const tolerance = (HANDLE_SIZE * 1.5) / zoom;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    
    // Transform point to local unrotated space
    const localP = rotation ? rotatePoint(p, center, -rotation) : p;

    // Check Rotation Handle (Top)
    if (selectedOverlayId) {
        const rotHandlePos = { x: rect.x + rect.width / 2, y: rect.y - (30 / zoom) };
        if (Math.abs(localP.x - rotHandlePos.x) < tolerance && Math.abs(localP.y - rotHandlePos.y) < tolerance) {
            return 'rotate';
        }
    }

    const hx = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
    const hy = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
    const types: (HandleType | null)[][] = [
      ['nw', 'n', 'ne'],
      ['w', null, 'e'],
      ['sw', 's', 'se']
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const type = types[i][j];
        if (type && Math.abs(localP.x - hx[j]) < tolerance && Math.abs(localP.y - hy[i]) < tolerance) return type;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEraseMode) {
      if (e.button !== 0) return;
      const p = getCanvasCoords(e);
      setIsErasing(true);
      setCurrentErasePath({ mode: eraseTool, size: eraseBrushSize, points: [p] });
      setSelection(null);
      onSelectionChange(null);
      onOverlaySelect(null);
      return;
    }

    if (isSpacePressed || e.button === 1) {
      setIsPanning(true);
      setStartPoint(getScreenCoords(e));
      return;
    }

    const p = getCanvasCoords(e);
    
    // Check handles on current selection or selected overlay
    let targetRect = selection;
    let rotation = 0;
    
    if (selectedOverlayId) {
       const ov = slide.overlays.find(o => o.id === selectedOverlayId);
       if (ov) {
         targetRect = ov.rect;
         rotation = ov.rotation || 0;
       }
    }

    if (targetRect) {
      const handle = getHandleAt(p, targetRect, rotation);
      if (handle) {
        if (handle === 'rotate') {
            setIsRotating(true);
            setInitialRotation(rotation);
        } else {
            setIsResizingSelection(true);
            setDragType(handle);
        }
        setStartPoint(getScreenCoords(e)); // Use screen coords for drag delta calculations
        return;
      }
    }

    // Hit test for overlays (Top to bottom z-index)
    const clickedOverlay = [...slide.overlays].reverse().find(o => isPointInRotatedRect(p, o.rect, o.rotation));
    
    if (clickedOverlay) {
      onOverlaySelect(clickedOverlay.id);
      setIsDraggingOverlay(true);
      setStartPoint(p);
      setSelection(null);
      onSelectionChange(null);
      return;
    }

    onOverlaySelect(null);
    setIsDrawing(true);
    const newSelection = { x: p.x, y: p.y, width: 0, height: 0 };
    setSelection(newSelection);
    setStartPoint(p);
    onSelectionChange(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screenP = getScreenCoords(e);
    const canvasP = getCanvasCoords(e);
    
    // Cursor Logic
    if (canvasRef.current) {
      if (isEraseMode) canvasRef.current.style.cursor = 'crosshair';
      else if (isSpacePressed || isPanning) canvasRef.current.style.cursor = isPanning ? 'grabbing' : 'grab';
      else if (isRotating) canvasRef.current.style.cursor = 'alias';
      else if (isDraggingOverlay) canvasRef.current.style.cursor = 'grabbing';
      else if (isResizingSelection) canvasRef.current.style.cursor = 'nwse-resize';
      else {
          // Check hover
          const hoveredOverlay = [...slide.overlays].reverse().find(o => isPointInRotatedRect(canvasP, o.rect, o.rotation));
          if (hoveredOverlay) canvasRef.current.style.cursor = 'pointer';
          else canvasRef.current.style.cursor = 'default';
          
          // Check handle hover if something is selected
          let targetRect = selection;
          let rot = 0;
          if (selectedOverlayId) {
             const ov = slide.overlays.find(o => o.id === selectedOverlayId);
             if (ov) { targetRect = ov.rect; rot = ov.rotation || 0; }
          }
          if (targetRect && getHandleAt(canvasP, targetRect, rot)) canvasRef.current.style.cursor = 'crosshair';
      }
    }

    if (isEraseMode && isErasing) {
      setCurrentErasePath((prev) => {
        if (!prev) return prev;
        return { ...prev, points: [...prev.points, canvasP] };
      });
      return;
    }

    if (isPanning && startPoint) {
      const dx = screenP.x - startPoint.x;
      const dy = screenP.y - startPoint.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setStartPoint(screenP);
      return;
    }

    if (isRotating && selectedOverlayId && startPoint) {
       // Calculate Angle
       const ov = slide.overlays.find(o => o.id === selectedOverlayId);
       if (ov) {
           const center = { 
               x: (ov.rect.x + ov.rect.width / 2) * zoom + offset.x, // Screen space center
               y: (ov.rect.y + ov.rect.height / 2) * zoom + offset.y 
           };
           // Angle from center to mouse
           const angle = Math.atan2(screenP.y - center.y, screenP.x - center.x) * (180 / Math.PI);
           // Shift by 90 deg because handle is at top (-90)
           const finalAngle = angle + 90;
           
           const newOverlays = slide.overlays.map(o => o.id === selectedOverlayId ? { ...o, rotation: finalAngle } : o);
           onUpdateOverlays(newOverlays);
       }
       return;
    }

    if (isDrawing && startPoint) {
      const x = Math.min(canvasP.x, startPoint.x);
      const y = Math.min(canvasP.y, startPoint.y);
      const width = Math.abs(canvasP.x - startPoint.x);
      const height = Math.abs(canvasP.y - startPoint.y);
      setSelection({ x, y, width, height });
    } else if (isResizingSelection && startPoint && dragType) {
       // Delta in canvas units
       const rect = canvasRef.current?.getBoundingClientRect();
       if (!rect) return;
       const zoomFactor = zoom;
       
       const dx = (screenP.x - startPoint.x) / zoomFactor;
       const dy = (screenP.y - startPoint.y) / zoomFactor;

       if (selection) {
            let newRect = { ...selection };
            if (dragType.includes('e')) newRect.width += dx;
            if (dragType.includes('w')) { newRect.x += dx; newRect.width -= dx; }
            if (dragType.includes('s')) newRect.height += dy;
            if (dragType.includes('n')) { newRect.y += dy; newRect.height -= dy; }
            setSelection(normalizeRect(newRect));
       } else if (selectedOverlayId) {
            const ov = slide.overlays.find(o => o.id === selectedOverlayId);
            if (ov) {
                let newRect = { ...ov.rect };
                if (dragType.includes('e')) newRect.width += dx;
                if (dragType.includes('w')) { newRect.x += dx; newRect.width -= dx; }
                if (dragType.includes('s')) newRect.height += dy;
                if (dragType.includes('n')) { newRect.y += dy; newRect.height -= dy; }
                newRect = normalizeRect(newRect);
                
                const newOverlays = slide.overlays.map(o => o.id === selectedOverlayId ? { ...o, rect: newRect } : o);
                onUpdateOverlays(newOverlays);
            }
       }
       setStartPoint(screenP);
    } else if (isDraggingOverlay && selectedOverlayId && startPoint) {
      const dx = canvasP.x - startPoint.x;
      const dy = canvasP.y - startPoint.y;
      const newOverlays = slide.overlays.map(ov => ov.id === selectedOverlayId ? { ...ov, rect: { ...ov.rect, x: ov.rect.x + dx, y: ov.rect.y + dy } } : ov);
      onUpdateOverlays(newOverlays);
      setStartPoint(canvasP);
    }
  };

  const handleMouseUp = () => {
    if (isEraseMode) {
      if (isErasing && currentErasePath) {
        onErasePathCommit(currentErasePath);
      }
      setCurrentErasePath(null);
      setIsErasing(false);
      return;
    }

    if (isDrawing || isResizingSelection) {
      if (selection && (selection.width < MIN_RECT_SIZE || selection.height < MIN_RECT_SIZE)) {
        setSelection(null);
        onSelectionChange(null);
      } else {
        onSelectionChange(selection);
      }
    }
    setIsDrawing(false);
    setIsDraggingOverlay(false);
    setIsResizingSelection(false);
    setIsRotating(false);
    setIsPanning(false);
    setIsErasing(false);
    setCurrentErasePath(null);
    setStartPoint(null);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center select-none"
      style={{ backgroundColor: isDark ? '#0b1017' : '#eef2ff' }}
    >
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={(e) => e.preventDefault()} className="block w-full h-full" />
      {/* Updated Control Panel: Single line, wider */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-xs font-medium border shadow-2xl pointer-events-none flex items-center gap-4 backdrop-blur-sm whitespace-nowrap min-w-max"
        style={{
          backgroundColor: isDark ? 'rgba(26,31,42,0.9)' : 'rgba(255,255,255,0.92)',
          borderColor: isDark ? '#1f2430' : '#e5e7eb',
          color: isDark ? '#e5e7eb' : '#374151'
        }}
      >
        {isEraseMode ? (
          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: isDark ? '#11151d' : '#eef0ff', color: isDark ? '#a5b4fc' : '#4f46e5' }}
            >
              Erase Brush
            </span>
            <span>지울 영역을 칠해 주세요</span>
          </div>
        ) : (
          <>
        <div className="flex items-center gap-2">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ backgroundColor: isDark ? '#11151d' : '#eef0ff', color: isDark ? '#a5b4fc' : '#4f46e5' }}
          >
            Space + Drag
          </span>
          <span>이동</span>
        </div>
        <div className="w-px h-3" style={{ backgroundColor: isDark ? '#4b5563' : '#cbd5e1' }}></div>
        <div className="flex items-center gap-2">
           <span
             className="px-1.5 py-0.5 rounded text-[10px] font-bold"
             style={{ backgroundColor: isDark ? '#11151d' : '#eef0ff', color: isDark ? '#a5b4fc' : '#4f46e5' }}
           >
             Space + Wheel
           </span>
           <span>확대/축소</span>
        </div>
        <div className="w-px h-3" style={{ backgroundColor: isDark ? '#4b5563' : '#cbd5e1' }}></div>
        <div className="flex items-center gap-2">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ backgroundColor: isDark ? '#11151d' : '#eef0ff', color: isDark ? '#a5b4fc' : '#4f46e5' }}
          >
            Drag Selection
          </span>
          <span>영역 선택</span>
        </div>
        <div className="w-px h-3" style={{ backgroundColor: isDark ? '#4b5563' : '#cbd5e1' }}></div>
        <div className="flex items-center gap-2">
           <span className="font-mono" style={{ color: isDark ? '#9ca3af' : '#64748b' }}>{Math.round(zoom * 100)}%</span>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditorCanvas;
