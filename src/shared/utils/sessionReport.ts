import {
  AttendanceEntry,
  EstimationHistoryEntry,
  SessionData,
  SessionReport,
  SessionReportCapacity,
  SessionReportGoal,
  SessionReportTicket,
  Vote,
} from '../types/index.js';

interface BuildSessionReportOptions {
  generatedAt?: Date;
  jiraBaseUrl?: string;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatReportDate(dateLike: Date | string): string {
  const date = new Date(dateLike);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function formatReportDateTime(dateLike: Date | string): string {
  const date = new Date(dateLike);
  return `${formatReportDate(date)} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}()#+.!|>-]|\[|\])/g, '\\$1');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normaliseAttendance(entries: AttendanceEntry[]): AttendanceEntry[] {
  return [...entries].sort(
    (left, right) =>
      new Date(left.firstJoinedAt).getTime() - new Date(right.firstJoinedAt).getTime()
  );
}

function buildReportGoal(session: SessionData): SessionReportGoal | null {
  if (!session.planning.enabled) return null;

  const finalGoal = session.planning.finalGoal.trim();
  const draftGoal = session.planning.goalDraft.trim();

  if (finalGoal) {
    return {
      text: finalGoal,
      status: 'finalized',
    };
  }

  if (draftGoal) {
    return {
      text: draftGoal,
      status: 'draft',
    };
  }

  if (session.planning.goalSkipped) {
    return {
      text: '',
      status: 'skipped',
    };
  }

  return {
    text: '',
    status: 'not-set',
  };
}

function buildReportCapacity(session: SessionData): SessionReportCapacity | null {
  if (!session.planning.enabled) return null;

  const members = session.participants
    .filter(participant => !participant.isViewer)
    .map(participant => ({
      name: participant.name,
      availabilityDays:
        typeof session.planning.capacityEntries[participant.name] === 'number'
          ? Number(session.planning.capacityEntries[participant.name])
          : null,
    }));

  const submittedMembers = members.filter(
    member => typeof member.availabilityDays === 'number'
  ) as Array<{ name: string; availabilityDays: number }>;

  const totalDays = submittedMembers.reduce((sum, member) => sum + member.availabilityDays, 0);

  return {
    skipped: session.planning.capacitySkipped,
    sprintLengthDays: session.planning.sprintLengthDays,
    members,
    totalDays,
    averageDays: submittedMembers.length ? totalDays / submittedMembers.length : null,
  };
}

interface TicketAccumulator {
  issueKey?: string;
  summary: string;
  ticketLabel: string;
  rounds: EstimationHistoryEntry[];
  finalEstimate: number | null;
  lastDiscussedAt: Date;
}

function buildTicketLabel(entry: EstimationHistoryEntry): string {
  if (entry.issueKey) {
    const summary = entry.summary?.trim();
    return summary ? `${entry.issueKey}: ${summary}` : entry.issueKey;
  }

  return entry.ticket?.trim() || 'Untitled ticket';
}

function buildTicketSummary(entry: EstimationHistoryEntry): string {
  if (entry.summary?.trim()) {
    return entry.summary.trim();
  }

  if (entry.ticket?.trim()) {
    return entry.ticket.trim();
  }

  return entry.issueKey?.trim() || 'Untitled ticket';
}

function buildReportTickets(
  history: EstimationHistoryEntry[],
  jiraBaseUrl?: string
): SessionReportTicket[] {
  const grouped = new Map<string, TicketAccumulator>();
  const orderedKeys: string[] = [];

  history.forEach(entry => {
    const key = entry.issueKey || entry.ticket?.trim();
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        issueKey: entry.issueKey,
        summary: buildTicketSummary(entry),
        ticketLabel: buildTicketLabel(entry),
        rounds: [],
        finalEstimate: null,
        lastDiscussedAt: new Date(entry.timestamp),
      });
      orderedKeys.push(key);
    }

    const accumulator = grouped.get(key)!;

    if (entry.summary?.trim()) {
      accumulator.summary = entry.summary.trim();
    } else if (!accumulator.summary && entry.ticket?.trim()) {
      accumulator.summary = entry.ticket.trim();
    }

    accumulator.ticketLabel = buildTicketLabel({
      ...entry,
      summary: accumulator.summary,
    });
    accumulator.lastDiscussedAt = new Date(entry.timestamp);

    if (entry.votes) {
      accumulator.rounds.push(entry);
    }

    if (typeof entry.storyPoints === 'number') {
      accumulator.finalEstimate = entry.storyPoints;
    }
  });

  return orderedKeys.map(key => {
    const accumulator = grouped.get(key)!;
    const finalRound = accumulator.rounds[accumulator.rounds.length - 1];
    const stats = finalRound?.stats;

    return {
      issueKey: accumulator.issueKey,
      ticketLabel: accumulator.ticketLabel,
      summary: accumulator.summary,
      link:
        accumulator.issueKey && jiraBaseUrl
          ? `${jiraBaseUrl.replace(/\/$/, '')}/browse/${accumulator.issueKey}`
          : undefined,
      roundCount: accumulator.rounds.length,
      finalVotes: finalRound?.votes || {},
      consensus: stats?.consensus ?? null,
      average: typeof stats?.average === 'number' ? stats.average : null,
      min: typeof stats?.min === 'number' ? stats.min : null,
      max: typeof stats?.max === 'number' ? stats.max : null,
      finalEstimate: accumulator.finalEstimate,
      lastDiscussedAt: accumulator.lastDiscussedAt,
    };
  });
}

export function buildDefaultSessionReportTitle(
  session: Pick<SessionData, 'sessionName' | 'planning'>,
  referenceDate: Date = new Date()
): string {
  const suffix =
    session.planning.selectedSprintName?.trim() || session.sessionName.trim() || 'Session';
  return `${formatReportDate(referenceDate)} ${suffix}`;
}

export function buildSessionReport(
  session: SessionData,
  options: BuildSessionReportOptions = {}
): SessionReport {
  const generatedAt = options.generatedAt || new Date();
  const attendees = normaliseAttendance(session.attendance || []);

  return {
    title: buildDefaultSessionReportTitle(session, generatedAt),
    sessionName: session.sessionName,
    facilitator: session.facilitator,
    generatedAt,
    planningEnabled: session.planning.enabled,
    sprintName: session.planning.selectedSprintName,
    attendees,
    goal: buildReportGoal(session),
    capacity: buildReportCapacity(session),
    tickets: buildReportTickets(session.history || [], options.jiraBaseUrl),
  };
}

export function buildSessionReportFilename(report: SessionReport): string {
  return `${report.title.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'session_summary'}.md`;
}

function formatVoteValue(vote: Vote): string {
  return typeof vote === 'number' ? String(vote) : vote;
}

function renderGoalMarkdown(report: SessionReport): string[] {
  if (!report.goal) return [];

  const lines = ['## Sprint Goal'];

  if (report.goal.status === 'skipped') {
    lines.push('Sprint goal voting was skipped.');
    return lines;
  }

  if (report.goal.status === 'not-set') {
    lines.push('No sprint goal was recorded.');
    return lines;
  }

  lines.push(`Status: ${report.goal.status}`);
  lines.push('');
  lines.push(report.goal.text);
  return lines;
}

function renderCapacityMarkdown(report: SessionReport): string[] {
  if (!report.capacity) return [];

  const lines = ['## Capacity'];

  if (report.capacity.skipped) {
    lines.push('Capacity planning was skipped.');
    return lines;
  }

  if (report.capacity.sprintLengthDays !== null) {
    lines.push(`Sprint length: ${report.capacity.sprintLengthDays} working days`);
  }

  if (!report.capacity.members.length) {
    lines.push('No voting members were recorded.');
    return lines;
  }

  lines.push('');
  report.capacity.members.forEach(member => {
    const value =
      typeof member.availabilityDays === 'number'
        ? `${member.availabilityDays} days`
        : 'Not submitted';
    lines.push(`- ${member.name}: ${value}`);
  });
  lines.push('');
  lines.push(`Total available days: ${report.capacity.totalDays}`);
  if (report.capacity.averageDays !== null) {
    lines.push(`Average available days: ${report.capacity.averageDays.toFixed(1)}`);
  }

  return lines;
}

function renderTicketsMarkdown(report: SessionReport): string[] {
  const lines = ['## Tickets Discussed'];

  if (!report.tickets.length) {
    lines.push('No tickets were discussed.');
    return lines;
  }

  report.tickets.forEach(ticket => {
    const title = ticket.link
      ? `[${escapeMarkdown(ticket.ticketLabel)}](${ticket.link})`
      : escapeMarkdown(ticket.ticketLabel);

    lines.push(`### ${title}`);
    lines.push(`- Rounds discussed: ${ticket.roundCount}`);
    if (ticket.finalEstimate !== null) {
      lines.push(`- Final estimate: ${ticket.finalEstimate}`);
    }
    if (ticket.consensus !== null) {
      lines.push(`- Final consensus: ${formatVoteValue(ticket.consensus)}`);
    }
    if (ticket.average !== null) {
      lines.push(`- Final average: ${ticket.average.toFixed(2)}`);
    }
    if (ticket.min !== null || ticket.max !== null) {
      lines.push(`- Final range: ${ticket.min ?? '-'} to ${ticket.max ?? '-'}`);
    }
    lines.push(`- Last discussed: ${formatReportDateTime(ticket.lastDiscussedAt)}`);

    const finalVotes = Object.entries(ticket.finalVotes);
    if (finalVotes.length) {
      lines.push('- Final votes:');
      finalVotes.forEach(([name, vote]) => {
        lines.push(`  - ${name}: ${formatVoteValue(vote)}`);
      });
    } else {
      lines.push('- Final votes: No revealed vote round recorded');
    }

    lines.push('');
  });

