'use client';

import React, { useEffect, useState, useCallback } from 'react';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'TITLE', 'HEAD', 'BR', 'HR', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'POLYLINE', 'ELLIPSE', 'DEFS', 'USE', 'G']);

function isInjectedElement(el: Element): boolean {
  const cls = typeof el.className === 'string' ? el.className : '';
  // Filter out Moveable's injected control boxes and our own edit style tag
  return cls.includes('moveable') || el.id === 'slide2html-edit-override';
}

interface TreeNode {
  el: HTMLElement | SVGElement;
  children: TreeNode[];
  key: string;
}

function buildTree(el: Element, keyPrefix: string): TreeNode {
  const children: TreeNode[] = [];
  let idx = 0;
  for (const child of Array.from(el.children)) {
    if (!SKIP_TAGS.has(child.tagName.toUpperCase()) && !isInjectedElement(child)) {
      children.push(buildTree(child, `${keyPrefix}-${idx}`));
      idx++;
    }
  }
  return { el: el as HTMLElement, children, key: keyPrefix };
}

function getLabel(el: HTMLElement | SVGElement): { tag: string; qualifier: string; preview: string } {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const firstClass = el.classList[0] ? `.${el.classList[0]}` : '';
  const qualifier = id || firstClass;
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 28) ?? '';
  return { tag, qualifier, preview: text };
}

interface TreeNodeViewProps {
  node: TreeNode;
  depth: number;
  selected: Array<HTMLElement | SVGElement>;
  onSelect: (el: HTMLElement | SVGElement, multi: boolean) => void;
  defaultExpanded: boolean;
}

const TreeNodeView: React.FC<TreeNodeViewProps> = ({ node, depth, selected, onSelect, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isSelected = selected.includes(node.el);
  const hasChildren = node.children.length > 0;
  const { tag, qualifier, preview } = getLabel(node.el as HTMLElement);

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-[3px] cursor-pointer rounded-md text-[11px] group select-none ${
          isSelected
            ? 'bg-blue-500 text-white'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
        style={{ paddingLeft: `${6 + depth * 12}px`, paddingRight: '6px' }}
        onClick={(e) => { e.stopPropagation(); onSelect(node.el, e.shiftKey); }}
      >
        {/* Expand/collapse toggle */}
        <button
          className={`w-4 h-4 flex items-center justify-center shrink-0 rounded text-[9px] transition-colors ${
            isSelected ? 'text-blue-200 hover:text-white' : 'text-gray-300 hover:text-gray-500'
          }`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(p => !p); }}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </button>

        {/* Tag name */}
        <span className={`font-mono font-bold shrink-0 ${isSelected ? 'text-blue-100' : 'text-blue-500'}`}>
          {tag}
        </span>

        {/* ID or class qualifier */}
        {qualifier && (
          <span className={`font-mono shrink-0 truncate max-w-[60px] ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
            {qualifier}
          </span>
        )}

        {/* Text preview */}
        {preview && (
          <span className={`truncate text-[10px] ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
            {preview}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNodeView
              key={child.key}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              defaultExpanded={depth < 2}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface LayerPanelProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  selectedElements: Array<HTMLElement | SVGElement>;
  onSelectionChange: (els: Array<HTMLElement | SVGElement>) => void;
  htmlKey: number; // increments on each html change to trigger tree rebuild
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ iframeRef, selectedElements, onSelectionChange, htmlKey }) => {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);

  const buildAndSetTree = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    const root = buildTree(body, 'root');
    setRootNodes(root.children); // skip <body> itself, show its children
  }, [iframeRef]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      // Small delay to let the document finish painting (Tailwind CDN etc.)
      setTimeout(buildAndSetTree, 150);
    };
    iframe.addEventListener('load', onLoad);
    if (iframe.contentDocument?.readyState === 'complete') buildAndSetTree();
    return () => iframe.removeEventListener('load', onLoad);
  }, [iframeRef, buildAndSetTree, htmlKey]);

  const handleSelect = useCallback((el: HTMLElement | SVGElement, multi: boolean) => {
    if (multi) {
      onSelectionChange(
        selectedElements.includes(el)
          ? selectedElements.filter(e => e !== el)
          : [...selectedElements, el]
      );
    } else {
      onSelectionChange([el]);
    }
    // Scroll selected element into view inside the iframe
    try { (el as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); } catch {}
  }, [selectedElements, onSelectionChange]);

  return (
    <div className="w-60 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Layers</span>
        <button
          onClick={buildAndSetTree}
          title="Refresh layer tree"
          className="text-[9px] text-gray-400 hover:text-blue-500 font-black uppercase tracking-widest transition-colors"
        >
          ↺
        </button>
      </div>

      {/* Selection summary */}
      {selectedElements.length > 0 && (
        <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
            {selectedElements.length} selected
          </span>
          <button
            onClick={() => onSelectionChange([])}
            className="text-[10px] text-blue-400 hover:text-blue-600 font-bold"
          >
            Clear
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="flex-grow overflow-y-auto py-1 px-1">
        {rootNodes.length > 0 ? (
          rootNodes.map(node => (
            <TreeNodeView
              key={node.key}
              node={node}
              depth={0}
              selected={selectedElements}
              onSelect={handleSelect}
              defaultExpanded={true}
            />
          ))
        ) : (
          <p className="text-[11px] text-gray-400 p-4 text-center">No document loaded</p>
        )}
      </div>
    </div>
  );
};
