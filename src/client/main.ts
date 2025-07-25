import './styles/globals.css';
import { gameState } from './components/GameState.js';
import { socketManager } from './components/SocketManager.js';
import {
  saveUserName,
  loadUserName,
  saveJiraCredentials,
  loadJiraCredentials,
  clearJiraCredentials,
  clearActiveSession,
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
  toggleFacilitatorControlsVisibility,
} from './utils/ui.js';
import { playSound, toggleSound, updateSoundIcon } from './utils/sound.js';
import {
  setTextContent,
  createElement,
  createSafeLink,
  processChatMessage,
} from './utils/security.js';
import { eventManager, addTrackedEventListener } from './utils/eventManager.js';
import { updateListIncrementally } from './utils/listRenderer.js';
import {
  SessionData,
  VotingResults,
  JiraIssue,
  Vote,
  JiraBoard,
  ChatMessage,
} from '@shared/types/index.js';
import { mutateDOM } from './utils/domBatcher.js';

class ScrumPokerApp {
  private eventListenerIds: string[] = [];

  // Store ticket event handlers to allow proper cleanup
  private ticketHoverHandler: (event: Event) => void = event => {
    const ticketElement = event.currentTarget as HTMLElement;
    ticketElement.style.borderColor = '#3b82f6';
    ticketElement.style.backgroundColor = '#eff6ff';
  };

  private ticketLeaveHandler: (event: Event) => void = event => {
    const ticketElement = event.currentTarget as HTMLElement;
    ticketElement.style.borderColor = 'transparent';
    ticketElement.style.backgroundColor = 'transparent';
  };

  private ticketClickHandler: (event: Event) => void = event => {
    event.preventDefault();
    event.stopPropagation();
    const state = gameState.getState();
    if (state.currentJiraIssue) {
      console.log('Ticket clicked!', state.currentJiraIssue.key);
      this.requestTicketDetails(state.currentJiraIssue.key);
    }
  };

  constructor() {
    this.setupSocketEventHandlers();
  }

  init(): void {
    // Setup DOM event listeners first, now that DOM is ready
    this.setupEventListeners();

    socketManager.connect();
    this.prefillSavedData();
    this.setupUrlParameters();
    updateSoundIcon();
    this.restoreCardStates();
    this.restoreCardLayout();
    // Setup drag and drop AFTER restoring layout to ensure event listeners are properly attached
    this.setupDragAndDrop();

    // Initialize export stats button as disabled
    this.updateExportStatsButtonState(false);
  }

