import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateWeekdayLength } from '../../dist/server/utils/jiraApi.js';
import {
  createEmptyPlanningState,
  getEligiblePlanningParticipantNames,
  getSessionData,
} from '../../dist/server/utils/sessionHelpers.js';

function createSessionFixture() {
  const planning = createEmptyPlanningState(true);
  planning.stage = 'capacity';
  planning.goalDraft = 'Ship the top priority stories';
  planning.finalGoal = 'Ship the top priority stories';
  planning.goalVotes = {
    Alice: 'approve',
    Bob: 'reject',
  };
  planning.capacityEntries = {
    Alice: 6,
  };
  planning.suggestionQueue = [
    {
      id: 'pending-1',
      issue: {
        key: 'ENG-1',
        summary: 'Pending suggestion',
        description: '',
        issueType: 'Story',
        priority: 'High',
        status: 'To Do',
        assignee: 'Unassigned',
        currentStoryPoints: null,
      },
      suggestedBy: 'Alice',
      status: 'pending',
      createdAt: new Date(),
    },
  ];
  planning.approvedQueue = [
    {
      id: 'approved-1',
      issue: {
        key: 'ENG-2',
        summary: 'Approved suggestion',
        description: '',
        issueType: 'Story',
        priority: 'High',
        status: 'To Do',
        assignee: 'Unassigned',
        currentStoryPoints: null,
      },
      suggestedBy: 'Bob',
      status: 'approved',
      createdAt: new Date(),
    },
  ];

  return {
    id: 'ROOM01',
    sessionName: 'Sprint Planning',
    facilitator: { name: 'Alice', socketId: 'socket-1' },
    currentTicket: '',
    currentJiraIssue: null,
    jiraConfig: null,
    jiraIssues: [],
    planning,
    participants: new Map([
      [
        'Alice',
        {
          name: 'Alice',
          isFacilitator: true,
          isViewer: false,
          socketId: 'socket-1',
          joinedAt: new Date(),
        },
      ],
      [
        'Bob',
        {
          name: 'Bob',
          isFacilitator: false,
          isViewer: false,
          socketId: 'socket-2',
          joinedAt: new Date(),
        },
      ],
      [
        'Viewer',
        {
          name: 'Viewer',
          isFacilitator: false,
          isViewer: true,
          socketId: 'socket-3',
          joinedAt: new Date(),
        },
      ],
    ]),
    votes: new Map(),
    votingRevealed: false,
    totalVotes: 0,
    countdownActive: false,
    countdownTimer: null,
    discussionStartTime: null,
    discussionTimer: null,
    createdAt: new Date(),
    lastActivity: new Date(),
    history: [],
    aggregate: null,
    chatMessages: [],
    typingUsers: new Map(),
    socketToParticipant: new Map(),
    participantToSocket: new Map(),
  };
}

test('calculateWeekdayLength counts working days only', () => {
  assert.equal(calculateWeekdayLength('2026-04-20', '2026-04-24'), 5);
  assert.equal(calculateWeekdayLength('2026-04-20', '2026-04-26'), 5);
  assert.equal(calculateWeekdayLength('2026-04-25', '2026-04-26'), 0);
});

test('eligible planning participants exclude viewers', () => {
  const session = createSessionFixture();
  assert.deepEqual(getEligiblePlanningParticipantNames(session), ['Alice', 'Bob']);
});

test('session planning summary reports goal, capacity, and queue counts', () => {
  const session = createSessionFixture();
  const sessionData = getSessionData(session);

  assert.equal(sessionData.planning.summary.eligibleVoterCount, 2);
  assert.equal(sessionData.planning.summary.goalVotesSubmitted, 2);
  assert.equal(sessionData.planning.summary.goalApproveCount, 1);
  assert.equal(sessionData.planning.summary.goalRejectCount, 1);
  assert.equal(sessionData.planning.summary.capacitySubmittedCount, 1);
  assert.equal(sessionData.planning.summary.totalCapacityDays, 6);
  assert.equal(sessionData.planning.summary.averageCapacityDays, 6);
  assert.equal(sessionData.planning.summary.pendingSuggestionCount, 1);
  assert.equal(sessionData.planning.summary.approvedSuggestionCount, 1);
});
