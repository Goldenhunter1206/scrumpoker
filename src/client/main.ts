import './styles/globals.css';
import { gameState } from './components/GameState.js';
import { socketManager } from './components/SocketManager.js';
import { 
  saveUserName, 
  loadUserName, 
  saveJiraCredentials, 
  loadJiraCredentials,
  clearJiraCredentials,
  clearActiveSession
} from './utils/storage.js';
import { 
  showNotification, 
  disableButtons, 
  showElement, 
  hideElement, 
  setElementText, 
  getInputValue, 
  setInputValue,
  setupClickToCopy,
  adaptFacilitatorControlsForViewport,
  toggleFacilitatorControlsVisibility
} from './utils/ui.js';
import { playSound, toggleSound, updateSoundIcon } from './utils/sound.js';
import { 
  SessionData, 
  VotingResults, 
  JiraIssue, 
  Vote, 
  JiraBoard
} from '@shared/types/index.js';

class ScrumPokerApp {

  constructor() {
    this.setupEventListeners();
    this.setupSocketEventHandlers();
  }

  init(): void {
    socketManager.connect();
    this.prefillSavedData();
    this.setupUrlParameters();
    updateSoundIcon();
    this.restoreCardStates();
    this.setupDragAndDrop();
    this.restoreCardLayout();
  }

