import { Socket, Server as SocketIOServer } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  Vote,
  VotingResults,
  JiraIssue,
  ChatMessage,
  PlanningState,
  PlanningSuggestion,
  SprintGoalVote,
} from '@shared/types/index.js';
import {
  getJiraBoards,
  getJiraBoardIssues,
  getJiraBacklogIssues,
  getJiraBoardSprints,
  searchConfluenceParentPages,
  createConfluencePage,
  updateJiraIssueStoryPoints,
  updateJiraSprintGoal,
  moveIssueToCurrentSprint,
  moveIssueToSprint,
  roundToNearestFibonacci,
  getJiraIssueDetails,
  calculateWeekdayLength,
} from './utils/jiraApi.js';
import {
  getSessionData,
  recordHistory,
  createEmptyPlanningState,
  getEligiblePlanningParticipantNames,
} from './utils/sessionHelpers.js';
import {
  buildSessionReport,
  renderSessionReportConfluenceStorage,
} from '@shared/utils/sessionReport.js';
import {
  validateSocketEvent,
  sanitizeString,
  socketEventRateLimiters,
} from './middleware/validation.js';
import { invalidateParticipantTokens, invalidateRoomTokens } from './utils/sessionTokens.js';

interface InternalSessionData {
  id: string;
  sessionName: string;
  facilitator: {
    name: string;
    socketId: string;
  };
  currentTicket: string;
  currentJiraIssue: JiraIssue | null;
  jiraConfig: any;
  jiraIssues: JiraIssue[];
  planning: PlanningState;
  attendance: Array<{ name: string; firstJoinedAt: Date }>;
  participants: Map<string, any>;
  votes: Map<string, Vote>;
  votingRevealed: boolean;
  totalVotes: number;
  countdownActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  discussionStartTime: Date | null;
  discussionTimer: NodeJS.Timeout | null;
  createdAt: Date;
  lastActivity: Date;
  history: any[];
  aggregate: any;
  chatMessages: ChatMessage[];
  typingUsers: Map<string, NodeJS.Timeout>;
  socketToParticipant: Map<string, string>;
  participantToSocket: Map<string, string>;
}

