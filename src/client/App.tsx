import { useState, useEffect } from 'react';
import { SessionProvider, useSessionState } from './context/SessionContext';
import { useSocket } from './hooks/useSocket';
import TopNav from './components/layout/TopNav';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
import NotificationToast from './components/layout/NotificationToast';
import { ConnectionStatus } from './components/layout/ConnectionStatus';

function AppInner() {
  const {
    connected,
    sessionData,
    roomCode,
    isFacilitator,
    countdownActive,
    countdownSeconds,
  } = useSessionState();

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sidebarOpen') !== 'false'; } catch { return true; }
  });

  const hasSession = !!sessionData;

  const elapsed = useElapsed(sessionData?.discussionStartTime);

  useSocket();

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    try { localStorage.setItem('sidebarOpen', String(next)); } catch {}
  };

  return (
    <div
      className="h-screen flex flex-col bg-[var(--sp-surface)] text-[var(--sp-fg)]"
      style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}
    >
      <ConnectionStatus connected={connected} />
      <NotificationToast />

      {hasSession && (
        <TopNav
          isFacilitator={isFacilitator}
          elapsedTime={elapsed}
          jiraConnected={!!sessionData?.jiraConfig}
          countdownActive={countdownActive}
          countdownSeconds={countdownSeconds}
          roomCode={roomCode}
          onToggleSidebar={toggleSidebar}
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop sidebar */}
        {hasSession && sidebarOpen && (
          <div className="hidden lg:block">
            <Sidebar />
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <MainContent view={hasSession ? 'session' : 'setup'} />
        </main>

        {/* Mobile sidebar overlay + backdrop */}
        {hasSession && sidebarOpen && (
          <>
            <div className="lg:hidden fixed inset-y-0 left-0 z-40">
              <div className="h-full bg-[var(--sp-card)] border-r border-[var(--sp-border)] shadow-xl w-[280px]">
                <Sidebar />
              </div>
            </div>
            <div
              className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </div>
  );
}

function useElapsed(start: Date | string | null | undefined): string {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (!start) { setElapsed('00:00:00'); return; }
    const startDate = typeof start === 'string' ? new Date(start) : start;
    if (isNaN(startDate.getTime())) { setElapsed('00:00:00'); return; }
    const tick = () => {
      const diff = Math.max(0, Date.now() - startDate.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [start]);

  return elapsed;
}

export default function App() {
  return (
    <SessionProvider>
      <AppInner />
    </SessionProvider>
  );
}
