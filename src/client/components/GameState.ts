import { GameState, Vote } from '@shared/types/index.js';

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
      aggregate: null
    };
  }

  getState(): GameState {
    return this.state;
  }

  updateState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
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
      aggregate: null
    };
  }
}

export const gameState = new GameStateManager();