function createValidationWrapper(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
  return function withValidation<T>(eventName: string, handler: (data: T) => void | Promise<void>) {
    return async (data: any) => {
      try {
        const validator = validateSocketEvent<T>(eventName as any);
        const validatedData = validator(data);
        await handler(validatedData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Validation error';
        console.warn(`Validation failed for ${eventName}:`, errorMessage);
        socket.emit('error', { message: 'Invalid request data' });
      }
    };
  };
}

function getParticipantBySocketId(session: InternalSessionData, socketId: string): any | null {
  const participantName = session.socketToParticipant.get(socketId);
  return participantName ? session.participants.get(participantName) : null;
}

function startDiscussionTimer(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  if (session.discussionTimer) {
    clearInterval(session.discussionTimer);
  }

  session.discussionStartTime = new Date();
  session.discussionTimer = setInterval(() => {
    if (!session.discussionStartTime) {
      clearInterval(session.discussionTimer!);
      session.discussionTimer = null;
      return;
    }

    const discussionDuration = Math.floor(
      (new Date().getTime() - session.discussionStartTime.getTime()) / 1000
    );

    io.to(roomCode).emit('discussion-timer-tick', {
      discussionDuration,
    });
  }, 1000);
}

function stopDiscussionTimer(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  if (session.discussionTimer) {
    clearInterval(session.discussionTimer);
    session.discussionTimer = null;

    if (session.discussionStartTime) {
      const finalDuration = Math.floor(
        (new Date().getTime() - session.discussionStartTime.getTime()) / 1000
      );
      io.to(roomCode).emit('discussion-timer-tick', {
        discussionDuration: finalDuration,
      });
    }
  }
}

function getEligibleEstimators(session: InternalSessionData): any[] {
  return Array.from(session.participants.values()).filter((participant: any) => {
    return !participant.isViewer && participant.socketId;
  });
}

function ensurePlanningState(session: InternalSessionData) {
  if (!session.planning) {
    session.planning = createEmptyPlanningState(false);
  }
}

function isPlanningEnabled(session: InternalSessionData): boolean {
  ensurePlanningState(session);
  return !!session.planning.enabled;
}

function clearEstimationRound(session: InternalSessionData) {
  session.votes.clear();
  session.votingRevealed = false;
  session.participants.forEach(participant => {
    participant.hasVoted = false;
  });
}

function clearCountdown(session: InternalSessionData) {
  if (session.countdownTimer) {
    clearInterval(session.countdownTimer);
    session.countdownTimer = null;
  }
  session.countdownActive = false;
}

function canInteractWithEstimation(session: InternalSessionData): boolean {
  return !isPlanningEnabled(session) || session.planning.stage === 'estimation';
}

function cleanupPlanningEligibility(session: InternalSessionData, participantName: string) {
  if (!isPlanningEnabled(session)) return;
  delete session.planning.goalVotes[participantName];
  delete session.planning.capacityEntries[participantName];
}

function isDuplicateSuggestion(session: InternalSessionData, issue: JiraIssue): boolean {
  const activeIssue = session.currentJiraIssue?.key === issue.key;
  const inPending = session.planning.suggestionQueue.some(item => item.issue.key === issue.key);
  const inApproved = session.planning.approvedQueue.some(item => item.issue.key === issue.key);
  const inHistory = session.history.some((entry: any) => entry.issueKey === issue.key);
  return activeIssue || inPending || inApproved || inHistory;
}

function maybeAutoRevealGoalVotes(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  if (!isPlanningEnabled(session) || session.planning.stage !== 'goal') return;
  const eligible = getEligiblePlanningParticipantNames(session);
  if (!eligible.length) return;

  const allSubmitted = eligible.every(name => !!session.planning.goalVotes[name]);
  if (!allSubmitted || session.planning.goalVoteRevealed) return;

  session.planning.goalVoteRevealed = true;
  io.to(roomCode).emit('planning-goal-revealed', {
    sessionData: getSessionData(session),
  });
}

function maybeAdvanceCapacity(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  if (!isPlanningEnabled(session) || session.planning.stage !== 'capacity') return;
  const eligible = getEligiblePlanningParticipantNames(session);
  if (!eligible.length) {
    session.planning.stage = 'estimation';
    io.to(roomCode).emit('planning-stage-advanced', {
      stage: session.planning.stage,
      sessionData: getSessionData(session),
    });
    return;
  }

  const allSubmitted = eligible.every(
    name => typeof session.planning.capacityEntries[name] === 'number'
  );
  if (!allSubmitted) return;

  session.planning.stage = 'estimation';
  io.to(roomCode).emit('planning-stage-advanced', {
    stage: session.planning.stage,
    sessionData: getSessionData(session),
  });
}

function buildSuggestion(issue: JiraIssue, participantName: string): PlanningSuggestion {
  return {
    id: `${issue.key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    issue,
    suggestedBy: participantName,
    status: 'pending',
    createdAt: new Date(),
  };
}

function startIssueEstimation(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  issue: JiraIssue
) {
  session.currentJiraIssue = issue;
  session.currentTicket = `${issue.key}: ${issue.summary}`;
  clearEstimationRound(session);
  clearCountdown(session);
  startDiscussionTimer(session, roomCode, io);
}

function buildSessionReportForPublish(session: InternalSessionData) {
  return buildSessionReport(getSessionData(session), {
    jiraBaseUrl: session.jiraConfig?.domain ? `https://${session.jiraConfig.domain}` : undefined,
  });
}

