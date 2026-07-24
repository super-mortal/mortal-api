'use client';

import { useState, useRef, useEffect } from 'react';
import { InlineIcon } from './icon';

export interface SelectOption {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'amber' | 'gray';
}

interface SelectFilterProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const colorDot: Record<string, string> = {
  green: 'bg-emerald-500',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
  gray: 'bg-gray-300',
};

export function SelectFilter({
  options, value, onChange, placeholder = '请选择', className = '',
}: SelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 whitespace-nowrap"
      >
        {selected?.color && (
          <span className={`w-2 h-2 rounded-full ${colorDot[selected.color] || ''}`} />
        )}
        <span className={selected ? 'font-medium' : 'text-gray-400'}>{selected?.label || placeholder}</span>
        <InlineIcon name="chevronDown" className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                value === opt.value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.color && <span className={`w-2 h-2 rounded-full ${colorDot[opt.color]}`} />}
              <span className="flex-1 truncate">{opt.label}</span>
              {value === opt.value && <InlineIcon name="check" className="w-3 h-3 text-indigo-500 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
