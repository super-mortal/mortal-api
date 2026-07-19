'use client';

import { Modal } from './modal';
import { InlineIcon } from './icon';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title = '确认操作',
  message,
  confirmText = '确认',
  variant = 'info',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Alert icon + message */}
        <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-3 ${
          variant === 'danger'
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'bg-indigo-50 border border-indigo-100 text-indigo-700'
        }`}>
          <InlineIcon
            name="triangleAlert"
            className={`w-5 h-5 shrink-0 mt-0.5 ${variant === 'danger' ? 'text-red-500' : 'text-indigo-500'}`}
          />
          <span>{message}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-3">
            <InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 ${
                variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {variant === 'danger' && <InlineIcon name="trash2" className="w-4 h-4" />}
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
