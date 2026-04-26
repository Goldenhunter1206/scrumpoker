import { useSessionState } from '../../context/SessionContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Sun, Moon } from 'lucide-react';

interface Props {
  isFacilitator: boolean;
  elapsedTime: string;
  jiraConnected: boolean;
  countdownActive: boolean;
  countdownSeconds: number;
  roomCode: string;
  onToggleSidebar: () => void;
}

export default function TopNav({
  isFacilitator,
  elapsedTime,
  jiraConnected,
  countdownActive,
  countdownSeconds,
  roomCode,
  onToggleSidebar,
}: Props) {
  const { sessionData } = useSessionState();
  const { isDark, toggle } = useDarkMode();

  return (
    <header className="h-14 bg-[var(--sp-card)] border-b border-[var(--sp-border)] flex items-center justify-between px-4 shrink-0">
      {/* Left: Logo + Role + Hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-[var(--sp-surface)] rounded-md transition-colors lg:hidden"
        >
          <svg className="w-5 h-5 text-[var(--sp-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--sp-primary)] rounded-md flex items-center justify-center">
            <span className="text-white text-lg">&#9824;</span>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold text-[var(--sp-fg)]">Scrum Poker</div>
            <div className="text-[10px] text-[var(--sp-muted)] -mt-0.5">
              {isFacilitator ? 'Facilitator' : 'Participant'}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Session Title */}
      <div className="flex-1 flex justify-center px-2">
        <h1 className="text-base font-semibold text-[var(--sp-fg)] truncate">
          {sessionData?.sessionName || 'Planning Session'}
        </h1>
      </div>

      {/* Right: Countdown + Timer + Jira + Room + Settings */}
      <div className="flex items-center gap-3">
        {countdownActive && (
          <div className="hidden md:flex items-center gap-1 px-2 py-1 text-sm font-medium text-[var(--sp-warn)] bg-[var(--sp-warn-bg)] rounded-md border border-[var(--sp-warn)]/30">
            <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{countdownSeconds}s</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-1.5 text-sm text-[var(--sp-muted)] bg-[var(--sp-surface)] px-3 py-1.5 rounded-md">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-mono">{elapsedTime}</span>
        </div>

        {roomCode && (
          <div className="hidden sm:block text-xs text-[var(--sp-muted)] bg-[var(--sp-surface)] px-2 py-1 rounded-md font-mono">
            {roomCode}
          </div>
        )}

        {jiraConnected && (
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-[var(--sp-success)] bg-[var(--sp-success-bg)] px-3 py-1.5 rounded-md border border-[var(--sp-success)]/30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <span>Jira</span>
          </div>
        )}

        <button className="p-2 hover:bg-[var(--sp-surface)] rounded-md transition-colors text-[var(--sp-muted)]" title="Settings" aria-label="Settings">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={toggle}
          className="p-2 hover:bg-[var(--sp-surface)] rounded-md transition-colors text-[var(--sp-muted)]"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
