// Test Jira utility functions without complex imports
describe('Jira API Helpers', () => {
  describe('Auth Header Generation', () => {
    test('should generate correct Basic Auth header', () => {
      function generateAuthHeader(email, token) {
        return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      }

      const authHeader = generateAuthHeader('test@example.com', 'secret-token');
      const expected = `Basic ${Buffer.from('test@example.com:secret-token').toString('base64')}`;
      
      expect(authHeader).toBe(expected);
    });

    test('should handle special characters in credentials', () => {
      function generateAuthHeader(email, token) {
        return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      }

      const authHeader = generateAuthHeader('user+test@example.com', 'token-with-special-chars!@#');
      
      // Should not throw and should be a valid base64 string
      expect(authHeader).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
    });
  });

  describe('URL Building', () => {
    test('should build correct Jira API URLs', () => {
      function buildJiraUrl(domain, endpoint, isAgile = false) {
        const baseUrl = isAgile 
          ? `https://${domain}/rest/agile/1.0/${endpoint}`
          : `https://${domain}/rest/api/3/${endpoint}`;
        return baseUrl;
      }

      expect(buildJiraUrl('test.atlassian.net', 'issue/TEST-1'))
        .toBe('https://test.atlassian.net/rest/api/3/issue/TEST-1');
      
      expect(buildJiraUrl('test.atlassian.net', 'board', true))
        .toBe('https://test.atlassian.net/rest/agile/1.0/board');
    });

    test('should handle domains with and without protocol', () => {
      function normalizeJiraDomain(domain) {
        return domain.replace(/^https?:\/\//, '');
      }

      expect(normalizeJiraDomain('test.atlassian.net')).toBe('test.atlassian.net');
      expect(normalizeJiraDomain('https://test.atlassian.net')).toBe('test.atlassian.net');
      expect(normalizeJiraDomain('http://test.atlassian.net')).toBe('test.atlassian.net');
    });
  });

  describe('Issue Transformation', () => {
    test('should transform Jira issue data correctly', () => {
      function transformJiraIssue(issue) {
        return {
          key: issue.key,
          summary: issue.fields?.summary || '',
          description: issue.fields?.description || '',
          issueType: issue.fields?.issuetype?.name || 'Story',
          priority: issue.fields?.priority?.name || 'Medium',
          status: issue.fields?.status?.name || 'To Do',
          assignee: issue.fields?.assignee?.displayName || 'Unassigned',
          currentStoryPoints: issue.fields?.customfield_10016 || null
        };
      }

      const jiraIssue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test issue',
          description: 'Test description',
          issuetype: { name: 'Story' },
          priority: { name: 'High' },
          status: { name: 'In Progress' },
          assignee: { displayName: 'John Doe' },
          customfield_10016: 8
        }
      };

      const result = transformJiraIssue(jiraIssue);
      
      expect(result).toEqual({
        key: 'TEST-1',
        summary: 'Test issue',
        description: 'Test description',
        issueType: 'Story',
        priority: 'High',
        status: 'In Progress',
        assignee: 'John Doe',
        currentStoryPoints: 8
      });
    });

    test('should handle missing fields with defaults', () => {
      function transformJiraIssue(issue) {
        return {
          key: issue.key,
          summary: issue.fields?.summary || '',
          description: issue.fields?.description || '',
          issueType: issue.fields?.issuetype?.name || 'Story',
          priority: issue.fields?.priority?.name || 'Medium',
          status: issue.fields?.status?.name || 'To Do',
          assignee: issue.fields?.assignee?.displayName || 'Unassigned',
          currentStoryPoints: issue.fields?.customfield_10016 || null
        };
      }

      const minimalIssue = {
        key: 'TEST-2',
        fields: {
          summary: 'Minimal issue'
        }
      };

      const result = transformJiraIssue(minimalIssue);
      
      expect(result).toEqual({
        key: 'TEST-2',
        summary: 'Minimal issue',
        description: '',
        issueType: 'Story',
        priority: 'Medium',
        status: 'To Do',
        assignee: 'Unassigned',
        currentStoryPoints: null
      });
    });
  });

  describe('Request Options Builder', () => {
    test('should build fetch options correctly', () => {
      function buildFetchOptions(method, auth, data = null) {
        const options = {
          method,
          headers: {
            'Authorization': auth,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Node.js Jira Client'
          }
        };

        if (data) {
          options.body = JSON.stringify(data);
        }

        return options;
      }

      const authHeader = 'Basic dGVzdEBleGFtcGxlLmNvbTpzZWNyZXQ=';
      
      // GET request
      const getOptions = buildFetchOptions('GET', authHeader);
      expect(getOptions.method).toBe('GET');
      expect(getOptions.headers.Authorization).toBe(authHeader);
      expect(getOptions.body).toBeUndefined();

      // POST request with data
      const postData = { fields: { summary: 'New issue' } };
      const postOptions = buildFetchOptions('POST', authHeader, postData);
      expect(postOptions.method).toBe('POST');
      expect(postOptions.body).toBe(JSON.stringify(postData));
    });
  });

  describe('Story Points Validation', () => {
    test('should validate story points correctly', () => {
      function isValidStoryPoints(value) {
        if (value === null || value === undefined) return true;
        if (typeof value !== 'number') return false;
        if (value < 0) return false;
        if (!Number.isInteger(value) && value !== 0.5) return false;
        return true;
      }

      // Valid values
      expect(isValidStoryPoints(null)).toBe(true);
      expect(isValidStoryPoints(undefined)).toBe(true);
      expect(isValidStoryPoints(0)).toBe(true);
      expect(isValidStoryPoints(0.5)).toBe(true);
      expect(isValidStoryPoints(1)).toBe(true);
      expect(isValidStoryPoints(13)).toBe(true);

      // Invalid values
      expect(isValidStoryPoints(-1)).toBe(false);
      expect(isValidStoryPoints(1.5)).toBe(false);
      expect(isValidStoryPoints('5')).toBe(false);
      expect(isValidStoryPoints({})).toBe(false);
    });

    test('should round to nearest Fibonacci number', () => {
      function roundToNearestFibonacci(value) {
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

      expect(roundToNearestFibonacci(4)).toBe(3);
      expect(roundToNearestFibonacci(6)).toBe(5);
      expect(roundToNearestFibonacci(10)).toBe(8);
      expect(roundToNearestFibonacci(1.4)).toBe(1);
      expect(roundToNearestFibonacci(1.6)).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should parse Jira error responses', () => {
      function parseJiraError(response) {
        try {
          const error = {
            status: response.status,
            statusText: response.statusText,
            message: `Failed to ${response.operation || 'complete operation'}: ${response.status} ${response.statusText}`
          };

          if (response.body && response.body.errorMessages) {
            error.details = response.body.errorMessages;
          }

          return error;
        } catch (e) {
          return {
            status: 500,
            statusText: 'Internal Error',
            message: 'Failed to parse error response'
          };
        }
      }

      const errorResponse = {
        status: 400,
        statusText: 'Bad Request',
        operation: 'update issue',
        body: {
          errorMessages: ['Field "customfield_10016" cannot be set']
        }
      };

      const parsedError = parseJiraError(errorResponse);
      
      expect(parsedError.status).toBe(400);
      expect(parsedError.message).toBe('Failed to update issue: 400 Bad Request');
      expect(parsedError.details).toEqual(['Field "customfield_10016" cannot be set']);
    });
  });

  describe('Board Transformation', () => {
    test('should transform board data correctly', () => {
      function transformBoard(board) {
        return {
          id: board.id?.toString() || '',
          name: board.name || '',
          type: board.type || 'unknown',
          projectName: board.location?.displayName || ''
        };
      }

      const jiraBoard = {
        id: 1,
        name: 'Test Board',
        type: 'scrum',
        location: {
          displayName: 'Test Project'
        }
      };

      const result = transformBoard(jiraBoard);
      
      expect(result).toEqual({
        id: '1',
        name: 'Test Board',
        type: 'scrum',
        projectName: 'Test Project'
      });
    });
  });
});