import React from 'react';

interface Props {
  sessionName: string;
  isFacilitator: boolean;
  elapsedTime: string;
  jiraConnected: boolean;
}

export default function TopNav({ sessionName, isFacilitator, elapsedTime, jiraConnected }: Props) {
  return (
    <header className="h-14 bg-white border-b border-[#DFE1E6] flex items-center justify-between px-4 shrink-0">
      {/* Left: Logo + Role */}
      <div className="flex items-center gap-3">
        <button className="p-2 hover:bg-[#F4F5F7] rounded-md transition-colors lg:hidden">
          <svg className="w-5 h-5 text-[#5E6C84]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0052CC] rounded-md flex items-center justify-center">
            <span className="text-white text-lg">♠</span>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold text-[#172B4D]">Scrum Poker</div>
            <div className="text-[10px] text-[#5E6C84] -mt-0.5">
              {isFacilitator ? 'Facilitator' : 'Participant'}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Session Title */}
      <div className="flex-1 flex justify-center">
        <h1 className="text-base font-semibold text-[#172B4D]">Planning Session</h1>
      </div>

      {/* Right: Timer + Jira + Settings */}
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-1.5 text-sm text-[#5E6C84] bg-[#F4F5F7] px-3 py-1.5 rounded-md">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span className="font-mono">{elapsedTime}</span>
        </div>

        {jiraConnected && (
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
            <span>Connected to Jira</span>
          </div>
        )}

        <button className="p-2 hover:bg-[#F4F5F7] rounded-md transition-colors text-[#5E6C84]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </button>
      </div>
    </header>
  );
}
