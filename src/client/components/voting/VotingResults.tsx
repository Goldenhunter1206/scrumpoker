interface Vote {
  name: string;
  vote: string | number;
}

interface Props {
  votes: Vote[];
  average: number;
  consensus: number | string;
}

export default function VotingResults({ votes, average, consensus }: Props) {
  return (
    <div className="bg-[var(--sp-card)] rounded-xl border border-[var(--sp-border)] shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[var(--sp-fg)] mb-4">Voting Results</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {votes.map((v) => (
          <div key={v.name} className="text-center p-3 bg-[var(--sp-surface)] rounded-lg border border-[var(--sp-border)]">
            <div className="text-lg font-bold text-[var(--sp-primary)]">{v.vote}</div>
            <div className="text-xs text-[var(--sp-muted)] mt-1 truncate">{v.name}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--sp-border)] flex items-center gap-6">
        <div>
          <span className="text-xs text-[var(--sp-muted)]">Average: </span>
          <span className="text-sm font-semibold text-[var(--sp-fg)]">{average}</span>
        </div>
        <div>
          <span className="text-xs text-[var(--sp-muted)]">Consensus: </span>
          <span className="text-sm font-semibold text-[var(--sp-fg)]">{consensus}</span>
        </div>
      </div>
    </div>
  );
}
