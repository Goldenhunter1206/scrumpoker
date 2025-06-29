# 📡 API Documentation

Complete API reference for the Scrum Poker application.

## 🔗 REST API Endpoints

### Health Check

**GET** `/api/health`

Returns server health status and basic information.

**Response:**
```json
{
  "status": "ok",
  "sessions": 15,
  "uptime": 3600.5,
  "environment": "production",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK` - Server is healthy
- `500 Internal Server Error` - Server issues

---

### Server Statistics

**GET** `/api/stats`

Returns server usage statistics.

**Response:**
```json
{
  "totalSessions": 15,
  "activeSessions": 8,
  "environment": "production", 
  "uptime": 3600.5
}
```

**Status Codes:**
- `200 OK` - Statistics retrieved successfully

---

### Session Information

**GET** `/api/session/:roomCode`

Retrieves public information about a specific session.

**Parameters:**
- `roomCode` (string) - 6-character room code (case-insensitive)

**Response:**
```json
{
  "id": "ABC123",
  "sessionName": "Sprint 23 Planning",
  "facilitator": "John Doe",
  "currentTicket": "USER-123: Add login functionality",
  "currentJiraIssue": {
    "key": "USER-123",
    "summary": "Add login functionality",
    "description": "...",
    "issueType": "Story",
    "priority": "High",
    "status": "To Do",
    "assignee": "Jane Smith",
    "currentStoryPoints": null
  },
  "jiraConfig": {
    "domain": "company.atlassian.net",
    "boardId": "1",
    "hasToken": true
  },
  "participants": [
    {
      "name": "John Doe",
      "isFacilitator": true,
      "isViewer": false,
      "joinedAt": "2024-01-15T10:30:00Z",
      "hasVoted": true,
      "vote": 5
    }
  ],
  "votingRevealed": true,
  "totalVotes": 3,
  "history": [...],
  "aggregate": {...}
}
```

**Status Codes:**
- `200 OK` - Session found
- `404 Not Found` - Session doesn't exist

---

## 🔌 WebSocket API (Socket.IO)

### Connection

Connect to the WebSocket endpoint:

```javascript
import { io } from 'socket.io-client';

const socket = io('https://your-domain.com', {
  transports: ['websocket', 'polling']
});
```

### Event Reference

#### Client → Server Events

##### Create Session

**Event:** `create-session`

**Payload:**
```json
{
  "sessionName": "Sprint 23 Planning",
  "facilitatorName": "John Doe"
}
```

**Response:** `session-created` or `error`

---

##### Join Session

**Event:** `join-session`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "participantName": "Jane Smith",
  "asViewer": false,
  "sessionToken": "optional-reconnection-token"
}
```

**Response:** `join-success` or `join-failed`

---

##### Configure Jira

**Event:** `configure-jira`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "domain": "company.atlassian.net",
  "email": "user@company.com",
  "token": "API_TOKEN",
  "projectKey": "USER"
}
```

**Response:** `jira-config-success` or `jira-config-failed`

---

##### Get Jira Issues

**Event:** `get-jira-issues`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "boardId": "1"
}
```

**Response:** `jira-issues-loaded` or `jira-issues-failed`

---

##### Set Jira Issue

**Event:** `set-jira-issue`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "issue": {
    "key": "USER-123",
    "summary": "Add login functionality",
    "description": "Implement user authentication",
    "issueType": "Story",
    "priority": "High",
    "status": "To Do",
    "assignee": "Jane Smith",
    "currentStoryPoints": null
  }
}
```

**Response:** `jira-issue-set`

---

##### Set Manual Ticket

**Event:** `set-ticket`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "ticket": "Implement user authentication feature"
}
```

**Response:** `ticket-set`

---

##### Submit Vote

**Event:** `submit-vote`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "vote": 5
}
```

**Valid vote values:** `0`, `0.5`, `1`, `2`, `3`, `5`, `8`, `13`, `21`, `34`, `55`, `89`, `"?"`, `"☕"`

**Response:** `vote-submitted`

---

##### Reveal Votes

**Event:** `reveal-votes`

**Payload:**
```json
{
  "roomCode": "ABC123"
}
```

**Response:** `votes-revealed`

---

##### Reset Voting

**Event:** `reset-voting`

**Payload:**
```json
{
  "roomCode": "ABC123"
}
```

**Response:** `voting-reset`

---

##### Start Countdown

**Event:** `start-countdown`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "duration": 30
}
```

**Response:** `countdown-started`

---

##### Finalize Estimation

**Event:** `finalize-estimation`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "finalEstimate": 5.0
}
```

**Response:** `jira-updated` or `jira-update-failed`

---

##### Moderate Participant

**Event:** `moderate-participant`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "targetName": "Jane Smith",
  "action": "make-viewer"
}
```

**Valid actions:** `"make-viewer"`, `"make-participant"`, `"make-facilitator"`, `"remove"`

**Response:** `participant-role-changed` or `participant-removed`

---

##### Set Facilitator Viewer Status

**Event:** `set-facilitator-viewer`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "isViewer": true
}
```

**Response:** `participant-role-changed`

---

##### End Session

**Event:** `end-session`

