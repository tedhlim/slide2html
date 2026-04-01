'use client';

import React, { useEffect, useState, useRef } from 'react';
import Moveable, { OnDragStart, OnDrag, OnDragEnd, OnResizeStart, OnResize, OnResizeEnd } from 'react-moveable';
import { VisualDelta } from '@/lib/types';

interface InteractionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onChange: (delta: VisualDelta) => void;
  isEditMode: boolean;
}

export const InteractionOverlay: React.FC<InteractionOverlayProps> = ({ iframeRef, onChange, isEditMode }) => {
  const [targets, setTargets] = useState<Array<HTMLElement | SVGElement>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [iframeWindow, setIframeWindow] = useState<Window | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editingElement, setEditingElement] = useState<HTMLElement | null>(null);
  
  const initialRects = useRef<Map<HTMLElement | SVGElement, DOMRect>>(new Map());
  const initialContent = useRef<string>("");

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
    let selector = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c.trim() !== '' && !c.includes('moveable')).join('.');
      if (classes) selector += `.${classes}`;
    }
    return selector;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditMode || !iframeWindow || !containerRef.current || editingElement) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const el = iframeWindow.document.elementFromPoint(x, y);
    
    if (el && !['HTML', 'BODY', 'SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)) {
      if (!e.shiftKey) {
        setTargets([el as HTMLElement]);
      } else {
        setTargets(prev => [...prev.filter(t => t !== el), el as HTMLElement]);
      }
    } else if (!e.shiftKey) {
      setTargets([]);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isEditMode || !iframeWindow || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const el = iframeWindow.document.elementFromPoint(x, y) as HTMLElement;

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

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 z-10 ${isEditMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {isEditMode && !editingElement && (
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
        />
      )}
    </div>
  );
};
