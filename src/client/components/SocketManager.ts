import { io, Socket } from 'socket.io-client';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  JiraIssue,
  Vote,
  ChatMessage,
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
    });

    this.socket.on('jira-issues-loaded', data => {
      gameState.updateState({ jiraIssues: data.issues });
      this.emit('jiraIssuesLoaded', data.issues);
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
      });
      gameState.clearVote();

      this.emit('sessionUpdated', data.sessionData);
      this.emit('ticketSet', data.issue);
      showNotification(`Set Jira issue: ${data.issue.key}`, 'success');
      playSound('ticket');
    });

    this.socket.on('jira-updated', data => {
      showNotification(`Updated ${data.issueKey} with ${data.storyPoints} story points`, 'success');

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
      gameState.updateState({ votingRevealed: false });
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

    this.socket.on('discussion-timer-tick', (data) => {
      this.emit('discussionTimerTick', data);
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
  createSession(sessionName: string, facilitatorName: string): void {
    this.socket?.emit('create-session', { sessionName, facilitatorName });
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

  getJiraIssues(roomCode: string, boardId: string): void {
    this.socket?.emit('get-jira-issues', { roomCode, boardId });
  }

  setJiraIssue(roomCode: string, issue: JiraIssue): void {
    this.socket?.emit('set-jira-issue', { roomCode, issue });
  }

  finalizeEstimation(roomCode: string, finalEstimate: number): void {
    this.socket?.emit('finalize-estimation', { roomCode, finalEstimate });
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
