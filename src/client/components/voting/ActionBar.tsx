import { Eye, Timer, SkipForward, RotateCcw, ExternalLink } from 'lucide-react';

interface Props {
  onReveal: () => void;
  onStartTimer: () => void;
  onSkip: () => void;
  onReset: () => void;
  onUpdateJira?: () => void;
  canReveal?: boolean;
  isRevealed?: boolean;
}

export default function ActionBar({
  onReveal,
  onStartTimer,
  onSkip,
  onReset,
  onUpdateJira,
  canReveal = true,
  isRevealed = false,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {!isRevealed ? (
        <>
          <button
            onClick={onReveal}
            disabled={!canReveal}
            aria-label="Reveal all votes"
            className="inline-flex items-center gap-2 h-10 px-4 bg-[var(--sp-primary)] text-white rounded-md text-sm font-medium hover:bg-[var(--sp-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye className="w-4 h-4" />
            Reveal Votes
          </button>

          <button
            onClick={onStartTimer}
            aria-label="Start voting timer"
            className="inline-flex items-center gap-2 h-10 px-4 bg-[var(--sp-card)] border border-[var(--sp-border)] text-[var(--sp-fg)] rounded-md text-sm font-medium hover:bg-[var(--sp-surface)] transition-colors"
          >
            <Timer className="w-4 h-4" />
            Start Timer
          </button>

          <button
            onClick={onSkip}
            aria-label="Skip to next issue"
            className="inline-flex items-center gap-2 h-10 px-4 bg-[var(--sp-card)] border border-[var(--sp-border)] text-[var(--sp-fg)] rounded-md text-sm font-medium hover:bg-[var(--sp-surface)] transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip to Next
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onReset}
            aria-label="Reset voting round"
            className="inline-flex items-center gap-2 h-10 px-4 bg-[var(--sp-card)] border border-[var(--sp-border)] text-[var(--sp-fg)] rounded-md text-sm font-medium hover:bg-[var(--sp-surface)] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Voting
          </button>

          {onUpdateJira && (
            <button
              onClick={onUpdateJira}
              aria-label="Update Jira with estimate"
              className="inline-flex items-center gap-2 h-10 px-4 bg-[var(--sp-primary)] text-white rounded-md text-sm font-medium hover:bg-[var(--sp-primary-hover)] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Update Jira
            </button>
          )}
        </>
      )}
    </div>
  );
}