**Payload:**
```json
{
  "roomCode": "ABC123"
}
```

**Response:** `session-ended`

---

##### Send Chat Message

**Event:** `send-chat-message`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "message": "Great estimate everyone!"
}
```

**Response:** `chatMessage` (broadcast)

---

##### Typing Indicator

**Event:** `typing-indicator`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "userName": "Jane Smith",
  "isTyping": true
}
```

**Response:** `typingUpdate` (broadcast)

---

#### Server → Client Events

##### Session Created

**Event:** `session-created`

**Payload:**
```json
{
  "success": true,
  "roomCode": "ABC123",
  "sessionData": {...},
  "sessionToken": "reconnection-token"
}
```

---

##### Join Success

**Event:** `join-success`

**Payload:**
```json
{
  "roomCode": "ABC123",
  "sessionData": {...},
  "yourVote": null,
  "sessionToken": "reconnection-token"
}
```

---

##### Join Failed

**Event:** `join-failed`

**Payload:**
```json
{
  "message": "Session not found"
}
```

---

##### Participant Joined

**Event:** `participant-joined`

**Payload:**
```json
{
  "participantName": "Jane Smith",
  "sessionData": {...}
}
```

---

##### Participant Left

**Event:** `participant-left`

**Payload:**
```json
{
  "participantName": "Jane Smith",
  "sessionData": {...}
}
```

---

##### Vote Submitted

**Event:** `vote-submitted`

**Payload:**
```json
{
  "participantName": "Jane Smith",
  "sessionData": {...}
}
```

---

##### Votes Revealed

**Event:** `votes-revealed`

**Payload:**
```json
{
  "sessionData": {...},
  "results": {
    "average": 4.67,
    "voteCounts": {
      "3": 1,
      "5": 2,
      "8": 1
    },
    "totalVotes": 4,
    "min": 3,
    "max": 8,
    "consensus": "-"
  }
}
```

---

##### Countdown Started

**Event:** `countdown-started`

**Payload:**
```json
{
  "duration": 30
}
```

---

##### Countdown Tick

**Event:** `countdown-tick`

**Payload:**
```json
{
  "secondsLeft": 25,
  "totalDuration": 30
}
```

---

##### Countdown Finished

**Event:** `countdown-finished`

**Payload:**
```json
{
  "sessionData": {...}
}
```

---

##### Chat Message

**Event:** `chatMessage`

**Payload:**
```json
{
  "id": "msg-12345",
  "author": "Jane Smith",
  "content": "Great estimate everyone!",
  "timestamp": "2024-01-15T10:35:00Z",
  "type": "message"
}
```

---

##### Typing Update

**Event:** `typingUpdate`

**Payload:**
```json
["Jane Smith", "John Doe"]
```

---

##### Error

**Event:** `error`

**Payload:**
```json
{
  "message": "Only facilitator can reveal votes"
}
```

---

## 🔐 Authentication & Security

### Session Tokens

Session tokens are used for reconnection authentication:

- Generated on session creation/join
- Required for reconnection to existing sessions
- Automatically invalidated on session end
- Expire with session timeout

### Rate Limiting

Default rate limits:

| Endpoint/Event | Limit | Window |
|----------------|-------|--------|
| REST API | 100 requests | 15 minutes |
| Socket Events | 60 events | 1 minute |
| Chat Messages | 20 messages | 1 minute |

### Input Validation

All inputs are validated for:

- Type checking
- Length limits
- HTML sanitization
- SQL injection prevention
- XSS protection

### CORS Configuration

Configure `CORS_ORIGIN` environment variable:

```bash
# Single origin
CORS_ORIGIN=https://your-domain.com

# Multiple origins
CORS_ORIGIN=https://domain1.com,https://domain2.com

# Development (not recommended for production)
CORS_ORIGIN=*
```

---

## 📝 Examples

### JavaScript Client

```javascript
import { io } from 'socket.io-client';

const socket = io('https://your-domain.com');

// Create session
socket.emit('create-session', {
  sessionName: 'Sprint Planning',
  facilitatorName: 'John Doe'
});

// Listen for session creation
socket.on('session-created', (data) => {
  console.log('Room code:', data.roomCode);
  localStorage.setItem('sessionToken', data.sessionToken);
});

// Join session
socket.emit('join-session', {
  roomCode: 'ABC123',
  participantName: 'Jane Smith',
  asViewer: false
});

// Submit vote
socket.emit('submit-vote', {
  roomCode: 'ABC123',
  vote: 5
});

// Listen for vote reveals
socket.on('votes-revealed', (data) => {
  console.log('Results:', data.results);
});
```

### cURL Examples

```bash
# Health check
curl https://your-domain.com/api/health

# Get session info
curl https://your-domain.com/api/session/ABC123

# Server stats
curl https://your-domain.com/api/stats
```

### Error Handling

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
  // Handle specific errors
  switch (error.message) {
    case 'Session not found':
      // Redirect to join page
      break;
    case 'Only facilitator can reveal votes':
      // Show permission error
      break;
    default:
      // Show generic error
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Handle connection failures
});
```

---

For more examples and integration guides, see the [main documentation](../README.md).