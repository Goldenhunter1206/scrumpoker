#!/usr/bin/env node

import { io } from 'socket.io-client';
import { performance } from 'perf_hooks';

class LoadTester {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:3000';
    this.sessions = new Map();
    this.clients = new Map();
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      totalEvents: 0,
      eventLatencies: [],
      sessionsCreated: 0,
      votesSubmitted: 0,
      errors: [],
    };
    this.isRunning = false;
    this.startTime = null;
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  generateRandomName() {
    const adjectives = ['Quick', 'Smart', 'Brave', 'Cool', 'Fast', 'Nice', 'Happy', 'Calm'];
    const nouns = ['Tiger', 'Eagle', 'Wolf', 'Bear', 'Lion', 'Fox', 'Hawk', 'Shark'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createSocketClient(clientId) {
    const startTime = performance.now();
    const socket = io(this.serverUrl, {
      transports: ['websocket'],
      timeout: 10000,
      forceNew: true,
    });

    const client = {
      id: clientId,
      socket,
      name: this.generateRandomName(),
      sessionId: null,
      isFacilitator: false,
      hasVoted: false,
      connectionTime: null,
      events: [],
    };

    socket.on('connect', () => {
      client.connectionTime = performance.now() - startTime;
      this.metrics.successfulConnections++;
      this.log(`Client ${clientId} connected in ${client.connectionTime.toFixed(2)}ms`);
    });

    socket.on('connect_error', error => {
      this.metrics.failedConnections++;
      this.metrics.errors.push({ clientId, error: error.message, timestamp: Date.now() });
      this.log(`Client ${clientId} connection failed: ${error.message}`, 'ERROR');
    });

    socket.on('disconnect', reason => {
      this.log(`Client ${clientId} disconnected: ${reason}`, 'WARN');
    });

    this.setupEventListeners(client);
    this.clients.set(clientId, client);
    this.metrics.totalConnections++;

    return client;
  }

  setupEventListeners(client) {
    const { socket, id } = client;

    // Session events
    socket.on('session-created', data => {
      client.sessionId = data.roomCode;
      client.isFacilitator = true;
      this.sessions.set(data.roomCode, { facilitator: id, participants: [id] });
      this.metrics.sessionsCreated++;
      this.recordEvent(id, 'session-created', data);
      this.log(`Client ${id} created session ${data.roomCode}`);
    });

    socket.on('join-success', data => {
      client.sessionId = data.roomCode;
      const session = this.sessions.get(data.roomCode);
      if (session) {
        session.participants.push(id);
      }
      this.recordEvent(id, 'join-success', data);
      this.log(`Client ${id} joined session ${data.roomCode}`);
    });

    socket.on('join-failed', data => {
      this.recordEvent(id, 'join-failed', data);
      this.log(`Client ${id} failed to join session: ${data.message}`, 'WARN');
    });

    // Voting events
    socket.on('vote-submitted', data => {
      this.recordEvent(id, 'vote-submitted', data);
    });

    socket.on('votes-revealed', data => {
      this.recordEvent(id, 'votes-revealed', data);
      this.log(
        `Votes revealed in session ${client.sessionId}: ${Object.keys(data.votes).length} votes`
      );
    });

    socket.on('voting-reset', data => {
      client.hasVoted = false;
      this.recordEvent(id, 'voting-reset', data);
    });

    // General events
    socket.on('participant-joined', data => {
      this.recordEvent(id, 'participant-joined', data);
    });

    socket.on('participant-left', data => {
      this.recordEvent(id, 'participant-left', data);
    });

    socket.on('error', data => {
      this.metrics.errors.push({ clientId: id, error: data.message, timestamp: Date.now() });
      this.recordEvent(id, 'error', data);
      this.log(`Client ${id} received error: ${data.message}`, 'ERROR');
    });
  }

  recordEvent(clientId, eventType, data) {
    const timestamp = performance.now();
    const client = this.clients.get(clientId);
    if (client) {
      client.events.push({ eventType, data, timestamp });
    }
    this.metrics.totalEvents++;
  }

  async createSession(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.socket.connected) {
      throw new Error(`Client ${clientId} not connected`);
    }

    const sessionName = `Load Test Session ${Date.now()}`;
    client.socket.emit('create-session', {
      sessionName,
      facilitatorName: client.name,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, 5000);

      client.socket.once('session-created', data => {
        clearTimeout(timeout);
        resolve(data.roomCode);
      });

      client.socket.once('error', error => {
        clearTimeout(timeout);
        reject(new Error(error.message));
      });
    });
  }

  async joinSession(clientId, roomCode, asViewer = false) {
    const client = this.clients.get(clientId);
    if (!client || !client.socket.connected) {
      throw new Error(`Client ${clientId} not connected`);
    }

    client.socket.emit('join-session', {
      roomCode,
      participantName: client.name,
      asViewer,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join session timeout'));
      }, 5000);

      client.socket.once('join-success', data => {
        clearTimeout(timeout);
        resolve(data);
      });

      client.socket.once('join-failed', error => {
        clearTimeout(timeout);
        reject(new Error(error.message));
      });
    });
  }

  submitVote(clientId, vote) {
    const client = this.clients.get(clientId);
    if (!client || !client.socket.connected || !client.sessionId) {
      return false;
    }

    const votes = [1, 2, 3, 5, 8, 13, 21, '?', '☕'];
    const selectedVote = vote || votes[Math.floor(Math.random() * votes.length)];

    client.socket.emit('submit-vote', {
      roomCode: client.sessionId,
      vote: selectedVote,
    });

    client.hasVoted = true;
    this.metrics.votesSubmitted++;
    return true;
  }

  revealVotes(facilitatorId) {
    const client = this.clients.get(facilitatorId);
    if (!client || !client.socket.connected || !client.isFacilitator) {
      return false;
    }

    client.socket.emit('reveal-votes', {
      roomCode: client.sessionId,
    });
    return true;
  }

  resetVoting(facilitatorId) {
    const client = this.clients.get(facilitatorId);
    if (!client || !client.socket.connected || !client.isFacilitator) {
      return false;
    }

    client.socket.emit('reset-voting', {
      roomCode: client.sessionId,
    });
    return true;
  }

  setTicket(facilitatorId, ticket) {
    const client = this.clients.get(facilitatorId);
    if (!client || !client.socket.connected || !client.isFacilitator) {
      return false;
    }

    client.socket.emit('set-ticket', {
      roomCode: client.sessionId,
      ticket: ticket || `Story ${Math.floor(Math.random() * 1000)}`,
    });
    return true;
  }

  async runScenario(scenario) {
    this.log(`Starting scenario: ${scenario.name}`);

    switch (scenario.type) {
      case 'basic-session':
        return this.runBasicSessionScenario(scenario);
      case 'concurrent-sessions':
        return this.runConcurrentSessionsScenario(scenario);
      case 'high-participant-session':
        return this.runHighParticipantSessionScenario(scenario);
      case 'rapid-voting':
        return this.runRapidVotingScenario(scenario);
      default:
        throw new Error(`Unknown scenario type: ${scenario.type}`);
    }
  }

  async runBasicSessionScenario(scenario) {
    const { participants = 5, votingRounds = 3 } = scenario;
    const clients = [];

    // Create clients
    for (let i = 0; i < participants; i++) {
      const client = this.createSocketClient(`basic-${i}`);
      clients.push(client);
    }

    // Wait for connections
    await this.waitForConnections(clients, 10000);

    // Create session with first client
    const facilitator = clients[0];
    const roomCode = await this.createSession(facilitator.id);
    this.log(`Created session ${roomCode} with facilitator ${facilitator.name}`);

    // Join other participants
    for (let i = 1; i < clients.length; i++) {
      await this.joinSession(clients[i].id, roomCode);
      await this.sleep(100); // Small delay between joins
    }

    // Run voting rounds
    for (let round = 1; round <= votingRounds; round++) {
      this.log(`Starting voting round ${round}`);

      // Set ticket
      this.setTicket(facilitator.id, `Story ${round}`);
      await this.sleep(500);

      // All participants vote
      for (const client of clients) {
        if (!client.isFacilitator) {
          this.submitVote(client.id);
          await this.sleep(100);
        }
      }

      // Reveal votes
      this.revealVotes(facilitator.id);
      await this.sleep(1000);

      // Reset for next round
      if (round < votingRounds) {
        this.resetVoting(facilitator.id);
        await this.sleep(500);
      }
    }

    // Cleanup
    for (const client of clients) {
      client.socket.disconnect();
    }

    this.log(`Completed basic session scenario`);
  }

  async runConcurrentSessionsScenario(scenario) {
    const { sessions = 3, participantsPerSession = 4 } = scenario;
    const allClients = [];

    // Create all clients
    for (let s = 0; s < sessions; s++) {
      for (let p = 0; p < participantsPerSession; p++) {
        const client = this.createSocketClient(`session${s}-participant${p}`);
        allClients.push(client);
      }
    }

    // Wait for all connections
    await this.waitForConnections(allClients, 15000);

    // Create sessions concurrently
    const sessionPromises = [];
    for (let s = 0; s < sessions; s++) {
      const facilitatorIndex = s * participantsPerSession;
      const facilitator = allClients[facilitatorIndex];

      const sessionPromise = this.createSession(facilitator.id).then(async roomCode => {
        this.log(`Session ${s}: Created ${roomCode}`);

        // Join other participants to this session
        for (let p = 1; p < participantsPerSession; p++) {
          const participantIndex = s * participantsPerSession + p;
          await this.joinSession(allClients[participantIndex].id, roomCode);
        }

        // Quick voting round
        this.setTicket(facilitator.id, `Concurrent Story ${s}`);
        await this.sleep(200);

        for (let p = 1; p < participantsPerSession; p++) {
          const participantIndex = s * participantsPerSession + p;
          this.submitVote(allClients[participantIndex].id);
        }

        await this.sleep(500);
        this.revealVotes(facilitator.id);
      });

      sessionPromises.push(sessionPromise);
    }

    await Promise.all(sessionPromises);

    // Cleanup
    for (const client of allClients) {
      client.socket.disconnect();
    }

    this.log(`Completed concurrent sessions scenario`);
  }

  async runHighParticipantSessionScenario(scenario) {
    const { participants = 20 } = scenario;
    const clients = [];

    // Create clients
    for (let i = 0; i < participants; i++) {
      const client = this.createSocketClient(`high-${i}`);
      clients.push(client);
    }

    // Wait for connections
    await this.waitForConnections(clients, 20000);

    // Create session
    const facilitator = clients[0];
    const roomCode = await this.createSession(facilitator.id);

    // Join participants in batches
    const batchSize = 5;
    for (let i = 1; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);
      const joinPromises = batch.map(client =>
        this.joinSession(client.id, roomCode).catch(err =>
          this.log(`Failed to join: ${err.message}`, 'WARN')
        )
      );
      await Promise.all(joinPromises);
      await this.sleep(500); // Delay between batches
    }

    // Single voting round with all participants
    this.setTicket(facilitator.id, 'High Participant Story');
    await this.sleep(1000);

    // All participants vote simultaneously
    const votePromises = clients.slice(1).map(client => {
      return new Promise(resolve => {
        setTimeout(() => {
          this.submitVote(client.id);
          resolve();
        }, Math.random() * 2000); // Random delay up to 2 seconds
      });
    });

    await Promise.all(votePromises);
    await this.sleep(1000);
    this.revealVotes(facilitator.id);

    // Cleanup
    for (const client of clients) {
      client.socket.disconnect();
    }

    this.log(`Completed high participant session scenario`);
  }

  async runRapidVotingScenario(scenario) {
    const { participants = 8, rapidRounds = 10 } = scenario;
    const clients = [];

    // Create clients
    for (let i = 0; i < participants; i++) {
      const client = this.createSocketClient(`rapid-${i}`);
      clients.push(client);
    }

    await this.waitForConnections(clients, 10000);

    // Create session
    const facilitator = clients[0];
    const roomCode = await this.createSession(facilitator.id);

    // Join participants
    for (let i = 1; i < clients.length; i++) {
      await this.joinSession(clients[i].id, roomCode);
    }

    // Rapid voting rounds
    for (let round = 1; round <= rapidRounds; round++) {
      this.setTicket(facilitator.id, `Rapid Story ${round}`);

      // Immediate voting
      for (const client of clients.slice(1)) {
        this.submitVote(client.id);
      }

      await this.sleep(200);
      this.revealVotes(facilitator.id);
      await this.sleep(100);

      if (round < rapidRounds) {
        this.resetVoting(facilitator.id);
        await this.sleep(100);
      }
    }

    // Cleanup
    for (const client of clients) {
      client.socket.disconnect();
    }

    this.log(`Completed rapid voting scenario`);
  }

  async waitForConnections(clients, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const connectedClients = clients.filter(client => client.socket.connected);
      if (connectedClients.length === clients.length) {
        this.log(`All ${clients.length} clients connected`);
        return;
      }
      await this.sleep(100);
    }

    const connectedCount = clients.filter(client => client.socket.connected).length;
    throw new Error(`Timeout: Only ${connectedCount}/${clients.length} clients connected`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateReport() {
    const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
    const avgConnectionTime =
      this.clients.size > 0
        ? Array.from(this.clients.values())
            .filter(c => c.connectionTime)
            .reduce((sum, c) => sum + c.connectionTime, 0) / this.clients.size
        : 0;

    const report = {
      duration: duration.toFixed(2),
      metrics: {
        ...this.metrics,
        avgConnectionTime: avgConnectionTime.toFixed(2),
        connectionsPerSecond:
          duration > 0 ? (this.metrics.totalConnections / duration).toFixed(2) : 0,
        eventsPerSecond: duration > 0 ? (this.metrics.totalEvents / duration).toFixed(2) : 0,
        successRate:
          this.metrics.totalConnections > 0
            ? ((this.metrics.successfulConnections / this.metrics.totalConnections) * 100).toFixed(
                2
              )
            : 0,
      },
      sessions: Array.from(this.sessions.entries()).map(([code, session]) => ({
        roomCode: code,
        participantCount: session.participants.length,
        facilitator: session.facilitator,
      })),
      errors: this.metrics.errors.slice(-10), // Last 10 errors
    };

    return report;
  }

  async run(scenarios) {
    this.isRunning = true;
    this.startTime = Date.now();
    this.log('Starting load test...');

    try {
      for (const scenario of scenarios) {
        await this.runScenario(scenario);
        await this.sleep(1000); // Brief pause between scenarios
      }
    } catch (error) {
      this.log(`Load test failed: ${error.message}`, 'ERROR');
      throw error;
    } finally {
      this.isRunning = false;

      // Cleanup any remaining connections
      for (const [, client] of this.clients) {
        if (client.socket.connected) {
          client.socket.disconnect();
        }
      }
    }

    const report = this.generateReport();
    this.log('Load test completed');
    return report;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const serverUrl =
    args.find(arg => arg.startsWith('--server='))?.split('=')[1] || 'http://localhost:3000';
  const scenario = args.find(arg => arg.startsWith('--scenario='))?.split('=')[1] || 'basic';

  const loadTester = new LoadTester({ serverUrl });

  // Define scenarios
  const scenarios = {
    basic: [
      { name: 'Basic Session Test', type: 'basic-session', participants: 5, votingRounds: 3 },
    ],
    concurrent: [
      {
        name: 'Concurrent Sessions Test',
        type: 'concurrent-sessions',
        sessions: 3,
        participantsPerSession: 4,
      },
    ],
    'high-load': [
      { name: 'High Participant Session', type: 'high-participant-session', participants: 20 },
    ],
    rapid: [{ name: 'Rapid Voting Test', type: 'rapid-voting', participants: 8, rapidRounds: 10 }],
    comprehensive: [
      { name: 'Basic Session Test', type: 'basic-session', participants: 5, votingRounds: 2 },
      {
        name: 'Concurrent Sessions Test',
        type: 'concurrent-sessions',
        sessions: 2,
        participantsPerSession: 3,
      },
      { name: 'High Participant Session', type: 'high-participant-session', participants: 15 },
      { name: 'Rapid Voting Test', type: 'rapid-voting', participants: 6, rapidRounds: 5 },
    ],
  };

  if (!scenarios[scenario]) {
    console.error(`Unknown scenario: ${scenario}`);
    console.error(`Available scenarios: ${Object.keys(scenarios).join(', ')}`);
    process.exit(1);
  }

  try {
    const report = await loadTester.run(scenarios[scenario]);

    console.log('\n=== LOAD TEST REPORT ===');
    console.log(`Duration: ${report.duration}s`);
    console.log(`Total Connections: ${report.metrics.totalConnections}`);
    console.log(`Successful Connections: ${report.metrics.successfulConnections}`);
    console.log(`Failed Connections: ${report.metrics.failedConnections}`);
    console.log(`Success Rate: ${report.metrics.successRate}%`);
    console.log(`Average Connection Time: ${report.metrics.avgConnectionTime}ms`);
    console.log(`Connections/Second: ${report.metrics.connectionsPerSecond}`);
    console.log(`Events/Second: ${report.metrics.eventsPerSecond}`);
    console.log(`Total Events: ${report.metrics.totalEvents}`);
    console.log(`Sessions Created: ${report.metrics.sessionsCreated}`);
    console.log(`Votes Submitted: ${report.metrics.votesSubmitted}`);

    if (report.sessions.length > 0) {
      console.log('\nSessions:');
      report.sessions.forEach(session => {
        console.log(`  ${session.roomCode}: ${session.participantCount} participants`);
      });
    }

    if (report.errors.length > 0) {
      console.log('\nRecent Errors:');
      report.errors.forEach(error => {
        console.log(`  [${error.clientId}] ${error.error}`);
      });
    }
  } catch (error) {
    console.error('Load test failed:', error.message);
    process.exit(1);
  }
}

// Check if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(console.error);
}

export default LoadTester;
