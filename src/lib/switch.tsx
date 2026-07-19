'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const sizes = {
  sm: { track: 'w-8 h-5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3' },
  md: { track: 'w-10 h-6', thumb: 'w-[1.125rem] h-[1.125rem]', translate: 'translate-x-4' },
} as const;

export function Switch({ checked, onChange, disabled = false, size = 'md' }: SwitchProps) {
  const s = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20
        ${checked ? 'bg-emerald-500' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${s.track}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow ring-0
          transition-transform duration-200 ease-in-out
          ${checked ? s.translate : 'translate-x-0'}
          ${s.thumb}
        `}
      />
    </button>
  );
}
