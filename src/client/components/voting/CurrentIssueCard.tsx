interface Props {
  issueKey?: string;
  title: string;
  description?: string;
  issueType?: string;
  priority?: string;
  status?: string;
}

export default function CurrentIssueCard({ issueKey, title, description, issueType, priority, status }: Props) {
  const priorityColors: Record<string, string> = {
    High: 'bg-[var(--sp-danger)]/15 text-[var(--sp-danger)]',
    Medium: 'bg-[var(--sp-warn)]/15 text-[var(--sp-warn)]',
    Low: 'bg-green-100 text-[var(--sp-success)]',
  };

  return (
    <div className="bg-[var(--sp-card)] rounded-xl border border-[var(--sp-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--sp-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {issueKey && (
            <span className="text-sm font-mono text-[var(--sp-primary)] font-semibold">
              {issueKey}
            </span>
          )}
          <span className="text-base font-semibold text-[var(--sp-fg)]">{title}</span>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {description && (
          <p className="text-sm text-[var(--sp-muted)] leading-relaxed">{description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {issueType && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-[var(--sp-primary-bg)] text-[var(--sp-primary)]">
              {issueType}
            </span>
          )}
          {priority && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[priority] || 'bg-gray-100 text-gray-700'}`}>
              {priority}
            </span>
          )}
          {status && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-[var(--sp-surface)] text-[var(--sp-muted)]">
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
