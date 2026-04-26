import React from 'react';
import { cn } from '../../lib/utils';

interface Props {
  options: string[];
  selectedValue: string | null;
  onVote: (value: string) => void;
  disabled?: boolean;
}

export default function VotingCards({ options, selectedValue, onVote, disabled }: Props) {
  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[#172B4D] mb-4">Select your estimate</h3>
      <div className="flex flex-wrap gap-3">
        {options.map((value) => (
          <button
            key={value}
            onClick={() => !disabled && onVote(value)}
            disabled={disabled}
            className={cn(
              'w-14 h-20 rounded-lg border-2 font-bold text-lg transition-all duration-200',
              selectedValue === value
                ? 'bg-[#0052CC] border-[#0052CC] text-white shadow-md scale-105'
                : 'bg-white border-[#DFE1E6] text-[#172B4D] hover:border-[#0052CC] hover:shadow-sm',
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
