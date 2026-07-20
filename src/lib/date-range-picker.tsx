'use client';

import { useState, useRef, useEffect } from 'react';
import { InlineIcon } from './icon';
import { DatePicker } from './date-picker';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DateRangePicker({
  startDate, endDate,
  onStartChange, onEndChange,
  onConfirm, onCancel,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, localStart, localEnd]);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  const handleConfirm = () => {
    onStartChange(localStart);
    onEndChange(localEnd);
    onConfirm();
    setOpen(false);
  };

  const handleCancel = () => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
    onCancel();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all bg-indigo-600 text-white shadow-sm"
      >
        <InlineIcon name="calendar" className="w-3 h-3" />
        自定义
        <InlineIcon name="chevronDown" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-lg p-4 min-w-[260px]">
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">开始日期</label>
              <DatePicker
                value={localStart}
                onChange={(d) => setLocalStart(d)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">结束日期</label>
              <DatePicker
                value={localEnd}
                onChange={(d) => setLocalEnd(d)}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={!localStart}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                确认
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
