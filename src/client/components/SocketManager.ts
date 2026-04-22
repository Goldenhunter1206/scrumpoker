import { io, Socket } from 'socket.io-client';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  JiraIssue,
  Vote,
  ChatMessage,
  SprintGoalVote,
} from '@shared/types/index.js';
import { gameState } from './GameState.js';
import { updateConnectionStatus, showNotification, enableButtons } from '../utils/ui.js';
import { saveActiveSession, loadActiveSessionInfo, clearActiveSession } from '../utils/storage.js';
import { playSound } from '../utils/sound.js';

export class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();

  connect(): void {
    this.socket = io();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      updateConnectionStatus(true);
      this.emit('connected');

      // Auto-rejoin if we have saved session info
      const saved = loadActiveSessionInfo();
      if (saved && !gameState.getState().roomCode) {
        gameState.updateState({
          myName: saved.name,
          isViewer: saved.isViewer,
        });

        this.socket!.emit('join-session', {
          roomCode: saved.roomCode,
          participantName: saved.name,
          asViewer: saved.isViewer,
          sessionToken: saved.sessionToken,
        });
      }
    });

    this.socket.on('disconnect', () => {
      updateConnectionStatus(false);
      this.emit('disconnected');
    });

    // Session creation and joining
    this.socket.on('session-created', data => {
      if (data.success) {
        const state = gameState.getState();
        gameState.updateState({
          roomCode: data.roomCode,
          isFacilitator: true,
        });

        saveActiveSession({
          roomCode: data.roomCode,
          name: state.myName,
          isViewer: false,
          sessionToken: data.sessionToken,
        });

        this.emit('sessionCreated', data.sessionData);
        showNotification('Session created successfully!', 'success');
      } else {
        showNotification('Failed to create session', 'error');
      }
    });

    this.socket.on('join-success', data => {
      const state = gameState.getState();
      const myParticipant = data.sessionData.participants.find(p => p.name === state.myName);

      gameState.updateState({
        roomCode: data.roomCode,
        isFacilitator: !!(myParticipant && myParticipant.isFacilitator),
        isViewer: myParticipant ? myParticipant.isViewer : false,
      });

      if (data.yourVote !== null && data.yourVote !== undefined) {
        gameState.setMyVote(data.yourVote);
      }

      saveActiveSession({
        roomCode: data.roomCode,
        name: state.myName,
        isViewer: gameState.getState().isViewer,
        sessionToken: data.sessionToken,
      });

      this.emit('joinSuccess', data.sessionData);
      showNotification('Joined session successfully!', 'success');
    });

    this.socket.on('join-failed', data => {
      showNotification(data.message, 'error');
      enableButtons();
      clearActiveSession();
    });

    // Real-time updates
    this.socket.on('participant-joined', data => {
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`${data.participantName} joined the session`, 'success');
    });

    this.socket.on('participant-left', data => {
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`${data.participantName} left the session`, 'error');
    });

    this.socket.on('participant-removed', data => {
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`${data.participantName} was removed from the session`, 'error');
    });

    this.socket.on('participant-role-changed', data => {
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`${data.participantName} is now a ${data.newRole}`, 'success');

      const state = gameState.getState();
      if (data.participantName === state.myName) {
        gameState.updateState({ isViewer: data.newRole === 'viewer' });
        this.emit('roleChanged', data.newRole);
      }
    });

    this.socket.on('facilitator-changed', data => {
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`${data.newFacilitatorName} is now the facilitator`, 'success');

      const state = gameState.getState();
      if (data.newFacilitatorName === state.myName) {
        gameState.updateState({ isFacilitator: true, isViewer: false });
        this.emit('roleChanged', 'facilitator');
      } else if (data.oldFacilitatorName === state.myName) {
        gameState.updateState({ isFacilitator: false });
        this.emit('roleChanged', 'participant');
      }
    });

    this.socket.on('removed-from-session', data => {
      showNotification(data.message, 'error');
      clearActiveSession();
      setTimeout(() => location.reload(), 3000);
    });

    // Jira integration
    this.socket.on('jira-config-success', data => {
      gameState.updateState({ jiraConfig: data.sessionData.jiraConfig });
      this.emit('jiraConfigured', { boards: data.boards, sessionData: data.sessionData });
      showNotification('Successfully connected to Jira!', 'success');
    });

    this.socket.on('jira-config-failed', data => {
      showNotification(data.message, 'error');
      enableButtons();
      this.emit('jiraConfigFailed', data);
    });

    this.socket.on('jira-issues-loaded', data => {
      gameState.updateState({
        jiraIssues: data.issues,
        planning: data.sessionData.planning,
      });
      this.emit('jiraIssuesLoaded', data.issues);
      this.emit('sessionUpdated', data.sessionData);
      showNotification(`Loaded ${data.issues.length} issues from Jira`, 'success');
    });

    this.socket.on('jira-issues-failed', data => {
      showNotification(data.message, 'error');
    });

    this.socket.on('jira-issue-set', data => {
      gameState.updateState({
        currentJiraIssue: data.issue,
        currentTicket: `${data.issue.key}: ${data.issue.summary}`,
        votingRevealed: false,
        planning: data.sessionData.planning,
      });
      gameState.clearVote();

      this.emit('sessionUpdated', data.sessionData);
      this.emit('ticketSet', data.issue);
      showNotification(`Set Jira issue: ${data.issue.key}`, 'success');
      playSound('ticket');
    });

    this.socket.on('jira-updated', data => {
      const sprintMsg =
        data.movedToSprint && data.sprintName ? ` and moved to ${data.sprintName}` : '';
      showNotification(
        `Updated ${data.issueKey} with ${data.storyPoints} story points${sprintMsg}`,
        'success'
      );

      // Update the cached Jira issues to reflect the new story points
      const state = gameState.getState();
      const updatedIssues = state.jiraIssues.map(issue =>
        issue.key === data.issueKey ? { ...issue, currentStoryPoints: data.storyPoints } : issue
      );

      gameState.updateState({
        currentTicket: '',
        currentJiraIssue: null,
        votingRevealed: false,
        jiraIssues: updatedIssues,
        planning: data.sessionData.planning,
      });
      gameState.clearVote();

      this.emit('sessionUpdated', data.sessionData);
      this.emit('jiraUpdated', data);
    });

    this.socket.on('jira-update-failed', data => {
      showNotification(data.message, 'error');
      this.emit('jiraUpdateFailed');
    });

    this.socket.on('ticket-set', data => {
      gameState.updateState({
        currentTicket: data.ticket,
        votingRevealed: false,
        planning: data.sessionData.planning,
      });
      gameState.clearVote();

      this.emit('sessionUpdated', data.sessionData);
      this.emit('ticketSet', data.ticket);
      showNotification('New ticket set for estimation', 'success');
      playSound('ticket');
    });

    // Voting
    this.socket.on('vote-submitted', data => {
      this.emit('sessionUpdated', data.sessionData);
      this.emit('voteSubmitted', data.participantName);
    });

    this.socket.on('votes-revealed', data => {
      this.emit('sessionUpdated', data.sessionData);
      this.emit('votesRevealed', data.results);
      showNotification('Votes revealed!', 'success');
      playSound('reveal');
    });

    this.socket.on('voting-reset', data => {
      gameState.updateState({ votingRevealed: false, planning: data.sessionData.planning });
      gameState.clearVote();

      this.emit('sessionUpdated', data.sessionData);
      this.emit('votingReset');
      showNotification('New voting round started', 'success');
    });

    // Countdown
    this.socket.on('countdown-started', data => {
      gameState.setCountdown(true, data.duration);
      this.emit('countdownStarted', data.duration);
      showNotification(`${data.duration} second countdown started!`, 'success');
      playSound('countdown');
    });

    this.socket.on('countdown-tick', data => {
      gameState.setCountdown(true, data.secondsLeft);
      this.emit('countdownTick', {
        secondsLeft: data.secondsLeft,
        totalDuration: data.totalDuration,
      });
    });

    this.socket.on('countdown-finished', data => {
      gameState.setCountdown(false, 0);
      this.emit('sessionUpdated', data.sessionData);
      this.emit('countdownFinished');
      showNotification("Time's up! Votes revealed automatically.", 'success');
    });

    // Session management
    this.socket.on('session-ended', data => {
      showNotification(data.message, 'error');
      clearActiveSession();
      setTimeout(() => location.reload(), 3000);
    });

    this.socket.on('error', data => {
      showNotification(data.message, 'error');
      enableButtons();
    });

    // Chat handlers
    this.socket.on('chatMessage', (message: ChatMessage) => {
      gameState.addChatMessage(message);
      this.emit('chatMessage', message);
      playSound('chat');
    });

    this.socket.on('typingUpdate', (typingUsers: string[]) => {
      gameState.setTypingUsers(typingUsers);
      this.emit('typingUpdate', typingUsers);
    });

    this.socket.on('discussion-timer-tick', data => {
      this.emit('discussionTimerTick', data);
    });

    this.socket.on('jira-issue-details-loaded', data => {
      this.emit('jiraIssueDetailsLoaded', data);
    });

    this.socket.on('jira-issue-details-failed', data => {
      this.emit('jiraIssueDetailsFailed', data);
    });

    this.socket.on('planning-sprints-loaded', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningSprintsLoaded', data.sprints);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-goal-updated', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningGoalUpdated', data.sessionData.planning);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-goal-vote-submitted', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningGoalVoteSubmitted', data);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-goal-revealed', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningGoalRevealed', data.sessionData.planning);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-capacity-submitted', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningCapacitySubmitted', data);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-stage-advanced', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningStageAdvanced', data.stage);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-suggestion-added', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningSuggestionAdded', data.suggestion);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-suggestion-reviewed', data => {
      gameState.updateState({ planning: data.sessionData.planning });
      this.emit('planningSuggestionReviewed', data);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('planning-approved-issue-selected', data => {
      gameState.updateState({
        currentJiraIssue: data.issue,
        currentTicket: `${data.issue.key}: ${data.issue.summary}`,
        votingRevealed: false,
        planning: data.sessionData.planning,
      });
      gameState.clearVote();
      this.emit('planningApprovedIssueSelected', data);
      this.emit('sessionUpdated', data.sessionData);
    });

    this.socket.on('confluence-parent-search-results', data => {
      this.emit('confluenceParentSearchResults', data);
    });

    this.socket.on('confluence-page-created', data => {
      showNotification(`Created Confluence page: ${data.title}`, 'success');
      this.emit('confluencePageCreated', data);
    });

    this.socket.on('confluence-page-failed', data => {
      showNotification(data.message, 'error');
      this.emit('confluencePageFailed', data);
    });
  }

  // Event system
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  // Socket.IO methods
  createSession(sessionName: string, facilitatorName: string, planningFlowEnabled = false): void {
    this.socket?.emit('create-session', { sessionName, facilitatorName, planningFlowEnabled });
  }

  joinSession(roomCode: string, participantName: string, asViewer = false): void {
    this.socket?.emit('join-session', { roomCode, participantName, asViewer });
  }

  configureJira(
    roomCode: string,
    domain: string,
    email: string,
    token: string,
    projectKey?: string
  ): void {
    this.socket?.emit('configure-jira', { roomCode, domain, email, token, projectKey });
  }

  getJiraIssues(roomCode: string, boardId: string, boardName?: string): void {
    this.socket?.emit('get-jira-issues', { roomCode, boardId, boardName });
  }

  getPlanningSprints(roomCode: string, boardId: string): void {
    this.socket?.emit('get-planning-sprints', { roomCode, boardId });
  }

  selectPlanningSprint(
    roomCode: string,
    sprintId?: number,
    sprintName?: string,
    sprintLengthDays?: number | null
  ): void {
    this.socket?.emit('select-planning-sprint', {
      roomCode,
      sprintId,
      sprintName,
      sprintLengthDays,
    });
  }

  updatePlanningGoal(roomCode: string, goalDraft: string): void {
    this.socket?.emit('update-planning-goal', { roomCode, goalDraft });
  }

  submitGoalVote(roomCode: string, vote: SprintGoalVote): void {
    this.socket?.emit('submit-goal-vote', { roomCode, vote });
  }

  revealGoalVotes(roomCode: string): void {
    this.socket?.emit('reveal-goal-votes', { roomCode });
  }

  resetGoalVoting(roomCode: string): void {
    this.socket?.emit('reset-goal-voting', { roomCode });
  }

  finalizeGoal(roomCode: string): void {
    this.socket?.emit('finalize-goal', { roomCode });
  }

  submitCapacity(roomCode: string, capacityDays: number): void {
    this.socket?.emit('submit-capacity', { roomCode, capacityDays });
  }

  skipPlanningStage(roomCode: string, stage: 'goal' | 'capacity'): void {
    this.socket?.emit('skip-planning-stage', { roomCode, stage });
  }

  suggestJiraIssue(roomCode: string, issue: JiraIssue): void {
    this.socket?.emit('suggest-jira-issue', { roomCode, issue });
  }

  reviewSuggestion(roomCode: string, suggestionId: string, action: 'approve' | 'reject'): void {
    this.socket?.emit('review-suggestion', { roomCode, suggestionId, action });
  }

  selectApprovedIssue(roomCode: string, suggestionId: string): void {
    this.socket?.emit('select-approved-issue', { roomCode, suggestionId });
  }

  searchConfluenceParents(roomCode: string, query: string): void {
    this.socket?.emit('search-confluence-parents', { roomCode, query });
  }

  createConfluencePage(roomCode: string, parentPageId: string | undefined, title: string): void {
    this.socket?.emit('create-confluence-page', { roomCode, parentPageId, title });
  }

  getJiraIssueDetails(roomCode: string, issueKey: string): void {
    console.log('SocketManager: Emitting get-jira-issue-details', { roomCode, issueKey });
    console.log('Socket connected:', this.socket?.connected);
    this.socket?.emit('get-jira-issue-details', { roomCode, issueKey });
    console.log('SocketManager: Event emitted');
  }

  setJiraIssue(roomCode: string, issue: JiraIssue): void {
    this.socket?.emit('set-jira-issue', { roomCode, issue });
  }

  finalizeEstimation(roomCode: string, finalEstimate: number, moveToSprint = false): void {
    this.socket?.emit('finalize-estimation', { roomCode, finalEstimate, moveToSprint });
  }

  setTicket(roomCode: string, ticket: string): void {
    this.socket?.emit('set-ticket', { roomCode, ticket });
  }

  submitVote(roomCode: string, vote: Vote): void {
    this.socket?.emit('submit-vote', { roomCode, vote });
  }

  moderateParticipant(roomCode: string, targetName: string, action: string): void {
    this.socket?.emit('moderate-participant', { roomCode, targetName, action });
  }

  setFacilitatorViewer(roomCode: string, isViewer: boolean): void {
    this.socket?.emit('set-facilitator-viewer', { roomCode, isViewer });
  }

  revealVotes(roomCode: string): void {
    this.socket?.emit('reveal-votes', { roomCode });
  }

  resetVoting(roomCode: string): void {
    this.socket?.emit('reset-voting', { roomCode });
  }

  startCountdown(roomCode: string, duration: number): void {
    this.socket?.emit('start-countdown', { roomCode, duration });
  }

  endSession(roomCode: string): void {
    this.socket?.emit('end-session', { roomCode });
  }

  sendChatMessage(roomCode: string, message: string): void {
    this.socket?.emit('send-chat-message', { roomCode, message });
  }

  sendTypingIndicator(roomCode: string, userName: string, isTyping: boolean): void {
    this.socket?.emit('typing-indicator', { roomCode, userName, isTyping });
  }
}

export const socketManager = new SocketManager();
