interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <div
      className="fixed top-3 left-4 px-2.5 py-1 rounded-full text-[11px] font-medium z-50 flex items-center gap-1.5 shadow-sm border transition-all duration-300"
      style={{
        background: connected ? 'var(--sp-success-bg, #E3FCEF)' : 'var(--sp-danger-bg, #FFEBE6)',
        borderColor: connected ? 'var(--sp-success, #36B37E)' : 'var(--sp-danger, #DE350B)',
        color: connected ? 'var(--sp-success, #36B37E)' : 'var(--sp-danger, #DE350B)',
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
      />
      {connected ? 'Connected' : 'Connecting...'}
    </div>
  );
}
