import { useState } from 'react';
interface Props {
  onSessionCreated: (name: string) => void;
}

export default function SetupView({ onSessionCreated }: Props) {
  const [mode, setMode] = useState('create' as 'create' | 'join');
  const [facilitatorName, setFacilitatorName] = useState('');
  const [sessionName, setSessionName] = useState('Sprint Planning Session');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinRole, setJoinRole] = useState('participant' as 'participant' | 'viewer');

  return (
    <div className="max-w-2xl mx-auto pt-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[#172B4D] mb-2">Scrum Poker</h1>
        <p className="text-[#5E6C84]">Collaborative Story Point Estimation for Your Team</p>
      </div>

      <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm overflow-hidden">
        {/* Mode tabs */}
        <div className="flex border-b border-[#DFE1E6]">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'text-[#0052CC] border-b-2 border-[#0052CC]'
                : 'text-[#5E6C84] hover:text-[#172B4D]'
            }`}
          >
            Create New Session
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'text-[#0052CC] border-b-2 border-[#0052CC]'
                : 'text-[#5E6C84] hover:text-[#172B4D]'
            }`}
          >
            Join Existing Session
          </button>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'create' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-[#172B4D] mb-1">
                  Your Name (Facilitator)
                </label>
                <input
                  type="text"
                  value={facilitatorName}
                  onChange={(e) => setFacilitatorName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full h-10 px-3 border border-[#DFE1E6] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#172B4D] mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Sprint 12 Planning"
                  className="w-full h-10 px-3 border border-[#DFE1E6] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <button
                onClick={() => facilitatorName && onSessionCreated(sessionName)}
                disabled={!facilitatorName}
                className="w-full h-10 bg-[#0052CC] text-white rounded-md text-sm font-medium hover:bg-[#0747A6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Start Session
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-[#172B4D] mb-1">Your Name</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full h-10 px-3 border border-[#DFE1E6] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#172B4D] mb-1">Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit room code"
                  maxLength={6}
                  className="w-full h-10 px-3 border border-[#DFE1E6] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0052CC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#172B4D] mb-1">Join as</label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as 'participant' | 'viewer')}
                  className="w-full h-10 px-3 border border-[#DFE1E6] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0052CC]"
                >
                  <option value="participant">Participant (can vote)</option>
                  <option value="viewer">Viewer (watch only)</option>
                </select>
              </div>
              <button
                onClick={() => {}}
                disabled={!joinName || roomCode.length !== 6}
                className="w-full h-10 bg-[#0052CC] text-white rounded-md text-sm font-medium hover:bg-[#0747A6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Join Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
