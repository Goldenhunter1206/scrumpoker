import {
  JiraConfig,
  JiraIssue,
  JiraBoard,
  PlanningSprint,
  ConfluencePageSearchResult,
} from '@shared/types/index.js';

interface JiraApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface JiraRequestOptions {
  method?: string;
  data?: any;
}

interface AtlassianRequestOptions {
  method?: string;
  data?: any;
}

const JIRA_STORYPOINT_FIELD = process.env.JIRA_STORYPOINT_FIELD || 'customfield_10016';
const JIRA_SPRINT_FIELD = process.env.JIRA_SPRINT_FIELD || 'customfield_10020';

function extractTextFromADF(adfContent: any): string {
  if (!adfContent || !adfContent.content) return '';

  function extractFromNode(node: any): string {
    if (!node) return '';
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractFromNode).join('');
    }
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

async function makeAtlassianSiteRequest<T>(
  config: JiraConfig & { email: string; token: string },
  path: string,
  options: AtlassianRequestOptions = {}
): Promise<JiraApiResponse<T>> {
  const { method = 'GET', data = null } = options;
  const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
  const baseUrl = `https://${config.domain}${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Node.js Atlassian Client)',
      },
    };

    if (data) {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(baseUrl, fetchOptions);
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Atlassian API Error:', responseData);
      return {
        success: false,
        error:
          (responseData as any)?.message ||
          (responseData as any)?.errorMessages?.[0] ||
          response.statusText,
      };
    }

    return { success: true, data: responseData as T };
  } catch (error) {
    console.error('Atlassian API Error:', (error as Error).message);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

function escapeConfluenceCql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildConfluencePageUrl(domain: string, pageId: string, webuiPath?: string): string {
  if (webuiPath) {
    return `https://${domain}${webuiPath.startsWith('/') ? webuiPath : `/${webuiPath}`}`;
  }

  return `https://${domain}/wiki/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`;
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

  const sprints = Array.isArray(sprintField) ? sprintField : [sprintField];
  const preferred =
    sprints.find((s: any) => s.state === 'active') ||
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
        makeJiraRequest(
          config,
          `${base}?fields=${fields}&startAt=${start}&maxResults=${maxResults}`
        )
      );

      if (remaining.length >= batchSize || start + maxResults >= total) {
        const batchResults = await Promise.all(remaining);
        for (const result of batchResults) {
          if (result.success) allIssues = allIssues.concat((result.data as any).issues || []);
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

function issueFields(): string {
  return `key,summary,description,issuetype,priority,status,assignee,${JIRA_STORYPOINT_FIELD},${JIRA_SPRINT_FIELD}`;
}

export async function getJiraBacklogIssues(
  config: JiraConfig & { email: string; token: string },
  boardId: string
): Promise<JiraApiResponse<{ issues: JiraIssue[] }>> {
  try {
    const backlogIssues = await fetchAllPaginatedIssues(
      config,
      `agile/1.0/board/${boardId}/backlog`,
      issueFields()
    );

    if (backlogIssues === null) {
      return { success: false, error: 'Failed to fetch backlog issues' };
    }

    return {
      success: true,
      data: {
        issues: backlogIssues.map(transformIssue),
      },
    };
  } catch (error) {
    console.error('Error fetching Jira backlog issues:', error);
    return {
      success: false,
      error: 'Failed to fetch backlog issues',
    };
  }
}

export async function getJiraBoardIssues(
  config: JiraConfig & { email: string; token: string },
  boardId: string
): Promise<JiraApiResponse<{ issues: JiraIssue[] }>> {
  try {
    const [backlogIssues, sprintsResult] = await Promise.all([
      fetchAllPaginatedIssues(config, `agile/1.0/board/${boardId}/backlog`, issueFields()),
      makeJiraRequest<{ values: Array<{ id: number; name: string; state: string }> }>(
        config,
        `agile/1.0/board/${boardId}/sprint?state=active,future`
      ),
    ]);

    if (backlogIssues === null) {
      return { success: false, error: 'Failed to fetch backlog issues' };
    }

    const sprints = sprintsResult.success ? (sprintsResult.data?.values ?? []) : [];
    const sprintIssueArrays = await Promise.all(
      sprints.map(sprint =>
        fetchAllPaginatedIssues(config, `agile/1.0/sprint/${sprint.id}/issue`, issueFields())
      )
    );

    const issueMap = new Map<string, any>();
    for (const issue of backlogIssues) {
      issueMap.set(issue.key, issue);
    }
    for (const issueArray of sprintIssueArrays) {
      if (issueArray) {
        for (const issue of issueArray) {
          issueMap.set(issue.key, issue);
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

export async function getJiraBoardSprints(
  config: JiraConfig & { email: string; token: string },
  boardId: string
): Promise<JiraApiResponse<{ sprints: PlanningSprint[] }>> {
  const result = await makeJiraRequest<{
    values: Array<{
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
    }>;
  }>(config, `agile/1.0/board/${boardId}/sprint?state=active,future`);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      sprints:
        result.data?.values.map(sprint => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          goal: sprint.goal,
        })) || [],
    },
  };
}

export async function searchConfluenceParentPages(
  config: JiraConfig & { email: string; token: string },
  query: string
): Promise<JiraApiResponse<{ results: ConfluencePageSearchResult[] }>> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { success: true, data: { results: [] } };
  }

  const cql = `type = page AND title ~ "${escapeConfluenceCql(trimmedQuery)}"`;
  const result = await makeAtlassianSiteRequest<any>(
    config,
    `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=space`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const rawResults = Array.isArray(result.data?.results) ? result.data.results : [];
  const mappedResults = rawResults
    .map((item: any) => {
      const id = String(item.id ?? item.content?.id ?? '');
      const title = String(item.title ?? item.content?.title ?? '').trim();
      if (!id || !title) {
        return null;
      }

      const spaceName =
        item.space?.name ||
        item.content?.space?.name ||
        item.space?.key ||
        item.content?.space?.key ||
        undefined;
      const webuiPath = item._links?.webui || item.content?._links?.webui;

      return {
        id,
        title,
        spaceName,
        url: buildConfluencePageUrl(config.domain, id, webuiPath),
      } satisfies ConfluencePageSearchResult;
    })
    .filter(
      (item: ConfluencePageSearchResult | null): item is ConfluencePageSearchResult => !!item
    );

  return {
    success: true,
    data: {
      results: mappedResults,
    },
  };
}

async function getConfluenceParentPageContext(
  config: JiraConfig & { email: string; token: string },
  parentPageId: string
): Promise<JiraApiResponse<{ pageId: string; title: string; spaceId: string }>> {
  const result = await makeAtlassianSiteRequest<any>(config, `/wiki/api/v2/pages/${parentPageId}`);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const pageId = String(result.data?.id || parentPageId);
  const title = String(result.data?.title || '');
  const spaceId = String(result.data?.spaceId || '');

  if (!spaceId) {
    return {
      success: false,
      error: 'Failed to determine the Confluence space from the selected parent page',
    };
  }

  return {
    success: true,
    data: {
      pageId,
      title,
      spaceId,
    },
  };
}

async function resolveConfluenceRootSpace(
  config: JiraConfig & { email: string; token: string }
): Promise<JiraApiResponse<{ spaceId: string; spaceName?: string }>> {
  const projectKey = String((config as any).projectKey || '').trim();
  const candidateEndpoints = projectKey
    ? [
        `/wiki/api/v2/spaces?keys=${encodeURIComponent(projectKey)}&limit=1`,
        '/wiki/api/v2/spaces?limit=1',
      ]
    : ['/wiki/api/v2/spaces?limit=1'];

  for (const endpoint of candidateEndpoints) {
    const result = await makeAtlassianSiteRequest<any>(config, endpoint);
    if (!result.success) {
      continue;
    }

    const spaces = Array.isArray(result.data?.results) ? result.data.results : [];
    const firstSpace = spaces[0];
    const spaceId = String(firstSpace?.id || '');

    if (spaceId) {
      return {
        success: true,
        data: {
          spaceId,
          spaceName: firstSpace?.name || firstSpace?.key,
        },
      };
    }
  }

  return {
    success: false,
    error: projectKey
      ? `Failed to find a Confluence space for project key "${projectKey}" or any accessible fallback space`
      : 'Failed to find an accessible Confluence space for root-level page creation',
  };
}

export async function createConfluencePage(
  config: JiraConfig & { email: string; token: string },
  parentPageId: string | undefined,
  title: string,
  storageBody: string
): Promise<JiraApiResponse<{ pageId: string; title: string; url: string }>> {
  const createPath = parentPageId ? '/wiki/api/v2/pages' : '/wiki/api/v2/pages?root-level=true';

  const contextResult = parentPageId
    ? await getConfluenceParentPageContext(config, parentPageId)
    : await resolveConfluenceRootSpace(config);
  if (!contextResult.success || !contextResult.data) {
    return {
      success: false,
      error:
        contextResult.error ||
        (parentPageId
          ? 'Failed to resolve the selected Confluence parent page'
          : 'Failed to resolve a Confluence space for root-level page creation'),
    };
  }

  const createResult = await makeAtlassianSiteRequest<any>(config, createPath, {
    method: 'POST',
    data: {
      spaceId: contextResult.data.spaceId,
      status: 'current',
      title,
      ...(parentPageId ? { parentId: parentPageId } : {}),
      body: {
        representation: 'storage',
        value: storageBody,
      },
    },
  });

  if (!createResult.success) {
    return { success: false, error: createResult.error };
  }

  const pageId = String(createResult.data?.id || '');
  if (!pageId) {
    return { success: false, error: 'Confluence page was created without an id' };
  }

  return {
    success: true,
    data: {
      pageId,
      title: String(createResult.data?.title || title),
      url: buildConfluencePageUrl(config.domain, pageId, createResult.data?._links?.webui),
    },
  };
}

export function calculateWeekdayLength(startDate?: string, endDate?: string): number | null {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let weekdays = 0;
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      weekdays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return weekdays;
}

export async function updateJiraIssueStoryPoints(
  config: JiraConfig & { email: string; token: string },
  issueKey: string,
  storyPoints: number
): Promise<JiraApiResponse<any>> {
  return await makeJiraRequest(config, `issue/${issueKey}`, {
    method: 'PUT',
    data: {
      fields: {
        [JIRA_STORYPOINT_FIELD]: storyPoints,
      },
    },
  });
}

export async function updateJiraSprintGoal(
  config: JiraConfig & { email: string; token: string },
  sprintId: number,
  goal: string,
  sprintName: string,
  sprintState: string,
  startDate?: string,
  endDate?: string
): Promise<JiraApiResponse<any>> {
  const data: Record<string, string> = {
    name: sprintName,
    state: sprintState,
    goal,
  };

  if (startDate) {
    data.startDate = startDate;
  }

  if (endDate) {
    data.endDate = endDate;
  }

  return await makeJiraRequest(config, `agile/1.0/sprint/${sprintId}`, {
    method: 'PUT',
    data,
  });
}

export async function moveIssueToSprint(
  config: JiraConfig & { email: string; token: string },
  issueKey: string,
  sprintId: number,
  sprintName?: string
): Promise<JiraApiResponse<{ sprintName?: string }>> {
  const moveResult = await makeJiraRequest(config, `agile/1.0/sprint/${sprintId}/issue`, {
    method: 'POST',
    data: { issues: [issueKey] },
  });

  if (!moveResult.success) {
    return moveResult as JiraApiResponse<{ sprintName?: string }>;
  }

  return {
    success: true,
    data: { sprintName },
  };
}

export async function moveIssueToCurrentSprint(
  config: JiraConfig & { email: string; token: string },
  issueKey: string,
  boardId: string
): Promise<JiraApiResponse<{ sprintName: string }>> {
  const sprintResult = await makeJiraRequest<{
    values: Array<{
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
    }>;
  }>(config, `agile/1.0/board/${boardId}/sprint?state=active,future`);

  if (!sprintResult.success || !sprintResult.data?.values?.length) {
    return { success: false, error: 'No current sprint found for this board' };
  }

  const sprints = sprintResult.data.values;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateMatchingSprint = sprints.find(s => {
    if (!s.startDate || !s.endDate) return false;
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  });

  const chosenSprint = dateMatchingSprint ?? sprints.find(s => s.state === 'active');
  if (!chosenSprint) {
    return { success: false, error: 'No sprint found covering the current date' };
  }

  const moveResult = await moveIssueToSprint(config, issueKey, chosenSprint.id, chosenSprint.name);
  if (!moveResult.success) return moveResult as JiraApiResponse<{ sprintName: string }>;

  return { success: true, data: { sprintName: chosenSprint.name } };
}

export function roundToNearestFibonacci(value: number): number | null {
  const fibonacci = [0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  if (typeof value !== 'number' || Number.isNaN(value)) return null;

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
    const issueResponse = await makeJiraRequest(
      config,
      `issue/${issueKey}?expand=renderedFields,comments,attachments,worklog`
    );

    if (!issueResponse.success || !issueResponse.data) {
      return issueResponse;
    }

    const issue = issueResponse.data as any;
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
          let bodyText = '';
          if (comment.renderedBody) {
            bodyText = comment.renderedBody;
          } else if (typeof comment.body === 'string') {
            bodyText = comment.body;
          } else if (comment.body && comment.body.content) {
            bodyText = extractTextFromADF(comment.body);
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
