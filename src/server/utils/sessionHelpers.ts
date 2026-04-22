import {
  AttendanceEntry,
  SessionData,
  Participant,
  EstimationHistoryEntry,
  PlanningState,
  PlanningSummary,
  SprintGoalVote,
} from '@shared/types/index.js';

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createEmptyPlanningState(enabled = false): PlanningState {
  return {
    enabled,
    stage: enabled ? 'setup' : 'estimation',
    selectedSprintState: undefined,
    selectedSprintStartDate: undefined,
    selectedSprintEndDate: undefined,
    availableSprints: [],
    sprintLengthDays: null,
    goalDraft: '',
    finalGoal: '',
    goalVoteRevealed: false,
    goalVotes: {},
    goalSkipped: false,
    capacityEntries: {},
    capacitySkipped: false,
    suggestionQueue: [],
    approvedQueue: [],
    summary: createPlanningSummary(),
  };
}

export function createPlanningSummary(): PlanningSummary {
  return {
    eligibleVoterCount: 0,
    goalVotesSubmitted: 0,
    goalApproveCount: 0,
    goalRejectCount: 0,
    capacitySubmittedCount: 0,
    totalCapacityDays: 0,
    averageCapacityDays: 0,
    pendingSuggestionCount: 0,
    approvedSuggestionCount: 0,
  };
}

export function createSession(sessionName: string, facilitatorName: string): SessionData {
  const roomCode = generateRoomCode();
  const facilitatorJoinedAt = new Date();

  const facilitator: Participant = {
    name: facilitatorName,
    isFacilitator: true,
    isViewer: false,
    joinedAt: facilitatorJoinedAt,
    hasVoted: false,
  };

  const session: SessionData = {
    id: roomCode,
    sessionName,
    facilitator: facilitatorName,
    currentTicket: '',
    currentJiraIssue: null,
    jiraConfig: null,
    jiraIssues: [],
    planning: createEmptyPlanningState(false),
    participants: [facilitator],
    attendance: [
      {
        name: facilitatorName,
        firstJoinedAt: facilitatorJoinedAt,
      },
    ],
    votingRevealed: false,
    totalVotes: 0,
    discussionStartTime: null,
    history: [],
    aggregate: null,
    chatMessages: [],
  };

  return session;
}

export function recordAttendance(
  session: { attendance?: AttendanceEntry[] },
  participantName: string,
  firstJoinedAt: Date = new Date()
): void {
  if (!session.attendance) {
    session.attendance = [];
  }

  if (session.attendance.some(entry => entry.name === participantName)) {
    return;
  }

  session.attendance.push({
    name: participantName,
    firstJoinedAt,
  });
}

export function getEligiblePlanningParticipantNames(session: any): string[] {
  return Array.from(session.participants.values())
    .filter((participant: any) => !participant.isViewer && participant.socketId)
    .map((participant: any) => participant.name);
}

function buildPlanningSummary(session: any): PlanningSummary {
  const eligibleNames = getEligiblePlanningParticipantNames(session);
  const goalVotes = session.planning?.goalVotes || {};
  const capacityEntries = session.planning?.capacityEntries || {};

  const goalVotesSubmitted = eligibleNames.filter((name: string) => goalVotes[name]).length;
  const goalApproveCount = eligibleNames.filter(
    (name: string) => goalVotes[name] === ('approve' as SprintGoalVote)
  ).length;
  const goalRejectCount = eligibleNames.filter(
    (name: string) => goalVotes[name] === ('reject' as SprintGoalVote)
  ).length;
  const capacitySubmitted = eligibleNames.filter(
    (name: string) => typeof capacityEntries[name] === 'number'
  );
  const totalCapacityDays = capacitySubmitted.reduce(
    (sum: number, name: string) => sum + Number(capacityEntries[name] || 0),
    0
  );

  return {
    eligibleVoterCount: eligibleNames.length,
    goalVotesSubmitted,
    goalApproveCount,
    goalRejectCount,
    capacitySubmittedCount: capacitySubmitted.length,
    totalCapacityDays,
    averageCapacityDays: capacitySubmitted.length
      ? totalCapacityDays / capacitySubmitted.length
      : 0,
    pendingSuggestionCount: session.planning?.suggestionQueue?.length || 0,
    approvedSuggestionCount: session.planning?.approvedQueue?.length || 0,
  };
}

function buildAttendance(session: any): AttendanceEntry[] {
  const attendance = Array.isArray(session.attendance) ? session.attendance : [];
  if (attendance.length > 0) {
    return [...attendance].sort(
      (left, right) =>
        new Date(left.firstJoinedAt).getTime() - new Date(right.firstJoinedAt).getTime()
    );
  }

  return Array.from(session.participants.values())
    .map((participant: any) => ({
      name: participant.name,
      firstJoinedAt: participant.joinedAt,
    }))
    .sort(
      (left: AttendanceEntry, right: AttendanceEntry) =>
        new Date(left.firstJoinedAt).getTime() - new Date(right.firstJoinedAt).getTime()
    );
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
    jiraIssues: session.jiraIssues || [],
    planning: {
      ...(session.planning || createEmptyPlanningState(false)),
      summary: buildPlanningSummary(session),
    },
    participants: Array.from(session.participants.values()).map((p: any) => ({
      name: p.name,
      isFacilitator: p.isFacilitator,
      isViewer: p.isViewer,
      joinedAt: p.joinedAt,
      hasVoted: session.votes.has(p.name),
      vote: session.votingRevealed ? session.votes.get(p.name) : undefined,
    })),
    attendance: buildAttendance(session),
    votingRevealed: session.votingRevealed,
    totalVotes: session.votes.size,
    discussionStartTime: session.discussionStartTime,
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

  const discussionDuration = session.discussionStartTime
    ? Math.floor((new Date().getTime() - session.discussionStartTime.getTime()) / 1000)
    : undefined;

  const stamped: EstimationHistoryEntry = {
    ...entry,
    timestamp: new Date(),
    discussionDuration,
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
        if (value === entry.stats.max) user.highCount += 1;
        if (value === entry.stats.min) user.lowCount += 1;
      }
    });
  }
}
