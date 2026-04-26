import { useState, useRef, useEffect } from 'react';
import { useSessionState } from '../../context/SessionContext';
import { useSocket } from '../../hooks/useSocket';
import { Send } from 'lucide-react';

export default function ChatPanel() {
  const { chatMessages, myName, typingUsers, sessionData } = useSessionState();
  const { sendChatMessage, sendTypingIndicator } = useSocket();
  const [msg, setMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const roomCode = sessionData?.id || '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleSend = () => {
    if (!msg.trim() || !roomCode) return;
    sendChatMessage(roomCode, msg.trim());
    setMsg('');
    sendTypingIndicator(roomCode, myName, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (v: string) => {
    setMsg(v);
    if (roomCode) {
      sendTypingIndicator(roomCode, myName, v.length > 0);
    }
  };

  const typing = typingUsers.filter((u) => u !== myName);

  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm flex flex-col h-96">
      <div className="px-4 py-3 border-b border-[#DFE1E6] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#172B4D]">Team Chat</h3>
        <span className="text-xs text-[#5E6C84]">{chatMessages.length} messages</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-xs text-[#5E6C84] py-8">No messages yet. Start the conversation!</div>
        )}
        {chatMessages.map((m) => {
          const isMe = m.author === myName;
          const isSystem = m.type === 'system';
          if (isSystem) {
            return (
              <div key={m.id} className="text-center text-[10px] text-[#5E6C84] py-1">
                {m.content}
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                isMe
                  ? 'bg-[#0052CC] text-white rounded-br-none'
                  : 'bg-[#F4F5F7] text-[#172B4D] rounded-bl-none'
              }`}>
                <div className={`text-[10px] mb-0.5 ${isMe ? 'text-blue-100' : 'text-[#5E6C84]'}`}>
                  {m.author}
                </div>
                <div>{m.content}</div>
              </div>
            </div>
          );
        })}
        {typing.length > 0 && (
          <div className="text-xs text-[#5E6C84] italic">
            {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-[#DFE1E6] flex items-center gap-2">
        <input
          type="text"
          value={msg}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="flex-1 h-9 px-3 text-sm border border-[#DFE1E6] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0052CC]"
        />
        <button
          onClick={handleSend}
          disabled={!msg.trim()}
          className="shrink-0 w-9 h-9 bg-[#0052CC] text-white rounded-md flex items-center justify-center hover:bg-[#0747A6] disabled:opacity-40 transition-colors"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
