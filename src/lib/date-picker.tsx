'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker, getDefaultClassNames, useDayPicker } from 'react-day-picker';
import { format, parse, isValid, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { InlineIcon } from './icon';

// ── Custom Nav component ────────────────────────────────────

function CustomNav() {
  const { goToMonth, months } = useDayPicker();
  const currentMonth = months[0]?.date ?? new Date();

  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => goToMonth(subYears(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="上一年">
          <InlineIcon name="chevrons-left" className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goToMonth(subMonths(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="上一月">
          <InlineIcon name="chevron-left" className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => goToMonth(addMonths(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="下一月">
          <InlineIcon name="chevron-right" className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goToMonth(addYears(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="下一年">
          <InlineIcon name="chevrons-right" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── DatePicker (date only) ─────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
}

export function DatePicker({
  value, onChange, placeholder = '选择日期',
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const displayText = value || placeholder;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    if (open) { document.addEventListener('mousedown', handler); document.addEventListener('keydown', keyHandler); }
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const defaultCls = getDefaultClassNames();

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <InlineIcon name="calendar" className="w-3.5 h-3.5 text-gray-400" />
        <span className={value ? 'font-medium' : 'text-gray-400'}>{displayText}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1" style={{ left: 0 }}>
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(day) => {
                if (day && isValid(day)) {
                  onChange(format(day, 'yyyy-MM-dd'));
                  setOpen(false);
                }
              }}
              locale={zhCN}
              components={{
                Nav: CustomNav,
              }}
              classNames={{
                root: `${defaultCls.root} w-fit`,
                chevron: `${defaultCls.chevron} fill-indigo-500`,
                month_caption: 'text-sm font-semibold text-gray-900 text-center mb-2',
                weekday: 'hidden',
                week: 'flex',
                day: 'p-0',
                day_button: 'w-9 h-9 text-sm rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors',
                today: 'font-semibold text-indigo-600',
                selected: 'bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-semibold',
                outside: 'text-gray-300',
                nav: 'hidden', // Hide default nav, using CustomNav
              }}
              formatters={{
                formatCaption: (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── DateTimePicker (date + time) ───────────────────────────────

interface DateTimePickerProps {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

export function DateTimePicker({ value, onChange, className = '' }: DateTimePickerProps) {
  const [dateVal, timeVal] = value ? value.split('T') : ['', ''];

  const handleDateChange = (d: string) => {
    onChange(`${d}T${timeVal || '00:00'}`);
  };

  const handleTimeChange = (t: string) => {
    onChange(`${dateVal || new Date().toISOString().slice(0, 10)}T${t}`);
  };

  return (
    <div className={`flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5 ${className}`}>
      <InlineIcon name="clock" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <DatePicker
        value={dateVal}
        onChange={handleDateChange}
        className="[&>button]:border-0 [&>button]:px-0 [&>button]:py-0 [&>button]:text-xs"
      />
      <span className="text-gray-300 shrink-0">—</span>
      <input
        type="time"
        value={timeVal}
        onChange={(e) => handleTimeChange(e.target.value)}
        className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700 w-20"
      />
    </div>
  );
}
