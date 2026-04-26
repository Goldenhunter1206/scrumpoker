interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <div
      className={`
        fixed top-5 right-5 px-4 py-2 rounded-full text-sm font-medium z-50
        transition-all duration-300
        ${
          connected
            ? 'bg-green-100 text-green-800 border border-[var(--sp-success)]/30'
            : 'bg-[var(--sp-danger)]/15 text-[var(--sp-danger)] border border-[var(--sp-danger)]/30'
        }
      `}
    >
      {connected ? '🟢 Connected' : '🟡 Connecting...'}
    </div>
  );
}
