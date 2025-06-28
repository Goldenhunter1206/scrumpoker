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
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Node.js Jira Client)'
      }
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
        error: (responseData as any)?.errorMessages?.[0] || response.statusText
      };
    }

    return { success: true, data: responseData as T };
  } catch (error) {
    console.error('Jira API Error:', (error as Error).message);
    return {
      success: false,
      error: (error as Error).message
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

export async function getJiraBoardIssues(
  config: JiraConfig & { email: string; token: string }, 
  boardId: string
): Promise<JiraApiResponse<{ issues: JiraIssue[] }>> {
  const base = `agile/1.0/board/${boardId}/backlog`;
  const fields = `key,summary,description,issuetype,priority,status,assignee,${JIRA_STORYPOINT_FIELD}`;

  let startAt = 0;
  const maxResults = 100;
  let allIssues: any[] = [];
  let isLast = false;

  while (!isLast) {
    const endpoint = `${base}?fields=${fields}&startAt=${startAt}&maxResults=${maxResults}`;
    const pageResult = await makeJiraRequest(config, endpoint);

    if (!pageResult.success) {
      return pageResult as JiraApiResponse<{ issues: JiraIssue[] }>;
    }

    const data = pageResult.data as any;
    allIssues = allIssues.concat(data.issues || []);

    if (data.isLast || (data.startAt + data.maxResults) >= data.total) {
      isLast = true;
    } else {
      startAt += maxResults;
    }
  }

  const transformedIssues: JiraIssue[] = allIssues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    description: issue.fields.description || '',
    issueType: issue.fields.issuetype?.name || 'Story',
    priority: issue.fields.priority?.name || 'Medium',
    status: issue.fields.status?.name || 'To Do',
    assignee: issue.fields.assignee?.displayName || 'Unassigned',
    currentStoryPoints: issue.fields[JIRA_STORYPOINT_FIELD] || null
  }));

  return { success: true, data: { issues: transformedIssues } };
}

export async function updateJiraIssueStoryPoints(
  config: JiraConfig & { email: string; token: string }, 
  issueKey: string, 
  storyPoints: number
): Promise<JiraApiResponse<any>> {
  const endpoint = `issue/${issueKey}`;
  const data = {
    fields: {
      [JIRA_STORYPOINT_FIELD]: storyPoints
    }
  };
  
  return await makeJiraRequest(config, endpoint, { method: 'PUT', data });
}

export function roundToNearestFibonacci(value: number): number | null {
  const fibonacci = [0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  if (typeof value !== 'number' || isNaN(value)) return null;
  
  let closest = fibonacci[0];
  let minDiff = Math.abs(value - closest);
  
  for (let fib of fibonacci) {
    const diff = Math.abs(value - fib);
    if (diff < minDiff) {
      minDiff = diff;
      closest = fib;
    }
  }
  
  return closest;
}