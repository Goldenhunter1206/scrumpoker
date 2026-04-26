import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
  SessionData,
  Vote,
  JiraConfig,
  JiraIssue,
  JiraBoard,
  ChatMessage,
  VotingResults,
} from '@shared/types/index.js';

type SessionState = {
  connected: boolean;
  myName: string;
  roomCode: string;
  isFacilitator: boolean;
  isViewer: boolean;
  sessionData: SessionData | null;
  myVote: Vote | null;
  votingRevealed: boolean;
  results: VotingResults | null;
  countdownActive: boolean;
  countdownSeconds: number;
  jiraConfig: JiraConfig | null;
  jiraBoards: JiraBoard[];
  jiraIssues: JiraIssue[];
  chatMessages: ChatMessage[];
  typingUsers: string[];
  notification: { message: string; type: 'success' | 'error' } | null;
};

const initialState: SessionState = {
  connected: false,
  myName: '',
  roomCode: '',
  isFacilitator: false,
  isViewer: false,
  sessionData: null,
  myVote: null,
  votingRevealed: false,
  results: null,
  countdownActive: false,
  countdownSeconds: 0,
  jiraConfig: null,
  jiraBoards: [],
  jiraIssues: [],
  chatMessages: [],
  typingUsers: [],
  notification: null,
};

type SessionAction =
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_MY_NAME'; payload: string }
  | { type: 'SET_SESSION_DATA'; payload: SessionData | null }
  | { type: 'SET_IS_FACILITATOR'; payload: boolean }
  | { type: 'SET_IS_VIEWER'; payload: boolean }
  | { type: 'SET_MY_VOTE'; payload: Vote | null }
  | { type: 'SET_VOTING_REVEALED'; payload: boolean }
  | { type: 'SET_RESULTS'; payload: VotingResults | null }
  | { type: 'SET_COUNTDOWN'; payload: { active: boolean; seconds: number } }
  | { type: 'SET_JIRA_CONFIG'; payload: JiraConfig | null }
  | { type: 'SET_JIRA_BOARDS'; payload: JiraBoard[] }
  | { type: 'SET_JIRA_ISSUES'; payload: JiraIssue[] }
  | { type: 'SET_CHAT_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_TYPING_USERS'; payload: string[] }
  | { type: 'SET_NOTIFICATION'; payload: { message: string; type: 'success' | 'error' } | null }
  | { type: 'RESET_VOTING' }
  | { type: 'CLEAR_NOTIFICATION' }
  | { type: 'RESET' };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    case 'SET_MY_NAME':
      return { ...state, myName: action.payload };
    case 'SET_SESSION_DATA':
      return {
        ...state,
        sessionData: action.payload,
        roomCode: action.payload?.id || state.roomCode,
        votingRevealed: action.payload?.votingRevealed || false,
      };
    case 'SET_IS_FACILITATOR':
      return { ...state, isFacilitator: action.payload };
    case 'SET_IS_VIEWER':
      return { ...state, isViewer: action.payload };
    case 'SET_MY_VOTE':
      return { ...state, myVote: action.payload };
    case 'SET_VOTING_REVEALED':
      return { ...state, votingRevealed: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload };
    case 'SET_COUNTDOWN':
      return {
        ...state,
        countdownActive: action.payload.active,
        countdownSeconds: action.payload.seconds,
      };
    case 'SET_JIRA_CONFIG':
      return { ...state, jiraConfig: action.payload };
    case 'SET_JIRA_BOARDS':
      return { ...state, jiraBoards: action.payload };
    case 'SET_JIRA_ISSUES':
      return { ...state, jiraIssues: action.payload };
    case 'SET_CHAT_MESSAGES':
      return { ...state, chatMessages: action.payload };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'SET_TYPING_USERS':
      return { ...state, typingUsers: action.payload };
    case 'SET_NOTIFICATION':
      return { ...state, notification: action.payload };
    case 'RESET_VOTING':
      return {
        ...state,
        myVote: null,
        votingRevealed: false,
        results: null,
      };
    case 'CLEAR_NOTIFICATION':
      return { ...state, notification: null };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  return (
    <SessionContext.Provider value={{ state, dispatch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}

// Convenience hooks
export function useSessionState() {
  const { state } = useSession();
  return state;
}

export function useSessionDispatch() {
  const { dispatch } = useSession();
  return dispatch;
}
