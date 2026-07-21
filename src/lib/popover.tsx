'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center';
}

export function Popover({
  trigger, children,
  open: controlledOpen, onOpenChange,
  align = 'start',
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const triggerEl = ref.current?.querySelector('[data-popover-trigger]') || ref.current?.firstElementChild;
      if (triggerEl?.contains(t) || dropdownRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, setIsOpen]);

  useLayoutEffect(() => {
    if (!isOpen) { setDropPos(null); return; }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const dropH = dropdownRef.current?.offsetHeight ?? 200;
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < dropH + gap && r.top > spaceBelow;
      setDropPos({
        left: r.left,
        width: r.width,
        flip,
        top: flip ? r.top - Math.min(dropH, r.top - gap) - gap : r.bottom + gap,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  return (
    <div ref={ref} className="relative inline-block">
      <div ref={triggerRef} data-popover-trigger onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && dropPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-3 max-h-60 overflow-y-auto"
          style={{
            top: dropPos.top,
            left: dropPos.left,
            width: 'max-content',
            minWidth: Math.max(dropPos.width, 160),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}
