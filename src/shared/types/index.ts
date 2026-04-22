export type Vote = number | '?' | '☕' | '-';
export type PlanningStage = 'setup' | 'goal' | 'capacity' | 'estimation';
export type SprintGoalVote = 'approve' | 'reject';
export type PlanningSuggestionStatus = 'pending' | 'approved' | 'rejected';

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
  sprintId?: number;
  sprintName?: string;
  sprintState?: string;
}

export interface PlanningSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface PlanningSuggestion {
  id: string;
  issue: JiraIssue;
  suggestedBy: string;
  status: PlanningSuggestionStatus;
  createdAt: Date;
}

export interface AttendanceEntry {
  name: string;
  firstJoinedAt: Date;
}

export interface PlanningSummary {
  eligibleVoterCount: number;
  goalVotesSubmitted: number;
  goalApproveCount: number;
  goalRejectCount: number;
  capacitySubmittedCount: number;
  totalCapacityDays: number;
  averageCapacityDays: number;
  pendingSuggestionCount: number;
  approvedSuggestionCount: number;
}

export interface PlanningState {
  enabled: boolean;
  stage: PlanningStage;
  boardId?: string;
  boardName?: string;
  selectedSprintId?: number;
  selectedSprintName?: string;
  selectedSprintState?: string;
  selectedSprintStartDate?: string;
  selectedSprintEndDate?: string;
  availableSprints: PlanningSprint[];
  sprintLengthDays: number | null;
  goalDraft: string;
  finalGoal: string;
  goalVoteRevealed: boolean;
  goalVotes: Record<string, SprintGoalVote>;
  goalSkipped: boolean;
  capacityEntries: Record<string, number>;
  capacitySkipped: boolean;
  suggestionQueue: PlanningSuggestion[];
  approvedQueue: PlanningSuggestion[];
  summary: PlanningSummary;
}

export interface SessionReportGoal {
  text: string;
  status: 'finalized' | 'draft' | 'skipped' | 'not-set';
}

export interface SessionReportCapacityMember {
  name: string;
  availabilityDays: number | null;
}

export interface SessionReportCapacity {
  skipped: boolean;
  sprintLengthDays: number | null;
  members: SessionReportCapacityMember[];
  totalDays: number;
  averageDays: number | null;
}

export interface SessionReportTicket {
  issueKey?: string;
  ticketLabel: string;
  summary: string;
  link?: string;
  roundCount: number;
  finalVotes: Record<string, Vote>;
  consensus: Vote | null;
  average: number | null;
  min: number | null;
  max: number | null;
  finalEstimate: number | null;
  lastDiscussedAt: Date;
}

export interface SessionReport {
  title: string;
  sessionName: string;
  facilitator: string;
  generatedAt: Date;
  planningEnabled: boolean;
  sprintName?: string;
  attendees: AttendanceEntry[];
  goal: SessionReportGoal | null;
  capacity: SessionReportCapacity | null;
  tickets: SessionReportTicket[];
}

export interface ConfluencePageSearchResult {
  id: string;
  title: string;
  spaceName?: string;
  url?: string;
}

