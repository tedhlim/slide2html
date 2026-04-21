/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IframeRenderer } from '@/components/IframeRenderer';
import { InteractionOverlay } from '@/components/InteractionOverlay';
import { LayerPanel } from '@/components/LayerPanel';
import { VisualDelta, DebugInfo } from '@/lib/types';

export default function Home() {
  const [html, setHtml] = useState<string>('');
  const [deltas, setDeltas] = useState<VisualDelta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRefactoring, setIsRefactoring] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [isKeyboardActive, setIsKeyboardActive] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [targets, setTargets] = useState<Array<HTMLElement | SVGElement>>([]);
  const [htmlKey, setHtmlKey] = useState<number>(0);
  const [history, setHistory] = useState<{ bodyHtml: string; deltas: VisualDelta[] }[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollClearDisabledRef = useRef<boolean>(false);

  const handleExport = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    
    let fullHtml = iframe.contentWindow.document.documentElement.outerHTML;
    // Strip the internal editing override styles so the exported file plays its native animations naturally
    fullHtml = fullHtml.replace(/<style id="slide2html-edit-override">[\s\S]*?<\/style>/i, '');
    const finalHtml = `<!DOCTYPE html>\n${fullHtml}`;
    
    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slide.html';
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        setHtml(content);
        setDeltas([]);
        setTargets([]);
        setHtmlKey(k => k + 1);
        setHistory([]);
        try {
          setIsSaving(true);
          const res = await fetch('/api/storage/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: content }),
          });
          if (!res.ok) throw new Error('Failed to save uploaded document');
        } catch (err: any) {
          console.error(err);
          setError(err.message || 'An error occurred while saving the uploaded document.');
        } finally {
          setIsSaving(false);
        }
      }
    };
    reader.readAsText(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/storage/read');
        if (!res.ok) throw new Error('Failed to fetch document');
        const data = await res.json();
        setHtml(data.html || '');
        setHistory([]);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An error occurred while loading the document.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocument();
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setDeltas(last.deltas);

    // Remember selectors of currently selected targets before DOM replacement
    const selectors = targets.map(el => {
      if (el.id) return `#${el.id}`;
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current.tagName !== 'HTML' && current.tagName !== 'BODY') {
        if (current.id) { path.unshift(`#${current.id}`); break; }
        let selector = current.tagName.toLowerCase();
        let nth = 1;
        let sibling = current.previousElementSibling;
        while (sibling) { if (sibling.tagName === current.tagName) nth++; sibling = sibling.previousElementSibling; }
        selector += `:nth-of-type(${nth})`;
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.join(' > ');
    });

    const iframe = iframeRef.current;
    if (iframe?.contentWindow?.document) {
      // Suppress scroll-clear during innerHTML replacement (it triggers scroll events)
      scrollClearDisabledRef.current = true;
      iframe.contentWindow.document.body.innerHTML = last.bodyHtml;

      // Re-select elements by their selectors in the new DOM after all
      // synchronous side-effects (scroll events, layout reflow) have settled
      const iDoc = iframe.contentWindow.document;
      const iframeWin = iframe.contentWindow as any;
      const iframeHTMLElement = iframeWin.HTMLElement;
      const iframeSVGElement = iframeWin.SVGElement;
      const restored = selectors
        .map(sel => { try { return iDoc.querySelector(sel); } catch { return null; } })
        .filter((el): el is HTMLElement | SVGElement => el instanceof iframeHTMLElement || el instanceof iframeSVGElement);
      requestAnimationFrame(() => {
        setTargets(restored.length > 0 ? restored : []);
        setTimeout(() => { scrollClearDisabledRef.current = false; }, 200);
      });
    } else {
      setTargets([]);
    }
  }, [history, targets]);

  // Keyboard Passthrough & Undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Handle Undo (Ctrl+Z / Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      const navKeys = ['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'g', 'G'];
      if (navKeys.includes(e.key)) {
        setTargets([]);
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
          iframe.contentWindow.document.dispatchEvent(new KeyboardEvent('keydown', {
            key: e.key,
            code: e.code,
            bubbles: true,
            cancelable: true
          }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  const pushHistoryState = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow?.document.body) {
      const currentHtml = iframe.contentWindow.document.body.innerHTML;
      setHistory(prev => {
        if (prev.length > 0 && prev[prev.length - 1].bodyHtml === currentHtml) {
          return prev;
        }
        return [...prev, { bodyHtml: currentHtml, deltas: [...deltas] }];
      });
    }
  }, [deltas]);

  const handleDeltaChange = useCallback((delta: VisualDelta) => {
    setDeltas((prev) => {
      const existing = prev.find(d => d.target_selector === delta.target_selector);
      if (!existing) return [...prev, delta];

      // Merge into existing delta for the same element
      const merged = { ...existing, changes: { ...existing.changes } };

      if (delta.changes.geometry?.position && merged.changes.geometry?.position) {
        const prev = merged.changes.geometry.position!;
        const next = delta.changes.geometry.position!;
        merged.changes.geometry = {
          ...merged.changes.geometry,
          position: { dx: prev.dx + next.dx, dy: prev.dy + next.dy },
        };
      } else if (delta.changes.geometry?.position) {
        merged.changes.geometry = { ...merged.changes.geometry, position: delta.changes.geometry.position };
      }

      if (delta.changes.geometry?.size && merged.changes.geometry?.size) {
        const prev = merged.changes.geometry.size!;
        const next = delta.changes.geometry.size!;
        merged.changes.geometry = {
          ...merged.changes.geometry,
          size: { dw: prev.dw + next.dw, dh: prev.dh + next.dh },
        };
      } else if (delta.changes.geometry?.size) {
        merged.changes.geometry = { ...merged.changes.geometry, size: delta.changes.geometry.size };
      }

      if (delta.changes.style) {
        merged.changes.style = { ...(merged.changes.style ?? {}), ...delta.changes.style };
      }

      if (delta.changes.content) {
        merged.changes.content = delta.changes.content;
      }

      return prev.map(d => d.target_selector === delta.target_selector ? merged : d);
    });
  }, []);

  const navigateSlide = (direction: 'next' | 'prev') => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
      setTargets([]);
      const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
      iframe.contentWindow.document.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true
      }));
      // Also scroll .slide-container directly for CSS scroll-snap decks
      const container = iframe.contentWindow.document.querySelector('.slide-container');
      if (container) {
        const scrollAmount = direction === 'next' ? container.clientWidth : -container.clientWidth;
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const res = await fetch('/api/storage/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      if (!res.ok) throw new Error('Failed to save document');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefactor = async () => {
    if (deltas.length === 0) return;
    try {
      setIsRefactoring(true);
      setError(null);
      const res = await fetch('/api/refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalHtml: html, deltas }),
      });

      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || data.details || 'Failed to refactor document');
      }

      setHtml(data.refactoredHtml);
      setDeltas([]);
      setTargets([]);
      setHtmlKey(k => k + 1);
      setHistory([]);
      await fetch('/api/storage/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: data.refactoredHtml }),
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during refactoring.');
    } finally {
      setIsRefactoring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Initializing Slide.html</p>
      </div>
    );
  }

  const hasUnsavedChanges = deltas.length > 0;

  return (
    <div className="flex flex-col h-screen bg-[#f1f3f5] font-sans selection:bg-blue-100">
      <header className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
               <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current"><path d="M12.89 3L14.85 3.4L11.11 21L9.15 20.6L12.89 3M19.59 12L16 8.41V5.58L22.42 12L16 18.41V15.58L19.59 12M1.58 12L8 5.58V8.41L4.41 12L8 15.58V18.41L1.58 12Z" /></svg>
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black text-gray-900 leading-none tracking-tight">SLIDE.HTML</h1>
              <span className="text-[9px] uppercase tracking-tighter text-blue-500 font-black">AI Round-Trip v1.0</span>
            </div>
          </div>
          
          <div className="h-6 w-[1px] bg-gray-200"></div>

          {/* Navigation Controls */}
          <div className="flex items-center space-x-1">
            <button onClick={() => navigateSlide('prev')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-all text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </button>
            <div className="px-3 py-1 bg-gray-100 rounded-md">
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Navigate</span>
            </div>
            <button onClick={() => navigateSlide('next')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-all text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end mr-4">
             <div className="flex items-center space-x-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isKeyboardActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Keyboard Active</span>
             </div>
             <span className={`text-[11px] font-black ${hasUnsavedChanges ? 'text-amber-500' : 'text-gray-300'}`}>
              {hasUnsavedChanges ? `${deltas.length} DELTAS READY` : 'NO CHANGES'}
            </span>
          </div>

          <div className="flex items-center bg-gray-100 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setIsEditMode(true)}
              className={`px-5 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${
                isEditMode ? 'bg-white shadow-md text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              EDIT
            </button>
            <button
              onClick={() => setIsEditMode(false)}
              className={`px-5 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${
                !isEditMode ? 'bg-white shadow-md text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              PLAY
            </button>
          </div>
          
          <input 
            type="file" 
            accept=".html" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-white border border-gray-200 hover:border-blue-200 hover:text-blue-600 text-gray-600 rounded-xl text-[10px] font-black tracking-widest transition-all"
          >
            UPLOAD
          </button>
          
          <button
            onClick={handleExport}
            className="px-6 py-2 bg-white border border-gray-200 hover:border-green-200 hover:text-green-600 text-gray-600 rounded-xl text-[10px] font-black tracking-widest transition-all"
          >
            EXPORT
          </button>
          
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:border-gray-400 text-gray-600 hover:text-black rounded-xl text-[10px] font-black tracking-widest transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            UNDO
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-white border border-gray-200 hover:border-blue-200 hover:text-blue-600 text-gray-600 rounded-xl text-[10px] font-black tracking-widest transition-all disabled:opacity-30"
          >
            {isSaving ? '...' : 'SAVE'}
          </button>
          
          <button
            onClick={handleRefactor}
            disabled={isRefactoring || !hasUnsavedChanges}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black tracking-widest shadow-xl shadow-blue-100 transition-all disabled:opacity-30 disabled:shadow-none"
          >
            {isRefactoring ? 'REFACTORING...' : 'SYNC WITH AI'}
          </button>

          <button
            onClick={() => setShowDebug(p => !p)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest border transition-all ${showDebug ? 'bg-amber-400 border-amber-400 text-black' : 'bg-white border-gray-200 text-gray-400 hover:text-amber-500 hover:border-amber-300'}`}
          >
            DEBUG
          </button>
        </div>
      </header>

      <main className="flex-grow flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-grow flex justify-center p-12 overflow-hidden min-w-0">
          <div
            className={`relative w-full max-w-[1400px] bg-white shadow-[0_40px_100px_rgba(0,0,0,0.12)] rounded-2xl border border-gray-100 overflow-hidden transition-all duration-500 ${isEditMode ? 'ring-4 ring-blue-500/10' : ''}`}
            style={{ aspectRatio: '16/9', alignSelf: 'center' }}
            onClick={() => setIsKeyboardActive(true)}
          >
            <IframeRenderer ref={iframeRef} htmlContent={html} />
            <InteractionOverlay
              iframeRef={iframeRef}
              onChange={handleDeltaChange}
              isEditMode={isEditMode}
              targets={targets}
              onTargetsChange={setTargets}
              onDebugInfo={setDebugInfo}
              onActionStart={pushHistoryState}
              scrollClearDisabledRef={scrollClearDisabledRef}
            />

            {isEditMode && (
              <div className="absolute bottom-6 left-6 pointer-events-none bg-blue-600/90 backdrop-blur-md text-white px-4 py-2 rounded-lg text-[10px] font-black tracking-widest shadow-2xl animate-fade-in-up">
                MANIPULATION MODE ACTIVE
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0 z-20">
          {/* Upper Right: Editing Tools Portal */}
          <div className="flex flex-col border-b border-gray-200 shrink-0">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-white">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Design</span>
            </div>
            <div id="style-panel-portal" className="bg-gray-50/50 flex-grow relative min-h-[120px]">
              {/* React Portal will inject standard editing tools here automatically */}
              {targets.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-[11px] text-gray-400 font-medium">Select an element to edit</p>
                </div>
              )}
            </div>
          </div>

          {/* Lower Right: Layer panel */}
          <div className="flex-grow flex flex-col overflow-hidden relative">
            <LayerPanel
              iframeRef={iframeRef}
              selectedElements={targets}
              onSelectionChange={setTargets}
              htmlKey={htmlKey}
            />
          </div>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-8 right-8 bg-red-500 text-white px-8 py-4 rounded-2xl shadow-[0_20px_50px_rgba(239,68,68,0.3)] z-50 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span className="text-xs font-black tracking-widest uppercase">{error}</span>
        </div>
      )}

      {showDebug && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 text-green-400 font-mono text-[11px] p-4 border-t border-green-900 max-h-64 overflow-y-auto">
          <div className="flex items-center gap-6 mb-2">
            <span className="text-green-600 font-black uppercase tracking-widest">DEBUG PANEL</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${debugInfo?.zoom && debugInfo.zoom !== 1 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              ZOOM: {debugInfo?.zoom?.toFixed(4) ?? '—'}
            </span>
            <span className="text-gray-500">SOURCE: <span className="text-yellow-400">{debugInfo?.zoomSource ?? '—'}</span></span>
            <span className="text-gray-500">TARGETS: <span className="text-white">{debugInfo?.targetCount ?? 0}</span></span>
          </div>

          <div className="mb-2">
            <span className="text-gray-500">LAST SELECTOR: </span>
            <span className="text-cyan-400">{debugInfo?.lastSelector ?? '—'}</span>
          </div>

          <div className="mb-3">
            <span className="text-gray-500">LAST DELTA TYPE: </span>
            <span className="text-purple-400">{debugInfo?.lastDeltaType ?? '—'}</span>
          </div>

          <div>
            <span className="text-gray-500 block mb-1">PENDING DELTAS ({deltas.length}):</span>
            <pre className="text-green-300 whitespace-pre-wrap break-all leading-relaxed">
              {deltas.length > 0 ? JSON.stringify(deltas, null, 2) : 'none'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
