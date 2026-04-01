'use client';

import React, { forwardRef, useEffect, useRef } from 'react';

interface IframeRendererProps {
  htmlContent: string;
  onLoad?: () => void;
  className?: string;
}

export const IframeRenderer = forwardRef<HTMLIFrameElement, IframeRendererProps>(
  ({ htmlContent, onLoad, className = '' }, ref) => {
    const internalRef = useRef<HTMLIFrameElement>(null);
    const resolvedRef = (ref as React.MutableRefObject<HTMLIFrameElement>) || internalRef;

    useEffect(() => {
      const iframe = resolvedRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      doc.open();
      doc.write(htmlContent);
      doc.close();

      const handleLoad = () => {
        onLoad?.();
      };

      iframe.addEventListener('load', handleLoad);
      return () => {
        iframe.removeEventListener('load', handleLoad);
      };
    }, [htmlContent, onLoad, resolvedRef]);

    return (
      <iframe
        ref={resolvedRef}
        className={`w-full h-full border-none bg-white ${className}`}
        sandbox="allow-same-origin allow-scripts allow-modals"
        title="Content Preview"
      />
    );
  }
);

IframeRenderer.displayName = 'IframeRenderer';
