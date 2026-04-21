'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  onActionStart?: () => void;
  scrollClearDisabledRef?: React.RefObject<boolean>;
}

interface StyleValues {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  fontStyle: string;
  textDecorationLine: string;
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

export const InteractionOverlay: React.FC<InteractionOverlayProps> = ({ iframeRef, onChange, isEditMode, targets, onTargetsChange, onDebugInfo, onActionStart, scrollClearDisabledRef }) => {
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
    
    const path: string[] = [];
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

  // Clear selection when the iframe scrolls (slide navigation)
  useEffect(() => {
    if (!iframeWindow) return;
    const doc = iframeWindow.document;

    const clearOnScroll = () => {
      if (scrollClearDisabledRef?.current) return;
      if (targets.length > 0) onTargetsChange([]);
    };

    const slideContainer = doc.querySelector('.slide-container');
    const scrollEl = doc.scrollingElement || doc.documentElement;

    slideContainer?.addEventListener('scroll', clearOnScroll);
    scrollEl.addEventListener('scroll', clearOnScroll);

    return () => {
      slideContainer?.removeEventListener('scroll', clearOnScroll);
      scrollEl.removeEventListener('scroll', clearOnScroll);
    };
  }, [iframeWindow, targets, onTargetsChange]);

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
        fontStyle: cs.fontStyle,
        textDecorationLine: cs.textDecorationLine || cs.textDecoration.split(' ')[0] || 'none',
        opacity: isNaN(parseFloat(cs.opacity)) ? '1' : parseFloat(cs.opacity).toString(),
        borderRadius: isNaN(parseFloat(cs.borderRadius)) ? '0' : Math.round(parseFloat(cs.borderRadius)).toString(),
        letterSpacing: isNaN(parseFloat(cs.letterSpacing)) ? '0' : parseFloat(cs.letterSpacing).toString(),
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
          user-select: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .slide-container {
          position: relative !important;
        }
        .slide, .reveal, .slide.active, .slide.visible .reveal {
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          pointer-events: auto !important;
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
        onActionStart?.();
        const selection = iframeWindow?.getSelection();
        const savedRange =
          selection && selection.rangeCount > 0
            ? selection.getRangeAt(0)
            : null;

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

        if (savedRange && iframeWindow) {
          const sel = iframeWindow.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(savedRange);
        }
        
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
      onActionStart?.();
      targets.forEach(target => {
        const selector = generateSelector(target as HTMLElement);
        onChange({ target_selector: selector, deleted: true, changes: {} });
        onDebugInfo?.({ zoom, zoomSource: zoomSourceRef.current, targetCount: 0, lastSelector: selector, lastDeltaType: 'deleted' });
        (target as HTMLElement).remove();
      });
      onTargetsChange([]);
    };

    const handleFormatShortcuts = (e: KeyboardEvent) => {
      if (!isEditMode || targets.length !== 1 || !styleSnapshot.current) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || editingElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          const currentWeight = styleSnapshot.current.fontWeight || '400';
          const isBold = currentWeight >= '600' || currentWeight === 'bold';
          handleStyleChange('fontWeight', isBold ? '400' : '700', isBold ? '400' : '700');
        } else if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          const currentStyle = styleSnapshot.current.fontStyle || 'normal';
          const isItalic = currentStyle === 'italic';
          handleStyleChange('fontStyle', isItalic ? 'normal' : 'italic', isItalic ? 'normal' : 'italic');
        } else if (e.key.toLowerCase() === 'u') {
          e.preventDefault();
          const currentDeco = styleSnapshot.current.textDecorationLine || '';
          const isUnderline = currentDeco.includes('underline');
          let newDeco = currentDeco.replace('underline', '').replace('none', '').trim();
          if (!isUnderline) newDeco += ' underline';
          newDeco = newDeco.trim() || 'none';
          handleStyleChange('textDecorationLine', newDeco, newDeco);
        }
      }
    };

    window.addEventListener('keydown', handleDelete);
    window.addEventListener('keydown', handleFormatShortcuts);
    return () => {
      window.removeEventListener('keydown', handleDelete);
      window.removeEventListener('keydown', handleFormatShortcuts);
    };
  }, [isEditMode, targets, editingElement, onChange, onDebugInfo, zoom, generateSelector]);

  const onDragStart = (e: OnDragStart) => {
    onActionStart?.();
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
    onActionStart?.();
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

  // Find the portal root for the styles panel
  const [stylePortalRoot, setStylePortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStylePortalRoot(document.getElementById('style-panel-portal'));
  }, []);

  // Resolve the Moveable container — prefer .slide-container (scroll context) over body
  const moveablePortal = useMemo(() => {
    if (!iframeWindow) return null;
    return (iframeWindow.document.querySelector('.slide-container') as HTMLElement) || iframeWindow.document.body;
  }, [iframeWindow]);

  if (!iframeWindow) return null;

  const FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];
  const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'];

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 pointer-events-none"
    >
      {/* Style Panel Portal */}
      {isEditMode && selectedStyles && !editingElement && stylePortalRoot && createPortal(
        <div
          className="flex flex-col gap-6 p-5 pointer-events-auto w-full h-full content-start overflow-y-auto font-sans"
          onMouseDown={e => e.stopPropagation()}
        >
          <style dangerouslySetInnerHTML={{__html: `
            input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
            input[type="range"] { -webkit-appearance: none; background: transparent; }
            input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: #ffffff; border: 2.5px solid #2563eb; cursor: pointer; margin-top: -5px; box-shadow: 0 1px 2px rgba(0,0,0,0.15); transition: transform 0.1s; }
            input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); }
            input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #e5e7eb; border-radius: 2px; }
            .color-well::-webkit-color-swatch-wrapper { padding: 0; }
            .color-well::-webkit-color-swatch { border: none; border-radius: 4px; }
          `}} />

          {/* Colors Section */}
          <div className="flex gap-3">
            {/* Text Color */}
            <label className="flex-1 flex flex-col gap-1.5" onPointerDown={() => onActionStart?.()}>
              <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10M9 17h6M12 3L7 17h10L12 3z"/></svg>
                Fill
              </span>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5 shadow-sm hover:border-blue-400 transition-colors cursor-pointer group focus-within:ring-2 focus-within:ring-blue-500/20">
                <input
                  type="color"
                  value={selectedStyles.color}
                  onChange={e => handleStyleChange('color', e.target.value, e.target.value)}
                  className="color-well w-5 h-5 cursor-pointer bg-transparent"
                />
                <span className="text-[11px] font-mono text-gray-700 tracking-wide uppercase">{selectedStyles.color}</span>
              </div>
            </label>

            {/* Background Color */}
            <label className="flex-1 flex flex-col gap-1.5" onPointerDown={() => onActionStart?.()}>
               <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5">
                 <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
                 Background
               </span>
               <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5 shadow-sm hover:border-blue-400 transition-colors cursor-pointer group focus-within:ring-2 focus-within:ring-blue-500/20">
                  <input
                    type="color"
                    value={selectedStyles.backgroundColor}
                    onChange={e => handleStyleChange('backgroundColor', e.target.value, e.target.value)}
                    className="color-well w-5 h-5 cursor-pointer bg-transparent"
                  />
                  <span className="text-[11px] font-mono text-gray-700 tracking-wide uppercase">{selectedStyles.backgroundColor}</span>
               </div>
            </label>
          </div>

          <div className="h-px bg-gray-100 w-full" />

          {/* Typography Section */}
          <div className="grid grid-cols-2 gap-4">
            <span className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-[-4px]">Typography</span>
            
            {/* Font Family */}
            <label className="col-span-2 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors pr-2">
              <div className="pl-3 pr-2 py-2 flex items-center text-gray-400 border-r border-gray-100">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
              </div>
              <select
                value={selectedStyles.fontFamily}
                onFocus={() => onActionStart?.()}
                onChange={e => handleStyleChange('fontFamily', e.target.value, e.target.value)}
                className="w-full text-xs font-semibold py-2 px-3 focus:outline-none bg-transparent appearance-none text-gray-700 cursor-pointer"
              >
                {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <svg className="w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
            </label>

            {/* Format Toggles */}
            <div className="col-span-2 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-1 shadow-sm">
               <button
                 onPointerDown={() => onActionStart?.()}
                 onClick={() => {
                   const isBold = selectedStyles.fontWeight >= '600' || selectedStyles.fontWeight === 'bold';
                   handleStyleChange('fontWeight', isBold ? '400' : '700', isBold ? '400' : '700');
                 }}
                 className={`flex-1 py-1.5 flex justify-center items-center rounded text-[13px] font-serif transition-colors ${selectedStyles.fontWeight >= '600' || selectedStyles.fontWeight === 'bold' ? 'bg-blue-100 text-blue-700 fill-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
               >
                 <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" className="fill-current"><path d="M2.5 10.5V1.5H6.084C6.961 1.5 7.643 1.705 8.129 2.115C8.615 2.518 8.858 3.064 8.858 3.754C8.858 4.606 8.358 5.253 7.359 5.696V5.753C8.636 6.074 9.274 6.837 9.274 8.043C9.274 8.825 9 9.431 8.455 9.862C7.917 10.287 7.07 10.5 5.912 10.5H2.5ZM4.398 5.228H5.733C6.313 5.228 6.746 5.106 7.031 4.862C7.323 4.611 7.469 4.253 7.469 3.788C7.469 3.293 7.323 2.924 7.031 2.68C6.739 2.43 6.305 2.305 5.733 2.305H4.398V5.228ZM4.398 9.695H6.078C6.716 9.695 7.199 9.553 7.529 9.271C7.865 8.981 8.034 8.563 8.034 8.016C8.034 7.514 7.867 7.12 7.534 6.834C7.208 6.541 6.721 6.395 6.072 6.395H4.398V9.695Z" /></svg>
               </button>
               <button
                 onPointerDown={() => onActionStart?.()}
                 onClick={() => {
                   const isItalic = selectedStyles.fontStyle === 'italic';
                   handleStyleChange('fontStyle', isItalic ? 'normal' : 'italic', isItalic ? 'normal' : 'italic');
                 }}
                 className={`flex-1 py-1.5 flex justify-center items-center rounded text-[13px] font-serif transition-colors ${selectedStyles.fontStyle === 'italic' ? 'bg-blue-100 text-blue-700 fill-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
               >
                 <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" className="fill-current"><path d="M4.536 10.5H2.404L4.856 1.5H6.988L4.536 10.5Z" /></svg>
               </button>
               <button
                 onPointerDown={() => onActionStart?.()}
                 onClick={() => {
                   const isUnderline = (selectedStyles.textDecorationLine || '').includes('underline');
                   let newDeco = (selectedStyles.textDecorationLine || '').replace('underline', '').replace('none', '').trim();
                   if (!isUnderline) newDeco += ' underline';
                   newDeco = newDeco.trim() || 'none';
                   handleStyleChange('textDecorationLine', newDeco, newDeco);
                 }}
                 className={`flex-1 py-1.5 flex justify-center items-center rounded text-[13px] font-serif transition-colors ${(selectedStyles.textDecorationLine || '').includes('underline') ? 'bg-blue-100 text-blue-700 fill-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
               >
                 <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" className="fill-current"><path d="M5.426 8.5C3.332 8.5 2.285 7.07 2.285 4.21V1.5H3.693V4.254C3.693 6.302 4.316 7.326 5.56 7.326C6.776 7.326 7.385 6.275 7.385 4.172V1.5H8.799V4.21C8.799 7.07 7.72 8.5 5.426 8.5ZM1.5 10.5H9.5V9.33H1.5V10.5Z" /></svg>
               </button>
               <button
                 onPointerDown={() => onActionStart?.()}
                 onClick={() => {
                   const isStrike = (selectedStyles.textDecorationLine || '').includes('line-through');
                   let newDeco = (selectedStyles.textDecorationLine || '').replace('line-through', '').replace('none', '').trim();
                   if (!isStrike) newDeco += ' line-through';
                   newDeco = newDeco.trim() || 'none';
                   handleStyleChange('textDecorationLine', newDeco, newDeco);
                 }}
                 className={`flex-1 py-1.5 flex justify-center items-center rounded text-[13px] transition-colors ${(selectedStyles.textDecorationLine || '').includes('line-through') ? 'bg-blue-100 text-blue-700 fill-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
               >
                 <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" className="fill-current"><path d="M10 5.5H1V6.5H10V5.5ZM7.689 3.018C7.549 2.502 6.953 2.1 5.766 2.1C4.426 2.1 3.596 2.652 3.551 3.693H2.039C2.084 1.954 3.518 0.81 5.766 0.81C7.886 0.81 9.07 1.83 9.07 3.253H7.689V3.018ZM3.385 8.798C3.595 9.42 4.364 9.932 5.592 9.932C7.039 9.932 8.006 9.384 8.006 8.217H9.539C9.539 10.158 8.04 11.236 5.592 11.236C3.21 11.236 1.986 10.144 1.986 8.563H3.385V8.798Z" /></svg>
               </button>
            </div>

            {/* Font Size */}
            <label className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
              <div className="pl-3 pr-2 py-1.5 flex items-center border-r border-gray-100">
                <span className="text-[10px] font-black text-gray-400">Size</span>
              </div>
              <input
                type="number"
                value={selectedStyles.fontSize}
                onFocus={() => onActionStart?.()}
                onChange={e => setSelectedStyles(prev => prev ? { ...prev, fontSize: e.target.value } : null)}
                onBlur={e => handleStyleChange('fontSize', e.target.value, `${e.target.value}px`)}
                className="w-full text-[11px] font-semibold py-1.5 px-2 focus:outline-none bg-transparent text-gray-700"
              />
            </label>
          </div>

          <div className="h-px bg-gray-100 w-full" />

          {/* Details Section */}
          <div className="grid grid-cols-2 gap-4">
            <span className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-[-4px]">Details</span>
            
            {/* Radius */}
            <label className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
               <div className="pl-2.5 flex items-center text-gray-400">
                 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
               </div>
               <input
                 type="number"
                 value={selectedStyles.borderRadius}
                 onFocus={() => onActionStart?.()}
                 onChange={e => setSelectedStyles(prev => prev ? { ...prev, borderRadius: e.target.value } : null)}
                 onBlur={e => handleStyleChange('borderRadius', e.target.value, `${e.target.value}px`)}
                 className="w-full text-[11px] font-semibold py-1.5 px-2 focus:outline-none bg-transparent text-gray-700"
               />
            </label>

            {/* Tracking */}
            <label className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
               <div className="pl-2.5 flex items-center text-gray-400">
                 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
               </div>
               <input
                 type="number"
                 value={selectedStyles.letterSpacing}
                 step={0.5}
                 onFocus={() => onActionStart?.()}
                 onChange={e => setSelectedStyles(prev => prev ? { ...prev, letterSpacing: e.target.value } : null)}
                 onBlur={e => handleStyleChange('letterSpacing', e.target.value, `${e.target.value}px`)}
                 className="w-full text-[11px] font-semibold py-1.5 px-2 focus:outline-none bg-transparent text-gray-700"
               />
            </label>
            
            {/* Opacity */}
            <label className="col-span-2 flex items-center gap-3 mt-1">
              <div className="flex flex-col flex-1 gap-1.5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Opacity
                  </span>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{Math.round(parseFloat(selectedStyles.opacity) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  onPointerDown={() => onActionStart?.()}
                  value={selectedStyles.opacity}
                  onChange={e => handleStyleChange('opacity', e.target.value, e.target.value)}
                  className="w-full px-1"
                />
              </div>
            </label>

          </div>
        </div>,
        stylePortalRoot
      )}

      {isEditMode && !editingElement && moveablePortal && createPortal(
        <Moveable
          ref={moveableRef}
          target={targets.length === 1 ? targets[0] : targets}
          container={moveablePortal}
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
        moveablePortal
      )}
    </div>
  );
};
