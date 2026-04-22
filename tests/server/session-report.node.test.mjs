import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionReport,
  renderSessionReportMarkdown,
} from '../../dist/shared/utils/sessionReport.js';
import { recordAttendance, getSessionData } from '../../dist/server/utils/sessionHelpers.js';

function createInternalSessionFixture() {
  return {
    id: 'ROOM99',
    sessionName: 'Sprint Planning',
    facilitator: { name: 'Alice', socketId: 'socket-1' },
    currentTicket: '',
    currentJiraIssue: null,
    jiraConfig: {
      domain: 'example.atlassian.net',
      email: 'alice@example.com',
      token: 'token',
      hasToken: true,
    },
    jiraIssues: [],
    planning: {
      enabled: true,
      stage: 'estimation',
      boardId: '42',
      boardName: 'Platform',
      selectedSprintId: 7,
      selectedSprintName: 'Sprint 42',
      selectedSprintState: 'future',
      selectedSprintStartDate: '2026-04-20',
      selectedSprintEndDate: '2026-05-01',
      availableSprints: [],
      sprintLengthDays: 10,
      goalDraft: 'Finish the sprint planning commitments',
      finalGoal: 'Finish the sprint planning commitments',
      goalVoteRevealed: true,
      goalVotes: { Alice: 'approve', Bob: 'approve' },
      goalSkipped: false,
      capacityEntries: { Alice: 6, Bob: 5 },
      capacitySkipped: false,
      suggestionQueue: [],
      approvedQueue: [],
      summary: {
        eligibleVoterCount: 2,
        goalVotesSubmitted: 2,
        goalApproveCount: 2,
        goalRejectCount: 0,
        capacitySubmittedCount: 2,
        totalCapacityDays: 11,
        averageCapacityDays: 5.5,
        pendingSuggestionCount: 0,
        approvedSuggestionCount: 0,
      },
    },
    attendance: [],
    participants: new Map([
      [
        'Alice',
        {
          name: 'Alice',
          isFacilitator: true,
          isViewer: false,
          socketId: 'socket-1',
          joinedAt: new Date('2026-04-22T08:00:00.000Z'),
        },
      ],
      [
        'Bob',
        {
          name: 'Bob',
          isFacilitator: false,
          isViewer: false,
          socketId: 'socket-2',
          joinedAt: new Date('2026-04-22T08:05:00.000Z'),
        },
      ],
      [
        'Carol',
        {
          name: 'Carol',
          isFacilitator: false,
          isViewer: true,
          socketId: 'socket-3',
          joinedAt: new Date('2026-04-22T08:10:00.000Z'),
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
    createdAt: new Date('2026-04-22T08:00:00.000Z'),
    lastActivity: new Date('2026-04-22T09:30:00.000Z'),
    history: [
      {
        issueKey: 'ENG-1',
        summary: 'Build sprint summary export',
        votes: { Alice: 3, Bob: 5 },
        stats: { consensus: '-', average: 4, min: 3, max: 5 },
        timestamp: new Date('2026-04-22T08:30:00.000Z'),
      },
      {
        issueKey: 'ENG-1',
        summary: 'Build sprint summary export',
        votes: { Alice: 5, Bob: 5 },
        stats: { consensus: 5, average: 5, min: 5, max: 5 },
        timestamp: new Date('2026-04-22T08:42:00.000Z'),
      },
      {
        issueKey: 'ENG-1',
        summary: 'Build sprint summary export',
        storyPoints: 5,
        originalEstimate: 4.8,
        timestamp: new Date('2026-04-22T08:45:00.000Z'),
      },
      {
        ticket: 'Investigate SSO rollout',
        votes: { Alice: 1, Bob: 2 },
        stats: { consensus: '-', average: 1.5, min: 1, max: 2 },
        timestamp: new Date('2026-04-22T09:00:00.000Z'),
      },
    ],
    aggregate: null,
    chatMessages: [],
    typingUsers: new Map(),
    socketToParticipant: new Map(),
    participantToSocket: new Map(),
  };
}

test('recordAttendance keeps the first join time and preserves ordering in session data', () => {
  const session = createInternalSessionFixture();

  recordAttendance(session, 'Bob', new Date('2026-04-22T08:05:00.000Z'));
  recordAttendance(session, 'Alice', new Date('2026-04-22T08:00:00.000Z'));
  recordAttendance(session, 'Bob', new Date('2026-04-22T08:20:00.000Z'));
  recordAttendance(session, 'Carol', new Date('2026-04-22T08:10:00.000Z'));

  const sessionData = getSessionData(session);
  assert.deepEqual(
    sessionData.attendance.map(entry => entry.name),
    ['Alice', 'Bob', 'Carol']
  );
  assert.equal(
    new Date(sessionData.attendance[1].firstJoinedAt).toISOString(),
    '2026-04-22T08:05:00.000Z'
  );
});

test('buildSessionReport aggregates final ticket rounds, estimates, and jira links', () => {
  const session = createInternalSessionFixture();
  recordAttendance(session, 'Alice', new Date('2026-04-22T08:00:00.000Z'));
  recordAttendance(session, 'Bob', new Date('2026-04-22T08:05:00.000Z'));
  recordAttendance(session, 'Carol', new Date('2026-04-22T08:10:00.000Z'));

  const report = buildSessionReport(getSessionData(session), {
    generatedAt: new Date('2026-04-22T09:30:00.000Z'),
    jiraBaseUrl: 'https://example.atlassian.net',
  });

  assert.equal(report.title, '2026-04-22 Sprint 42');
  assert.equal(report.goal?.text, 'Finish the sprint planning commitments');
  assert.equal(report.capacity?.totalDays, 11);
  assert.equal(report.capacity?.members.length, 2);
  assert.equal(report.tickets.length, 2);

  const jiraTicket = report.tickets.find(ticket => ticket.issueKey === 'ENG-1');
  assert.ok(jiraTicket);
  assert.equal(jiraTicket.roundCount, 2);
  assert.equal(jiraTicket.finalEstimate, 5);
  assert.deepEqual(jiraTicket.finalVotes, { Alice: 5, Bob: 5 });
  assert.equal(jiraTicket.link, 'https://example.atlassian.net/browse/ENG-1');

  const manualTicket = report.tickets.find(ticket => ticket.ticketLabel === 'Investigate SSO rollout');
  assert.ok(manualTicket);
  assert.equal(manualTicket.roundCount, 1);
  assert.equal(manualTicket.finalEstimate, null);

  const markdown = renderSessionReportMarkdown(report);
  assert.match(markdown, /# 2026-04-22 Sprint 42/);
  assert.match(
    markdown,
    /\[ENG\\-1: Build sprint summary export\]\(https:\/\/example\.atlassian\.net\/browse\/ENG-1\)/
  );
  assert.match(markdown, /Total available days: 11/);
});
