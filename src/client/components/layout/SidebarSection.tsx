import { useState } from 'react';
interface Props {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function SidebarSection({ title, children, defaultOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--sp-border)]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider hover:bg-[var(--sp-surface)] transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
