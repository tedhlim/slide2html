'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Moveable, { OnDragStart, OnDrag, OnDragEnd, OnResizeStart, OnResize, OnResizeEnd } from 'react-moveable';
import { VisualDelta, DebugInfo } from '@/lib/types';

interface InteractionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onChange: (delta: VisualDelta) => void;
  isEditMode: boolean;
  targets: Array<HTMLElement | SVGElement>;
  onTargetsChange: (targets: Array<HTMLElement | SVGElement>) => void;
  onDebugInfo?: (info: DebugInfo) => void;
}

interface StyleValues {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  opacity: string;
  borderRadius: string;
  letterSpacing: string;
}

function rgbToHex(rgb: string): string {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
  if (rgb.startsWith('#')) return rgb;
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return '#000000';
  return '#' + result.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

export const InteractionOverlay: React.FC<InteractionOverlayProps> = ({ iframeRef, onChange, isEditMode, targets, onTargetsChange, onDebugInfo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [iframeWindow, setIframeWindow] = useState<Window | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editingElement, setEditingElement] = useState<HTMLElement | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<StyleValues | null>(null);

  const initialRects = useRef<Map<HTMLElement | SVGElement, DOMRect>>(new Map());
  const initialContent = useRef<string>("");
  const styleSnapshot = useRef<Partial<StyleValues>>({});
  const lastSelectorRef = useRef<string | null>(null);
  const zoomSourceRef = useRef<string>('not yet detected');

  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        setIframeWindow(iframe.contentWindow);
        const deck = iframe.contentWindow.document.getElementById('deck');
        if (deck) {
          const transform = iframe.contentWindow.getComputedStyle(deck).transform;
          if (transform && transform !== 'none') {
            const matrix = transform.match(/^matrix\((.+)\)$/);
            if (matrix) {
              const values = matrix[1].split(', ');
              const scale = Math.sqrt(parseFloat(values[0]) * parseFloat(values[0]) + parseFloat(values[1]) * parseFloat(values[1]));
              zoomSourceRef.current = `#deck matrix(${values[0]}, ${values[1]}, ...)`;
              setZoom(scale);
            } else {
              zoomSourceRef.current = `#deck transform="${transform}" (unrecognized format)`;
            }
          } else {
            zoomSourceRef.current = '#deck found but transform=none';
          }
        } else {
          zoomSourceRef.current = 'no #deck element — defaulting to 1';
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      if (iframe.contentDocument?.readyState === 'complete') handleIframeLoad();
      iframe.addEventListener('load', handleIframeLoad);
    }
    return () => iframe?.removeEventListener('load', handleIframeLoad);
  }, [iframeRef]);

  const generateSelector = useCallback((el: HTMLElement | SVGElement): string => {
    if (el.id) return `#${el.id}`;
    
    let path: string[] = [];
    let current: Element | null = el;
    
    while (current && current.tagName !== 'HTML' && current.tagName !== 'BODY') {
      if (current.id) {
        path.unshift(`#${current.id}`);
        break; // ID is unique
      }
      
      let selector = current.tagName.toLowerCase();
      let nth = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) nth++;
        sibling = sibling.previousElementSibling;
      }
      
      selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      
      current = current.parentElement;
    }

    return path.join(' > ');
  }, []);

  // Emit debug info whenever targets or zoom changes
  useEffect(() => {
    onDebugInfo?.({
      zoom,
      zoomSource: zoomSourceRef.current,
      targetCount: targets.length,
      lastSelector: lastSelectorRef.current,
      lastDeltaType: null,
    });
  }, [targets, zoom, onDebugInfo]);

  // Read computed styles whenever selection changes
  useEffect(() => {
    if (targets.length === 1 && iframeWindow) {
      const el = targets[0] as HTMLElement;
      const cs = iframeWindow.getComputedStyle(el);
      const styles: StyleValues = {
        color: rgbToHex(cs.color),
        backgroundColor: rgbToHex(cs.backgroundColor),
        fontSize: Math.round(parseFloat(cs.fontSize)).toString(),
        fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
        opacity: parseFloat(cs.opacity).toString(),
        borderRadius: Math.round(parseFloat(cs.borderRadius || '0')).toString(),
        letterSpacing: parseFloat(cs.letterSpacing || '0').toString(),
      };
      setSelectedStyles(styles);
      styleSnapshot.current = { ...styles };
    } else {
      setSelectedStyles(null);
    }
  }, [targets, iframeWindow]);

  const handleStyleChange = (
    property: keyof StyleValues,
    displayValue: string,
    cssValue: string,
  ) => {
    if (targets.length !== 1) return;
    const el = targets[0] as HTMLElement;
    const fromCss = styleSnapshot.current[property] ?? '';
    (el.style as any)[property] = cssValue;
    setSelectedStyles(prev => prev ? { ...prev, [property]: displayValue } : null);
    const selector = generateSelector(el);
    lastSelectorRef.current = selector;
    onChange({
      target_selector: selector,
      changes: { style: { [property]: { from: fromCss, to: cssValue } } },
    });
    onDebugInfo?.({ zoom, zoomSource: zoomSourceRef.current, targetCount: targets.length, lastSelector: selector, lastDeltaType: `style ${property}: ${fromCss} → ${cssValue}` });
    styleSnapshot.current[property] = displayValue;
  };

  useEffect(() => {
    if (!iframeWindow || !isEditMode || editingElement) return;

    const doc = iframeWindow.document;

    // Inject critical CSS to disable native animations and transitions.
    // If we do not disable this, Moveable's inline `transform` updates will be:
    // 1. Ignored entirely by elements with `animation-fill-mode: both`
    // 2. Delayed massively by elements with `transition: all 0.6s`
    const styleId = 'slide2html-edit-override';
    let styleEl = doc.getElementById(styleId);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        * {
          transition: none !important;
          animation: none !important;
        }
      `;
      doc.head.appendChild(styleEl);
    }

    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;

      // Let Moveable handle interactions on its own control handles
      if (
        el.closest('.moveable-control-box') ||
        (typeof el.className === 'string' && el.className.includes('moveable')) ||
        (el.closest && el.closest('[class*="moveable"]'))
      ) {
        return;
      }

      // If the user is mousedown-ing on an already-selected element, let the event
      // through so Moveable can initiate a drag. Do not block it.
      const isSelectedTarget = targets.some(t => t === el || (t as HTMLElement).contains(el));
      if (isSelectedTarget) {
        return;
      }

      // For everything else: stop the event here so the slide deck cannot
      // intercept it and advance the slide. We handle selection ourselves.
      e.stopPropagation();

      if (el && !['HTML', 'BODY', 'SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) {
        if (e.shiftKey) {
          onTargetsChange(targets.includes(el) ? targets.filter(t => t !== el) : [...targets, el]);
        } else {
          onTargetsChange([el]);
        }
      } else if (!e.shiftKey) {
        onTargetsChange([]);
      }
    };

    // Also block pointerdown in capture phase — some decks use pointer events for navigation
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest('.moveable-control-box') ||
        (typeof el.className === 'string' && el.className.includes('moveable')) ||
        (el.closest && el.closest('[class*="moveable"]'))
      ) return;
      const isSelectedTarget = targets.some(t => t === el || (t as HTMLElement).contains(el));
      if (!isSelectedTarget) e.stopPropagation();
    };

    const onDoubleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const el = e.target as HTMLElement;
      if (el && !['HTML', 'BODY', 'SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) {
        setEditingElement(el);
        onTargetsChange([]); // Hide moveable handles while editing text
        initialContent.current = el.innerText;
        
        // Make element editable and style it so it looks editable
        el.contentEditable = "true";
        el.style.outline = "2px solid #2563eb";
        el.style.backgroundColor = "rgba(37, 99, 235, 0.05)";
        el.style.borderRadius = "2px";
        el.style.cursor = "text";
        el.focus();
        
        // Stop event propagation inside the element to allow native text selection and keyboard usage
        const stopProp = (ev: Event) => ev.stopPropagation();
        el.addEventListener('keydown', stopProp);
        el.addEventListener('keyup', stopProp);
        el.addEventListener('keypress', stopProp);
        el.addEventListener('mousedown', stopProp);
        
        const onBlur = () => {
          el.contentEditable = "false";
          el.style.outline = "";
          el.style.backgroundColor = "";
          el.style.borderRadius = "";
          el.style.cursor = "";
          
          if (el.innerText !== initialContent.current) {
            onChange({
              target_selector: generateSelector(el),
              changes: {
                content: { from: initialContent.current, to: el.innerText }
              }
            });
          }
          
          setEditingElement(null);
          el.removeEventListener('blur', onBlur);
          el.removeEventListener('keydown', stopProp);
          el.removeEventListener('keyup', stopProp);
          el.removeEventListener('keypress', stopProp);
          el.removeEventListener('mousedown', stopProp);
        };
        el.addEventListener('blur', onBlur);
      }
    };

    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };

    // All three bound in capture phase so we intercept before the slide deck does
    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('dblclick', onDoubleClick, true);
    doc.addEventListener('click', onClick, true);

    return () => {
      if (styleEl) styleEl.remove();
      doc.removeEventListener('mousedown', onMouseDown, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('dblclick', onDoubleClick, true);
      doc.removeEventListener('click', onClick, true);
    };
  }, [iframeWindow, isEditMode, editingElement, onChange, targets]);

  // Delete key handler — fires on the parent window so it works regardless of iframe focus
  useEffect(() => {
    if (!isEditMode) return;

    const handleDelete = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Don't fire while typing in an input or contentEditable
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        editingElement
      ) return;
      if (targets.length === 0) return;

      e.preventDefault();
      targets.forEach(target => {
        const selector = generateSelector(target as HTMLElement);
        onChange({ target_selector: selector, deleted: true, changes: {} });
        onDebugInfo?.({ zoom, zoomSource: zoomSourceRef.current, targetCount: 0, lastSelector: selector, lastDeltaType: 'deleted' });
        (target as HTMLElement).remove();
      });
      onTargetsChange([]);
    };

    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [isEditMode, targets, editingElement, onChange, onDebugInfo, zoom, generateSelector]);

  const onDragStart = (e: OnDragStart) => {
    initialRects.current.set(e.target as HTMLElement | SVGElement, e.target.getBoundingClientRect());
  };

  const onDrag = (e: OnDrag) => { e.target.style.transform = e.transform; };

  const onDragEnd = (e: OnDragEnd) => {
    if (e.isDrag) {
      const target = e.target as HTMLElement | SVGElement;
      const initialRect = initialRects.current.get(target);
      if (initialRect) {
        const finalRect = target.getBoundingClientRect();
        const selector = generateSelector(target);
        lastSelectorRef.current = selector;
        const delta: VisualDelta = {
          target_selector: selector,
          changes: {
            geometry: {
              position: {
                dx: Math.round((finalRect.left - initialRect.left) / zoom),
                dy: Math.round((finalRect.top - initialRect.top) / zoom)
              }
            }
          }
        };
        onChange(delta);
        onDebugInfo?.({ zoom, zoomSource: zoomSourceRef.current, targetCount: targets.length, lastSelector: selector, lastDeltaType: `drag dx:${delta.changes.geometry!.position!.dx} dy:${delta.changes.geometry!.position!.dy}` });
        initialRects.current.delete(target);
      }
    }
  };

  const onResizeStart = (e: OnResizeStart) => {
    e.setOrigin(['%', '%']);
    initialRects.current.set(e.target as HTMLElement | SVGElement, e.target.getBoundingClientRect());
  };

  const onResize = (e: OnResize) => {
    e.target.style.width = `${e.width}px`;
    e.target.style.height = `${e.height}px`;
    e.target.style.transform = e.drag.transform;
  };

  const onResizeEnd = (e: OnResizeEnd) => {
    if (e.isDrag) {
      const target = e.target as HTMLElement | SVGElement;
      const initialRect = initialRects.current.get(target);
      if (initialRect) {
        const finalRect = target.getBoundingClientRect();
        const selector = generateSelector(target);
        lastSelectorRef.current = selector;
        const delta: VisualDelta = {
          target_selector: selector,
          changes: {
            geometry: {
              size: {
                dw: Math.round((finalRect.width - initialRect.width) / zoom),
                dh: Math.round((finalRect.height - initialRect.height) / zoom)
              },
              position: {
                dx: Math.round((finalRect.left - initialRect.left) / zoom),
                dy: Math.round((finalRect.top - initialRect.top) / zoom)
              }
            }
          }
        };
        onChange(delta);
        onDebugInfo?.({ zoom, zoomSource: zoomSourceRef.current, targetCount: targets.length, lastSelector: selector, lastDeltaType: `resize dw:${delta.changes.geometry!.size!.dw} dh:${delta.changes.geometry!.size!.dh}` });
        initialRects.current.delete(target);
      }
    }
  };

  if (!iframeWindow) return null;

  const FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];
  const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'];

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 pointer-events-none"
    >
      {/* Style Panel */}
      {isEditMode && selectedStyles && !editingElement && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2 flex items-center gap-3 pointer-events-auto flex-wrap"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Text Color */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Text</span>
            <input
              type="color"
              value={selectedStyles.color}
              onChange={e => handleStyleChange('color', e.target.value, e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-gray-200"
            />
          </label>

          <div className="w-px h-8 bg-gray-200" />

          {/* Background Color */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">BG</span>
            <input
              type="color"
              value={selectedStyles.backgroundColor}
              onChange={e => handleStyleChange('backgroundColor', e.target.value, e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-gray-200"
            />
          </label>

          <div className="w-px h-8 bg-gray-200" />

          {/* Font Size */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Size</span>
            <input
              type="number"
              value={selectedStyles.fontSize}
              min={6}
              max={200}
              onChange={e => setSelectedStyles(prev => prev ? { ...prev, fontSize: e.target.value } : null)}
              onBlur={e => handleStyleChange('fontSize', e.target.value, `${e.target.value}px`)}
              className="w-12 text-center text-[11px] font-bold border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>

          {/* Font Weight */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Weight</span>
            <select
              value={selectedStyles.fontWeight}
              onChange={e => handleStyleChange('fontWeight', e.target.value, e.target.value)}
              className="text-[11px] font-bold border border-gray-200 rounded-md py-1 px-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {FONT_WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>

          {/* Font Family */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Font</span>
            <select
              value={selectedStyles.fontFamily}
              onChange={e => handleStyleChange('fontFamily', e.target.value, e.target.value)}
              className="text-[11px] font-bold border border-gray-200 rounded-md py-1 px-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white max-w-[100px]"
            >
              {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>

          <div className="w-px h-8 bg-gray-200" />

          {/* Opacity */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selectedStyles.opacity}
              onChange={e => handleStyleChange('opacity', e.target.value, e.target.value)}
              className="w-16 accent-blue-600"
            />
          </label>

          {/* Border Radius */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Radius</span>
            <input
              type="number"
              value={selectedStyles.borderRadius}
              min={0}
              max={999}
              onChange={e => setSelectedStyles(prev => prev ? { ...prev, borderRadius: e.target.value } : null)}
              onBlur={e => handleStyleChange('borderRadius', e.target.value, `${e.target.value}px`)}
              className="w-12 text-center text-[11px] font-bold border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>

          {/* Letter Spacing */}
          <label className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Tracking</span>
            <input
              type="number"
              value={selectedStyles.letterSpacing}
              step={0.5}
              onChange={e => setSelectedStyles(prev => prev ? { ...prev, letterSpacing: e.target.value } : null)}
              onBlur={e => handleStyleChange('letterSpacing', e.target.value, `${e.target.value}px`)}
              className="w-12 text-center text-[11px] font-bold border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>
        </div>
      )}

      {isEditMode && !editingElement && iframeWindow && createPortal(
        <Moveable
          ref={moveableRef}
          target={targets}
          container={iframeWindow.document.body}
          draggable={true}
          resizable={true}
          zoom={1 / zoom}
          onDragStart={onDragStart}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
          className="pointer-events-auto"
        />,
        iframeWindow.document.body
      )}
    </div>
  );
};
