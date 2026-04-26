import SidebarSection from './SidebarSection';
import { useState } from 'react';

export default function Sidebar() {
  const [autoReveal, setAutoReveal] = useState(true);
  const [votingTimer, setVotingTimer] = useState(60);
  const [lockVoting, setLockVoting] = useState(false);

  return (
    <aside className="w-[280px] bg-white border-r border-[#DFE1E6] flex flex-col overflow-y-auto shrink-0">
      {/* Session Settings */}
      <SidebarSection title="Session Settings" defaultOpen>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[#5E6C84] uppercase tracking-wider">
              Voting System
            </label>
            <select className="mt-1 w-full h-9 px-2 border border-[#DFE1E6] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0052CC]">
              <option>Fibonacci</option>
              <option>T-Shirt Sizes</option>
              <option>Powers of 2</option>
            </select>
            <div className="mt-1 text-xs text-[#5E6C84]">
              0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#172B4D]">Auto-reveal votes</label>
              <button
                onClick={() => setAutoReveal(!autoReveal)}
                className={`relative w-10 h-5 rounded-full transition-colors ${autoReveal ? 'bg-[#0052CC]' : 'bg-[#DFE1E6]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoReveal ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-[#5E6C84] mt-0.5">Reveals automatically after timer</p>
          </div>

          <div>
            <label className="text-xs font-medium text-[#5E6C84] uppercase tracking-wider">
              Voting Timer
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setVotingTimer(Math.max(10, votingTimer - 10))}
                className="w-8 h-8 border border-[#DFE1E6] rounded-md flex items-center justify-center text-[#5E6C84] hover:bg-[#F4F5F7]"
              >
                −
              </button>
              <span className="text-sm font-mono text-[#172B4D] min-w-[3ch] text-center">
                {votingTimer}
              </span>
              <button
                onClick={() => setVotingTimer(Math.min(300, votingTimer + 10))}
                className="w-8 h-8 border border-[#DFE1E6] rounded-md flex items-center justify-center text-[#5E6C84] hover:bg-[#F4F5F7]"
              >
                +
              </button>
              <span className="text-xs text-[#5E6C84]">sec</span>
            </div>
          </div>
        </div>
      </SidebarSection>

      {/* Moderator Controls */}
      <SidebarSection title="Moderator Controls" defaultOpen>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#5E6C84]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              <span className="text-sm text-[#172B4D]">Lock voting</span>
            </div>
            <button
              onClick={() => setLockVoting(!lockVoting)}
              className={`relative w-10 h-5 rounded-full transition-colors ${lockVoting ? 'bg-[#0052CC]' : 'bg-[#DFE1E6]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${lockVoting ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <p className="text-xs text-[#5E6C84] pl-6">Prevent new votes</p>

          <button className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[#172B4D] hover:bg-[#F4F5F7] rounded-md transition-colors">
            <svg className="w-4 h-4 text-[#5E6C84]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            End voting and move on
          </button>

          <button className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[#172B4D] hover:bg-[#F4F5F7] rounded-md transition-colors">
            <svg className="w-4 h-4 text-[#5E6C84]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Create a new issue on the fly
          </button>

          <button className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[#172B4D] hover:bg-[#F4F5F7] rounded-md transition-colors">
            <svg className="w-4 h-4 text-[#5E6C84]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Edit session configuration
          </button>
        </div>
      </SidebarSection>

      {/* Participants */}
      <SidebarSection title={"Participants (8)"} defaultOpen>
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-[#DEEBFF]">
            <div className="w-8 h-8 rounded-full bg-[#0052CC] text-white text-xs flex items-center justify-center font-medium">
              GH
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#172B4D] truncate">Goldenhunter</div>
              <div className="text-[10px] text-[#0052CC]">Facilitator</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md hover:bg-[#F4F5F7]">
            <div className="w-8 h-8 rounded-full bg-[#36B37E] text-white text-xs flex items-center justify-center font-medium">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#172B4D] truncate">Jane Doe</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md hover:bg-[#F4F5F7]">
            <div className="w-8 h-8 rounded-full bg-[#FF991F] text-white text-xs flex items-center justify-center font-medium">
              JS
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#172B4D] truncate">John Smith</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        </div>
      </SidebarSection>
    </aside>
  );
}
