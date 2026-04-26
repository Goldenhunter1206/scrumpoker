import React, { useState } from 'react';
import TopNav from './components/layout/TopNav';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
import { ConnectionStatus } from './components/layout/ConnectionStatus';

export type AppView = 'setup' | 'session';

export default function App() {
  const [view, setView] = useState('setup' as AppView);
  const [connected, setConnected] = useState(false);
  const [sessionName, setSessionName] = useState('');

  return (
    <div className="h-screen flex flex-col bg-[#F4F5F7] text-[#172B4D]" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
      <ConnectionStatus connected={connected} />

      {view === 'session' && (
        <TopNav
          sessionName={sessionName}
          isFacilitator={true}
          elapsedTime="00:42:18"
          jiraConnected={false}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {view === 'session' && <Sidebar />}

        <main className="flex-1 overflow-y-auto p-6">
          <MainContent view={view} onViewChange={setView} onSessionCreated={setSessionName} />
        </main>
      </div>
    </div>
  );
}
