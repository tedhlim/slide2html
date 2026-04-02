'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Moveable, { OnDragStart, OnDrag, OnDragEnd, OnResizeStart, OnResize, OnResizeEnd } from 'react-moveable';
import { VisualDelta } from '@/lib/types';

interface InteractionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onChange: (delta: VisualDelta) => void;
  isEditMode: boolean;
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

export const InteractionOverlay: React.FC<InteractionOverlayProps> = ({ iframeRef, onChange, isEditMode }) => {
  const [targets, setTargets] = useState<Array<HTMLElement | SVGElement>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [iframeWindow, setIframeWindow] = useState<Window | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editingElement, setEditingElement] = useState<HTMLElement | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<StyleValues | null>(null);

  const initialRects = useRef<Map<HTMLElement | SVGElement, DOMRect>>(new Map());
  const initialContent = useRef<string>("");
  const styleSnapshot = useRef<Partial<StyleValues>>({});

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
              setZoom(scale);
            }
          }
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

  const generateSelector = (el: HTMLElement | SVGElement): string => {
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
  };

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
    onChange({
      target_selector: generateSelector(el),
      changes: { style: { [property]: { from: fromCss, to: cssValue } } },
    });
    styleSnapshot.current[property] = displayValue;
  };

  useEffect(() => {
    if (!iframeWindow || !isEditMode || editingElement) return;

    const doc = iframeWindow.document;

    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // Ignore clicks on Moveable handles so we don't abort a drag by changing selection
      if (
        el.closest('.moveable-control-box') || 
        (typeof el.className === 'string' && el.className.includes('moveable')) ||
        (el.closest && el.closest('[class*="moveable"]'))
      ) {
        return;
      }

      if (el && !['HTML', 'BODY', 'SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) {
        setTargets(prev => {
          if (prev.includes(el) && !e.shiftKey) return prev;
          if (!e.shiftKey) return [el];
          return [...prev.filter(t => t !== el), el];
        });
      } else if (!e.shiftKey) {
        setTargets([]);
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const el = e.target as HTMLElement;
      if (el && !['HTML', 'BODY', 'SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) {
        setEditingElement(el);
        setTargets([]); // Hide moveable handles while editing text
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

    doc.addEventListener('mousedown', onMouseDown);
    // Bind in capture phase to stop underlying deck scripts from advancing slides on double-click
    doc.addEventListener('dblclick', onDoubleClick, true);
    // Add click listener in capture phase to stop underlying deck scripts from advancing slides
    doc.addEventListener('click', onClick, true);

    return () => {
      doc.removeEventListener('mousedown', onMouseDown);
      doc.removeEventListener('dblclick', onDoubleClick, true);
      doc.removeEventListener('click', onClick, true);
    };
  }, [iframeWindow, isEditMode, editingElement, onChange]);

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
        onChange({
          target_selector: generateSelector(target),
          changes: {
            geometry: {
              position: {
                from: { x: initialRect.left / zoom, y: initialRect.top / zoom },
                to: { x: finalRect.left / zoom, y: finalRect.top / zoom }
              }
            }
          }
        });
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
        onChange({
          target_selector: generateSelector(target),
          changes: {
            geometry: {
              size: { from: { w: initialRect.width / zoom, h: initialRect.height / zoom }, to: { w: finalRect.width / zoom, h: finalRect.height / zoom } },
              position: { from: { x: initialRect.left / zoom, y: initialRect.top / zoom }, to: { x: finalRect.left / zoom, y: finalRect.top / zoom } }
            }
          }
        });
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