  return lines;
}

export function renderSessionReportMarkdown(report: SessionReport): string {
  const lines = [
    `# ${report.title}`,
    '',
    `Generated: ${formatReportDateTime(report.generatedAt)}`,
    `Session: ${report.sessionName}`,
    `Facilitator: ${report.facilitator}`,
  ];

  if (report.sprintName) {
    lines.push(`Sprint: ${report.sprintName}`);
  }

  lines.push('');
  lines.push('## Members Attended');
  if (report.attendees.length) {
    report.attendees.forEach(attendee => {
      lines.push(`- ${attendee.name} (${formatReportDateTime(attendee.firstJoinedAt)})`);
    });
  } else {
    lines.push('No attendees were recorded.');
  }

  if (report.planningEnabled) {
    lines.push('');
    lines.push(...renderGoalMarkdown(report));
    lines.push('');
    lines.push(...renderCapacityMarkdown(report));
  }

  lines.push('');
  lines.push(...renderTicketsMarkdown(report));

  return lines.join('\n').trimEnd() + '\n';
}

function renderCapacityTable(report: SessionReport): string {
  if (!report.capacity) return '';
  if (report.capacity.skipped) {
    return '<p>Capacity planning was skipped.</p>';
  }
  if (!report.capacity.members.length) {
    return '<p>No voting members were recorded.</p>';
  }

  const rows = report.capacity.members
    .map(
      member =>
        `<tr><td>${escapeHtml(member.name)}</td><td>${
          typeof member.availabilityDays === 'number'
            ? escapeHtml(String(member.availabilityDays))
            : 'Not submitted'
        }</td></tr>`
    )
    .join('');

  const summaryRows = [
    `<p>Total available days: <strong>${escapeHtml(String(report.capacity.totalDays))}</strong></p>`,
    report.capacity.averageDays !== null
      ? `<p>Average available days: <strong>${escapeHtml(report.capacity.averageDays.toFixed(1))}</strong></p>`
      : '',
  ].join('');

  return `<table><tbody><tr><th>Member</th><th>Availability (days)</th></tr>${rows}</tbody></table>${summaryRows}`;
}

