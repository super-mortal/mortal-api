'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { InlineIcon } from './icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  portal?: boolean;
  zIndex?: number;
}

export function Modal({ open, onClose, title, children, portal, zIndex }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const el = (
    <div
      ref={overlayRef}
      className={`fixed inset-0 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200 ${zIndex ? '' : 'z-50'}`}
      style={zIndex ? { zIndex } : undefined}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-50">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <InlineIcon name="x" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );

  return portal ? createPortal(el, document.body) : el;
}
