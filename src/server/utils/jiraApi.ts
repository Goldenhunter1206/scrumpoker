import { JiraConfig, JiraIssue, JiraBoard } from '@shared/types/index.js';

interface JiraApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface JiraRequestOptions {
  method?: string;
  data?: any;
}

const JIRA_STORYPOINT_FIELD = process.env.JIRA_STORYPOINT_FIELD || 'customfield_10016';
const JIRA_SPRINT_FIELD = process.env.JIRA_SPRINT_FIELD || 'customfield_10020';

// Helper to extract text from Atlassian Document Format (ADF)
function extractTextFromADF(adfContent: any): string {
  if (!adfContent || !adfContent.content) return '';

  function extractFromNode(node: any): string {
    if (!node) return '';

    // If it's a text node, return the text
    if (node.type === 'text') {
      return node.text || '';
    }

    // If it has content, recursively extract from children
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractFromNode).join('');
    }

    // For other node types, try to extract meaningful content
    if (node.type === 'paragraph' || node.type === 'heading') {
      return node.content ? node.content.map(extractFromNode).join('') + '\n' : '';
    }

    return '';
  }

  return adfContent.content.map(extractFromNode).join('').trim();
}

export async function makeJiraRequest<T>(
  config: JiraConfig & { email: string; token: string },
  endpoint: string,
  options: JiraRequestOptions = {}
): Promise<JiraApiResponse<T>> {
  const { method = 'GET', data = null } = options;
  const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');

  const baseUrl = endpoint.startsWith('agile/')
    ? `https://${config.domain}/rest/${endpoint}`
    : `https://${config.domain}/rest/api/3/${endpoint}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Node.js Jira Client)',
      },
    };

    if (data) {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(baseUrl, fetchOptions);
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Jira API Error:', responseData);
      return {
        success: false,
        error: (responseData as any)?.errorMessages?.[0] || response.statusText,
      };
    }

    return { success: true, data: responseData as T };
  } catch (error) {
    console.error('Jira API Error:', (error as Error).message);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function getJiraBoards(
  config: JiraConfig & { email: string; token: string },
  projectKey?: string
): Promise<JiraApiResponse<{ values: JiraBoard[] }>> {
  const endpointBase = 'agile/1.0/board';
  const endpoint = projectKey
    ? `${endpointBase}?projectKeyOrId=${encodeURIComponent(projectKey)}`
    : endpointBase;

  return await makeJiraRequest(config, endpoint);
}

function extractSprintInfo(sprintField: any): {
  sprintId?: number;
  sprintName?: string;
  sprintState?: string;
} {
  if (!sprintField) return {};

  // Jira returns sprint as an array; pick the most recent active/future sprint
  const sprints = Array.isArray(sprintField) ? sprintField : [sprintField];
  const preferred = sprints.find((s: any) => s.state === 'active') ||
    sprints.find((s: any) => s.state === 'future') ||
    sprints[sprints.length - 1];

  if (!preferred) return {};

  return {
    sprintId: preferred.id,
    sprintName: preferred.name,
    sprintState: preferred.state,
  };
}

function transformIssue(issue: any): JiraIssue {
  const sprintInfo = extractSprintInfo(issue.fields[JIRA_SPRINT_FIELD]);
  return {
    key: issue.key,
    summary: issue.fields.summary,
    description: issue.fields.description || '',
    issueType: issue.fields.issuetype?.name || 'Story',
    priority: issue.fields.priority?.name || 'Medium',
    status: issue.fields.status?.name || 'To Do',
    assignee: issue.fields.assignee?.displayName || 'Unassigned',
    currentStoryPoints: issue.fields[JIRA_STORYPOINT_FIELD] || null,
    ...sprintInfo,
  };
}

async function fetchAllPaginatedIssues(
  config: JiraConfig & { email: string; token: string },
  base: string,
  fields: string
): Promise<any[] | null> {
  const maxResults = 100;
  let allIssues: any[] = [];

  const firstResult = await makeJiraRequest(
    config,
    `${base}?fields=${fields}&startAt=0&maxResults=${maxResults}`
  );
  if (!firstResult.success) return null;

  const firstData = firstResult.data as any;
  allIssues = allIssues.concat(firstData.issues || []);
  const total = firstData.total || 0;

  if (total > maxResults) {
    const batchSize = 3;
    const remaining: Promise<any>[] = [];

    for (let start = maxResults; start < total; start += maxResults) {
      remaining.push(
        makeJiraRequest(config, `${base}?fields=${fields}&startAt=${start}&maxResults=${maxResults}`)
      );

      if (remaining.length >= batchSize || start + maxResults >= total) {
        const batchResults = await Promise.all(remaining);
        for (const r of batchResults) {
          if (r.success) allIssues = allIssues.concat((r.data as any).issues || []);
        }
        remaining.length = 0;
        if (start + maxResults < total) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }

  return allIssues;
}

export async function getJiraBoardIssues(
  config: JiraConfig & { email: string; token: string },
  boardId: string
): Promise<JiraApiResponse<{ issues: JiraIssue[] }>> {
  const fields = `key,summary,description,issuetype,priority,status,assignee,${JIRA_STORYPOINT_FIELD},${JIRA_SPRINT_FIELD}`;

  try {
    // Fetch backlog and active/future sprint issues in parallel
    const [backlogIssues, sprintsResult] = await Promise.all([
      fetchAllPaginatedIssues(config, `agile/1.0/board/${boardId}/backlog`, fields),
      makeJiraRequest<{ values: Array<{ id: number; name: string; state: string }> }>(
        config,
        `agile/1.0/board/${boardId}/sprint?state=active,future`
      ),
    ]);

    if (backlogIssues === null) {
      return { success: false, error: 'Failed to fetch backlog issues' };
    }

    // Fetch sprint issues for all active/future sprints
    const sprints = sprintsResult.success ? (sprintsResult.data?.values ?? []) : [];
    const sprintIssueArrays = await Promise.all(
      sprints.map(sprint =>
        fetchAllPaginatedIssues(config, `agile/1.0/sprint/${sprint.id}/issue`, fields)
      )
    );

    // Merge all issues, deduplicating by key (sprint issues take precedence for sprint info)
    const issueMap = new Map<string, any>();
    for (const issue of backlogIssues) {
      issueMap.set(issue.key, issue);
    }
    for (const issueArray of sprintIssueArrays) {
      if (issueArray) {
        for (const issue of issueArray) {
          issueMap.set(issue.key, issue); // overwrite with sprint version
        }
      }
    }

    const transformedIssues: JiraIssue[] = Array.from(issueMap.values()).map(transformIssue);

    return { success: true, data: { issues: transformedIssues } };
  } catch (error) {
    console.error('Error fetching Jira issues:', error);
    return {
      success: false,
      error: 'Failed to fetch issues due to pagination error',
    };
  }
}

export async function updateJiraIssueStoryPoints(
  config: JiraConfig & { email: string; token: string },
  issueKey: string,
  storyPoints: number
): Promise<JiraApiResponse<any>> {
  const endpoint = `issue/${issueKey}`;
  const data = {
    fields: {
      [JIRA_STORYPOINT_FIELD]: storyPoints,
    },
  };

  return await makeJiraRequest(config, endpoint, { method: 'PUT', data });
}

export function roundToNearestFibonacci(value: number): number | null {
  const fibonacci = [0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  if (typeof value !== 'number' || isNaN(value)) return null;

  let closest = fibonacci[0];
  let minDiff = Math.abs(value - closest);

  for (const fib of fibonacci) {
    const diff = Math.abs(value - fib);
    if (diff < minDiff) {
      minDiff = diff;
      closest = fib;
    }
  }

  return closest;
}

export async function getJiraIssueDetails(
  config: JiraConfig & { email: string; token: string },
  issueKey: string
): Promise<JiraApiResponse<any>> {
  try {
    // Get detailed issue information including comments
    const issueResponse = await makeJiraRequest(
      config,
      `issue/${issueKey}?expand=renderedFields,comments,attachments,worklog`
    );

    if (!issueResponse.success || !issueResponse.data) {
      return issueResponse;
    }

    const issue = issueResponse.data as any;

    // Format the response with the most useful information for split-screen view
    const detailedIssue = {
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.renderedFields?.description || issue.fields.description || '',
      issueType: issue.fields.issuetype?.name || '',
      priority: issue.fields.priority?.name || '',
      status: issue.fields.status?.name || '',
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      reporter: issue.fields.reporter?.displayName || '',
      created: issue.fields.created,
      updated: issue.fields.updated,
      storyPoints: issue.fields[JIRA_STORYPOINT_FIELD] || null,
      labels: issue.fields.labels || [],
      components: issue.fields.components?.map((comp: any) => comp.name) || [],
      fixVersions: issue.fields.fixVersions?.map((version: any) => version.name) || [],
      url: `https://${config.domain}/browse/${issue.key}`,
      project: {
        key: issue.fields.project?.key || '',
        name: issue.fields.project?.name || '',
      },
      comments:
        issue.fields.comment?.comments?.slice(0, 10).map((comment: any) => {
          // Extract text from Atlassian Document Format if needed
          let bodyText = '';
          if (comment.renderedBody) {
            bodyText = comment.renderedBody;
          } else if (typeof comment.body === 'string') {
            bodyText = comment.body;
          } else if (comment.body && comment.body.content) {
            // Parse Atlassian Document Format
            bodyText = extractTextFromADF(comment.body);
          } else {
            bodyText = '';
          }

          return {
            id: comment.id,
            author: comment.author?.displayName || '',
            body: bodyText,
            created: comment.created,
            updated: comment.updated,
          };
        }) || [],
      attachments:
        issue.fields.attachment?.slice(0, 10).map((attachment: any) => ({
          id: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          mimeType: attachment.mimeType,
          created: attachment.created,
          author: attachment.author?.displayName || '',
        })) || [],
      worklog:
        issue.fields.worklog?.worklogs?.slice(0, 5).map((work: any) => ({
          id: work.id,
          author: work.author?.displayName || '',
          timeSpent: work.timeSpent,
          started: work.started,
          comment: work.comment || '',
        })) || [],
    };

    return {
      success: true,
      data: detailedIssue,
    };
  } catch (error) {
    console.error('Error fetching Jira issue details:', error);
    return {
      success: false,
      error: 'Failed to fetch issue details',
    };
  }
}