function renderTicketVotesHtml(ticket: SessionReportTicket): string {
  const votes = Object.entries(ticket.finalVotes);
  if (!votes.length) {
    return '<p>No revealed vote round recorded.</p>';
  }

  const items = votes
    .map(([name, vote]) => `<li>${escapeHtml(name)}: ${escapeHtml(formatVoteValue(vote))}</li>`)
    .join('');

  return `<ul>${items}</ul>`;
}

export function renderSessionReportConfluenceStorage(report: SessionReport): string {
  const attendeeItems = report.attendees.length
    ? `<ul>${report.attendees
        .map(
          attendee =>
            `<li>${escapeHtml(attendee.name)} (${escapeHtml(formatReportDateTime(attendee.firstJoinedAt))})</li>`
        )
        .join('')}</ul>`
    : '<p>No attendees were recorded.</p>';

  const goalHtml = !report.planningEnabled
    ? ''
    : report.goal?.status === 'skipped'
      ? '<p>Sprint goal voting was skipped.</p>'
      : report.goal?.status === 'not-set'
        ? '<p>No sprint goal was recorded.</p>'
        : `<p><strong>Status:</strong> ${escapeHtml(report.goal?.status || 'not-set')}</p><p>${escapeHtml(
            report.goal?.text || ''
          ).replace(/\n/g, '<br />')}</p>`;

  const ticketsHtml = report.tickets.length
    ? report.tickets
        .map(ticket => {
          const metadata = [
            `<li>Rounds discussed: ${escapeHtml(String(ticket.roundCount))}</li>`,
            ticket.finalEstimate !== null
              ? `<li>Final estimate: ${escapeHtml(String(ticket.finalEstimate))}</li>`
              : '',
            ticket.consensus !== null
              ? `<li>Final consensus: ${escapeHtml(formatVoteValue(ticket.consensus))}</li>`
              : '',
            ticket.average !== null
              ? `<li>Final average: ${escapeHtml(ticket.average.toFixed(2))}</li>`
              : '',
            ticket.min !== null || ticket.max !== null
              ? `<li>Final range: ${escapeHtml(String(ticket.min ?? '-'))} to ${escapeHtml(
                  String(ticket.max ?? '-')
                )}</li>`
              : '',
            `<li>Last discussed: ${escapeHtml(formatReportDateTime(ticket.lastDiscussedAt))}</li>`,
            ticket.link ? `<li><a href="${escapeHtml(ticket.link)}">Open Jira issue</a></li>` : '',
          ]
            .filter(Boolean)
            .join('');

          return [
            `<h3>${escapeHtml(ticket.ticketLabel)}</h3>`,
            `<ul>${metadata}</ul>`,
            '<p><strong>Final votes</strong></p>',
            renderTicketVotesHtml(ticket),
          ].join('');
        })
        .join('')
    : '<p>No tickets were discussed.</p>';

  return [
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<p><strong>Generated:</strong> ${escapeHtml(formatReportDateTime(report.generatedAt))}</p>`,
    `<p><strong>Session:</strong> ${escapeHtml(report.sessionName)}</p>`,
    `<p><strong>Facilitator:</strong> ${escapeHtml(report.facilitator)}</p>`,
    report.sprintName ? `<p><strong>Sprint:</strong> ${escapeHtml(report.sprintName)}</p>` : '',
    '<h2>Members Attended</h2>',
    attendeeItems,
    report.planningEnabled ? '<h2>Sprint Goal</h2>' : '',
    report.planningEnabled ? goalHtml : '',
    report.planningEnabled ? '<h2>Capacity</h2>' : '',
    report.planningEnabled ? renderCapacityTable(report) : '',
    '<h2>Tickets Discussed</h2>',
    ticketsHtml,
  ]
    .filter(Boolean)
    .join('');
}
