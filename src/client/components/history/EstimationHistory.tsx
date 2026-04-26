import { useSessionState } from '../../context/SessionContext';
import { Download } from 'lucide-react';

function formatRelative(ts: Date | string): string {
  const date = typeof ts === 'string' ? new Date(ts) : ts;
  if (isNaN(date.getTime())) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  return `${h}h ago`;
}

export default function EstimationHistory() {
  const { sessionData } = useSessionState();
  const history = sessionData?.history || [];

  const handleExport = () => {
    if (!history.length) return;
    const headers = ['#', 'Issue', 'Title', 'Estimate', 'Voters', 'Time'];
    const rows = history.map((h, i) => [
      String(i + 1),
      h.issueKey || h.ticket || '',
      h.summary || '',
      String(h.storyPoints ?? h.originalEstimate ?? ''),
      String(Object.keys(h.votes || {}).length || 0),
      formatRelative(h.timestamp),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  };

  return (
    <div className="bg-[var(--sp-card)] rounded-xl border border-[var(--sp-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--sp-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--sp-fg)]">Estimation History</h3>
        {history.length > 0 && (
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--sp-primary)] bg-[var(--sp-primary-bg)] rounded-md hover:bg-[var(--sp-primary)]/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--sp-surface)]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">Key</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">Estimate</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">Voters</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--sp-muted)] uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DFE1E6]">
            {history.map((item, idx) => (
              <tr key={`${item.timestamp}-${idx}`} className="hover:bg-[var(--sp-surface)] transition-colors">
                <td className="px-4 py-3 text-[var(--sp-fg)]">{idx + 1}</td>
                <td className="px-4 py-3 font-mono text-[var(--sp-primary)] font-medium">{item.issueKey || item.ticket || '—'}</td>
                <td className="px-4 py-3 text-[var(--sp-fg)] max-w-xs truncate">{item.summary || '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--sp-success-bg)] text-[var(--sp-success)]">
                    {item.storyPoints ?? item.originalEstimate ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--sp-muted)]">{Object.keys(item.votes || {}).length}</td>
                <td className="px-4 py-3 text-[var(--sp-muted)]">{formatRelative(item.timestamp)}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--sp-muted)]">
                  No estimations yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
