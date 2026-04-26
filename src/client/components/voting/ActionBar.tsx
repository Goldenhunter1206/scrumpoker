import React from 'react';
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
            className="inline-flex items-center gap-2 h-10 px-4 bg-[#0052CC] text-white rounded-md text-sm font-medium hover:bg-[#0747A6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye className="w-4 h-4" />
            Reveal Votes
          </button>

          <button
            onClick={onStartTimer}
            className="inline-flex items-center gap-2 h-10 px-4 bg-white border border-[#DFE1E6] text-[#172B4D] rounded-md text-sm font-medium hover:bg-[#F4F5F7] transition-colors"
          >
            <Timer className="w-4 h-4" />
            Start Timer
          </button>

          <button
            onClick={onSkip}
            className="inline-flex items-center gap-2 h-10 px-4 bg-white border border-[#DFE1E6] text-[#172B4D] rounded-md text-sm font-medium hover:bg-[#F4F5F7] transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip to Next
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 h-10 px-4 bg-white border border-[#DFE1E6] text-[#172B4D] rounded-md text-sm font-medium hover:bg-[#F4F5F7] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Voting
          </button>

          {onUpdateJira && (
            <button
              onClick={onUpdateJira}
              className="inline-flex items-center gap-2 h-10 px-4 bg-[#0052CC] text-white rounded-md text-sm font-medium hover:bg-[#0747A6] transition-colors"
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