  private setupEventListeners(): void {
    // Session management
    document.getElementById('start-btn')?.addEventListener('click', () => this.startSession());
    document.getElementById('join-btn')?.addEventListener('click', () => this.joinSession());
    
    // Facilitator controls
    document.getElementById('setup-jira-btn')?.addEventListener('click', () => this.toggleJiraSetup());
    document.getElementById('cancel-jira-btn')?.addEventListener('click', () => this.toggleJiraSetup());
    document.getElementById('connect-jira-btn')?.addEventListener('click', () => this.configureJira());
    document.getElementById('load-issues-btn')?.addEventListener('click', () => this.loadJiraIssues());
    document.getElementById('set-ticket-btn')?.addEventListener('click', () => this.setCurrentTicket());
    document.getElementById('reveal-btn')?.addEventListener('click', () => this.revealVotes());
    document.getElementById('reset-btn')?.addEventListener('click', () => this.resetVoting());
    document.getElementById('countdown-btn')?.addEventListener('click', () => this.startCountdown());
    document.getElementById('toggle-viewer-btn')?.addEventListener('click', () => this.toggleFacilitatorViewer());
    document.getElementById('end-session-btn')?.addEventListener('click', () => this.endSession());
    document.getElementById('finalize-btn')?.addEventListener('click', () => this.finalizeEstimation());
    document.getElementById('export-history-btn')?.addEventListener('click', () => this.exportHistory());

    // Sound toggle
    document.getElementById('sound-toggle')?.addEventListener('click', () => {
      toggleSound();
      updateSoundIcon();
    });

    // Voting cards
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        const value = card.getAttribute('data-value');
        if (value) {
          this.vote(value === '?' || value === '☕' ? value as Vote : parseFloat(value));
        }
      });
    });

    // Moderation modal
    document.getElementById('moderation-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.closeModerationModal();
      }
    });

    document.getElementById('make-viewer-btn')?.addEventListener('click', () => this.moderateParticipant('make-viewer'));
    document.getElementById('make-participant-btn')?.addEventListener('click', () => this.moderateParticipant('make-participant'));
    document.getElementById('remove-participant-btn')?.addEventListener('click', () => this.moderateParticipant('remove'));
    document.getElementById('cancel-moderation-btn')?.addEventListener('click', () => this.closeModerationModal());

    // Jira board selection
    document.getElementById('jira-board-select')?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const loadBtn = document.getElementById('load-issues-btn') as HTMLButtonElement;
      if (loadBtn) {
        loadBtn.disabled = !target.value;
      }
    });

    // Room code input auto-uppercase
    document.getElementById('room-code-input')?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = target.value.toUpperCase();
    });

    // Enter key handlers
    document.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const activeElement = document.activeElement as HTMLElement;
        
        if (activeElement.id === 'facilitator-name' || activeElement.id === 'session-name') {
          this.startSession();
        } else if (activeElement.id === 'join-name' || activeElement.id === 'room-code-input') {
          this.joinSession();
        } else if (activeElement.id === 'jira-ticket') {
          this.setCurrentTicket();
        }
      }
    });

    // Responsive controls toggle
    document.getElementById('toggle-controls-btn')?.addEventListener('click', toggleFacilitatorControlsVisibility);
    window.addEventListener('resize', adaptFacilitatorControlsForViewport);

    /* History / Issues Tabs */
    const tabIssues = document.getElementById('history-tab-issues');
    const tabHistory = document.getElementById('history-tab-history');
    tabIssues?.addEventListener('click', () => this.switchHistoryTab('issues'));
    tabHistory?.addEventListener('click', () => this.switchHistoryTab('history'));
  }

  private setupSocketEventHandlers(): void {
    socketManager.on('sessionCreated', (sessionData: SessionData) => {
      this.updateSessionUI(sessionData);
    });

    socketManager.on('joinSuccess', (sessionData: SessionData) => {
      this.updateSessionUI(sessionData);
      const state = gameState.getState();
      if (state.myVote !== null) {
        this.updateCardSelection(state.myVote);
      }
    });

    socketManager.on('sessionUpdated', (sessionData: SessionData) => {
      this.updateSessionUI(sessionData);
    });

    socketManager.on('roleChanged', () => {
      this.updateVotingCards();
      this.updateToggleViewerButton();
    });

    socketManager.on('jiraConfigured', (data: { boards: JiraBoard[], sessionData: SessionData }) => {
      this.updateJiraUI();
      this.populateJiraBoards(data.boards);
    });

    socketManager.on('jiraIssuesLoaded', () => {
      this.displayJiraIssues();
    });

    socketManager.on('ticketSet', () => {
      this.updateTicketDisplay();
      this.resetVotingUI();
    });

    socketManager.on('jiraUpdated', () => {
      this.updateTicketDisplay();
      this.resetVotingUI();
      this.displayJiraIssues();
      const finalizeBtn = document.getElementById('finalize-btn') as HTMLButtonElement;
      if (finalizeBtn) finalizeBtn.disabled = false;
    });

    socketManager.on('jiraUpdateFailed', () => {
      const finalizeBtn = document.getElementById('finalize-btn') as HTMLButtonElement;
      if (finalizeBtn) finalizeBtn.disabled = false;
    });

    socketManager.on('voteSubmitted', (participantName: string) => {
      this.updateFacilitatorControls();
      const state = gameState.getState();
      if (participantName === state.myName && state.myVote !== null) {
        this.updateCardSelection(state.myVote);
      }
    });

    socketManager.on('votesRevealed', (results: VotingResults) => {
      this.showResults(results);
      this.updateVotingCards();
    });

    socketManager.on('votingReset', () => {
      this.resetVotingUI();
    });

    socketManager.on('countdownStarted', (duration: number) => {
      this.displayCountdown(duration, duration);
      this.updateCountdownUI();
    });

    socketManager.on('countdownTick', (data: { secondsLeft: number, totalDuration: number }) => {
      this.displayCountdown(data.secondsLeft, data.totalDuration);
    });

    socketManager.on('countdownFinished', () => {
      this.hideCountdown();
      this.updateCountdownUI();
    });
  }

  private prefillSavedData(): void {
    const savedName = loadUserName();
    if (savedName) {
      setInputValue('facilitator-name', savedName);
      setInputValue('join-name', savedName);
    }

    const storedCreds = loadJiraCredentials();
    if (storedCreds) {
      setInputValue('jira-domain', storedCreds.domain);
      setInputValue('jira-email', storedCreds.email);
      setInputValue('jira-token', storedCreds.token);
      setInputValue('jira-project-key', storedCreds.projectKey);
      const checkbox = document.getElementById('remember-jira') as HTMLInputElement;
      if (checkbox) checkbox.checked = true;
    }
  }

  private setupUrlParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode) {
      setInputValue('room-code-input', roomCode.toUpperCase());
      showNotification(`Ready to join room ${roomCode}. Enter your name and click Join Session.`, 'success');
    }

    setupClickToCopy('room-code', 'Room code copied to clipboard!');
    setupClickToCopy('session-link', 'Session link copied to clipboard!');
  }

  // Session Management Methods
  private startSession(): void {
    const facilitatorName = getInputValue('facilitator-name');
    const sessionName = getInputValue('session-name');
    
    if (!facilitatorName || !sessionName) {
      showNotification('Please enter both your name and session name', 'error');
      return;
    }

    saveUserName(facilitatorName);
    disableButtons();
    gameState.updateState({ myName: facilitatorName });
    socketManager.createSession(sessionName, facilitatorName);
  }

  private joinSession(): void {
    const participantName = getInputValue('join-name');
    const roomCode = getInputValue('room-code-input').toUpperCase();
    const joinRole = (document.getElementById('join-role') as HTMLSelectElement).value;
    
    if (!participantName || !roomCode) {
      showNotification('Please enter both your name and room code', 'error');
      return;
    }

    if (roomCode.length !== 6) {
      showNotification('Room code must be 6 characters', 'error');
      return;
    }

    saveUserName(participantName);
    disableButtons();
    
    const isViewer = joinRole === 'viewer';
    gameState.updateState({ 
      myName: participantName,
      isViewer 
    });
    
    socketManager.joinSession(roomCode, participantName, isViewer);
  }

  private updateSessionUI(sessionData: SessionData): void {
    const state = gameState.getState();
    
    gameState.updateState({
      participants: sessionData.participants,
      sessionName: sessionData.sessionName,
      votingRevealed: sessionData.votingRevealed,
      currentJiraIssue: sessionData.currentJiraIssue,
      jiraConfig: sessionData.jiraConfig,
      currentTicket: sessionData.currentTicket || '',
      history: sessionData.history || [],
      aggregate: sessionData.aggregate || null
    });

    // Update user's viewer status
    const myParticipant = sessionData.participants.find(p => p.name === state.myName);
    if (myParticipant) {
      gameState.updateState({ isViewer: myParticipant.isViewer });
    }

    // Show session section
    hideElement('setup-section');
    showElement('session-section');

    // Update session info
    setElementText('current-session-name', sessionData.sessionName);
    setElementText('room-code', state.roomCode);
    setElementText('session-link', `${window.location.origin}?room=${state.roomCode}`);

    // Show facilitator controls if user is facilitator
    if (state.isFacilitator) {
      showElement('facilitator-controls');
      this.updateJiraUI();
      adaptFacilitatorControlsForViewport();
    }

    // Update UI components
    this.updateParticipantsList();
    this.updateFacilitatorControls();
    this.updateVotingCards();
    
    if (state.isFacilitator) {
      this.updateToggleViewerButton();
    }

    this.updateTicketDisplay();
    this.updateHistoryUI();
    this.updateStatsUI();
  }

  // Jira Integration Methods
  private toggleJiraSetup(): void {
    const setupDiv = document.getElementById('jira-setup');
    const notConnectedDiv = document.getElementById('jira-not-connected');
    
    if (!setupDiv || !notConnectedDiv) return;
    
    if (setupDiv.classList.contains('hidden')) {
      showElement('jira-setup');
      hideElement('jira-not-connected');
    } else {
      hideElement('jira-setup');
      showElement('jira-not-connected');
      // Clear form
      setInputValue('jira-domain', '');
      setInputValue('jira-email', '');
      setInputValue('jira-token', '');
    }
  }

  private configureJira(): void {
    const domain = getInputValue('jira-domain');
    const email = getInputValue('jira-email');
    const token = getInputValue('jira-token');
    const projectKey = getInputValue('jira-project-key').toUpperCase();
    const remember = (document.getElementById('remember-jira') as HTMLInputElement).checked;

    if (!domain || !email || !token) {
      showNotification('Please fill in all Jira configuration fields', 'error');
      return;
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '');

    if (remember) {
      saveJiraCredentials({ domain: cleanDomain, email, token, projectKey });
    } else {
      clearJiraCredentials();
    }

    const connectBtn = document.getElementById('connect-jira-btn') as HTMLButtonElement;
    if (connectBtn) connectBtn.disabled = true;
    
    const state = gameState.getState();
    socketManager.configureJira(state.roomCode, cleanDomain, email, token, projectKey || undefined);
  }

  private updateJiraUI(): void {
    const state = gameState.getState();
    
    if (state.jiraConfig && state.jiraConfig.hasToken) {
      hideElement('jira-setup');
      showElement('jira-connected');
      hideElement('jira-not-connected');
      setElementText('jira-domain-display', state.jiraConfig.domain);
    } else {
      hideElement('jira-setup');
      hideElement('jira-connected');
      showElement('jira-not-connected');
    }
  }

  private populateJiraBoards(boards: JiraBoard[]): void {
    const select = document.getElementById('jira-board-select') as HTMLSelectElement;
    if (!select) return;
    
    select.innerHTML = '<option value="">Choose a board...</option>';
    
    const sortedBoards = [...boards].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    
    sortedBoards.forEach(board => {
      const option = document.createElement('option');
      option.value = board.id;
      option.textContent = board.name;
      select.appendChild(option);
    });
  }

  private loadJiraIssues(): void {
    const boardSelect = document.getElementById('jira-board-select') as HTMLSelectElement;
    const boardId = boardSelect.value;
    if (!boardId) return;

    const loadBtn = document.getElementById('load-issues-btn') as HTMLButtonElement;
    if (loadBtn) loadBtn.disabled = true;
    
    const state = gameState.getState();
    socketManager.getJiraIssues(state.roomCode, boardId);
  }

  private displayJiraIssues(): void {
    const container = document.getElementById('jira-issues-list');
    const section = document.getElementById('jira-issues-section');
    const state = gameState.getState();
    
    if (!container || !section) return;
    
    container.innerHTML = '';
    
    if (state.jiraIssues.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #6b7280;">No issues found in the selected board backlog.</p>';
      showElement('jira-issues-section');
      return;
    }

    const unestimatedIssues = state.jiraIssues.filter(issue => !issue.currentStoryPoints);
    const estimatedIssues = state.jiraIssues.filter(issue => issue.currentStoryPoints);

    if (unestimatedIssues.length > 0) {
      const header = document.createElement('div');
      header.innerHTML = '<h4 style="margin: 15px 0 10px 0; color: #374151;">📋 Ready for Estimation</h4>';
      container.appendChild(header);

      unestimatedIssues.forEach(issue => {
        const div = this.createJiraIssueElement(issue, true);
        container.appendChild(div);
      });
    }

    if (estimatedIssues.length > 0) {
      const header = document.createElement('div');
      header.innerHTML = '<h4 style="margin: 25px 0 10px 0; color: #374151;">✅ Already Estimated</h4>';
      container.appendChild(header);

      estimatedIssues.forEach(issue => {
        const div = this.createJiraIssueElement(issue, false);
        container.appendChild(div);
      });
    }
    
    showElement('jira-issues-section');
    const loadBtn = document.getElementById('load-issues-btn') as HTMLButtonElement;
    if (loadBtn) loadBtn.disabled = false;

    // Reveal the Issues tab button if hidden
    const issuesTabBtn = document.getElementById('history-tab-issues');
    if (issuesTabBtn) {
      issuesTabBtn.classList.remove('hidden');
    }

    // Ensure history-section card is visible
    showElement('history-section');

    // Automatically switch to Issues tab the first time issues are loaded
    this.switchHistoryTab('issues');
  }

  private createJiraIssueElement(issue: JiraIssue, clickable: boolean): HTMLElement {
    const div = document.createElement('div');
    div.className = 'jira-issue';
    
    if (clickable) {
      div.addEventListener('click', () => this.selectJiraIssue(issue));
    } else {
      div.style.opacity = '0.7';
      div.style.cursor = 'default';
      div.style.background = '#f9fafb';
    }
    
    const currentPoints = issue.currentStoryPoints ? 
      `<span class="jira-current-points">${issue.currentStoryPoints} SP</span>` : '';
    
    div.innerHTML = `
      <div class="jira-issue-key">${issue.key} ${currentPoints}</div>
      <div class="jira-issue-summary">${issue.summary}</div>
      <div class="jira-issue-meta">
        <span>📋 ${issue.issueType}</span>
        <span>🔺 ${issue.priority}</span>
        <span>📊 ${issue.status}</span>
        <span>👤 ${issue.assignee}</span>
      </div>
    `;
    
    return div;
  }

  private selectJiraIssue(issue: JiraIssue): void {
    if (issue.currentStoryPoints) {
      showNotification('This issue is already estimated. Choose an unestimated issue.', 'error');
      return;
    }

    document.querySelectorAll('.jira-issue').forEach(el => {
      el.classList.remove('selected');
    });
    
    const target = event?.target as HTMLElement;
    target?.closest('.jira-issue')?.classList.add('selected');
    
    gameState.updateState({ selectedIssue: issue });
    const state = gameState.getState();
    socketManager.setJiraIssue(state.roomCode, issue);
  }

  // Continue with rest of methods...
  // [This file is getting long, so I'll continue in the next part]

  private vote(value: Vote): void {
    const state = gameState.getState();
    
    if (!state.currentTicket) {
      showNotification('Please wait for a ticket to be set', 'error');
      return;
    }

    if (state.isViewer) {
      showNotification('Viewers cannot vote', 'error');
      return;
    }

    if (state.votingRevealed) {
      showNotification('Voting is complete for this round. Wait for a new round.', 'error');
      return;
    }

    gameState.setMyVote(value);
    socketManager.submitVote(state.roomCode, value);
    playSound('vote');
    this.updateCardSelection(value);
  }

  private updateCardSelection(selectedValue: Vote | null): void {
    document.querySelectorAll('.card').forEach(card => {
      card.classList.remove('selected');
    });

    if (selectedValue !== null) {
      const selectedCard = Array.from(document.querySelectorAll('.card'))
        .find(card => card.getAttribute('data-value') === String(selectedValue));
      if (selectedCard) {
        selectedCard.classList.add('selected');
      }
    }
  }

  private updateVotingCards(): void {
    const state = gameState.getState();
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
      if (state.isViewer || state.votingRevealed) {
        card.classList.add('disabled');
        (card as HTMLElement).style.cursor = 'not-allowed';
      } else {
        card.classList.remove('disabled');
        (card as HTMLElement).style.cursor = 'pointer';
      }
    });
  }

  private resetVotingUI(): void {
    gameState.clearVote();
    gameState.setCountdown(false, 0);
    this.updateCardSelection(null);
    this.updateVotingCards();
    hideElement('results');
    hideElement('finalize-estimation');
    this.hideCountdown();
    this.updateCountdownUI();
  }

  // Additional methods will be added in the continuation...
  private setCurrentTicket(): void {
    const ticket = getInputValue('jira-ticket');
    if (!ticket) {
      showNotification('Please enter a ticket description', 'error');
      return;
    }

    const state = gameState.getState();
    socketManager.setTicket(state.roomCode, ticket);
  }

  private updateTicketDisplay(): void {
    const state = gameState.getState();
    
    if (state.currentTicket) {
      const ticketElement = document.getElementById('ticket-description');
      if (!ticketElement) return;
      
      if (state.currentJiraIssue) {
        const issue = state.currentJiraIssue;
        const jiraBaseUrl = state.jiraConfig ? `https://${state.jiraConfig.domain}` : '#';
        const currentPoints = issue.currentStoryPoints ? 
          `<span style="background: #fbbf24; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px;">Current: ${issue.currentStoryPoints} SP</span>` : '';
        
        ticketElement.innerHTML = `
          <div style="display: flex; align-items: center; margin-bottom: 10px; gap: 10px;">
            <a href="${jiraBaseUrl}/browse/${issue.key}" target="_blank" style="color: #059669; font-size: 16px; font-weight: bold; text-decoration: underline;">
              ${issue.key}
            </a>
            ${currentPoints}
          </div>
          <div style="font-weight: 600; margin-bottom: 8px;">${issue.summary}</div>
          <div style="font-size: 14px; color: #6b7280; display: flex; gap: 15px; flex-wrap: wrap;">
            <span>📋 ${issue.issueType}</span>
            <span>🔺 ${issue.priority}</span>
            <span>📊 ${issue.status}</span>
            <span>👤 ${issue.assignee}</span>
          </div>
          ${issue.description ? `<div style="margin-top: 10px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 14px;">${issue.description.substring(0, 200)}${issue.description.length > 200 ? '...' : ''}</div>` : ''}
        `;
      } else {
        ticketElement.textContent = state.currentTicket;
      }
      
      showElement('current-ticket');
    } else {
      hideElement('current-ticket');
    }
  }

  private updateParticipantsList(): void {
    const list = document.getElementById('participants-list');
    const count = document.getElementById('participant-count');
    const state = gameState.getState();
    
    if (!list || !count) return;
    
    list.innerHTML = '';
    count.textContent = String(state.participants.length);

    state.participants.forEach(participant => {
      const div = document.createElement('div');
      div.className = 'participant';
      
      let statusHtml;
      if (participant.isViewer) {
        statusHtml = `<span class="viewer-badge">👁️ Viewer</span>`;
      } else if (state.votingRevealed && participant.hasVoted) {
        statusHtml = `<span class="vote-value">${participant.vote}</span>`;
      } else if (participant.hasVoted) {
        statusHtml = `<span class="vote-status voted">✓ Voted</span>`;
      } else {
        statusHtml = `<span class="vote-status not-voted">⏳ Waiting</span>`;
      }

      const moderationButton = state.isFacilitator && !participant.isFacilitator ? 
        `<button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; margin-left: 10px;" onclick="app.openModerationModal('${participant.name}')">⚙️</button>` : '';
      
      div.innerHTML = `
        <span class="participant-name">
          ${participant.name} ${participant.isFacilitator ? '👑' : ''}
        </span>
        <div style="display: flex; align-items: center;">
          ${statusHtml}
          ${moderationButton}
        </div>
      `;
      
      list.appendChild(div);
    });
  }

  private updateFacilitatorControls(): void {
    const state = gameState.getState();
    if (!state.isFacilitator) return;

    const hasVotes = state.participants.some(p => p.hasVoted && !p.isViewer);
    const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement;
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    const countdownBtn = document.getElementById('countdown-btn') as HTMLButtonElement;

    if (revealBtn) revealBtn.disabled = (!hasVotes || state.votingRevealed) || state.countdownActive;
    if (resetBtn) resetBtn.disabled = !state.currentTicket;
    if (countdownBtn) countdownBtn.disabled = !state.currentTicket || state.votingRevealed || state.countdownActive;
  }

  private revealVotes(): void {
    const state = gameState.getState();
    socketManager.revealVotes(state.roomCode);
  }

  private resetVoting(): void {
    const state = gameState.getState();
    socketManager.resetVoting(state.roomCode);
  }

  private startCountdown(): void {
    const state = gameState.getState();
    if (!state.currentTicket) {
      showNotification('Please set a ticket first', 'error');
      return;
    }

    socketManager.startCountdown(state.roomCode, 30);
  }

  private displayCountdown(seconds: number, totalDuration: number): void {
    const display = document.getElementById('countdown-display');
    const numberEl = document.getElementById('countdown-number');
    const progressBar = document.getElementById('countdown-progress-bar');
    
    if (!display || !numberEl || !progressBar) return;
    
    showElement('countdown-display');
    numberEl.textContent = String(seconds);
    
    const progress = (seconds / totalDuration) * 100;
    progressBar.style.width = progress + '%';
    
    if (seconds <= 10) {
      display.classList.add('countdown-urgent');
    } else {
      display.classList.remove('countdown-urgent');
    }
  }

  private hideCountdown(): void {
    hideElement('countdown-display');
    const display = document.getElementById('countdown-display');
    if (display) {
      display.classList.remove('countdown-urgent');
    }
  }

  private updateCountdownUI(): void {
    const state = gameState.getState();
    const countdownBtn = document.getElementById('countdown-btn') as HTMLButtonElement;
    const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement;
    
    if (countdownBtn) {
      if (state.countdownActive) {
        countdownBtn.disabled = true;
        countdownBtn.textContent = 'Countdown Active...';
      } else {
        countdownBtn.disabled = !state.currentTicket || state.votingRevealed;
        countdownBtn.textContent = 'Start 30s Countdown';
      }
    }
    
    if (revealBtn && !state.countdownActive) {
      this.updateFacilitatorControls();
    }
  }

  private showResults(results: VotingResults): void {
    if (!results || results.totalVotes === 0) {
      hideElement('results');
      return;
    }

    setElementText('average-vote', results.average.toFixed(1));
    setElementText('consensus-vote', String(results.consensus) || '-');
    setElementText('total-voters', String(results.totalVotes));
    
    const breakdown = document.getElementById('vote-breakdown');
    if (breakdown) {
      breakdown.innerHTML = '<h4>Vote Distribution:</h4>';
      
      Object.entries(results.voteCounts).forEach(([vote, count]) => {
        const percentage = ((count / results.totalVotes) * 100).toFixed(0);
        breakdown.innerHTML += `
          <div style="margin: 5px 0; padding: 8px; background: white; border-radius: 4px;">
            <strong>${vote}</strong>: ${count} vote${count > 1 ? 's' : ''} (${percentage}%)
          </div>
        `;
      });
    }
    
    const state = gameState.getState();
    const finalizeSection = document.getElementById('finalize-estimation');
    if (finalizeSection && state.isFacilitator && state.currentJiraIssue && state.jiraConfig) {
      showElement('finalize-estimation');
      const suggestedValue = !isNaN(Number(results.consensus)) ? 
        Number(results.consensus) : results.average;
      setInputValue('final-estimate', suggestedValue.toFixed(1));
    } else if (finalizeSection) {
      hideElement('finalize-estimation');
    }
    
    showElement('results');
    this.updateCardSelection(null);

    if (results && results.totalVotes > 0 && results.min !== null && results.min === results.max) {
      playSound('consensus');
    }
  }

  private finalizeEstimation(): void {
    const finalEstimate = parseFloat(getInputValue('final-estimate'));
    const state = gameState.getState();
    
    if (isNaN(finalEstimate) || finalEstimate < 0) {
      showNotification('Please enter a valid story point value', 'error');
      return;
    }

    if (!state.currentJiraIssue) {
      showNotification('No Jira issue selected', 'error');
      return;
    }

    const finalizeBtn = document.getElementById('finalize-btn') as HTMLButtonElement;
    if (finalizeBtn) finalizeBtn.disabled = true;
    
    socketManager.finalizeEstimation(state.roomCode, finalEstimate);
  }

  private toggleFacilitatorViewer(): void {
    const state = gameState.getState();
    if (!state.isFacilitator) {
      showNotification('Only the facilitator can change their observer status', 'error');
      return;
    }
    
    const newIsViewer = !state.isViewer;
    socketManager.setFacilitatorViewer(state.roomCode, newIsViewer);
  }

  private updateToggleViewerButton(): void {
    const btn = document.getElementById('toggle-viewer-btn');
    const state = gameState.getState();
    if (!btn) return;
    btn.textContent = state.isViewer ? 'Switch to Participant' : 'Switch to Observer';
  }

  private endSession(): void {
    if (confirm('Are you sure you want to end this session? All participants will be disconnected.')) {
      clearActiveSession();
      const state = gameState.getState();
      socketManager.endSession(state.roomCode);
    }
  }

  // Moderation methods
  openModerationModal(participantName: string): void {
    const state = gameState.getState();
    if (!state.isFacilitator) {
      showNotification('Only facilitators can moderate participants', 'error');
      return;
    }
    
    gameState.setModerationTarget(participantName);
    setElementText('moderation-target', participantName);
    const modal = document.getElementById('moderation-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  }

  private closeModerationModal(): void {
    gameState.setModerationTarget(null);
    const modal = document.getElementById('moderation-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  private moderateParticipant(action: string): void {
    const state = gameState.getState();
    if (!state.moderationTarget || !state.isFacilitator) return;
    
    socketManager.moderateParticipant(state.roomCode, state.moderationTarget, action);
    this.closeModerationModal();
  }

  // History and stats methods
  private updateHistoryUI(): void {
    const historyList = document.getElementById('history-list');
    const state = gameState.getState();
    
    if (!historyList) return;
    
    historyList.innerHTML = '';
    
    const hasHistory = state.history && state.history.length > 0;
    const hasIssues = state.jiraIssues && state.jiraIssues.length > 0;

    if (!hasHistory && !hasIssues) {
      hideElement('history-section');
      return;
    }

    showElement('history-section');

    state.history.forEach(entry => {
      const div = document.createElement('div');
      div.style.cssText = 'padding: 8px 12px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; font-size: 14px;';

      const ticketText = entry.issueKey ? `${entry.issueKey}: ${entry.summary || ''}` : entry.ticket;
      const consensus = entry.stats ? entry.stats.consensus : (entry.storyPoints || '-');
      const average = entry.stats ? entry.stats.average.toFixed(1) : '-';
      const range = entry.stats ? `${entry.stats.min}‒${entry.stats.max}` : '-';
      const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';

      div.innerHTML = `<strong>${ticketText}</strong><br><span style="color:#6b7280;">Consensus: ${consensus} | Avg: ${average} | Range: ${range} | ${timeStr}</span>`;
      historyList.appendChild(div);
    });
    
    this.updateStatsUI();
  }

  private updateStatsUI(): void {
    const section = document.getElementById('stats-section');
    const teamDiv = document.getElementById('team-stats');
    const userDiv = document.getElementById('user-stats');
    const state = gameState.getState();
    
    if (!section || !teamDiv || !userDiv || !state.aggregate) {
      if (section) hideElement('stats-section');
      return;
    }
    
    const agg = state.aggregate;
    if (agg.totalRounds === 0) {
      hideElement('stats-section');
      return;
    }
    
    showElement('stats-section');

    const consensusPct = ((agg.consensusRounds / agg.totalRounds) * 100).toFixed(0);

    let totalSP = 0;
    if (state.history && state.history.length) {
      const latest = new Map();
      state.history.forEach(h => {
        const key = h.issueKey || h.ticket;
        latest.set(key, h);
      });
      
      latest.forEach(h => {
        const consensus = h.stats ? h.stats.consensus : h.storyPoints;
        if (typeof consensus === 'number') {
          totalSP += consensus;
        } else if (consensus === '-' && h.stats && typeof h.stats.average === 'number') {
          // If no consensus but we have an average, use closest Fibonacci
          const closestFib = roundToNearestFibonacci(h.stats.average);
          if (closestFib !== null) {
            totalSP += closestFib;
          }
        }
      });
    }

    teamDiv.innerHTML = `<strong>Total Rounds:</strong> ${agg.totalRounds} &nbsp; | &nbsp; <strong>Consensus Achieved:</strong> ${agg.consensusRounds} (${consensusPct}%) &nbsp; | &nbsp; <strong>Total Story Points:</strong> ${totalSP}`;

    userDiv.innerHTML = '';
    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse;';
    
    const headerRow = document.createElement('tr');
    ['Member','Avg','High','Low','Votes'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = 'border: 1px solid #e5e7eb; padding: 4px; background: #f9fafb;';
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    Object.entries(agg.perUser).forEach(([name, data]) => {
      const tr = document.createElement('tr');
      const avg = data.count ? (data.sum / data.count).toFixed(1) : '-';
      const cells = [name, avg, data.highCount, data.lowCount, data.count];
      
      cells.forEach(val => {
        const td = document.createElement('td');
        td.textContent = String(val);
        td.style.cssText = 'border: 1px solid #e5e7eb; padding: 4px; text-align: center;';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    
    userDiv.appendChild(table);
  }

  private exportHistory(): void {
    const state = gameState.getState();
    
    if (!state.history || state.history.length === 0) {
      showNotification('No history to export', 'error');
      return;
    }

    const header = ['Ticket', 'Consensus', 'Average', 'Min', 'Max', 'Timestamp'];

    const latest = new Map();
    state.history.forEach(entry => {
      const key = entry.issueKey || entry.ticket;
      latest.set(key, entry);
    });

    let totalPoints = 0;
    const rows: (string | number)[][] = [];
    
    latest.forEach(entry => {
      const ticketText = entry.issueKey ? `${entry.issueKey}: ${entry.summary || ''}` : entry.ticket;
      const consensus = entry.stats ? entry.stats.consensus : (entry.storyPoints || '-');
      const avg = entry.stats ? entry.stats.average : '';
      const min = entry.stats ? entry.stats.min : '';
      const max = entry.stats ? entry.stats.max : '';
      const timeStr = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';

      if (typeof consensus === 'number') {
        totalPoints += consensus;
      } else if (consensus === '-' && entry.stats && typeof entry.stats.average === 'number') {
        // If no consensus but we have an average, use closest Fibonacci
        const closestFib = roundToNearestFibonacci(entry.stats.average);
        if (closestFib !== null) {
          totalPoints += closestFib;
        }
      }

      rows.push([ticketText, consensus, avg, min, max, timeStr]);
    });

    rows.push([]);
    rows.push(['Total Story Points', totalPoints]);
    
    if (state.aggregate) {
      const a = state.aggregate;
      const pct = ((a.consensusRounds / a.totalRounds) * 100).toFixed(0);
      rows.push(['Total Rounds', a.totalRounds]);
      rows.push(['Consensus Rounds', a.consensusRounds, pct + '%']);
    }

    const csvArray = [header, ...rows].map(r => 
      r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvArray], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.sessionName || 'estimation_history'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Switch between the Issues and History tabs inside the history-section card
   */
  private switchHistoryTab(tab: 'issues' | 'history'): void {
    const tabIssues = document.getElementById('history-tab-issues');
    const tabHistory = document.getElementById('history-tab-history');
    const issuesPanel = document.getElementById('jira-issues-section');
    const historyPanel = document.getElementById('history-panel');

    if (!tabIssues || !tabHistory || !issuesPanel || !historyPanel) return;

    const activate = (btn: HTMLElement) => {
      btn.classList.add('bg-background', 'text-foreground', 'shadow-sm');
    };
    const deactivate = (btn: HTMLElement) => {
      btn.classList.remove('bg-background', 'text-foreground', 'shadow-sm');
    };

    if (tab === 'issues') {
      activate(tabIssues);
      deactivate(tabHistory);
      showElement('jira-issues-section');
      hideElement('history-panel');
    } else {
      activate(tabHistory);
      deactivate(tabIssues);
      showElement('history-panel');
      hideElement('jira-issues-section');
    }
  }

  /**
   * Toggle collapse/expand state of dashboard cards
   */
  toggleCard(cardId: string): void {
    const card = document.querySelector(`[data-card="${cardId}"]`);
    if (!card) return;
    
    card.classList.toggle('collapsed');
    
    // Save state to localStorage
    const collapsedCards = JSON.parse(localStorage.getItem('collapsedCards') || '[]');
    if (card.classList.contains('collapsed')) {
      if (!collapsedCards.includes(cardId)) {
        collapsedCards.push(cardId);
      }
    } else {
      const index = collapsedCards.indexOf(cardId);
      if (index > -1) {
        collapsedCards.splice(index, 1);
      }
    }
    localStorage.setItem('collapsedCards', JSON.stringify(collapsedCards));
  }

  /**
   * Restore collapsed card states from localStorage
   */
  private restoreCardStates(): void {
    const collapsedCards = JSON.parse(localStorage.getItem('collapsedCards') || '[]');
    collapsedCards.forEach((cardId: string) => {
      const card = document.querySelector(`[data-card="${cardId}"]`);
      if (card) {
        card.classList.add('collapsed');
      }
    });
  }

  // Drag and Drop Methods
  private setupDragAndDrop(): void {
    this.setupDragEvents();
    this.setupDropZones();
  }

  private setupDragEvents(): void {
    const cards = document.querySelectorAll('.dashboard-card[draggable="true"]');
    
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => this.handleDragStart(e as DragEvent));
      card.addEventListener('dragend', (e) => this.handleDragEnd(e as DragEvent));
      card.addEventListener('dragover', (e) => this.handleDragOver(e as DragEvent));
      card.addEventListener('drop', (e) => this.handleDrop(e as DragEvent));
      
      // Setup drag handle events
      const dragHandle = card.querySelector('.drag-handle');
      if (dragHandle) {
        dragHandle.addEventListener('mousedown', (e) => {
          e.stopPropagation(); // Prevent card toggle
        });
      }    });
  }

  private setupDropZones(): void {
    const columns = document.querySelectorAll('[data-column]');
    const dropZones = document.querySelectorAll('.column-drop-zone');
    
    [...columns, ...dropZones].forEach(zone => {
      zone.addEventListener('dragover', (e) => this.handleColumnDragOver(e as DragEvent));
      zone.addEventListener('drop', (e) => this.handleColumnDrop(e as DragEvent));
      zone.addEventListener('dragleave', (e) => this.handleColumnDragLeave(e as DragEvent));
    });
  }

  private draggedElement: HTMLElement | null = null;
  private draggedFromColumn: string | null = null;

  private handleDragStart(e: DragEvent): void {
    const target = e.target as HTMLElement;
    this.draggedElement = target.closest('.dashboard-card') as HTMLElement;
    
    if (this.draggedElement) {
      this.draggedElement.classList.add('dragging');
      this.draggedFromColumn = this.getCardColumn(this.draggedElement);
      
      e.dataTransfer?.setData('text/plain', this.draggedElement.dataset.card || '');
    }
  }

  private handleDragEnd(e: DragEvent): void {
    const target = e.target as HTMLElement;
    const card = target.closest('.dashboard-card') as HTMLElement;
    
    if (card) {
      card.classList.remove('dragging');
    }
    
    // Clean up drag indicators
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drop-indicator.active').forEach(el => el.classList.remove('active'));
    
    this.draggedElement = null;
    this.draggedFromColumn = null;
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    
    const target = e.target as HTMLElement;
    const card = target.closest('.dashboard-card') as HTMLElement;
    
    if (card && card !== this.draggedElement) {
      card.classList.add('drag-over');
    }
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    
    const target = e.target as HTMLElement;
    const targetCard = target.closest('.dashboard-card') as HTMLElement;
    
    if (targetCard && this.draggedElement && targetCard !== this.draggedElement) {
      const targetColumn = this.getCardColumn(targetCard);
      const targetParent = targetCard.parentElement;
      
      if (targetParent) {
        // Insert before the target card
        targetParent.insertBefore(this.draggedElement, targetCard);
        this.saveCardLayout();
      }
    }
    
    targetCard?.classList.remove('drag-over');
  }

  private handleColumnDragOver(e: DragEvent): void {
    e.preventDefault();
    
    const target = e.target as HTMLElement;
    const column = target.closest('[data-column]') as HTMLElement;
    const dropZone = target.closest('.column-drop-zone') as HTMLElement;
    
    if (dropZone) {
      dropZone.classList.add('drag-over');
    } else if (column) {
      column.classList.add('drag-over');
    }
  }

  private handleColumnDrop(e: DragEvent): void {
    e.preventDefault();
    
    const target = e.target as HTMLElement;
    const column = target.closest('[data-column]') as HTMLElement;
    const dropZone = target.closest('.column-drop-zone') as HTMLElement;
    
    if (this.draggedElement && (column || dropZone)) {
      const targetColumn = column?.dataset.column || dropZone?.dataset.dropZone;
      
      if (targetColumn) {
        const columnElement = column || document.querySelector(`[data-column="${targetColumn}"]`);
        
        if (columnElement) {
          // Append to the column (before the drop zone)
          const dropZoneInColumn = columnElement.querySelector('.column-drop-zone');
          if (dropZoneInColumn) {
            columnElement.insertBefore(this.draggedElement, dropZoneInColumn);
          } else {
            columnElement.appendChild(this.draggedElement);
          }
          
          this.saveCardLayout();
        }
      }
    }
    
    // Clean up
    target.classList.remove('drag-over');
    column?.classList.remove('drag-over');
    dropZone?.classList.remove('drag-over');
  }

  private handleColumnDragLeave(e: DragEvent): void {
    const target = e.target as HTMLElement;
    target.classList.remove('drag-over');
  }

  private getCardColumn(card: HTMLElement): string | null {
    const column = card.closest('[data-column]');
    return column?.getAttribute('data-column') || null;
  }

  private saveCardLayout(): void {
    const layout = {
      sidebar: this.getColumnCardOrder('sidebar'),
      main: this.getColumnCardOrder('main')
    };
    
    localStorage.setItem('cardLayout', JSON.stringify(layout));
  }

  private getColumnCardOrder(columnName: string): string[] {
    const column = document.querySelector(`[data-column="${columnName}"]`);
    if (!column) return [];
    
    const cards = column.querySelectorAll('.dashboard-card[data-card]');
    return Array.from(cards).map(card => (card as HTMLElement).dataset.card || '');
  }

  private restoreCardLayout(): void {
    const savedLayout = localStorage.getItem('cardLayout');
    if (!savedLayout) return;
    
    try {
      const layout = JSON.parse(savedLayout);
      
      // Restore sidebar column
      if (layout.sidebar) {
        this.restoreColumnOrder('sidebar', layout.sidebar);
      }
      
      // Restore main column  
      if (layout.main) {
        this.restoreColumnOrder('main', layout.main);
      }
    } catch (error) {
      console.warn('Failed to restore card layout:', error);
    }
  }

  private restoreColumnOrder(columnName: string, cardOrder: string[]): void {
    const column = document.querySelector(`[data-column="${columnName}"]`);
    if (!column) return;
    
    const dropZone = column.querySelector('.column-drop-zone');
    
    cardOrder.forEach(cardId => {
      const card = document.querySelector(`[data-card="${cardId}"]`);
      if (card) {
        if (dropZone) {
          column.insertBefore(card, dropZone);
        } else {
          column.appendChild(card);
        }
      }
    });
  }
}

// Helper function to round to nearest Fibonacci number
function roundToNearestFibonacci(value: number): number | null {
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

// Initialize the application
const app = new ScrumPokerApp();

// Expose app globally for onclick handlers
(window as any).app = app;

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}