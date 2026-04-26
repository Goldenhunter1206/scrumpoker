import { useState } from 'react';
import { useSessionState } from '../../context/SessionContext';
import { useSocket } from '../../hooks/useSocket';
import SidebarSection from './SidebarSection';

function getAvatarBg(name: string): string {
  const colors = ['#0052CC', '#36B37E', '#FF991F', '#6554C0', '#00B8D9', '#FF5630', '#97A0AF'];
  const total = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0);
  return colors[total % colors.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Sidebar() {
  const {
    sessionData,
    myName,
    isFacilitator,
    votingRevealed,
  } = useSessionState();
  const {
    revealVotes,
    resetVoting,
    startCountdown,
    endSession,
    setTicket,
  } = useSocket();

  const roomCode = sessionData?.id || '';
  const participants = sessionData?.participants || [];

  const [autoReveal, setAutoReveal] = useState(true);
  const [votingTimer, setVotingTimer] = useState(60);
  const [lockVoting, setLockVoting] = useState(false);
  const [quickTicket, setQuickTicket] = useState('');

  const votedCount = participants.filter((p) => p.hasVoted).length;
  const nonViewerCount = participants.filter((p) => !p.isViewer).length;

  return (
    <aside className="w-[280px] bg-[var(--sp-card)] border-r border-[var(--sp-border)] flex flex-col overflow-y-auto shrink-0">
      {/* Session Settings */}
      <SidebarSection title="Session Settings" defaultOpen>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--sp-muted)] uppercase tracking-wider">
              Voting System
            </label>
            <select className="mt-1 w-full h-9 px-2 border border-[var(--sp-border)] rounded-md text-sm bg-[var(--sp-card)] focus:outline-none focus:ring-2 focus:ring-[#0052CC]">
              <option>Fibonacci</option>
              <option>T-Shirt Sizes</option>
              <option>Powers of 2</option>
            </select>
            <div className="mt-1 text-xs text-[var(--sp-muted)]">0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?</div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--sp-fg)]">Auto-reveal votes</label>
              <button
                onClick={() => setAutoReveal(!autoReveal)}
                className={`relative w-10 h-5 rounded-full transition-colors ${autoReveal ? 'bg-[var(--sp-primary)]' : 'bg-[#DFE1E6]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[var(--sp-card)] rounded-full shadow transition-transform ${autoReveal ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-[var(--sp-muted)] mt-0.5">Reveals automatically after timer</p>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--sp-muted)] uppercase tracking-wider">Voting Timer</label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setVotingTimer(Math.max(10, votingTimer - 10))}
                className="w-8 h-8 border border-[var(--sp-border)] rounded-md flex items-center justify-center text-[var(--sp-muted)] hover:bg-[var(--sp-surface)]"
              >
                −
              </button>
              <span className="text-sm font-mono text-[var(--sp-fg)] min-w-[3ch] text-center">{votingTimer}</span>
              <button
                onClick={() => setVotingTimer(Math.min(300, votingTimer + 10))}
                className="w-8 h-8 border border-[var(--sp-border)] rounded-md flex items-center justify-center text-[var(--sp-muted)] hover:bg-[var(--sp-surface)]"
              >
                +
              </button>
              <span className="text-xs text-[var(--sp-muted)]">sec</span>
            </div>
            {isFacilitator && (
              <button
                onClick={() => startCountdown(roomCode, votingTimer)}
                className="mt-2 w-full h-8 text-xs bg-[var(--sp-primary)] text-white rounded-md hover:bg-[var(--sp-primary-hover)] transition-colors"
              >
                Start Countdown
              </button>
            )}
          </div>
        </div>
      </SidebarSection>

      {/* Moderator Controls */}
      {isFacilitator && (
        <SidebarSection title="Moderator Controls" defaultOpen>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--sp-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm text-[var(--sp-fg)]">Lock voting</span>
              </div>
              <button
                onClick={() => setLockVoting(!lockVoting)}
                className={`relative w-10 h-5 rounded-full transition-colors ${lockVoting ? 'bg-[var(--sp-primary)]' : 'bg-[#DFE1E6]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[var(--sp-card)] rounded-full shadow transition-transform ${lockVoting ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-[var(--sp-muted)] pl-6">Prevent new votes</p>

            {!votingRevealed ? (
              <button
                onClick={() => revealVotes(roomCode)}
                disabled={votedCount === 0}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[var(--sp-fg)] hover:bg-[var(--sp-surface)] rounded-md transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4 text-[var(--sp-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Reveal Votes ({votedCount}/{nonViewerCount})
              </button>
            ) : (
              <button
                onClick={() => resetVoting(roomCode)}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[var(--sp-fg)] hover:bg-[var(--sp-surface)] rounded-md transition-colors"
              >
                <svg className="w-4 h-4 text-[var(--sp-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Voting
              </button>
            )}

            <button
              onClick={() => {
                if (quickTicket.trim()) {
                  setTicket(roomCode, quickTicket.trim());
                  setQuickTicket('');
                }
              }}
              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[var(--sp-fg)] hover:bg-[var(--sp-surface)] rounded-md transition-colors"
            >
              <svg className="w-4 h-4 text-[var(--sp-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Set Ticket
            </button>
            <input
              type="text"
              value={quickTicket}
              onChange={(e) => setQuickTicket(e.target.value)}
              placeholder="Ticket number or title"
              className="w-full h-8 px-2 border border-[var(--sp-border)] rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#0052CC]"
            />

            <button
              onClick={() => {
                if (confirm('End session for everyone?')) {
                  endSession(roomCode);
                }
              }}
              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-[var(--sp-danger)] hover:bg-[var(--sp-danger)]/10 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              End Session
            </button>
          </div>
        </SidebarSection>
      )}

      {/* Participants */}
      <SidebarSection title={`Participants (${participants.length})`} defaultOpen>
        <div className="space-y-1">
          {participants.map((p) => {
            const isMe = p.name === myName;
            const bg = getAvatarBg(p.name);
            return (
              <div
                key={p.name}
                className={`flex items-center gap-2 p-2 rounded-md ${isMe ? 'bg-[var(--sp-primary-bg)]' : 'hover:bg-[var(--sp-surface)]'}`}
              >
                <div
                  className="w-8 h-8 rounded-full text-white text-xs flex items-center justify-center font-medium shrink-0"
                  style={{ backgroundColor: bg }}
                >
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isMe ? 'font-medium text-[var(--sp-fg)]' : 'text-[var(--sp-fg)]'}`}>
                    {p.name} {isMe && <span className="text-[10px] text-[var(--sp-primary)]">(you)</span>}
                  </div>
                  <div className="text-[10px] text-[var(--sp-muted)]">
                    {p.isFacilitator ? 'Facilitator' : p.isViewer ? 'Viewer' : p.hasVoted ? 'Voted' : 'Not voted'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.hasVoted && !p.isViewer && (
                    <span className="w-2 h-2 rounded-full bg-[var(--sp-success)]" title="Has voted" />
                  )}
                  <div
                    className={`w-2 h-2 rounded-full ${p.disconnectedAt ? 'bg-gray-400' : 'bg-[var(--sp-success)]'}`}
                    title={p.disconnectedAt ? 'Offline' : 'Online'}
                  />
                </div>
              </div>
            );
          })}
          {participants.length === 0 && (
            <div className="text-xs text-[var(--sp-muted)] text-center py-2">No participants yet</div>
          )}
        </div>
      </SidebarSection>
    </aside>
  );
}
