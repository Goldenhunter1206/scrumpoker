import { SessionData, Participant, EstimationHistoryEntry } from '@shared/types/index.js';

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createSession(sessionName: string, facilitatorName: string): SessionData {
  const roomCode = generateRoomCode();

  const facilitator: Participant = {
    name: facilitatorName,
    isFacilitator: true,
    isViewer: false,
    joinedAt: new Date(),
    hasVoted: false,
  };

  const session: SessionData = {
    id: roomCode,
    sessionName,
    facilitator: facilitatorName,
    currentTicket: '',
    currentJiraIssue: null,
    jiraConfig: null,
    participants: [facilitator],
    votingRevealed: false,
    totalVotes: 0,
    history: [],
    aggregate: null,
    chatMessages: [],
  };

  return session;
}

export function getSessionData(session: any): SessionData {
  return {
    id: session.id,
    sessionName: session.sessionName,
    facilitator:
      typeof session.facilitator === 'string' ? session.facilitator : session.facilitator.name,
    currentTicket: session.currentTicket,
    currentJiraIssue: session.currentJiraIssue,
    jiraConfig: session.jiraConfig
      ? {
          domain: session.jiraConfig.domain,
          boardId: session.jiraConfig.boardId,
          hasToken: !!(session.jiraConfig as any).token,
        }
      : null,
    participants: Array.from(session.participants.values()).map((p: any) => ({
      name: p.name,
      isFacilitator: p.isFacilitator,
      isViewer: p.isViewer,
      joinedAt: p.joinedAt,
      hasVoted: session.votes.has(p.name),
      vote: session.votingRevealed ? session.votes.get(p.name) : undefined,
    })),
    votingRevealed: session.votingRevealed,
    totalVotes: session.votes.size,
    history: session.history || [],
    aggregate: session.aggregate || null,
    chatMessages: session.chatMessages || [],
  };
}

export function recordHistory(
  session: any,
  entry: Omit<EstimationHistoryEntry, 'timestamp'>
): void {
  if (!session.history) session.history = [];
  if (!session.aggregate) {
    session.aggregate = {
      totalRounds: 0,
      consensusRounds: 0,
      perUser: {},
    };
  }

  const stamped: EstimationHistoryEntry = {
    ...entry,
    timestamp: new Date(),
  };
  session.history.push(stamped);

  const agg = session.aggregate;
  agg.totalRounds += 1;

  if (entry.stats && entry.stats.min === entry.stats.max) {
    agg.consensusRounds += 1;
  }

  if (entry.votes) {
    Object.entries(entry.votes).forEach(([name, value]) => {
      if (typeof value !== 'number') return;
      if (!agg.perUser[name]) {
        agg.perUser[name] = { sum: 0, count: 0, highCount: 0, lowCount: 0 };
      }
      const user = agg.perUser[name];
      user.sum += value;
      user.count += 1;
      if (entry.stats && entry.stats.min !== entry.stats.max) {
        // Only count high/low if there's actually variance in the votes
        if (value === entry.stats.max) user.highCount += 1;
        if (value === entry.stats.min) user.lowCount += 1;
      }
    });
  }
}
