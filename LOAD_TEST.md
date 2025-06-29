# Load Testing Guide

This guide explains how to perform load testing on your Scrum Poker application to simulate multiple users conducting sprint planning sessions.

## Prerequisites

1. Start your Scrum Poker server:

   ```bash
   npm run dev
   # or for production
   npm start
   ```

2. Ensure the server is running on `http://localhost:3000` (or specify a different URL)

## Running Load Tests

### Quick Start

```bash
# Basic test with 5 participants, 3 voting rounds
npm run load-test:basic

# Test with concurrent sessions
npm run load-test:concurrent

# Test with high participant count (20 users)
npm run load-test:high-load

# Test rapid voting scenarios
npm run load-test:rapid

# Run comprehensive test suite
npm run load-test:comprehensive
```

### Custom Server URL

```bash
# Test against a different server
node load-test.js --server=http://your-server.com --scenario=basic
```

## Test Scenarios

### 1. Basic Session (`basic`)

- **Purpose**: Test normal session flow
- **Participants**: 5 users
- **Behavior**: Create session, join participants, 3 voting rounds
- **Tests**: Basic WebSocket communication, voting flow

### 2. Concurrent Sessions (`concurrent`)

- **Purpose**: Test multiple simultaneous sessions
- **Sessions**: 3 concurrent sessions
- **Participants**: 4 users per session
- **Tests**: Server capacity, session isolation

### 3. High Load (`high-load`)

- **Purpose**: Test session with many participants
- **Participants**: 20 users in one session
- **Tests**: Broadcast performance, memory usage

### 4. Rapid Voting (`rapid`)

- **Purpose**: Test rapid successive voting rounds
- **Participants**: 8 users
- **Rounds**: 10 rapid voting cycles
- **Tests**: Event processing speed, state management

### 5. Comprehensive (`comprehensive`)

- **Purpose**: Full test suite
- **Combines**: All above scenarios in sequence
- **Tests**: Overall system stability

## Metrics Collected

The load test reports the following metrics:

- **Connection Metrics**:
  - Total connections attempted
  - Successful/failed connections
  - Average connection time
  - Success rate percentage

- **Performance Metrics**:
  - Events per second
  - Connections per second
  - Total events processed

- **Session Metrics**:
  - Sessions created
  - Votes submitted
  - Participants per session

- **Error Tracking**:
  - Connection errors
  - WebSocket errors
  - Recent error details

## Sample Report

```
=== LOAD TEST REPORT ===
Duration: 45.32s
Total Connections: 50
Successful Connections: 48
Failed Connections: 2
Success Rate: 96.00%
Average Connection Time: 125.45ms
Connections/Second: 1.10
Events/Second: 15.67
Total Events: 710
Sessions Created: 5
Votes Submitted: 156

Sessions:
  ABC123: 5 participants
  DEF456: 4 participants
  GHI789: 3 participants

Recent Errors:
  [rapid-7] Connection timeout
```

## Understanding Results

### Good Performance Indicators

- **Success Rate**: >95%
- **Connection Time**: <500ms
- **No timeout errors**
- **Stable event processing**

### Performance Issues

- **High connection times**: May indicate server overload
- **Connection failures**: Could suggest resource limits
- **Event processing delays**: May indicate WebSocket bottlenecks

### Troubleshooting

1. **Connection Timeouts**:
   - Check server resources (CPU, memory)
   - Verify WebSocket connection limits
   - Review network configuration

2. **Memory Issues**:
   - Monitor server memory during tests
   - Check for session cleanup
   - Review participant management

3. **Event Processing Delays**:
   - Check Socket.IO event queue
   - Monitor database/Redis performance
   - Review event handler efficiency

## Custom Load Tests

You can create custom tests by modifying `load-test.js`:

```javascript
// Add custom scenario
const customScenario = {
  name: 'My Custom Test',
  type: 'basic-session',
  participants: 10,
  votingRounds: 5,
};

await loadTester.run([customScenario]);
```

## Production Considerations

When testing production environments:

1. **Start Small**: Begin with basic scenarios
2. **Monitor Resources**: Watch server CPU, memory, and network
3. **Gradual Increase**: Slowly increase load to find limits
4. **Real Network**: Test over actual network conditions
5. **Peak Simulation**: Test expected peak usage scenarios

## Limitations

- **Memory Storage**: Tests in-memory session storage (not Redis persistence)
- **Single Server**: Tests single server instance (not load balancer scenarios)
- **WebSocket Only**: Focuses on WebSocket performance (not HTTP API load)
- **Simulated Behavior**: May not reflect exact user interaction patterns

## Support

For issues with load testing:

1. Check server logs during tests
2. Monitor system resources
3. Review WebSocket connection limits
4. Test with smaller loads first
