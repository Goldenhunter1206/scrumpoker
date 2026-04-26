import React from 'react';

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
            ? 'bg-green-100 text-green-800 border border-green-200'
            : 'bg-red-100 text-red-800 border border-red-200'
        }
      `}
    >
      {connected ? '🟢 Connected' : '🟡 Connecting...'}
    </div>
  );
}
