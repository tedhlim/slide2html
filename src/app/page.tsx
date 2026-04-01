'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IframeRenderer } from '@/components/IframeRenderer';
import { InteractionOverlay } from '@/components/InteractionOverlay';
import { VisualDelta } from '@/lib/types';

export default function Home() {
  const [html, setHtml] = useState<string>('');
  const [deltas, setDeltas] = useState<VisualDelta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRefactoring, setIsRefactoring] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [isKeyboardActive, setIsKeyboardActive] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/storage/read');
        if (!res.ok) throw new Error('Failed to fetch document');
        const data = await res.json();
        setHtml(data.html || '');
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An error occurred while loading the document.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocument();
  }, []);

  // Keyboard Passthrough: Forward keys to the iframe's document
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const navKeys = ['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'g', 'G'];
      if (navKeys.includes(e.key)) {
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
          // Dispatch to document specifically as that's where the listener is
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
  }, []);

  const handleDeltaChange = useCallback((delta: VisualDelta) => {
    setDeltas((prev) => [...prev, delta]);
  }, []);

  const navigateSlide = (direction: 'next' | 'prev') => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
      const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
      iframe.contentWindow.document.dispatchEvent(new KeyboardEvent('keydown', { 
        key, 
        bubbles: true,
        cancelable: true 
      }));
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
    <div className="flex flex-col min-h-screen bg-[#f1f3f5] font-sans selection:bg-blue-100">
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
        </div>
      </header>

      <main className="flex-grow flex justify-center p-12 overflow-hidden">
        <div 
          className={`relative w-full max-w-[1400px] bg-white shadow-[0_40px_100px_rgba(0,0,0,0.12)] rounded-2xl border border-gray-100 overflow-hidden transition-all duration-500 ${isEditMode ? 'ring-4 ring-blue-500/10' : ''}`} 
          style={{ aspectRatio: '16/9' }}
          onClick={() => setIsKeyboardActive(true)}
        >
          <IframeRenderer ref={iframeRef} htmlContent={html} />
          <InteractionOverlay 
            iframeRef={iframeRef} 
            onChange={handleDeltaChange}
            isEditMode={isEditMode}
          />
          
          {isEditMode && (
             <div className="absolute bottom-6 left-6 pointer-events-none bg-blue-600/90 backdrop-blur-md text-white px-4 py-2 rounded-lg text-[10px] font-black tracking-widest shadow-2xl animate-fade-in-up">
                MANIPULATION MODE ACTIVE
             </div>
          )}
        </div>
      </main>

      {error && (
        <div className="fixed bottom-8 right-8 bg-red-500 text-white px-8 py-4 rounded-2xl shadow-[0_20px_50px_rgba(239,68,68,0.3)] z-50 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span className="text-xs font-black tracking-widest uppercase">{error}</span>
        </div>
      )}
    </div>
  );
}
