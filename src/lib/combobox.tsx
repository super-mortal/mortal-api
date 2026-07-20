'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { InlineIcon } from './icon';

interface ComboBoxOption {
  label: string;
  value: string;
}

interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  onCreateCustom?: (input: string) => void;
  emptyText?: string;
  /** Multi-select mode — shows checkboxes, value is ignored, use onSelectionChange */
  multi?: boolean;
  selectedValues?: string[];
  onSelectionChange?: (values: string[]) => void;
}

export function ComboBox({
  options,
  value,
  onChange,
  placeholder = '输入或选择...',
  allowCustom = true,
  onCreateCustom,
  emptyText = '无匹配选项',
  multi = false,
  selectedValues = [],
  onSelectionChange,
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(multi ? '' : value);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);

  // Position the portal dropdown relative to the input, flipping above when
  // there isn't room below. Uses fixed coordinates so it escapes any ancestor
  // overflow-hidden (e.g. Modal panels).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
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
  }, [open]);

  useEffect(() => {
    if (!multi) setInput(value);
  }, [value, multi]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setHighlightIdx(0); }, [input, open]);

  const filtered = input
    ? options.filter(o => o.label.toLowerCase().includes(input.toLowerCase()) || o.value.toLowerCase().includes(input.toLowerCase()))
    : options;

  const handleSelect = (opt: ComboBoxOption) => {
    if (multi) {
      const newSelected = selectedValues.includes(opt.value)
        ? selectedValues.filter(v => v !== opt.value)
        : [...selectedValues, opt.value];
      onSelectionChange?.(newSelected);
      inputRef.current?.focus();
    } else {
      setInput(opt.label);
      onChange(opt.value);
      setOpen(false);
    }
  };

  const handleInputChange = (newInput: string) => {
    setInput(newInput);
    if (!multi && !allowCustom) onChange(newInput);
    if (!open) setOpen(true);
  };

  const handleCreateNew = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (multi) {
      if (!selectedValues.includes(trimmed)) {
        onSelectionChange?.([...selectedValues, trimmed]);
      }
      setInput('');
      inputRef.current?.focus();
    } else {
      if (onCreateCustom) onCreateCustom(trimmed);
      onChange(trimmed);
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (multi && input.trim()) {
        // In multi mode, typing then Enter adds the typed value as a custom entry
        const matched = filtered.filter(f => !selectedValues.includes(f.value));
        if (matched.length === 1 && matched[0].label === input) {
          handleSelect(matched[0]);
        } else if (allowCustom) {
          handleCreateNew();
        }
      } else if (!multi) {
        if (filtered.length === 1) handleSelect(filtered[0]);
        else if (allowCustom && input.trim()) handleCreateNew();
      }
    }
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 pr-8"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <InlineIcon name="chevronDown" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && dropPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {filtered.length > 0 ? (
            filtered.map((opt, i) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                    i === highlightIdx ? 'bg-gray-50' : ''
                  } ${multi ? (isSelected ? 'text-indigo-700' : 'text-gray-700') : (value === opt.value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700')}`}
                >
                  <span className="truncate flex items-center gap-2">
                    {multi && (
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {isSelected && <InlineIcon name="check" className="w-3 h-3 text-white" />}
                      </span>
                    )}
                    {opt.label}
                  </span>
                  {!multi && value === opt.value && <InlineIcon name="check" className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">
              {emptyText}
              {allowCustom && input.trim() && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="mt-2 flex items-center gap-1.5 mx-auto text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <InlineIcon name="plus" className="w-3.5 h-3.5" />
                  添加 "{input.trim()}"
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