export function setupSocketHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  memoryStore: Map<string, InternalSessionData>
) {
  const withValidation = createValidationWrapper(socket);

  socket.on(
    'configure-jira',
    withValidation(
      'configure-jira',
      async ({ roomCode, domain, email, token, projectKey }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session) return;

        const facilitator = getParticipantBySocketId(session, socket.id);
        if (!facilitator?.isFacilitator) {
          socket.emit('error', { message: 'Only facilitator can configure Jira' });
          return;
        }

        const sanitizedDomain = sanitizeString(domain);
        const sanitizedEmail = sanitizeString(email);
        const config = { domain: sanitizedDomain, email: sanitizedEmail, token, hasToken: true };
        const boardsResult = await getJiraBoards(config, projectKey || undefined);

        if (!boardsResult.success) {
          socket.emit('jira-config-failed', {
            message: 'Failed to connect to Jira. Please check your credentials.',
          });
          return;
        }

        session.jiraConfig = {
          ...config,
          projectKey: projectKey ? sanitizeString(projectKey) : undefined,
        };
        session.lastActivity = new Date();

        socket.emit('jira-config-success', {
          boards: boardsResult.data?.values || [],
          sessionData: getSessionData(session),
        });
      }
    )
  );

  socket.on(
    'get-jira-issues',
    withValidation('get-jira-issues', async ({ roomCode, boardId, boardName }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can fetch Jira issues' });
        return;
      }

      session.jiraConfig.boardId = boardId;
      if (isPlanningEnabled(session)) {
        session.planning.boardId = boardId;
        session.planning.boardName = boardName || session.planning.boardName;
      }

      const issuesResult = isPlanningEnabled(session)
        ? await getJiraBacklogIssues(session.jiraConfig, boardId)
        : await getJiraBoardIssues(session.jiraConfig, boardId);

      if (!issuesResult.success) {
        socket.emit('jira-issues-failed', {
          message: `Failed to fetch issues: ${issuesResult.error}`,
        });
        return;
      }

      session.jiraIssues = issuesResult.data?.issues || [];
      session.lastActivity = new Date();

      io.to(roomCode).emit('jira-issues-loaded', {
        issues: session.jiraIssues,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'get-planning-sprints',
    withValidation('get-planning-sprints', async ({ roomCode, boardId }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator || !isPlanningEnabled(session)) {
        socket.emit('error', { message: 'Only facilitator can fetch planning sprints' });
        return;
      }

      const result = await getJiraBoardSprints(session.jiraConfig, boardId);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Failed to fetch sprints' });
        return;
      }

      session.planning.availableSprints = result.data?.sprints || [];
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-sprints-loaded', {
        sprints: session.planning.availableSprints,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'select-planning-sprint',
    withValidation(
      'select-planning-sprint',
      async ({ roomCode, sprintId, sprintName, sprintLengthDays }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session || !isPlanningEnabled(session)) return;

        const facilitator = getParticipantBySocketId(session, socket.id);
        if (!facilitator?.isFacilitator) {
          socket.emit('error', { message: 'Only facilitator can configure planning setup' });
          return;
        }

        const selectedSprint = session.planning.availableSprints.find(
          sprint => sprint.id === sprintId
        );
        session.planning.selectedSprintId = selectedSprint?.id;
        session.planning.selectedSprintName = selectedSprint?.name || sprintName || undefined;
        session.planning.selectedSprintState = selectedSprint?.state;
        session.planning.selectedSprintStartDate = selectedSprint?.startDate;
        session.planning.selectedSprintEndDate = selectedSprint?.endDate;

        const derivedLength = calculateWeekdayLength(
          selectedSprint?.startDate,
          selectedSprint?.endDate
        );
        session.planning.sprintLengthDays =
          derivedLength ?? (typeof sprintLengthDays === 'number' ? sprintLengthDays : null);
        session.planning.stage = 'goal';
        session.lastActivity = new Date();

        io.to(roomCode).emit('planning-stage-advanced', {
          stage: session.planning.stage,
          sessionData: getSessionData(session),
        });
      }
    )
  );

  socket.on(
    'update-planning-goal',
    withValidation('update-planning-goal', ({ roomCode, goalDraft }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can update the sprint goal' });
        return;
      }

      session.planning.goalDraft = sanitizeString(goalDraft);
      session.planning.goalVoteRevealed = false;
      session.planning.goalVotes = {};
      if (session.planning.stage === 'setup') {
        session.planning.stage = 'goal';
      }
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-goal-updated', {
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'submit-goal-vote',
    withValidation('submit-goal-vote', ({ roomCode, vote }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant || participant.isViewer) {
        socket.emit('error', { message: 'Only voting participants can vote on the sprint goal' });
        return;
      }

      if (session.planning.stage !== 'goal') {
        socket.emit('error', { message: 'Sprint goal voting is not active' });
        return;
      }

      session.planning.goalVotes[participant.name] = vote as SprintGoalVote;
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-goal-vote-submitted', {
        participantName: participant.name,
        sessionData: getSessionData(session),
      });

      maybeAutoRevealGoalVotes(session, roomCode, io);
    })
  );

  socket.on(
    'reveal-goal-votes',
    withValidation('reveal-goal-votes', ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reveal goal votes' });
        return;
      }

      session.planning.goalVoteRevealed = true;
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-goal-revealed', {
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'reset-goal-voting',
    withValidation('reset-goal-voting', ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reset goal voting' });
        return;
      }

      session.planning.goalVotes = {};
      session.planning.goalVoteRevealed = false;
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-goal-updated', {
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'finalize-goal',
    withValidation('finalize-goal', async ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can finalize the sprint goal' });
        return;
      }

      if (!session.planning.goalDraft.trim()) {
        socket.emit('error', { message: 'Enter a sprint goal before finalizing it' });
        return;
      }

      if (session.planning.selectedSprintId && session.jiraConfig) {
        if (!session.planning.selectedSprintName || !session.planning.selectedSprintState) {
          socket.emit('error', {
            message: 'Selected sprint is missing Jira metadata',
          });
          return;
        }

        const updateResult = await updateJiraSprintGoal(
          session.jiraConfig,
          session.planning.selectedSprintId,
          session.planning.goalDraft,
          session.planning.selectedSprintName,
          session.planning.selectedSprintState,
          session.planning.selectedSprintStartDate,
          session.planning.selectedSprintEndDate
        );

        if (!updateResult.success) {
          socket.emit('error', {
            message: updateResult.error || 'Failed to update sprint goal in Jira',
          });
          return;
        }
      }

      session.planning.finalGoal = session.planning.goalDraft;
      session.planning.goalVoteRevealed = true;
      session.planning.stage = 'capacity';
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-stage-advanced', {
        stage: session.planning.stage,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'submit-capacity',
    withValidation('submit-capacity', ({ roomCode, capacityDays }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant || participant.isViewer) {
        socket.emit('error', { message: 'Only voting participants can submit capacity' });
        return;
      }

      if (session.planning.stage !== 'capacity') {
        socket.emit('error', { message: 'Capacity planning is not active' });
        return;
      }

      if (
        session.planning.sprintLengthDays !== null &&
        Number(capacityDays) > Number(session.planning.sprintLengthDays)
      ) {
        socket.emit('error', { message: 'Capacity cannot exceed the sprint length' });
        return;
      }

      session.planning.capacityEntries[participant.name] = Number(capacityDays);
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-capacity-submitted', {
        participantName: participant.name,
        sessionData: getSessionData(session),
      });

      maybeAdvanceCapacity(session, roomCode, io);
    })
  );

  socket.on(
    'skip-planning-stage',
    withValidation('skip-planning-stage', ({ roomCode, stage }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can skip planning stages' });
        return;
      }

      if (stage === 'goal') {
        session.planning.goalSkipped = true;
        session.planning.stage = 'capacity';
      } else {
        session.planning.capacitySkipped = true;
        session.planning.stage = 'estimation';
      }
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-stage-advanced', {
        stage: session.planning.stage,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'suggest-jira-issue',
    withValidation('suggest-jira-issue', ({ roomCode, issue }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant) return;

      if (session.planning.stage !== 'estimation') {
        socket.emit('error', { message: 'Issue suggestions open during the estimation stage' });
        return;
      }

      if (issue.currentStoryPoints !== null && issue.currentStoryPoints !== undefined) {
        socket.emit('error', { message: 'This Jira issue is already estimated' });
        return;
      }

      if (isDuplicateSuggestion(session, issue)) {
        socket.emit('error', { message: 'This Jira issue is already in the planning queue' });
        return;
      }

      const suggestion = buildSuggestion(issue, participant.name);
      session.planning.suggestionQueue.push(suggestion);
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-suggestion-added', {
        suggestion,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'review-suggestion',
    withValidation('review-suggestion', ({ roomCode, suggestionId, action }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can review suggestions' });
        return;
      }

      const suggestionIndex = session.planning.suggestionQueue.findIndex(
        suggestion => suggestion.id === suggestionId
      );
      if (suggestionIndex === -1) {
        socket.emit('error', { message: 'Suggestion not found' });
        return;
      }

      const [suggestion] = session.planning.suggestionQueue.splice(suggestionIndex, 1);
      if (action === 'approve') {
        session.planning.approvedQueue.push({
          ...suggestion,
          status: 'approved',
        });
      }
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-suggestion-reviewed', {
        suggestionId,
        action: action === 'approve' ? 'approved' : 'rejected',
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'select-approved-issue',
    withValidation('select-approved-issue', ({ roomCode, suggestionId }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !isPlanningEnabled(session)) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can start an approved issue' });
        return;
      }

      const suggestionIndex = session.planning.approvedQueue.findIndex(
        suggestion => suggestion.id === suggestionId
      );
      if (suggestionIndex === -1) {
        socket.emit('error', { message: 'Approved issue not found' });
        return;
      }

      const [suggestion] = session.planning.approvedQueue.splice(suggestionIndex, 1);
      startIssueEstimation(session, roomCode, io, suggestion.issue);
      session.lastActivity = new Date();

      io.to(roomCode).emit('planning-approved-issue-selected', {
        suggestionId,
        issue: suggestion.issue,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'search-confluence-parents',
    withValidation('search-confluence-parents', async ({ roomCode, query }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('confluence-page-failed', {
          message: 'Only the facilitator can search Confluence parent pages',
        });
        return;
      }

      const result = await searchConfluenceParentPages(session.jiraConfig, query);
      if (!result.success) {
        socket.emit('confluence-page-failed', {
          message: result.error || 'Failed to search Confluence pages',
        });
        return;
      }

      session.lastActivity = new Date();
      socket.emit('confluence-parent-search-results', {
        query,
        results: result.data?.results || [],
      });
    })
  );

  socket.on(
    'create-confluence-page',
    withValidation('create-confluence-page', async ({ roomCode, parentPageId, title }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('confluence-page-failed', {
          message: 'Only the facilitator can publish the sprint report to Confluence',
        });
        return;
      }

      const report = buildSessionReportForPublish(session);
      const storageBody = renderSessionReportConfluenceStorage(report);
      const result = await createConfluencePage(
        session.jiraConfig,
        parentPageId,
        title,
        storageBody
      );

      if (!result.success || !result.data) {
        socket.emit('confluence-page-failed', {
          message: result.error || 'Failed to create the Confluence page',
        });
        return;
      }

      session.lastActivity = new Date();
      socket.emit('confluence-page-created', {
        pageId: result.data.pageId,
        title: result.data.title,
        url: result.data.url,
      });
    })
  );

  socket.on('get-jira-issue-details', async data => {
    const { roomCode, issueKey } = data || {};
    try {
      const session = memoryStore.get(roomCode);
      if (!session) {
        socket.emit('jira-issue-details-failed', { message: 'Session not found' });
        return;
      }

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant) {
        socket.emit('jira-issue-details-failed', { message: 'Participant not found' });
        return;
      }

      if (!session.jiraConfig) {
        socket.emit('jira-issue-details-failed', {
          message: 'Jira not configured for this session',
        });
        return;
      }

      const result = await getJiraIssueDetails(
        {
          ...session.jiraConfig,
          email: session.jiraConfig.email,
          token: session.jiraConfig.token,
        },
        issueKey
      );

      if (result.success) {
        socket.emit('jira-issue-details-loaded', {
          issueDetails: result.data,
        });
      } else {
        socket.emit('jira-issue-details-failed', {
          message: result.error || 'Failed to fetch issue details',
        });
      }
    } catch (error) {
      console.error('Failed to fetch Jira issue details', error);
      socket.emit('jira-issue-details-failed', { message: 'Server error occurred' });
    }
  });

  socket.on(
    'set-jira-issue',
    withValidation('set-jira-issue', ({ roomCode, issue }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const facilitator = getParticipantBySocketId(session, socket.id);
      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can set Jira issues' });
        return;
      }

      if (isPlanningEnabled(session)) {
        socket.emit('error', { message: 'Use the planning approval queue to start Jira issues' });
        return;
      }

      startIssueEstimation(session, roomCode, io, issue);
      session.lastActivity = new Date();

      io.to(roomCode).emit('jira-issue-set', {
        issue,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'finalize-estimation',
    withValidation(
      'finalize-estimation',
      async ({ roomCode, finalEstimate, moveToSprint }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session || !session.currentJiraIssue || !session.jiraConfig) return;

        const facilitator = getParticipantBySocketId(session, socket.id);
        if (!facilitator?.isFacilitator) {
          socket.emit('error', { message: 'Only facilitator can finalize estimations' });
          return;
        }

        const roundedEstimate = roundToNearestFibonacci(finalEstimate);
        if (roundedEstimate === null) {
          socket.emit('jira-update-failed', { message: 'Invalid estimate value' });
          return;
        }

        const updateResult = await updateJiraIssueStoryPoints(
          session.jiraConfig,
          session.currentJiraIssue.key,
          roundedEstimate
        );
        if (!updateResult.success) {
          socket.emit('jira-update-failed', {
            message: `Failed to update Jira: ${updateResult.error}`,
          });
          return;
        }

        session.currentJiraIssue.currentStoryPoints = roundedEstimate;
        const updatedIssueKey = session.currentJiraIssue.key;
        let movedToSprint = false;
        let sprintName: string | undefined;

        if (moveToSprint) {
          if (isPlanningEnabled(session) && session.planning.selectedSprintId) {
            const sprintResult = await moveIssueToSprint(
              session.jiraConfig,
              updatedIssueKey,
              session.planning.selectedSprintId,
              session.planning.selectedSprintName
            );
            movedToSprint = sprintResult.success;
            sprintName = sprintResult.data?.sprintName;
          } else if (session.jiraConfig.boardId) {
            const sprintResult = await moveIssueToCurrentSprint(
              session.jiraConfig,
              updatedIssueKey,
              session.jiraConfig.boardId
            );
            movedToSprint = sprintResult.success;
            sprintName = sprintResult.data?.sprintName;
          }
        }

        recordHistory(session, {
          issueKey: updatedIssueKey,
          summary: session.currentJiraIssue.summary,
          storyPoints: roundedEstimate,
          originalEstimate: finalEstimate,
        });

        session.jiraIssues = session.jiraIssues.map(issue =>
          issue.key === updatedIssueKey ? { ...issue, currentStoryPoints: roundedEstimate } : issue
        );
        session.currentTicket = '';
        session.currentJiraIssue = null;
        clearEstimationRound(session);
        session.lastActivity = new Date();

        io.to(roomCode).emit('jira-updated', {
          issueKey: updatedIssueKey,
          storyPoints: roundedEstimate,
          originalEstimate: finalEstimate,
          movedToSprint,
          sprintName,
          sessionData: getSessionData(session),
        });
      }
    )
  );

  socket.on(
    'set-ticket',
    withValidation('set-ticket', ({ roomCode, ticket }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can set tickets' });
        return;
      }

      if (isPlanningEnabled(session)) {
        socket.emit('error', { message: 'Manual tickets are disabled in planning flow sessions' });
        return;
      }

      session.currentTicket = ticket;
      session.currentJiraIssue = null;
      clearEstimationRound(session);
      clearCountdown(session);
      session.lastActivity = new Date();
      startDiscussionTimer(session, roomCode, io);

      io.to(roomCode).emit('ticket-set', {
        ticket,
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'submit-vote',
    withValidation('submit-vote', ({ roomCode, vote }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant) return;
      if (participant.isViewer) {
        socket.emit('error', { message: 'Viewers cannot vote' });
        return;
      }
      if (!canInteractWithEstimation(session)) {
        socket.emit('error', { message: 'Estimation voting is not unlocked yet' });
        return;
      }
      if (session.votingRevealed) {
        socket.emit('error', { message: 'Voting is already complete for this round' });
        return;
      }

      session.votes.set(participant.name, vote);
      participant.hasVoted = true;
      session.lastActivity = new Date();

      io.to(roomCode).emit('vote-submitted', {
        participantName: participant.name,
        sessionData: getSessionData(session),
      });

      if (session.countdownActive) {
        const eligibleVoters = getEligibleEstimators(session);
        if (session.votes.size >= eligibleVoters.length && eligibleVoters.length > 0) {
          clearCountdown(session);
          session.votingRevealed = true;
          session.lastActivity = new Date();
          stopDiscussionTimer(session, roomCode, io);

          const results = calculateVotingResults(session.votes);
          if (session.currentJiraIssue) {
            recordHistory(session, {
              issueKey: session.currentJiraIssue.key,
              summary: session.currentJiraIssue.summary,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          } else if (session.currentTicket) {
            recordHistory(session, {
              ticket: session.currentTicket,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          }

          io.to(roomCode).emit('countdown-finished', {
            sessionData: getSessionData(session),
          });
          io.to(roomCode).emit('votes-revealed', {
            sessionData: getSessionData(session),
            results,
          });
        }
      }
    })
  );

  socket.on(
    'reveal-votes',
    withValidation('reveal-votes', ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reveal votes' });
        return;
      }
      if (!canInteractWithEstimation(session)) {
        socket.emit('error', { message: 'Estimation voting is not unlocked yet' });
        return;
      }

      clearCountdown(session);
      session.votingRevealed = true;
      session.lastActivity = new Date();
      stopDiscussionTimer(session, roomCode, io);

      const results = calculateVotingResults(session.votes);
      if (session.currentJiraIssue) {
        recordHistory(session, {
          issueKey: session.currentJiraIssue.key,
          summary: session.currentJiraIssue.summary,
          votes: Object.fromEntries(session.votes),
          stats: {
            consensus: results.consensus,
            average: results.average,
            min: results.min,
            max: results.max,
          },
        });
      } else if (session.currentTicket) {
        recordHistory(session, {
          ticket: session.currentTicket,
          votes: Object.fromEntries(session.votes),
          stats: {
            consensus: results.consensus,
            average: results.average,
            min: results.min,
            max: results.max,
          },
        });
      }

      io.to(roomCode).emit('votes-revealed', {
        sessionData: getSessionData(session),
        results,
      });
    })
  );

  socket.on(
    'reset-voting',
    withValidation('reset-voting', ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reset voting' });
        return;
      }
      if (!canInteractWithEstimation(session)) {
        socket.emit('error', { message: 'Estimation voting is not unlocked yet' });
        return;
      }

      clearEstimationRound(session);
      clearCountdown(session);
      session.lastActivity = new Date();

      io.to(roomCode).emit('voting-reset', {
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'set-facilitator-viewer',
    withValidation('set-facilitator-viewer', ({ roomCode, isViewer }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const facilitatorEntry = getParticipantBySocketId(session, socket.id);
      if (!facilitatorEntry?.isFacilitator) {
        socket.emit('error', { message: 'Only the facilitator can change their viewer status' });
        return;
      }

      facilitatorEntry.isViewer = isViewer;
      if (isViewer) {
        cleanupPlanningEligibility(session, facilitatorEntry.name);
        session.votes.delete(facilitatorEntry.name);
      }
      session.lastActivity = new Date();
      maybeAutoRevealGoalVotes(session, roomCode, io);
      maybeAdvanceCapacity(session, roomCode, io);

      io.to(roomCode).emit('participant-role-changed', {
        participantName: facilitatorEntry.name,
        newRole: isViewer ? 'viewer' : 'participant',
        sessionData: getSessionData(session),
      });
    })
  );

  socket.on(
    'moderate-participant',
    withValidation('moderate-participant', ({ roomCode, targetName, action }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const facilitatorEntry = getParticipantBySocketId(session, socket.id);
      if (!facilitatorEntry?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can moderate participants' });
        return;
      }

      const target = session.participants.get(targetName);
      if (!target) {
        socket.emit('error', { message: 'Participant not found' });
        return;
      }

      switch (action) {
        case 'make-viewer':
          target.isViewer = true;
          cleanupPlanningEligibility(session, targetName);
          session.votes.delete(targetName);
          io.to(roomCode).emit('participant-role-changed', {
            participantName: targetName,
            newRole: 'viewer',
            sessionData: getSessionData(session),
          });
          break;
        case 'make-participant':
          target.isViewer = false;
          io.to(roomCode).emit('participant-role-changed', {
            participantName: targetName,
            newRole: 'participant',
            sessionData: getSessionData(session),
          });
          break;
        case 'make-facilitator':
          if (targetName === facilitatorEntry.name) {
            socket.emit('error', { message: 'You are already the facilitator' });
            return;
          }
          facilitatorEntry.isFacilitator = false;
          target.isFacilitator = true;
          target.isViewer = false;
          session.facilitator.name = targetName;
          session.facilitator.socketId = target.socketId || '';
          io.to(roomCode).emit('facilitator-changed', {
            oldFacilitatorName: facilitatorEntry.name,
            newFacilitatorName: targetName,
            sessionData: getSessionData(session),
          });
          break;
        case 'remove':
          session.participants.delete(targetName);
          cleanupPlanningEligibility(session, targetName);
          session.votes.delete(targetName);
          invalidateParticipantTokens(targetName, roomCode);
          io.to(roomCode).emit('participant-removed', {
            participantName: targetName,
            sessionData: getSessionData(session),
          });

          if (target.socketId) {
            const targetSocket = io.sockets.sockets.get(target.socketId);
            if (targetSocket) {
              targetSocket.emit('removed-from-session', {
                message: 'You have been removed from the session by the facilitator',
              });
              targetSocket.leave(roomCode);
            }
          }
          break;
        default:
          socket.emit('error', { message: 'Unknown moderation action' });
          return;
      }

      session.lastActivity = new Date();
      maybeAutoRevealGoalVotes(session, roomCode, io);
      maybeAdvanceCapacity(session, roomCode, io);
    })
  );

  socket.on(
    'start-countdown',
    withValidation('start-countdown', ({ roomCode, duration }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can start countdown' });
        return;
      }
      if (!canInteractWithEstimation(session)) {
        socket.emit('error', { message: 'Estimation voting is not unlocked yet' });
        return;
      }
      if (session.votingRevealed) {
        socket.emit('error', { message: 'Voting is already complete' });
        return;
      }
      if (session.countdownActive) {
        socket.emit('error', { message: 'Countdown is already active' });
        return;
      }

      clearCountdown(session);
      session.countdownActive = true;
      session.lastActivity = new Date();
      let secondsLeft = duration;
      io.to(roomCode).emit('countdown-started', { duration });

      session.countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          io.to(roomCode).emit('countdown-tick', {
            secondsLeft,
            totalDuration: duration,
          });
          return;
        }

        clearCountdown(session);
        session.votingRevealed = true;
        session.lastActivity = new Date();
        stopDiscussionTimer(session, roomCode, io);

        const results = calculateVotingResults(session.votes);
        if (session.currentJiraIssue) {
          recordHistory(session, {
            issueKey: session.currentJiraIssue.key,
            summary: session.currentJiraIssue.summary,
            votes: Object.fromEntries(session.votes),
            stats: {
              consensus: results.consensus,
              average: results.average,
              min: results.min,
              max: results.max,
            },
          });
        } else if (session.currentTicket) {
          recordHistory(session, {
            ticket: session.currentTicket,
            votes: Object.fromEntries(session.votes),
            stats: {
              consensus: results.consensus,
              average: results.average,
              min: results.min,
              max: results.max,
            },
          });
        }

        io.to(roomCode).emit('countdown-finished', {
          sessionData: getSessionData(session),
        });
        io.to(roomCode).emit('votes-revealed', {
          sessionData: getSessionData(session),
          results,
        });
      }, 1000);
    })
  );

  socket.on(
    'end-session',
    withValidation('end-session', ({ roomCode }: any) => {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can end session' });
        return;
      }

      clearCountdown(session);
      stopDiscussionTimer(session, roomCode, io);

      io.to(roomCode).emit('session-ended', {
        message: 'Session has been ended by the facilitator',
      });

      const room = io.sockets.adapter.rooms.get(roomCode);
      if (room) {
        room.forEach(socketId => {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket) {
            clientSocket.leave(roomCode);
          }
        });
      }

      invalidateRoomTokens(roomCode);
      memoryStore.delete(roomCode);
    })
  );

  socket.on(
    'send-chat-message',
    socketEventRateLimiters.chatMessages(
      socket,
      withValidation('send-chat-message', ({ roomCode, message }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session) return;

        const participant = getParticipantBySocketId(session, socket.id);
        if (!participant) return;

        const sanitizedMessage = sanitizeString(message);
        const chatMessage: ChatMessage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          author: participant.name,
          content: sanitizedMessage,
          timestamp: new Date(),
          type: 'message',
        };

        session.chatMessages.push(chatMessage);
        session.lastActivity = new Date();
        if (session.chatMessages.length > 100) {
          session.chatMessages = session.chatMessages.slice(-100);
        }

        io.to(roomCode).emit('chatMessage', chatMessage);
      })
    )
  );

  socket.on('typing-indicator', ({ roomCode, userName, isTyping }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant || participant.name !== userName) return;

      const existingTimeout = session.typingUsers.get(userName);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        session.typingUsers.delete(userName);
      }

      if (isTyping) {
        const timeout = setTimeout(() => {
          session.typingUsers.delete(userName);
          io.to(roomCode).emit('typingUpdate', Array.from(session.typingUsers.keys()));
        }, 5000);
        session.typingUsers.set(userName, timeout);
      }

      io.to(roomCode).emit('typingUpdate', Array.from(session.typingUsers.keys()));
    } catch (error) {
      console.error('Failed to update typing indicator', error);
      socket.emit('error', { message: 'Failed to update typing indicator' });
    }
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function calculateVotingResults(votes: Map<string, Vote>): VotingResults {
  const numericVotes = Array.from(votes.values()).filter(
    vote => typeof vote === 'number'
  ) as number[];

  const minVal = numericVotes.length > 0 ? Math.min(...numericVotes) : null;
  const maxVal = numericVotes.length > 0 ? Math.max(...numericVotes) : null;

  const results: VotingResults = {
    average:
      numericVotes.length > 0
        ? numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length
        : 0,
    voteCounts: {},
    totalVotes: votes.size,
    min: minVal,
    max: maxVal,
    consensus: '?' as Vote,
  };

  votes.forEach(vote => {
    results.voteCounts[String(vote)] = (results.voteCounts[String(vote)] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(results.voteCounts));
  const mostCommonVotes = Object.keys(results.voteCounts).filter(
    vote => results.voteCounts[vote] === maxCount
  );

  if (mostCommonVotes.length === 1) {
    const consensusKey = mostCommonVotes[0];
    results.consensus = Number.isNaN(Number(consensusKey))
      ? (consensusKey as Vote)
      : Number(consensusKey);
  } else {
    results.consensus = '-' as Vote;
  }

  if (minVal !== null && maxVal !== null && minVal !== maxVal) {
    const lowestVoters = Array.from(votes.entries())
      .filter(([, value]) => value === minVal)
      .map(([name]) => name);
    const highestVoters = Array.from(votes.entries())
      .filter(([, value]) => value === maxVal)
      .map(([name]) => name);

    results.lowestVoter = pickRandom(lowestVoters);
    results.highestVoter = pickRandom(highestVoters);
  }

  return results;
}