export interface SessionData {
  id: string;
  sessionName: string;
  facilitator: string;
  currentTicket: string;
  currentJiraIssue: JiraIssue | null;
  jiraConfig: JiraConfig | null;
  jiraIssues: JiraIssue[];
  planning: PlanningState;
  participants: Participant[];
  attendance: AttendanceEntry[];
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
  lowestVoter?: string;
  highestVoter?: string;
}

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
  'jira-issues-loaded': (data: { issues: JiraIssue[]; sessionData: SessionData }) => void;
  'jira-issues-failed': (data: { message: string }) => void;
  'jira-issue-details-loaded': (data: { issueDetails: any }) => void;
  'jira-issue-details-failed': (data: { message: string }) => void;
  'jira-issue-set': (data: { issue: JiraIssue; sessionData: SessionData }) => void;
  'jira-updated': (data: {
    issueKey: string;
    storyPoints: number;
    originalEstimate: number;
    movedToSprint?: boolean;
    sprintName?: string;
    sessionData: SessionData;
  }) => void;
  'jira-update-failed': (data: { message: string }) => void;
  'ticket-set': (data: { ticket: string; sessionData: SessionData }) => void;
  'vote-submitted': (data: { participantName: string; sessionData: SessionData }) => void;
  'votes-revealed': (data: { sessionData: SessionData; results: VotingResults }) => void;
  'voting-reset': (data: { sessionData: SessionData }) => void;
  'planning-sprints-loaded': (data: {
    sprints: PlanningSprint[];
    sessionData: SessionData;
  }) => void;
  'planning-goal-updated': (data: { sessionData: SessionData }) => void;
  'planning-goal-vote-submitted': (data: {
    participantName: string;
    sessionData: SessionData;
  }) => void;
  'planning-goal-revealed': (data: { sessionData: SessionData }) => void;
  'planning-capacity-submitted': (data: {
    participantName: string;
    sessionData: SessionData;
  }) => void;
  'planning-stage-advanced': (data: { stage: PlanningStage; sessionData: SessionData }) => void;
  'planning-suggestion-added': (data: {
    suggestion: PlanningSuggestion;
    sessionData: SessionData;
  }) => void;
  'planning-suggestion-reviewed': (data: {
    suggestionId: string;
    action: 'approved' | 'rejected';
    sessionData: SessionData;
  }) => void;
  'planning-approved-issue-selected': (data: {
    suggestionId: string;
    issue: JiraIssue;
    sessionData: SessionData;
  }) => void;
  'confluence-parent-search-results': (data: {
    query: string;
    results: ConfluencePageSearchResult[];
  }) => void;
  'confluence-page-created': (data: { pageId: string; title: string; url?: string }) => void;
  'confluence-page-failed': (data: { message: string }) => void;
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
  'create-session': (data: {
    sessionName: string;
    facilitatorName: string;
    planningFlowEnabled?: boolean;
  }) => void;
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
  'get-jira-issues': (data: { roomCode: string; boardId: string; boardName?: string }) => void;
  'get-planning-sprints': (data: { roomCode: string; boardId: string }) => void;
  'select-planning-sprint': (data: {
    roomCode: string;
    sprintId?: number;
    sprintName?: string;
    sprintLengthDays?: number | null;
  }) => void;
  'update-planning-goal': (data: { roomCode: string; goalDraft: string }) => void;
  'submit-goal-vote': (data: { roomCode: string; vote: SprintGoalVote }) => void;
  'reveal-goal-votes': (data: { roomCode: string }) => void;
  'reset-goal-voting': (data: { roomCode: string }) => void;
  'finalize-goal': (data: { roomCode: string }) => void;
  'submit-capacity': (data: { roomCode: string; capacityDays: number }) => void;
  'skip-planning-stage': (data: { roomCode: string; stage: 'goal' | 'capacity' }) => void;
  'suggest-jira-issue': (data: { roomCode: string; issue: JiraIssue }) => void;
  'review-suggestion': (data: {
    roomCode: string;
    suggestionId: string;
    action: 'approve' | 'reject';
  }) => void;
  'select-approved-issue': (data: { roomCode: string; suggestionId: string }) => void;
  'search-confluence-parents': (data: { roomCode: string; query: string }) => void;
  'create-confluence-page': (data: {
    roomCode: string;
    parentPageId?: string;
    title: string;
  }) => void;
  'get-jira-issue-details': (data: { roomCode: string; issueKey: string }) => void;
  'set-jira-issue': (data: { roomCode: string; issue: JiraIssue }) => void;
  'finalize-estimation': (data: {
    roomCode: string;
    finalEstimate: number;
    moveToSprint?: boolean;
  }) => void;
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
  planning: PlanningState;
  selectedIssue: JiraIssue | null;
  participants: Participant[];
  attendance: AttendanceEntry[];
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
