import { GameState, Vote, ChatMessage } from '@shared/types/index.js';

export class GameStateManager {
  private state: GameState;

  constructor() {
    this.state = {
      roomCode: '',
      sessionName: '',
      currentTicket: '',
      currentJiraIssue: null,
      jiraConfig: null,
      jiraIssues: [],
      selectedIssue: null,
      participants: [],
      isFacilitator: false,
      isViewer: false,
      myName: '',
      votingRevealed: false,
      myVote: null,
      moderationTarget: null,
      countdownActive: false,
      countdownSeconds: 0,
      history: [],
      aggregate: null,
      chatMessages: [],
      typingUsers: [],
    };
  }

  getState(): GameState {
    return this.state;
  }

  updateState(updates: Partial<GameState>): void {
    // Optimized state update to avoid full object recreation
    // Only update changed properties to maintain object references
    Object.keys(updates).forEach(key => {
      const typedKey = key as keyof GameState;
      if (this.state[typedKey] !== updates[typedKey]) {
        (this.state as any)[typedKey] = updates[typedKey];
      }
    });
  }

  setMyVote(vote: Vote | null): void {
    this.state.myVote = vote;
  }

  clearVote(): void {
    this.state.myVote = null;
  }

  setCountdown(active: boolean, seconds: number = 0): void {
    this.state.countdownActive = active;
    this.state.countdownSeconds = seconds;
  }

  setModerationTarget(target: string | null): void {
    this.state.moderationTarget = target;
  }

  addChatMessage(message: ChatMessage): void {
    this.state.chatMessages.push(message);
  }

  setChatMessages(messages: ChatMessage[]): void {
    this.state.chatMessages = messages;
  }

  setTypingUsers(users: string[]): void {
    this.state.typingUsers = users;
  }

  addTypingUser(userName: string): void {
    if (!this.state.typingUsers.includes(userName)) {
      this.state.typingUsers.push(userName);
    }
  }

  removeTypingUser(userName: string): void {
    this.state.typingUsers = this.state.typingUsers.filter(user => user !== userName);
  }

  reset(): void {
    this.state = {
      roomCode: '',
      sessionName: '',
      currentTicket: '',
      currentJiraIssue: null,
      jiraConfig: null,
      jiraIssues: [],
      selectedIssue: null,
      participants: [],
      isFacilitator: false,
      isViewer: false,
      myName: '',
      votingRevealed: false,
      myVote: null,
      moderationTarget: null,
      countdownActive: false,
      countdownSeconds: 0,
      history: [],
      aggregate: null,
      chatMessages: [],
      typingUsers: [],
    };
  }
}

export const gameState = new GameStateManager();
