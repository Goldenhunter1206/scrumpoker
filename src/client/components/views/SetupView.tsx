import { useState } from 'react';
import { useSessionState, useSessionDispatch } from '../../context/SessionContext';
import { useSocket } from '../../hooks/useSocket';

export default function SetupView() {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [facilitatorName, setFacilitatorName] = useState('');
  const [sessionName, setSessionName] = useState('Sprint Planning Session');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinRole, setJoinRole] = useState<'participant' | 'viewer'>('participant');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { connected } = useSessionState();
  const dispatch = useSessionDispatch();
  const { createSession, joinSession } = useSocket();

  const handleCreate = () => {
    if (!facilitatorName || !connected) return;
    setIsSubmitting(true);
    dispatch({ type: 'SET_MY_NAME', payload: facilitatorName });
    createSession(sessionName, facilitatorName);
  };

  const handleJoin = () => {
    if (!joinName || roomCode.length !== 6 || !connected) return;
    setIsSubmitting(true);
    dispatch({ type: 'SET_MY_NAME', payload: joinName });
    joinSession(roomCode, joinName, joinRole === 'viewer');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-10">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--sp-fg)] mb-2">Scrum Poker</h1>
        <p className="text-sm md:text-base text-[var(--sp-muted)]">Collaborative Story Point Estimation for Your Team</p>
      </div>

      {!connected && (
        <div className="mb-4 p-3 bg-[var(--sp-warn-bg)] border border-[var(--sp-warn)]/30 rounded-md text-sm text-[var(--sp-warn)] text-center">
          Connecting to server…
        </div>
      )}

      <div className="bg-[var(--sp-card)] rounded-xl border border-[var(--sp-border)] shadow-sm overflow-hidden">
        {/* Mode tabs */}
        <div className="flex border-b border-[var(--sp-border)]">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'text-[var(--sp-primary)] border-b-2 border-[#0052CC]'
                : 'text-[var(--sp-muted)] hover:text-[var(--sp-fg)]'
            }`}
          >
            Create New Session
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'text-[var(--sp-primary)] border-b-2 border-[#0052CC]'
                : 'text-[var(--sp-muted)] hover:text-[var(--sp-fg)]'
            }`}
          >
            Join Existing Session
          </button>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'create' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--sp-fg)] mb-1">
                  Your Name (Facilitator)
                </label>
                <input
                  type="text"
                  value={facilitatorName}
                  onChange={(e) => setFacilitatorName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full h-10 px-3 border border-[var(--sp-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--sp-fg)] mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Sprint 12 Planning"
                  className="w-full h-10 px-3 border border-[var(--sp-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!facilitatorName || !connected || isSubmitting}
                className="w-full h-10 bg-[var(--sp-primary)] text-white rounded-md text-sm font-medium hover:bg-[var(--sp-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Starting…' : 'Start Session'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--sp-fg)] mb-1">Your Name</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full h-10 px-3 border border-[var(--sp-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--sp-fg)] mb-1">Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit room code"
                  maxLength={6}
                  className="w-full h-10 px-3 border border-[var(--sp-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--sp-fg)] mb-1">Join as</label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as 'participant' | 'viewer')}
                  className="w-full h-10 px-3 border border-[var(--sp-border)] rounded-md text-sm bg-[var(--sp-card)] focus:outline-none focus:ring-2 focus:ring-[#0052CC]"
                >
                  <option value="participant">Participant (can vote)</option>
                  <option value="viewer">Viewer (watch only)</option>
                </select>
              </div>
              <button
                onClick={handleJoin}
                disabled={!joinName || roomCode.length !== 6 || !connected || isSubmitting}
                className="w-full h-10 bg-[var(--sp-primary)] text-white rounded-md text-sm font-medium hover:bg-[var(--sp-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Joining…' : 'Join Session'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
