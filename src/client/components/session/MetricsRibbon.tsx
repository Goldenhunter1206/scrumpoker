interface Props {
  average: number;
  agreement: number;
  consensus: number | string;
  totalVoters: number;
}

export default function MetricsRibbon({ average, agreement, consensus, totalVoters }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-[var(--sp-card)] rounded-lg border border-[var(--sp-border)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--sp-primary-bg)] flex items-center justify-center text-[var(--sp-primary)]">
          📊
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--sp-fg)]">{average}</div>
          <div className="text-xs text-[var(--sp-muted)]">Average</div>
        </div>
      </div>

      <div className="bg-[var(--sp-card)] rounded-lg border border-[var(--sp-border)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--sp-success-bg)] flex items-center justify-center text-[var(--sp-success)]">
          🤝
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--sp-fg)]">{agreement}%</div>
          <div className="text-xs text-[var(--sp-muted)]">Agreement</div>
        </div>
      </div>

      <div className="bg-[var(--sp-card)] rounded-lg border border-[var(--sp-border)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--sp-purple-bg)] flex items-center justify-center text-[var(--sp-purple)]">
          🎯
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--sp-fg)]">{consensus}</div>
          <div className="text-xs text-[var(--sp-muted)]">Consensus</div>
        </div>
      </div>

      <div className="bg-[var(--sp-card)] rounded-lg border border-[var(--sp-border)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--sp-warn-bg)] flex items-center justify-center text-[var(--sp-warn)]">
          👥
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--sp-fg)]">{totalVoters}</div>
          <div className="text-xs text-[var(--sp-muted)]">Voters</div>
        </div>
      </div>
    </div>
  );
}
