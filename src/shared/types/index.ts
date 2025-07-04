export interface Participant {
  name: string;
  isFacilitator: boolean;
  isViewer: boolean;
  joinedAt: Date;
  hasVoted: boolean;
  vote?: Vote;
  socketId?: string;
  disconnectedAt?: Date;
}

export interface JiraConfig {
  domain: string;
  boardId?: string;
  hasToken: boolean;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  priority: string;
  status: string;
  assignee: string;
  currentStoryPoints: number | null;
}

export interface SessionData {
  id: string;
  sessionName: string;
  facilitator: string;
  currentTicket: string;
  currentJiraIssue: JiraIssue | null;
  jiraConfig: JiraConfig | null;
  participants: Participant[];
  votingRevealed: boolean;
  totalVotes: number;
  discussionStartTime: Date | null;
  history: EstimationHistoryEntry[];
  aggregate: AggregateStats | null;
  chatMessages: ChatMessage[];
}

export interface EstimationHistoryEntry {
  issueKey?: string;
  summary?: string;
  ticket?: string;
  storyPoints?: number;
  originalEstimate?: number;
  votes?: Record<string, Vote>;
  stats?: VotingStats;
  timestamp: Date;
  discussionDuration?: number;
}

export interface AggregateStats {
  totalRounds: number;
  consensusRounds: number;
  perUser: Record<string, UserStats>;
}

export interface UserStats {
  sum: number;
  count: number;
  highCount: number;
  lowCount: number;
}

export interface VotingStats {
  consensus: Vote;
  average: number;
  min: number | null;
  max: number | null;
}

export interface VotingResults extends VotingStats {
  voteCounts: Record<string, number>;
  totalVotes: number;
}

export type Vote = number | '?' | '☕';

// Socket.IO Event Types
export interface ServerToClientEvents {
  'session-created': (data: {
    success: boolean;
    roomCode: string;
    sessionData: SessionData;
    sessionToken: string;
  }) => void;
  'join-success': (data: {
    roomCode: string;
    sessionData: SessionData;
    yourVote: Vote | null;
    sessionToken: string;
  }) => void;
  'join-failed': (data: { message: string }) => void;
  'participant-joined': (data: { participantName: string; sessionData: SessionData }) => void;
  'participant-left': (data: { participantName: string; sessionData: SessionData }) => void;
  'participant-removed': (data: { participantName: string; sessionData: SessionData }) => void;
  'participant-role-changed': (data: {
    participantName: string;
    newRole: string;
    sessionData: SessionData;
  }) => void;
  'facilitator-changed': (data: {
    oldFacilitatorName: string;
    newFacilitatorName: string;
    sessionData: SessionData;
  }) => void;
  'removed-from-session': (data: { message: string }) => void;
  'jira-config-success': (data: { boards: JiraBoard[]; sessionData: SessionData }) => void;
  'jira-config-failed': (data: { message: string }) => void;
  'jira-issues-loaded': (data: { issues: JiraIssue[] }) => void;
  'jira-issues-failed': (data: { message: string }) => void;
  'jira-issue-set': (data: { issue: JiraIssue; sessionData: SessionData }) => void;
  'jira-updated': (data: {
    issueKey: string;
    storyPoints: number;
    originalEstimate: number;
    sessionData: SessionData;
  }) => void;
  'jira-update-failed': (data: { message: string }) => void;
  'ticket-set': (data: { ticket: string; sessionData: SessionData }) => void;
  'vote-submitted': (data: { participantName: string; sessionData: SessionData }) => void;
  'votes-revealed': (data: { sessionData: SessionData; results: VotingResults }) => void;
  'voting-reset': (data: { sessionData: SessionData }) => void;
  'session-ended': (data: { message: string }) => void;
  'countdown-started': (data: { duration: number }) => void;
  'countdown-tick': (data: { secondsLeft: number; totalDuration: number }) => void;
  'countdown-finished': (data: { sessionData: SessionData }) => void;
  'discussion-timer-tick': (data: { discussionDuration: number }) => void;
  'server-shutdown': (data: { message: string }) => void;
  chatMessage: (message: ChatMessage) => void;
  typingUpdate: (typingUsers: string[]) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'create-session': (data: { sessionName: string; facilitatorName: string }) => void;
  'join-session': (data: {
    roomCode: string;
    participantName: string;
    asViewer?: boolean;
    sessionToken?: string;
  }) => void;
  'configure-jira': (data: {
    roomCode: string;
    domain: string;
    email: string;
    token: string;
    projectKey?: string;
  }) => void;
  'get-jira-issues': (data: { roomCode: string; boardId: string }) => void;
  'set-jira-issue': (data: { roomCode: string; issue: JiraIssue }) => void;
  'finalize-estimation': (data: { roomCode: string; finalEstimate: number }) => void;
  'set-ticket': (data: { roomCode: string; ticket: string }) => void;
  'submit-vote': (data: { roomCode: string; vote: Vote }) => void;
  'moderate-participant': (data: { roomCode: string; targetName: string; action: string }) => void;
  'set-facilitator-viewer': (data: { roomCode: string; isViewer: boolean }) => void;
  'reveal-votes': (data: { roomCode: string }) => void;
  'reset-voting': (data: { roomCode: string }) => void;
  'start-countdown': (data: { roomCode: string; duration: number }) => void;
  'end-session': (data: { roomCode: string }) => void;
  'send-chat-message': (data: { roomCode: string; message: string }) => void;
  'typing-indicator': (data: { roomCode: string; userName: string; isTyping: boolean }) => void;
}

export interface JiraBoard {
  id: string;
  name: string;
}

export interface GameState {
  roomCode: string;
  sessionName: string;
  currentTicket: string;
  currentJiraIssue: JiraIssue | null;
  jiraConfig: JiraConfig | null;
  jiraIssues: JiraIssue[];
  selectedIssue: JiraIssue | null;
  participants: Participant[];
  isFacilitator: boolean;
  isViewer: boolean;
  myName: string;
  votingRevealed: boolean;
  myVote: Vote | null;
  moderationTarget: string | null;
  countdownActive: boolean;
  countdownSeconds: number;
  history: EstimationHistoryEntry[];
  aggregate: AggregateStats | null;
  chatMessages: ChatMessage[];
  typingUsers: string[];
}

// Chat-related types
export interface ChatMessage {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  type: 'message' | 'system';
}

export interface TypingIndicator {
  roomCode: string;
  userName: string;
  isTyping: boolean;
}

export interface NotificationData {
  message: string;
  type: 'success' | 'error';
}

export interface SavedSessionInfo {
  roomCode: string;
  name: string;
  isViewer: boolean;
  sessionToken?: string;
}

export interface SavedJiraCredentials {
  domain: string;
  email: string;
  token: string;
  projectKey: string;
}