  private setupEventListeners(): void {
    // Session management
    document.getElementById('start-btn')?.addEventListener('click', () => this.startSession());
    document.getElementById('join-btn')?.addEventListener('click', () => this.joinSession());

    // Facilitator controls
    document
      .getElementById('setup-jira-btn')
      ?.addEventListener('click', () => this.toggleJiraSetup());
    document
      .getElementById('cancel-jira-btn')
      ?.addEventListener('click', () => this.toggleJiraSetup());
    document
      .getElementById('connect-jira-btn')
      ?.addEventListener('click', () => this.configureJira());

    // Re-enable Jira buttons when user modifies fields after a failed connection
    ['jira-domain', 'jira-email', 'jira-token', 'jira-project-key'].forEach(fieldId => {
      document.getElementById(fieldId)?.addEventListener('input', () => this.enableJiraButtons());
    });
    document
      .getElementById('load-issues-btn')
      ?.addEventListener('click', () => this.loadJiraIssues());

    // Jira issues search
    document.getElementById('jira-issues-search')?.addEventListener('input', e => {
      const searchTerm = (e.target as HTMLInputElement).value;
      this.displayJiraIssues(searchTerm);
    });

    document
      .getElementById('set-ticket-btn')
      ?.addEventListener('click', () => this.setCurrentTicket());
    document.getElementById('reveal-btn')?.addEventListener('click', () => this.revealVotes());
    document.getElementById('reset-btn')?.addEventListener('click', () => this.resetVoting());
    document
      .getElementById('countdown-btn')
      ?.addEventListener('click', () => this.startCountdown());
    document
      .getElementById('toggle-viewer-btn')
      ?.addEventListener('click', () => this.toggleFacilitatorViewer());
    document.getElementById('end-session-btn')?.addEventListener('click', () => this.endSession());
    document
      .getElementById('finalize-btn')
      ?.addEventListener('click', () => this.finalizeEstimation());
    document
      .getElementById('export-history-btn')
      ?.addEventListener('click', () => this.exportHistory());
    document
      .getElementById('export-stats-btn')
      ?.addEventListener('click', () => this.exportStatistics());

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
          this.vote(value === '?' || value === '☕' ? (value as Vote) : parseFloat(value));
        }
      });
    });

    // Moderation modal
    document.getElementById('moderation-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.closeModerationModal();
      }
    });

    document
      .getElementById('make-viewer-btn')
      ?.addEventListener('click', () => this.moderateParticipant('make-viewer'));
    document
      .getElementById('make-participant-btn')
      ?.addEventListener('click', () => this.moderateParticipant('make-participant'));
    document
      .getElementById('make-facilitator-btn')
      ?.addEventListener('click', () => this.moderateParticipant('make-facilitator'));
    document
      .getElementById('remove-participant-btn')
      ?.addEventListener('click', () => this.moderateParticipant('remove'));
    document
      .getElementById('cancel-moderation-btn')
      ?.addEventListener('click', () => this.closeModerationModal());

    // End session modal
    document.getElementById('end-session-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        this.closeEndSessionModal();
      }
    });
    document
      .getElementById('confirm-end-session-btn')
      ?.addEventListener('click', () => this.confirmEndSession());
    document
      .getElementById('cancel-end-session-btn')
      ?.addEventListener('click', () => this.closeEndSessionModal());
    document
      .getElementById('download-history-btn')
      ?.addEventListener('click', () => this.exportHistory());
    document
      .getElementById('download-statistics-btn')
      ?.addEventListener('click', () => this.exportStatistics());

    // Chat functionality
    document.getElementById('chat-input')?.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });
    document.getElementById('chat-input')?.addEventListener('input', () => {
      this.handleTyping();
    });
    document
      .getElementById('send-message-btn')
      ?.addEventListener('click', () => this.sendChatMessage());

    // Jira board selection
    document.getElementById('jira-board-select')?.addEventListener('change', e => {
      const target = e.target as HTMLSelectElement;
      const loadBtn = document.getElementById('load-issues-btn') as HTMLButtonElement;
      if (loadBtn) {
        loadBtn.disabled = !target.value;
      }
    });

    // Room code input auto-uppercase
    document.getElementById('room-code-input')?.addEventListener('input', e => {
      const target = e.target as HTMLInputElement;
      target.value = target.value.toUpperCase();
    });

    // Enter key handlers
    document.addEventListener('keypress', e => {
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
    document
      .getElementById('toggle-controls-btn')
      ?.addEventListener('click', toggleFacilitatorControlsVisibility);
    this.eventListenerIds.push(
      addTrackedEventListener(window, 'resize', adaptFacilitatorControlsForViewport)
    );

    /* History / Issues Tabs */
    const tabIssues = document.getElementById('history-tab-issues');
    const tabHistory = document.getElementById('history-tab-history');
    tabIssues?.addEventListener('click', () => this.switchHistoryTab('issues'));
    tabHistory?.addEventListener('click', () => this.switchHistoryTab('history'));

    // Split screen close button
    document
      .getElementById('close-split-screen')
      ?.addEventListener('click', () => this.hideSplitScreen());
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

    socketManager.on('roleChanged', (newRole: string) => {
      this.updateVotingCards();

      const facilitatorControls = document.getElementById('facilitator-controls');

      // Handle facilitator role changes
      if (newRole === 'facilitator') {
        if (facilitatorControls) {
          facilitatorControls.style.display = 'block';
          facilitatorControls.classList.remove('hidden');
        }
        this.updateJiraUI();
        adaptFacilitatorControlsForViewport();
        this.updateToggleViewerButton();
      } else if (newRole === 'participant' || newRole === 'viewer') {
        if (facilitatorControls) {
          facilitatorControls.style.display = 'none';
          facilitatorControls.classList.add('hidden');
        }
        adaptFacilitatorControlsForViewport();
        if (newRole === 'participant') {
          this.updateToggleViewerButton();
        }
      }
    });

    socketManager.on(
      'jiraConfigured',
      (data: { boards: JiraBoard[]; sessionData: SessionData }) => {
        this.updateJiraUI();
        this.populateJiraBoards(data.boards);
        this.enableJiraButtons();
      }
    );

    socketManager.on('jiraIssuesLoaded', () => {
      // Clear search field when new issues are loaded
      const searchInput = document.getElementById('jira-issues-search') as HTMLInputElement;
      if (searchInput) searchInput.value = '';
      this.displayJiraIssues();
    });

    // Handle Jira configuration failures
    socketManager.on('jiraConfigFailed', () => {
      this.enableJiraButtons();
    });

    socketManager.on('ticketSet', (ticketData: any) => {
      this.updateTicketDisplay();
      this.resetVotingUI();

      // Handle split-screen panel based on ticket type
      if (ticketData && typeof ticketData === 'object' && ticketData.key) {
        // This is a Jira issue - update split-screen if it's currently showing
        this.handleJiraTicketChange(ticketData);
      } else {
        // This is a manual ticket - hide split-screen
        this.hideSplitScreen();
      }
    });

    socketManager.on('jiraUpdated', () => {
      this.updateTicketDisplay();
      this.resetVotingUI();
      // Clear search field when issues are updated
      const searchInput = document.getElementById('jira-issues-search') as HTMLInputElement;
      if (searchInput) searchInput.value = '';
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

    socketManager.on('countdownTick', (data: { secondsLeft: number; totalDuration: number }) => {
      this.displayCountdown(data.secondsLeft, data.totalDuration);
    });

    socketManager.on('countdownFinished', () => {
      this.hideCountdown();
      this.updateCountdownUI();
    });

    // Chat event handlers
    socketManager.on('chatMessage', (message: ChatMessage) => {
      gameState.addChatMessage(message);
      this.displayChatMessage(message, true);
    });

    socketManager.on('typingUpdate', (typingUsers: string[]) => {
      gameState.setTypingUsers(typingUsers);
      this.updateTypingIndicator(typingUsers);
    });

    socketManager.on('discussionTimerTick', (data: { discussionDuration: number }) => {
      this.updateDiscussionTimer(data.discussionDuration);
    });

    socketManager.on('jiraIssueDetailsLoaded', (data: { issueDetails: any }) => {
      console.log('✅ CLIENT: Received jira-issue-details-loaded event', data);
      this.displayTicketDetails(data.issueDetails);
    });

    socketManager.on('jiraIssueDetailsFailed', (data: { message: string }) => {
      console.log('❌ CLIENT: Received jira-issue-details-failed event', data);
      this.showTicketDetailsError(data.message);
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
      showNotification(
        `Ready to join room ${roomCode}. Enter your name and click Join Session.`,
        'success'
      );
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
      isViewer,
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
      aggregate: sessionData.aggregate || null,
      chatMessages: sessionData.chatMessages || [],
    });

    // Update user's role status
    const myParticipant = sessionData.participants.find(p => p.name === state.myName);
    if (myParticipant) {
      gameState.updateState({
        isViewer: myParticipant.isViewer,
        isFacilitator: myParticipant.isFacilitator,
      });
    }

    // Show session section
    hideElement('setup-section');
    showElement('session-section');

    // Update session info
    setElementText('current-session-name', sessionData.sessionName);
    setElementText('room-code', state.roomCode);
    setElementText('session-link', `${window.location.origin}?room=${state.roomCode}`);

    // Show/hide facilitator controls based on role
    const isFacilitator = myParticipant ? myParticipant.isFacilitator : false;
    const facilitatorControls = document.getElementById('facilitator-controls');
    const facilitatorCards = [
      document.querySelector('[data-card="session-controls"]'),
      document.querySelector('[data-card="jira-integration"]'),
      document.querySelector('[data-card="manual-ticket"]'),
    ];

    if (isFacilitator) {
      if (facilitatorControls) {
        facilitatorControls.style.display = 'block';
        facilitatorControls.classList.remove('hidden');
      }
      facilitatorCards.forEach(card => {
        if (card) {
          (card as HTMLElement).style.display = 'block';
          card.classList.remove('hidden');
        }
      });
      this.updateJiraUI();
      adaptFacilitatorControlsForViewport();
    } else {
      if (facilitatorControls) {
        facilitatorControls.style.setProperty('display', 'none', 'important');
        facilitatorControls.classList.add('hidden');
      }
      facilitatorCards.forEach(card => {
        if (card) {
          (card as HTMLElement).style.setProperty('display', 'none', 'important');
          card.classList.add('hidden');
        }
      });
      adaptFacilitatorControlsForViewport();
    }

    // Update UI components
    this.updateParticipantsList();
    this.updateFacilitatorControls();
    this.updateVotingCards();

    if (isFacilitator) {
      this.updateToggleViewerButton();

      // Auto-reconnect to Jira if saved credentials exist and no Jira config is active
      this.autoReconnectJira();
    }

    this.updateTicketDisplay();
    this.updateHistoryUI();
    this.updateStatsUI();
    this.updateChatUI();

    // Update discussion timer if session has discussion in progress
    if (sessionData.discussionStartTime && sessionData.currentTicket) {
      const discussionDuration = Math.floor(
        (new Date().getTime() - new Date(sessionData.discussionStartTime).getTime()) / 1000
      );
      this.updateDiscussionTimer(discussionDuration);
    } else {
      this.updateDiscussionTimer(0);
    }

    // Reinitialize drag and drop after UI updates (cards may have become visible/hidden)
    this.reinitializeDragAndDrop();
  }

  // Auto-reconnect to Jira if saved credentials exist
  private autoReconnectJira(): void {
    const state = gameState.getState();

    console.log('🔄 AUTO-RECONNECT: Checking if we should auto-reconnect to Jira');
    console.log('🔄 AUTO-RECONNECT: Current jiraConfig:', state.jiraConfig);
    console.log('🔄 AUTO-RECONNECT: Is facilitator:', state.isFacilitator);
    console.log('🔄 AUTO-RECONNECT: Room code:', state.roomCode);

    // Only auto-reconnect if:
    // 1. No Jira is currently configured in the session
    // 2. We have saved credentials
    // 3. User is a facilitator
    if (state.jiraConfig) {
      console.log(
        '🔄 AUTO-RECONNECT: Jira already configured, checking if boards need to be reloaded'
      );

      // Check if the board dropdown is empty but we have Jira configured
      const boardSelect = document.getElementById('jira-board-select') as HTMLSelectElement;
      if (boardSelect && boardSelect.options.length <= 1) {
        console.log('🔄 AUTO-RECONNECT: Board dropdown is empty, re-configuring to load boards');
        this.configureJira();
      } else {
        console.log('🔄 AUTO-RECONNECT: Boards already loaded, skipping');
      }
      return;
    }

    if (!state.isFacilitator) {
      console.log('🔄 AUTO-RECONNECT: Not a facilitator, skipping');
      return;
    }

    const storedCreds = loadJiraCredentials();
    console.log('🔄 AUTO-RECONNECT: Stored credentials:', storedCreds ? 'Found' : 'Not found');

    if (!storedCreds || !storedCreds.domain || !storedCreds.email || !storedCreds.token) {
      console.log('🔄 AUTO-RECONNECT: Missing credentials, skipping');
      return;
    }

    // Auto-configure Jira with saved credentials
    console.log('🔄 AUTO-RECONNECT: Starting auto-reconnect to Jira with saved credentials');
    this.configureJira();
  }

  // Jira Integration Methods
  private enableJiraButtons(): void {
    const connectBtn = document.getElementById('connect-jira-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-jira-btn') as HTMLButtonElement;

    if (connectBtn) connectBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }

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
    const cancelBtn = document.getElementById('cancel-jira-btn') as HTMLButtonElement;

    if (connectBtn) connectBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

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

    const sortedBoards = [...boards].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    );

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

  private displayJiraIssues(searchTerm: string = ''): void {
    const container = document.getElementById('jira-issues-list');
    const section = document.getElementById('jira-issues-section');
    const state = gameState.getState();

    if (!container || !section) return;

    container.innerHTML = '';

    if (state.jiraIssues.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #6b7280;">No issues found in the selected board backlog.</p>';
      showElement('jira-issues-section');
      return;
    }

    // Filter issues based on search term
    let filteredIssues = state.jiraIssues;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredIssues = state.jiraIssues.filter(
        issue =>
          issue.key.toLowerCase().includes(lowerSearchTerm) ||
          issue.summary.toLowerCase().includes(lowerSearchTerm) ||
          (issue.description && issue.description.toLowerCase().includes(lowerSearchTerm)) ||
          (issue.issueType && issue.issueType.toLowerCase().includes(lowerSearchTerm)) ||
          (issue.priority && issue.priority.toLowerCase().includes(lowerSearchTerm)) ||
          (issue.status && issue.status.toLowerCase().includes(lowerSearchTerm)) ||
          (issue.assignee && issue.assignee.toLowerCase().includes(lowerSearchTerm))
      );
    }

    if (filteredIssues.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #6b7280;">No issues match your search criteria.</p>';
      showElement('jira-issues-section');
      return;
    }

    const unestimatedIssues = filteredIssues.filter(issue => !issue.currentStoryPoints);
    const estimatedIssues = filteredIssues.filter(issue => issue.currentStoryPoints);

    if (unestimatedIssues.length > 0) {
      const header = document.createElement('div');
      header.innerHTML =
        '<h4 style="margin: 15px 0 10px 0; color: #374151;">📋 Ready for Estimation</h4>';
      container.appendChild(header);

      unestimatedIssues.forEach(issue => {
        const div = this.createJiraIssueElement(issue, true);
        container.appendChild(div);
      });
    }

    if (estimatedIssues.length > 0) {
      const header = document.createElement('div');
      header.innerHTML =
        '<h4 style="margin: 25px 0 10px 0; color: #374151;">✅ Already Estimated</h4>';
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

    // Update tab visibility and card title based on available content
    this.updateHistoryTabsVisibility();

    // Automatically switch to Issues tab if both tabs are visible
    const hasHistory = state.history && state.history.length > 0;
    if (hasHistory) {
      this.switchHistoryTab('issues');
    }
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

    // Create key container
    const keyDiv = createElement('div');
    keyDiv.className = 'jira-issue-key';
    setTextContent(keyDiv, issue.key);

    // Add current points if they exist
    if (issue.currentStoryPoints) {
      const pointsSpan = createElement(
        'span',
        `${issue.currentStoryPoints} SP`,
        'jira-current-points'
      );
      keyDiv.appendChild(document.createTextNode(' '));
      keyDiv.appendChild(pointsSpan);
    }

    // Create summary div
    const summaryDiv = createElement('div', issue.summary, 'jira-issue-summary');

    // Create meta container
    const metaDiv = createElement('div');
    metaDiv.className = 'jira-issue-meta';

    // Add meta items with escaped content
    const metaItems = [
      `📋 ${issue.issueType}`,
      `🔺 ${issue.priority}`,
      `📊 ${issue.status}`,
      `👤 ${issue.assignee}`,
    ];

    metaItems.forEach(item => {
      const span = createElement('span', item);
      metaDiv.appendChild(span);
    });

    // Add all elements to div
    div.appendChild(keyDiv);
    div.appendChild(summaryDiv);
    div.appendChild(metaDiv);

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
      const selectedCard = Array.from(document.querySelectorAll('.card')).find(
        card => card.getAttribute('data-value') === String(selectedValue)
      );
      if (selectedCard) {
        selectedCard.classList.add('selected');
      }
    }
  }

  private updateVotingCards(): void {
    const state = gameState.getState();

    // Batch voting card updates
    mutateDOM(() => {
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

    // Only hide split screen if there's no current ticket, not on every update
    // This prevents hiding the split screen during voting updates

    if (state.currentTicket) {
      const ticketElement = document.getElementById('ticket-description');
      if (!ticketElement) return;

      if (state.currentJiraIssue) {
        const issue = state.currentJiraIssue;
        const jiraBaseUrl = state.jiraConfig ? `https://${state.jiraConfig.domain}` : '#';

        // Clear the element first
        ticketElement.innerHTML = '';

        // Reset event listeners by removing existing ones
        ticketElement.removeEventListener('mouseenter', this.ticketHoverHandler);
        ticketElement.removeEventListener('mouseleave', this.ticketLeaveHandler);
        ticketElement.removeEventListener('click', this.ticketClickHandler);

        // Create main container
        const mainContainer = createElement('div');
        mainContainer.style.cssText =
          'display: flex; align-items: center; margin-bottom: 10px; gap: 10px;';

        // Create safe link to Jira
        const jiraUrl = `${jiraBaseUrl}/browse/${encodeURIComponent(issue.key)}`;
        const jiraLink = createSafeLink(jiraUrl, issue.key, '_blank');
        jiraLink.style.cssText =
          'color: #059669; font-size: 16px; font-weight: bold; text-decoration: underline;';
        mainContainer.appendChild(jiraLink);

        // Add current points if they exist
        if (issue.currentStoryPoints) {
          const pointsSpan = createElement('span', `Current: ${issue.currentStoryPoints} SP`);
          pointsSpan.style.cssText =
            'background: #fbbf24; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px;';
          mainContainer.appendChild(pointsSpan);
        }

        // Create summary element
        const summaryDiv = createElement('div', issue.summary);
        summaryDiv.style.cssText = 'font-weight: 600; margin-bottom: 8px;';

        // Create metadata container
        const metaDiv = createElement('div');
        metaDiv.style.cssText =
          'font-size: 14px; color: #6b7280; display: flex; gap: 15px; flex-wrap: wrap;';

        // Add metadata spans with escaped content
        const metaItems = [
          `📋 ${issue.issueType}`,
          `🔺 ${issue.priority}`,
          `📊 ${issue.status}`,
          `👤 ${issue.assignee}`,
        ];

        metaItems.forEach(item => {
          const span = createElement('span', item);
          metaDiv.appendChild(span);
        });

        // Add all elements to ticket element
        ticketElement.appendChild(mainContainer);
        ticketElement.appendChild(summaryDiv);
        ticketElement.appendChild(metaDiv);

        // Add description if it exists
        if (issue.description) {
          const descDiv = createElement('div');
          descDiv.style.cssText =
            'margin-top: 10px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 14px;';
          const truncatedDesc = issue.description.substring(0, 200);
          const finalDesc = issue.description.length > 200 ? truncatedDesc + '...' : truncatedDesc;
          setTextContent(descDiv, finalDesc);
          ticketElement.appendChild(descDiv);
        }

        // Add click handler to show split screen with ticket details
        ticketElement.style.cursor = 'pointer';
        ticketElement.style.border = '2px solid transparent';
        ticketElement.style.borderRadius = '8px';
        ticketElement.style.transition = 'border-color 0.2s';
        ticketElement.title = 'Click to view detailed ticket information';

        // Add hover effect
        ticketElement.addEventListener('mouseenter', this.ticketHoverHandler);
        ticketElement.addEventListener('mouseleave', this.ticketLeaveHandler);
        ticketElement.addEventListener('click', this.ticketClickHandler);
      } else {
        setTextContent(ticketElement, state.currentTicket);
        // Remove cursor pointer and click handler for non-Jira tickets
        ticketElement.style.cursor = 'default';
        ticketElement.title = '';
        // Clean up event listeners for non-Jira tickets
        ticketElement.removeEventListener('mouseenter', this.ticketHoverHandler);
        ticketElement.removeEventListener('mouseleave', this.ticketLeaveHandler);
        ticketElement.removeEventListener('click', this.ticketClickHandler);
      }

      showElement('current-ticket');
    } else {
      hideElement('current-ticket');
      // Hide split screen when no ticket is selected
      this.hideSplitScreen();
    }
  }

  private updateDiscussionTimer(discussionDuration: number): void {
    const timerElement = document.getElementById('discussion-timer');
    const durationElement = document.getElementById('discussion-duration');

    if (timerElement && durationElement) {
      // Convert seconds to minutes:seconds format
      const minutes = Math.floor(discussionDuration / 60);
      const seconds = discussionDuration % 60;
      const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      durationElement.textContent = timeString;

      // Show timer if there's a current ticket
      const state = gameState.getState();
      if (state.currentTicket) {
        showElement('discussion-timer');
      } else {
        hideElement('discussion-timer');
      }
    }
  }

  private displayTicketDetails(issueDetails: any): void {
    const panel = document.getElementById('ticket-details-panel');
    const content = document.getElementById('ticket-details-data');
    const loading = document.getElementById('ticket-details-loading');
    const error = document.getElementById('ticket-details-error');
    const title = document.getElementById('ticket-details-title');

    if (!panel || !content || !loading || !error || !title) return;

    // Hide loading and error states
    hideElement('ticket-details-loading');
    hideElement('ticket-details-error');

    // Update title and show panel
    title.textContent = `${issueDetails.key}: ${issueDetails.summary}`;

    // Build the ticket details HTML
    content.innerHTML = `
      <div class="ticket-meta-grid">
        <div class="ticket-field">
          <div class="ticket-field-label">📋 Issue Type</div>
          <div class="ticket-field-value">${issueDetails.issueType || 'Unknown'}</div>
        </div>
        <div class="ticket-field">
          <div class="ticket-field-label">⚡ Priority</div>
          <div class="ticket-field-value">${issueDetails.priority || 'None'}</div>
        </div>
        <div class="ticket-field">
          <div class="ticket-field-label">📊 Status</div>
          <div class="ticket-field-value">${issueDetails.status || 'Unknown'}</div>
        </div>
        <div class="ticket-field">
          <div class="ticket-field-label">👤 Assignee</div>
          <div class="ticket-field-value">${issueDetails.assignee || 'Unassigned'}</div>
        </div>
      </div>

      ${
        issueDetails.storyPoints
          ? `
        <div class="ticket-field">
          <div class="ticket-field-label">🎯 Story Points</div>
          <div class="ticket-field-value">${issueDetails.storyPoints}</div>
        </div>
      `
          : ''
      }

      ${
        issueDetails.labels?.length
          ? `
        <div class="ticket-field">
          <div class="ticket-field-label">🏷️ Labels</div>
          <div class="ticket-tags">
            ${issueDetails.labels.map((label: string) => `<span class="ticket-tag">${label}</span>`).join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        issueDetails.description
          ? `
        <div class="ticket-field">
          <div class="ticket-field-label">📝 Description</div>
          <div class="ticket-description">${issueDetails.description}</div>
        </div>
      `
          : ''
      }

      ${
        issueDetails.comments?.length
          ? `
        <div class="ticket-field">
          <div class="ticket-field-label">💬 Recent Comments</div>
          <div class="ticket-comments">
            ${issueDetails.comments
              .slice(0, 5)
              .map(
                (comment: any) => `
              <div class="ticket-comment">
                <div class="ticket-comment-author">${comment.author || 'Unknown'} - ${comment.created ? new Date(comment.created).toLocaleDateString() : 'Unknown date'}</div>
                <div class="ticket-comment-body">${comment.body || 'No content'}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <div class="ticket-action-bar-bottom">
        <a href="${issueDetails.url || '#'}" target="_blank" rel="noopener noreferrer" class="ticket-external-link">
          🔗 Open in Jira
        </a>
      </div>
    `;

    // Ensure loading is hidden and content is shown
    hideElement('ticket-details-loading');
    showElement('ticket-details-data');
    this.showSplitScreen();
  }

  private showTicketDetailsError(message: string): void {
    const loading = document.getElementById('ticket-details-loading');
    const error = document.getElementById('ticket-details-error');
    const data = document.getElementById('ticket-details-data');

    if (!loading || !error || !data) return;

    hideElement('ticket-details-loading');
    hideElement('ticket-details-data');

    const errorContent = error.querySelector('p');
    if (errorContent) {
      errorContent.textContent = message;
    }

    showElement('ticket-details-error');
    this.showSplitScreen();
  }

  private showSplitScreen(): void {
    const container = document.getElementById('split-screen-container');
    const panel = document.getElementById('ticket-details-panel');

    if (!container || !panel) return;

    container.classList.add('split-active');
    showElement('ticket-details-panel');
  }

  private hideSplitScreen(): void {
    const container = document.getElementById('split-screen-container');
    const panel = document.getElementById('ticket-details-panel');

    if (!container || !panel) return;

    container.classList.remove('split-active');
    hideElement('ticket-details-panel');
  }

  private handleJiraTicketChange(jiraIssue: any): void {
    const panel = document.getElementById('ticket-details-panel');
    if (!panel || panel.classList.contains('hidden')) {
      // Split-screen is not currently showing, don't auto-open it
      return;
    }

    // Split-screen is showing, update it with the new ticket details
    console.log('🔄 TICKET CHANGE: Updating split-screen for new Jira issue:', jiraIssue.key);
    this.requestTicketDetails(jiraIssue.key);
  }

  private requestTicketDetails(issueKey: string): void {
    const state = gameState.getState();
    if (!state.roomCode) return;

    const loading = document.getElementById('ticket-details-loading');
    const error = document.getElementById('ticket-details-error');
    const data = document.getElementById('ticket-details-data');
    const title = document.getElementById('ticket-details-title');

    if (!loading || !error || !data || !title) return;

    // Clear previous content immediately to prevent flickering
    title.textContent = 'Loading Ticket Details...';
    data.innerHTML = '';

    // Show loading state
    hideElement('ticket-details-error');
    hideElement('ticket-details-data');
    showElement('ticket-details-loading');

    this.showSplitScreen();

    socketManager.getJiraIssueDetails(state.roomCode, issueKey);

    // Add timeout to show error if no response within 10 seconds
    setTimeout(() => {
      const currentLoading = document.getElementById('ticket-details-loading');
      if (currentLoading && !currentLoading.classList.contains('hidden')) {
        this.showTicketDetailsError('Request timed out - please try again');
      }
    }, 10000);
  }

  private updateParticipantsList(): void {
    const list = document.getElementById('participants-list');
    const count = document.getElementById('participant-count');
    const state = gameState.getState();

    if (!list || !count) return;

    // Batch DOM updates for better performance
    mutateDOM(() => {
      count.textContent = String(state.participants.length);

      // Use incremental list rendering for better performance
      updateListIncrementally(
        list,
        state.participants,
        participant => participant.name,
        participant => {
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

          const moderationButton =
            state.isFacilitator && !participant.isFacilitator
              ? `<button class="btn btn-outline" style="border: 0px; padding: 4px 8px; font-size: 12px; margin-left: 10px;" onclick="app.openModerationModal('${participant.name}')">⚙️</button>`
              : '';

          div.innerHTML = `
            <span class="participant-name">
              ${participant.name} ${participant.isFacilitator ? '👑' : ''}
            </span>
            <div style="display: flex; align-items: center;">
              ${statusHtml}
              ${moderationButton}
            </div>
          `;

          return div;
        },
        // Equality function to determine if participant has changed
        (a, b) =>
          a.name === b.name &&
          a.hasVoted === b.hasVoted &&
          a.isViewer === b.isViewer &&
          a.isFacilitator === b.isFacilitator &&
          a.vote === b.vote
      );
    });
  }

  private updateFacilitatorControls(): void {
    const state = gameState.getState();
    if (!state.isFacilitator) return;

    const hasVotes = state.participants.some(p => p.hasVoted && !p.isViewer);

    // Batch button updates
    mutateDOM(() => {
      const revealBtn = document.getElementById('reveal-btn') as HTMLButtonElement;
      const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
      const countdownBtn = document.getElementById('countdown-btn') as HTMLButtonElement;

      if (revealBtn)
        revealBtn.disabled = !hasVotes || state.votingRevealed || state.countdownActive;
      if (resetBtn) resetBtn.disabled = !state.currentTicket;
      if (countdownBtn)
        countdownBtn.disabled =
          !state.currentTicket || state.votingRevealed || state.countdownActive;
    });
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
        const barWidth = (count / results.totalVotes) * 100;
        breakdown.innerHTML += `
          <div style="
            margin: 5px 0;
            padding: 8px;
            background: linear-gradient(to right, #dcfce7 ${barWidth}%, white ${barWidth}%);
            border-radius: 4px;
            border: 1px solid #e5e7eb;
            position: relative;
          ">
            <strong>${vote}</strong>: ${count} vote${count > 1 ? 's' : ''} (${percentage}%)
          </div>
        `;
      });
    }

    const state = gameState.getState();
    const finalizeSection = document.getElementById('finalize-estimation');
    if (finalizeSection && state.isFacilitator && state.currentJiraIssue && state.jiraConfig) {
      showElement('finalize-estimation');
      const suggestedValue = !isNaN(Number(results.consensus))
        ? Number(results.consensus)
        : results.average;
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
    this.openEndSessionModal();
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

  // End session modal methods
  private openEndSessionModal(): void {
    const modal = document.getElementById('end-session-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }

    // Update download button visibility based on available data
    this.updateEndSessionDownloadButtons();
  }

  private updateEndSessionDownloadButtons(): void {
    const state = gameState.getState();
    const hasHistory = state.history && state.history.length > 0;
    const hasStats = state.aggregate && state.aggregate.totalRounds > 0;

    const historyBtn = document.getElementById('download-history-btn') as HTMLButtonElement;
    const statsBtn = document.getElementById('download-statistics-btn') as HTMLButtonElement;
    const downloadsSection = document.getElementById('end-session-downloads');

    if (historyBtn) {
      historyBtn.disabled = !hasHistory;
      historyBtn.style.opacity = hasHistory ? '1' : '0.5';
    }

    if (statsBtn) {
      statsBtn.disabled = !hasStats;
      statsBtn.style.opacity = hasStats ? '1' : '0.5';
    }

    // Hide entire downloads section if no data available
    if (downloadsSection) {
      if (!hasHistory && !hasStats) {
        downloadsSection.style.display = 'none';
      } else {
        downloadsSection.style.display = 'block';
      }
    }
  }

  private closeEndSessionModal(): void {
    const modal = document.getElementById('end-session-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  private confirmEndSession(): void {
    clearActiveSession();
    const state = gameState.getState();
    socketManager.endSession(state.roomCode);
    this.closeEndSessionModal();
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
      div.className = 'history-item';

      const ticketText = entry.issueKey
        ? `${entry.issueKey}: ${entry.summary || ''}`
        : entry.ticket;
      const consensus = entry.stats ? entry.stats.consensus : entry.storyPoints || '-';
      const average = entry.stats ? entry.stats.average.toFixed(1) : '-';
      const range = entry.stats ? `${entry.stats.min}‒${entry.stats.max}` : '-';
      const timeStr = entry.timestamp
        ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      const discussionDurationStr = entry.discussionDuration
        ? `${Math.floor(entry.discussionDuration / 60)}:${(entry.discussionDuration % 60).toString().padStart(2, '0')}`
        : '';

      div.innerHTML = `
        <div class="history-item-title">${ticketText}</div>
        <div class="history-item-meta">
          <div class="history-item-stat">
            <span class="history-item-stat-label">Consensus:</span>
            <span>${consensus}</span>
          </div>
          <div class="history-item-stat">
            <span class="history-item-stat-label">Avg:</span>
            <span>${average}</span>
          </div>
          <div class="history-item-stat">
            <span class="history-item-stat-label">Range:</span>
            <span>${range}</span>
          </div>
          ${
            discussionDurationStr
              ? `<div class="history-item-stat">
            <span class="history-item-stat-label">Discussion:</span>
            <span>${discussionDurationStr}</span>
          </div>`
              : ''
          }
          ${
            timeStr
              ? `<div class="history-item-stat">
            <span class="history-item-stat-label">Time:</span>
            <span>${timeStr}</span>
          </div>`
              : ''
          }
        </div>
      `;
      historyList.appendChild(div);
    });

    this.updateStatsUI();
    this.updateHistoryTabsVisibility();
  }

  private updateStatsUI(): void {
    const section = document.getElementById('stats-section');
    const teamDiv = document.getElementById('team-stats');
    const userDiv = document.getElementById('user-stats');
    const state = gameState.getState();

    if (!section || !teamDiv || !userDiv || !state.aggregate) {
      if (section) hideElement('stats-section');
      this.updateExportStatsButtonState(false);
      return;
    }

    const agg = state.aggregate;
    if (agg.totalRounds === 0) {
      hideElement('stats-section');
      this.updateExportStatsButtonState(false);
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

    teamDiv.innerHTML = `
      <div class="stats-summary">
        <div class="flex flex-wrap gap-4">
          <div class="stats-summary-item">
            <span class="stats-summary-label">Total Rounds:</span>
            <span class="stats-summary-value">${agg.totalRounds}</span>
          </div>
          <div class="stats-summary-item">
            <span class="stats-summary-label">Consensus Achieved:</span>
            <span class="stats-summary-value">${agg.consensusRounds} (${consensusPct}%)</span>
          </div>
          <div class="stats-summary-item">
            <span class="stats-summary-label">Total Story Points:</span>
            <span class="stats-summary-value">${totalSP}</span>
          </div>
        </div>
      </div>
    `;

    userDiv.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'stats-table';

    const headerRow = document.createElement('tr');
    ['Member', 'Avg', 'High', 'Low', 'Votes'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    Object.entries(agg.perUser).forEach(([name, data]) => {
      const tr = document.createElement('tr');
      const avg = data.count ? (data.sum / data.count).toFixed(1) : '-';
      const cells = [
        { value: name, isName: true },
        { value: avg, isName: false },
        { value: data.highCount, isName: false },
        { value: data.lowCount, isName: false },
        { value: data.count, isName: false },
      ];

      cells.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = String(cell.value);
        if (cell.isName) {
          td.className = 'name-cell';
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    userDiv.appendChild(table);

    // Enable export stats button since we have stats to export
    this.updateExportStatsButtonState(true);
  }

  private updateExportStatsButtonState(hasStats: boolean): void {
    const exportBtn = document.getElementById('export-stats-btn') as HTMLButtonElement;
    if (exportBtn) {
      exportBtn.disabled = !hasStats;
      exportBtn.style.opacity = hasStats ? '1' : '0.5';
      exportBtn.title = hasStats
        ? 'Export session statistics as CSV'
        : 'No statistics available to export';
    }
  }

  private exportHistory(): void {
    const state = gameState.getState();

    if (!state.history || state.history.length === 0) {
      showNotification('No history to export', 'error');
      return;
    }

    const header = [
      'Ticket',
      'Consensus',
      'Average',
      'Min',
      'Max',
      'Discussion Duration',
      'Timestamp',
    ];

    const latest = new Map();
    state.history.forEach(entry => {
      const key = entry.issueKey || entry.ticket;
      latest.set(key, entry);
    });

    let totalPoints = 0;
    const rows: (string | number)[][] = [];

    latest.forEach(entry => {
      const ticketText = entry.issueKey
        ? `${entry.issueKey}: ${entry.summary || ''}`
        : entry.ticket;
      const consensus = entry.stats ? entry.stats.consensus : entry.storyPoints || '-';
      const avg = entry.stats ? entry.stats.average : '';
      const min = entry.stats ? entry.stats.min : '';
      const max = entry.stats ? entry.stats.max : '';
      const discussionDuration = entry.discussionDuration
        ? `${Math.floor(entry.discussionDuration / 60)}:${(entry.discussionDuration % 60).toString().padStart(2, '0')}`
        : '';
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

      rows.push([ticketText, consensus, avg, min, max, discussionDuration, timeStr]);
    });

    rows.push([]);
    rows.push(['Total Story Points', totalPoints]);

    if (state.aggregate) {
      const a = state.aggregate;
      const pct = ((a.consensusRounds / a.totalRounds) * 100).toFixed(0);
      rows.push(['Total Rounds', a.totalRounds]);
      rows.push(['Consensus Rounds', a.consensusRounds, pct + '%']);
    }

    const csvArray = [header, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

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

  private exportStatistics(): void {
    const state = gameState.getState();

    if (!state.aggregate || state.aggregate.totalRounds === 0) {
      showNotification('No statistics to export', 'error');
      return;
    }

    const agg = state.aggregate;
    const consensusPct = ((agg.consensusRounds / agg.totalRounds) * 100).toFixed(1);

    // Calculate total story points
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
          const closestFib = roundToNearestFibonacci(h.stats.average);
          if (closestFib !== null) {
            totalSP += closestFib;
          }
        }
      });
    }

    // Prepare CSV data
    const header = ['Metric', 'Value'];
    const summaryRows: (string | number)[][] = [
      ['Total Rounds', agg.totalRounds],
      ['Consensus Rounds', agg.consensusRounds],
      ['Consensus Percentage', consensusPct + '%'],
      ['Total Story Points', totalSP],
      [''],
    ];

    // User statistics header
    const userHeader = ['Member', 'Average Vote', 'High Votes', 'Low Votes', 'Total Votes'];
    const userRows: (string | number)[][] = [];

    Object.entries(agg.perUser).forEach(([name, data]) => {
      const avg = data.count ? (data.sum / data.count).toFixed(1) : '-';
      userRows.push([name, avg, data.highCount, data.lowCount, data.count]);
    });

    // Combine all data
    const csvArray = [
      ['SESSION STATISTICS'],
      [''],
      header,
      ...summaryRows,
      ['INDIVIDUAL STATISTICS'],
      [''],
      userHeader,
      ...userRows,
    ]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvArray], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.sessionName || 'session'}_statistics.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification('Statistics exported successfully!', 'success');
  }

  private updateChatUI(): void {
    const state = gameState.getState();
    const container = document.getElementById('chat-messages');
    const emptyMessage = document.getElementById('chat-empty');

    if (!container) return;

    // Show chat section when in session
    showElement('chat-section');

    // Clear existing messages except empty message
    const existingMessages = container.querySelectorAll('.chat-message');
    existingMessages.forEach(msg => msg.remove());

    if (state.chatMessages.length === 0) {
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
      return;
    }

    // Hide empty message
    if (emptyMessage) {
      emptyMessage.style.display = 'none';
    }

    // Display all messages
    state.chatMessages.forEach(message => {
      // Render existing messages without affecting unread count
      this.displayChatMessage(message, false);
    });

    // After initial render, update unread indicator based on current message list
    this.recalculateUnreadIndicator();
  }

  // Chat functionality
  private sendChatMessage(): void {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const message = input.value.trim();

    if (!message) return;

    const state = gameState.getState();
    input.value = '';
    this.updateSendButton();

    socketManager.sendChatMessage(state.roomCode, message);
  }

  private handleTyping(): void {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const message = input.value.trim();

    this.updateSendButton();

    const state = gameState.getState();
    const isTyping = message.length > 0;

    // Debounce typing indicator
    clearTimeout(this.typingTimeout);

    if (isTyping) {
      if (!this.isTyping) {
        this.isTyping = true;
        socketManager.sendTypingIndicator(state.roomCode, state.myName, true);
      }

      this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
        socketManager.sendTypingIndicator(state.roomCode, state.myName, false);
      }, 2000);
    } else if (this.isTyping) {
      this.isTyping = false;
      socketManager.sendTypingIndicator(state.roomCode, state.myName, false);
    }
  }

  private updateSendButton(): void {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const button = document.getElementById('send-message-btn') as HTMLButtonElement;

    if (button) {
      button.disabled = !input.value.trim();
    }
  }

  private displayChatMessage(message: ChatMessage, isNew: boolean = true): void {
    const container = document.getElementById('chat-messages');
    const emptyMessage = document.getElementById('chat-empty');

    if (!container) return;

    // Hide empty message
    if (emptyMessage) {
      emptyMessage.style.display = 'none';
    }

    const messageDiv = document.createElement('div');
    const state = gameState.getState();
    const isOwn = message.author === state.myName;
    const isSystem = message.type === 'system';

    messageDiv.className = `chat-message ${isSystem ? 'system' : isOwn ? 'own' : 'other'}`;

    if (isSystem) {
      const contentDiv = createElement('div');
      contentDiv.className = 'chat-message-content text-center';
      contentDiv.appendChild(processChatMessage(message.content));
      messageDiv.appendChild(contentDiv);
    } else {
      const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Create header
      const headerDiv = createElement('div');
      headerDiv.className = 'chat-message-header';

      const authorSpan = createElement('span', message.author, 'chat-message-author');
      const timeSpan = createElement('span', timeStr, 'chat-message-time');

      headerDiv.appendChild(authorSpan);
      headerDiv.appendChild(timeSpan);

      // Create content with link processing
      const contentDiv = createElement('div');
      contentDiv.className = 'chat-message-content';
      contentDiv.appendChild(processChatMessage(message.content));

      messageDiv.appendChild(headerDiv);
      messageDiv.appendChild(contentDiv);
    }

    container.appendChild(messageDiv);

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Play sound for new messages (not from self)
    if (isNew && !isOwn) {
      playSound('chat');
      this.showUnreadIndicator();
    }
  }

  private updateTypingIndicator(typingUsers: string[]): void {
    const indicator = document.getElementById('typing-indicator');
    const text = document.getElementById('typing-text');

    if (!indicator || !text) return;

    const state = gameState.getState();
    const othersTyping = typingUsers.filter(user => user !== state.myName);

    if (othersTyping.length === 0) {
      indicator.classList.add('hidden');
      return;
    }

    indicator.classList.remove('hidden');

    if (othersTyping.length === 1) {
      text.innerHTML = `${othersTyping[0]} is typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    } else if (othersTyping.length === 2) {
      text.innerHTML = `${othersTyping[0]} and ${othersTyping[1]} are typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    } else {
      text.innerHTML = `${othersTyping.length} people are typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    }
  }

  private showUnreadIndicator(): void {
    const indicator = document.getElementById('unread-indicator');
    const count = document.getElementById('unread-count');
    const chatCard = document.querySelector('[data-card="chat"]');

    if (!indicator || !count || !chatCard) return;

    // Only show if chat is collapsed
    if (chatCard.classList.contains('collapsed')) {
      const currentCount = parseInt(count.textContent || '0');
      count.textContent = String(currentCount + 1);
      indicator.classList.remove('hidden');
    }
  }

  private clearUnreadIndicator(): void {
    const indicator = document.getElementById('unread-indicator');
    const count = document.getElementById('unread-count');

    if (indicator && count) {
      indicator.classList.add('hidden');
      count.textContent = '0';
    }
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
   * Update the visibility of tabs and card title based on available content
   */
  private updateHistoryTabsVisibility(): void {
    const state = gameState.getState();
    const hasHistory = state.history && state.history.length > 0;
    const hasIssues = state.jiraIssues && state.jiraIssues.length > 0;

    const tabsContainer = document.getElementById('history-tabs-container');
    const cardTitle = document.getElementById('history-card-title');
    const issuesTab = document.getElementById('history-tab-issues');

    if (!tabsContainer || !cardTitle) return;

    // Determine what content is available
    if (hasHistory && hasIssues) {
      // Both available - show tabs
      showElement('history-tabs-container');
      cardTitle.textContent = 'Issues & History';
      if (issuesTab) issuesTab.classList.remove('hidden');
    } else if (hasIssues) {
      // Only issues - hide tabs, show issues panel
      hideElement('history-tabs-container');
      cardTitle.textContent = 'Issues';
      showElement('jira-issues-section');
      hideElement('history-panel');
    } else if (hasHistory) {
      // Only history - hide tabs, show history panel
      hideElement('history-tabs-container');
      cardTitle.textContent = 'History';
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

    // Don't toggle if drag was intended
    if (card.classList.contains('drag-intent')) return;

    card.classList.toggle('collapsed');

    // Clear unread indicator when chat is opened
    if (cardId === 'chat' && !card.classList.contains('collapsed')) {
      this.clearUnreadIndicator();
    }

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

  // Method to reinitialize drag and drop (useful when cards visibility changes)
  private reinitializeDragAndDrop(): void {
    this.setupDragAndDrop();
  }

  private setupDragEvents(): void {
    // Select all dashboard cards that have the draggable attribute (regardless of its value)
    const cards = document.querySelectorAll('.dashboard-card[draggable]');

    cards.forEach(card => {
      // Initially disable dragging
      (card as HTMLElement).draggable = false;

      // Remove existing listeners to prevent duplicates
      const existingDragStart = (card as any)._dragStartHandler;
      const existingDragEnd = (card as any)._dragEndHandler;
      const existingDragOver = (card as any)._dragOverHandler;
      const existingDrop = (card as any)._dropHandler;

      if (existingDragStart) card.removeEventListener('dragstart', existingDragStart);
      if (existingDragEnd) card.removeEventListener('dragend', existingDragEnd);
      if (existingDragOver) card.removeEventListener('dragover', existingDragOver);
      if (existingDrop) card.removeEventListener('drop', existingDrop);

      // Create new bound handlers
      const dragStartHandler = (e: Event) => this.handleDragStart(e as DragEvent);
      const dragEndHandler = (e: Event) => this.handleDragEnd(e as DragEvent);
      const dragOverHandler = (e: Event) => this.handleDragOver(e as DragEvent);
      const dropHandler = (e: Event) => this.handleDrop(e as DragEvent);

      // Store handlers for later removal
      (card as any)._dragStartHandler = dragStartHandler;
      (card as any)._dragEndHandler = dragEndHandler;
      (card as any)._dragOverHandler = dragOverHandler;
      (card as any)._dropHandler = dropHandler;

      card.addEventListener('dragstart', dragStartHandler);
      card.addEventListener('dragend', dragEndHandler);
      card.addEventListener('dragover', dragOverHandler);
      card.addEventListener('drop', dropHandler);

      // Setup drag handle events
      const dragHandle = card.querySelector('.drag-handle');
      if (dragHandle) {
        const existingMouseDown = (dragHandle as any)._mouseDownHandler;
        const existingMouseUp = (dragHandle as any)._mouseUpHandler;
        const existingMouseLeave = (dragHandle as any)._mouseLeaveHandler;
        if (existingMouseDown) dragHandle.removeEventListener('mousedown', existingMouseDown);
        if (existingMouseUp) dragHandle.removeEventListener('mouseup', existingMouseUp);
        if (existingMouseLeave) dragHandle.removeEventListener('mouseleave', existingMouseLeave);

        const mouseDownHandler = (_e: Event) => {
          // Enable dragging only when drag handle is pressed
          (card as HTMLElement).draggable = true;
          card.classList.add('drag-intent');
        };

        const mouseUpHandler = () => {
          // Don't immediately disable dragging on mouseup
          // Let the drag operation complete naturally via dragend event
          // Only disable if no drag actually started after a delay
          setTimeout(() => {
            if (!this.isDragging && !card.classList.contains('dragging')) {
              (card as HTMLElement).draggable = false;
              card.classList.remove('drag-intent');
            }
          }, 50);
        };

        const mouseLeaveHandler = () => {
          // Don't disable dragging on mouse leave - this was causing the main issue
          // Let the drag operation complete naturally or be handled by mouseup
        };

        (dragHandle as any)._mouseDownHandler = mouseDownHandler;
        (dragHandle as any)._mouseUpHandler = mouseUpHandler;
        (dragHandle as any)._mouseLeaveHandler = mouseLeaveHandler;
        dragHandle.addEventListener('mousedown', mouseDownHandler);
        dragHandle.addEventListener('mouseup', mouseUpHandler);
        dragHandle.addEventListener('mouseleave', mouseLeaveHandler);
      }
    });
  }

  private setupDropZones(): void {
    const columns = document.querySelectorAll('[data-column]');
    const dropZones = document.querySelectorAll('.column-drop-zone');

    [...columns, ...dropZones].forEach(zone => {
      zone.addEventListener('dragover', e => this.handleColumnDragOver(e as DragEvent));
      zone.addEventListener('drop', e => this.handleColumnDrop(e as DragEvent));
      zone.addEventListener('dragleave', e => this.handleColumnDragLeave(e as DragEvent));
    });
  }

  private draggedElement: HTMLElement | null = null;
  private isDragging = false;
  private typingTimeout?: ReturnType<typeof setTimeout>;
  private isTyping = false;

  private handleDragStart(e: DragEvent): void {
    const target = e.target as HTMLElement;
    this.draggedElement = target.closest('.dashboard-card') as HTMLElement;

    if (!this.draggedElement) {
      return;
    }

    // Ensure the element is actually draggable before proceeding
    if (!(this.draggedElement as HTMLElement).draggable) {
      e.preventDefault();
      return;
    }

    this.isDragging = true;

    this.draggedElement.classList.add('dragging');

    // Show all drop zones during dragging
    document.querySelectorAll('.column-drop-zone').forEach(zone => {
      zone.classList.add('drag-active');
    });

    // Some browsers require a dataTransfer payload and explicit effectAllowed to keep the drag session alive
    try {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', this.draggedElement?.dataset.card || '');
        e.dataTransfer.effectAllowed = 'move';
      }
    } catch {
      // Ignore potential security errors when setting dataTransfer during automated tests
    }
  }

  private handleDragEnd(_e: DragEvent): void {
    // Clean up visual indicators immediately
    document.querySelectorAll('.dragging').forEach(el => {
      el.classList.remove('dragging');
      el.classList.remove('drag-intent');
    });

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    document
      .querySelectorAll('.drop-indicator.active')
      .forEach(el => el.classList.remove('active'));

    // Hide all drop zones after dragging
    document.querySelectorAll('.column-drop-zone').forEach(zone => {
      zone.classList.remove('drag-active');
    });

    // Reset drag state
    this.draggedElement = null;
    this.isDragging = false;

    // Clean up draggable property with delay to avoid interference
    setTimeout(() => {
      document.querySelectorAll('.dashboard-card[draggable="true"]').forEach(card => {
        if (!card.classList.contains('drag-intent')) {
          (card as HTMLElement).draggable = false;
        }
      });
    }, 100);
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();

    // Clear previous drag-over indicators
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    const target = e.target as HTMLElement;
    const card = target.closest('.dashboard-card') as HTMLElement;

    if (card && card !== this.draggedElement) {
      // Determine which half of the card we're over for visual feedback
      const rect = card.getBoundingClientRect();
      const mouseY = e.clientY;
      const cardMiddle = rect.top + rect.height / 2;

      if (mouseY < cardMiddle) {
        // Mouse is in top half - will insert before
        card.classList.add('drag-over-top');
      } else {
        // Mouse is in bottom half - will insert after
        card.classList.add('drag-over-bottom');
      }
    }
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();

    const target = e.target as HTMLElement;
    const targetCard = target.closest('.dashboard-card') as HTMLElement;

    // If we're dropping on a card, always stop propagation to prevent column handler from firing
    if (targetCard && this.draggedElement) {
      e.stopPropagation();

      // Only proceed if it's a different card
      if (targetCard !== this.draggedElement) {
        const targetParent = targetCard.parentElement;

        if (targetParent) {
          // Determine if we should insert before or after based on mouse position
          const rect = targetCard.getBoundingClientRect();
          const mouseY = e.clientY;
          const cardMiddle = rect.top + rect.height / 2;

          if (mouseY < cardMiddle) {
            // Mouse is in top half - insert before
            targetParent.insertBefore(this.draggedElement, targetCard);
          } else {
            // Mouse is in bottom half - insert after
            const nextSibling = targetCard.nextElementSibling;
            if (nextSibling) {
              targetParent.insertBefore(this.draggedElement, nextSibling);
            } else {
              targetParent.appendChild(this.draggedElement);
            }
          }
          this.saveCardLayout();
        }
      }
    }

    // Clean up drag over indicators
    if (targetCard) {
      targetCard.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    }
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
          // Check if we're dropping between cards by finding the best insertion point
          const cards = Array.from(columnElement.querySelectorAll('.dashboard-card')).filter(
            card => card !== this.draggedElement
          );
          let insertionPoint = null;

          if (cards.length > 0) {
            // Find the best insertion point based on mouse position
            const mouseY = e.clientY;
            let bestCard = null;
            let bestDistance = Infinity;

            for (const card of cards) {
              const rect = card.getBoundingClientRect();
              const cardCenter = rect.top + rect.height / 2;
              const distance = Math.abs(mouseY - cardCenter);

              if (distance < bestDistance) {
                bestDistance = distance;
                bestCard = card;
              }
            }

            if (bestCard) {
              const rect = bestCard.getBoundingClientRect();
              const cardCenter = rect.top + rect.height / 2;

              if (mouseY < cardCenter) {
                // Insert before the closest card
                insertionPoint = bestCard;
              } else {
                // Insert after the closest card
                insertionPoint = bestCard.nextElementSibling;
              }
            }
          }

          // Insert at the determined position
          if (insertionPoint) {
            columnElement.insertBefore(this.draggedElement, insertionPoint);
          } else {
            // Append to the column (before the drop zone)
            const dropZoneInColumn = columnElement.querySelector('.column-drop-zone');
            if (dropZoneInColumn) {
              columnElement.insertBefore(this.draggedElement, dropZoneInColumn);
            } else {
              columnElement.appendChild(this.draggedElement);
            }
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

  private saveCardLayout(): void {
    const layout = {
      sidebar: this.getColumnCardOrder('sidebar'),
      main: this.getColumnCardOrder('main'),
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
    if (!savedLayout) {
      // If no saved layout exists, normalize the DOM structure by moving cards to their proper positions
      // This ensures consistent DOM structure whether or not localStorage exists
      this.normalizeCardLayout();
      return;
    }

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
      // Fallback to normalization if parsing fails
      this.normalizeCardLayout();
    }
  }

  private normalizeCardLayout(): void {
    // Move all cards to their proper DOM positions relative to drop zones
    // This ensures consistent structure whether localStorage exists or not

    // Get current card order for each column
    const currentLayout = {
      sidebar: this.getColumnCardOrder('sidebar'),
      main: this.getColumnCardOrder('main'),
    };

    // Re-position cards using the current order
    if (currentLayout.sidebar.length > 0) {
      this.restoreColumnOrder('sidebar', currentLayout.sidebar);
    }
    if (currentLayout.main.length > 0) {
      this.restoreColumnOrder('main', currentLayout.main);
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

  /**
   * Calculate and set the unread message indicator based on the current chat history.
   * Runs mainly after the initial chat history render so pre-existing messages are
   * counted exactly once. Further increments are handled in real-time by
   * showUnreadIndicator().
   */
  private recalculateUnreadIndicator(): void {
    const indicator = document.getElementById('unread-indicator');
    const countEl = document.getElementById('unread-count');
    const chatCard = document.querySelector('[data-card="chat"]');

    if (!indicator || !countEl || !chatCard) return;

    // Only show indicator when the chat panel is collapsed (i.e., not visible)
    if (!chatCard.classList.contains('collapsed')) {
      return;
    }

    // If the indicator is already showing a non-zero count, keep it as is to
    // avoid overriding counts gathered in real-time.
    if (parseInt(countEl.textContent || '0', 10) > 0) {
      return;
    }

    const state = gameState.getState();

    // Count messages not authored by the current user. System messages (type
    // "system") have no author matching any user, so they are included.
    const unreadCount = state.chatMessages.filter(m => m.author !== state.myName).length;

    if (unreadCount > 0) {
      countEl.textContent = String(unreadCount);
      indicator.classList.remove('hidden');
    }
  }

  /**
   * Clean up all event listeners and resources
   */
  cleanup(): void {
    // Clean up tracked event listeners
    this.eventListenerIds.forEach(id => eventManager.removeEventListener(id));
    this.eventListenerIds = [];

    // Clean up all other tracked listeners
    console.log(`Cleaning up ${eventManager.getListenerCount()} event listeners`);
    eventManager.removeAllEventListeners();
  }
}

// Helper function to round to nearest Fibonacci number
function roundToNearestFibonacci(value: number): number | null {
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

// Ensure cleanup on page unload
window.addEventListener('beforeunload', () => {
  app.cleanup();
});
