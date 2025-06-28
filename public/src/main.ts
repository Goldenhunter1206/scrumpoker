// @ts-nocheck

        // Application state
        let socket;
        let countdownInterval = null;
        let gameState = {
            roomCode: '',
            sessionName: '',
            currentTicket: '',
            currentJiraIssue: null,
            jiraConfig: null,
            jiraIssues: [],
            selectedIssue: null,
            participants: [],
            isFacilitator: false,
            isViewer: false,
            myName: '',
            votingRevealed: false,
            myVote: null,
            moderationTarget: null,
            countdownActive: false,
            countdownSeconds: 0,
            history: [],
            aggregate: null
        };

        // Initialize socket connection
        function initSocket() {
            socket = io();
            
            socket.on('connect', () => {
                updateConnectionStatus(true);
            });

            socket.on('disconnect', () => {
                updateConnectionStatus(false);
            });

            // Session creation
            socket.on('session-created', (data) => {
                if (data.success) {
                    gameState.roomCode = data.roomCode;
                    gameState.isFacilitator = true;
                    updateSessionUI(data.sessionData);
                    showNotification('Session created successfully!', 'success');

                    // Persist for auto-rejoin
                    saveActiveSession();
                } else {
                    showNotification('Failed to create session', 'error');
                }
            });

            // Session joining
            socket.on('join-success', (data) => {
                gameState.roomCode = data.roomCode;
                // Determine role from participant record
                const myParticipant = data.sessionData.participants.find(p => p.name === gameState.myName);
                gameState.isFacilitator = !!(myParticipant && myParticipant.isFacilitator);
                gameState.isViewer = myParticipant ? myParticipant.isViewer : false;
                
                // Restore previously set vote (if any)
                if (typeof data.yourVote !== 'undefined' && data.yourVote !== null) {
                    gameState.myVote = data.yourVote;
                }
                
                updateSessionUI(data.sessionData);
                showNotification('Joined session successfully!', 'success');

                // Persist for auto-rejoin
                saveActiveSession();

                // Highlight card if we already voted
                if (gameState.myVote !== null) {
                    updateCardSelection(gameState.myVote);
                }
            });

            socket.on('join-failed', (data) => {
                showNotification(data.message, 'error');
                enableButtons();
                clearActiveSession();
            });

            // Real-time updates
            socket.on('participant-joined', (data) => {
                updateSessionUI(data.sessionData);
                showNotification(`${data.participantName} joined the session`, 'success');
            });

            socket.on('participant-left', (data) => {
                updateSessionUI(data.sessionData);
                showNotification(`${data.participantName} left the session`, 'error');
            });

            socket.on('participant-removed', (data) => {
                updateSessionUI(data.sessionData);
                showNotification(`${data.participantName} was removed from the session`, 'error');
            });

            socket.on('participant-role-changed', (data) => {
                updateSessionUI(data.sessionData);
                showNotification(`${data.participantName} is now a ${data.newRole}`, 'success');
                
                // If current user's role changed, update local state
                if (data.participantName === gameState.myName) {
                    gameState.isViewer = data.newRole === 'viewer';
                    updateVotingCards();
                    updateToggleViewerButton();
                }
            });

            socket.on('removed-from-session', (data) => {
                showNotification(data.message, 'error');
                clearActiveSession();
                setTimeout(() => {
                    location.reload();
                }, 3000);
            });

            // Jira integration events
            socket.on('jira-config-success', (data) => {
                gameState.jiraConfig = data.sessionData.jiraConfig;
                updateJiraUI();
                populateJiraBoards(data.boards);
                showNotification('Successfully connected to Jira!', 'success');
            });

            socket.on('jira-config-failed', (data) => {
                showNotification(data.message, 'error');
                enableButtons();
                const connectBtn = document.getElementById('connect-jira-btn');
                if (connectBtn) connectBtn.disabled = false; // allow another attempt
            });

            socket.on('jira-issues-loaded', (data) => {
                gameState.jiraIssues = data.issues;
                displayJiraIssues();
                showNotification(`Loaded ${data.issues.length} issues from Jira`, 'success');
            });

            socket.on('jira-issues-failed', (data) => {
                showNotification(data.message, 'error');
            });

            socket.on('jira-issue-set', (data) => {
                gameState.currentJiraIssue = data.issue;
                gameState.currentTicket = `${data.issue.key}: ${data.issue.summary}`;
                gameState.votingRevealed = false;
                gameState.myVote = null;
                updateSessionUI(data.sessionData);
                updateTicketDisplay();
                resetVotingUI();
                showNotification(`Set Jira issue: ${data.issue.key}`, 'success');
                playSound('ticket');
            });

            socket.on('jira-updated', (data) => {
                showNotification(`Updated ${data.issueKey} with ${data.storyPoints} story points`, 'success');
                
                // Update current issue if it's the one that was updated
                if (gameState.currentJiraIssue && gameState.currentJiraIssue.key === data.issueKey) {
                    gameState.currentJiraIssue.currentStoryPoints = data.storyPoints;
                }
                
                // Update the issue in the issues list
                const issueIndex = gameState.jiraIssues.findIndex(issue => issue.key === data.issueKey);
                if (issueIndex !== -1) {
                    gameState.jiraIssues[issueIndex].currentStoryPoints = data.storyPoints;
                }
                
                // Clear current ticket and reset voting after successful update
                gameState.currentTicket = '';
                gameState.currentJiraIssue = null;
                gameState.votingRevealed = false;
                gameState.myVote = null;
                
                // Update UI
                updateSessionUI(data.sessionData);
                updateTicketDisplay();
                resetVotingUI();
                
                // Refresh the Jira issues display to show updated story points
                displayJiraIssues();
                
                // Re-enable finalize button
                document.getElementById('finalize-btn').disabled = false;
            });

            socket.on('jira-update-failed', (data) => {
                showNotification(data.message, 'error');
                document.getElementById('finalize-btn').disabled = false;
            });

            socket.on('ticket-set', (data) => {
                gameState.currentTicket = data.ticket;
                gameState.votingRevealed = false;
                gameState.myVote = null;
                updateSessionUI(data.sessionData);
                updateTicketDisplay();
                resetVotingUI();
                showNotification('New ticket set for estimation', 'success');
                playSound('ticket');
            });

            socket.on('vote-submitted', (data) => {
                updateSessionUI(data.sessionData);
                updateFacilitatorControls();
                
                // Keep the facilitator's vote selection visible
                if (data.participantName === gameState.myName && gameState.myVote !== null) {
                    updateCardSelection(gameState.myVote);
                }
            });

            socket.on('votes-revealed', (data) => {
                updateSessionUI(data.sessionData);
                showResults(data.results);
                updateVotingCards(); // Disable cards after reveal
                showNotification('Votes revealed!', 'success');

                // Play reveal sound
                playSound('reveal');
            });

            socket.on('voting-reset', (data) => {
                gameState.votingRevealed = false;
                gameState.myVote = null;
                updateSessionUI(data.sessionData);
                resetVotingUI();
                showNotification('New voting round started', 'success');
            });

            socket.on('session-ended', (data) => {
                showNotification(data.message, 'error');
                clearActiveSession();
                setTimeout(() => {
                    location.reload();
                }, 3000);
            });

            // Countdown events
            socket.on('countdown-started', (data) => {
                gameState.countdownActive = true;
                gameState.countdownSeconds = data.duration;
                displayCountdown(data.duration, data.duration);
                updateCountdownUI();
                showNotification(`${data.duration} second countdown started!`, 'success');

                // Play countdown start sound
                playSound('countdown');
            });

            socket.on('countdown-tick', (data) => {
                gameState.countdownSeconds = data.secondsLeft;
                displayCountdown(data.secondsLeft, data.totalDuration);
            });

            socket.on('countdown-finished', (data) => {
                gameState.countdownActive = false;
                hideCountdown();
                updateCountdownUI();
                showNotification('Time\'s up! Votes revealed automatically.', 'success');
            });

            socket.on('error', (data) => {
                showNotification(data.message, 'error');
                enableButtons();
                const connectBtn = document.getElementById('connect-jira-btn');
                if (connectBtn) connectBtn.disabled = false; // in case the generic error was during Jira connect
            });

            // Auto-rejoin when socket (re)connects
            socket.on('connect', () => {
                updateConnectionStatus(true);
                const saved = loadActiveSessionInfo();
                if (saved && !gameState.roomCode) {
                    gameState.myName = saved.name;
                    gameState.isViewer = saved.isViewer;
                    socket.emit('join-session', {
                        roomCode: saved.roomCode,
                        participantName: saved.name,
                        asViewer: saved.isViewer
                    });
                }
            });
        }

        // UI Helper Functions
        function updateConnectionStatus(connected) {
            const status = document.getElementById('connection-status');
            if (connected) {
                status.textContent = '🟢 Connected';
                status.className = 'connection-status connected';
            } else {
                status.textContent = '🔴 Disconnected';
                status.className = 'connection-status disconnected';
            }
        }

        function showNotification(message, type = 'success') {
            // Remove existing notifications
            const existing = document.querySelector('.notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.remove();
            }, 4000);
        }

        function disableButtons() {
            document.getElementById('start-btn').disabled = true;
            document.getElementById('join-btn').disabled = true;
        }

        function enableButtons() {
            document.getElementById('start-btn').disabled = false;
            document.getElementById('join-btn').disabled = false;
        }

        // NEW: Remember user name in localStorage
        function saveUserName(name) {
            try {
                localStorage.setItem('userName', name);
            } catch (e) {
                console.error('Failed to save user name', e);
            }
        }

        function loadUserName() {
            try {
                return localStorage.getItem('userName') || '';
            } catch (e) {
                return '';
            }
        }

        // Session Management
        function startSession() {
            const facilitatorName = document.getElementById('facilitator-name').value.trim();
            const sessionName = document.getElementById('session-name').value.trim();
            
            if (!facilitatorName || !sessionName) {
                showNotification('Please enter both your name and session name', 'error');
                return;
            }

            // NEW: persist name
            saveUserName(facilitatorName);

            disableButtons();
            gameState.myName = facilitatorName;
            socket.emit('create-session', { sessionName, facilitatorName });
        }

        function joinSession() {
            const participantName = document.getElementById('join-name').value.trim();
            const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
            const joinRole = document.getElementById('join-role').value;
            
            if (!participantName || !roomCode) {
                showNotification('Please enter both your name and room code', 'error');
                return;
            }

            if (roomCode.length !== 6) {
                showNotification('Room code must be 6 characters', 'error');
                return;
            }

            // NEW: persist name
            saveUserName(participantName);

            disableButtons();
            gameState.myName = participantName;
            gameState.isViewer = joinRole === 'viewer';
            socket.emit('join-session', { 
                roomCode, 
                participantName, 
                asViewer: joinRole === 'viewer' 
            });
        }

        function updateParticipantsList() {
            const list = document.getElementById('participants-list');
            const count = document.getElementById('participant-count');
            
            list.innerHTML = '';
            count.textContent = gameState.participants.length;

            gameState.participants.forEach(participant => {
                const div = document.createElement('div');
                div.className = 'participant';
                
                let statusHtml;
                if (participant.isViewer) {
                    statusHtml = `<span class="viewer-badge">👁️ Viewer</span>`;
                } else if (gameState.votingRevealed && participant.hasVoted) {
                    statusHtml = `<span class="vote-value">${participant.vote}</span>`;
                } else if (participant.hasVoted) {
                    statusHtml = `<span class="vote-status voted">✓ Voted</span>`;
                } else {
                    statusHtml = `<span class="vote-status not-voted">⏳ Waiting</span>`;
                }

                const moderationButton = gameState.isFacilitator && !participant.isFacilitator ? 
                    `<button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; margin-left: 10px;" onclick="window.openModerationModal('${participant.name}')">⚙️</button>` : '';
                
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

        function updateSessionUI(sessionData) {
            gameState.participants = sessionData.participants;
            gameState.sessionName = sessionData.sessionName;
            gameState.votingRevealed = sessionData.votingRevealed;
            gameState.currentJiraIssue = sessionData.currentJiraIssue;
            gameState.jiraConfig = sessionData.jiraConfig;
            gameState.currentTicket = sessionData.currentTicket || '';
            gameState.history = sessionData.history || [];
            gameState.aggregate = sessionData.aggregate || null;

            // Update user's viewer status
            const myParticipant = sessionData.participants.find(p => p.name === gameState.myName);
            if (myParticipant) {
                gameState.isViewer = myParticipant.isViewer;
            }

            // Show session section
            document.getElementById('setup-section').classList.add('hidden');
            document.getElementById('session-section').classList.remove('hidden');

            // Update session info
            document.getElementById('current-session-name').textContent = sessionData.sessionName;
            document.getElementById('room-code').textContent = gameState.roomCode;
            document.getElementById('session-link').textContent = `${window.location.origin}?room=${gameState.roomCode}`;

            // Show facilitator controls if user is facilitator
            if (gameState.isFacilitator) {
                document.getElementById('facilitator-controls').classList.remove('hidden');
                updateJiraUI();

                // Adapt controls for viewport size (mobile vs desktop)
                adaptFacilitatorControlsForViewport();
            }

            // Update participants list and voting cards
            updateParticipantsList();
            updateFacilitatorControls();
            updateVotingCards();
            if (gameState.isFacilitator) {
                updateToggleViewerButton();
            }

            // Update ticket display (if any)
            updateTicketDisplay();

            // Update estimation history
            updateHistoryUI();
            updateStatsUI();
        }

        // Jira Integration Functions
        function toggleJiraSetup() {
            const setupDiv = document.getElementById('jira-setup');
            const notConnectedDiv = document.getElementById('jira-not-connected');
            
            if (setupDiv.classList.contains('hidden')) {
                setupDiv.classList.remove('hidden');
                notConnectedDiv.classList.add('hidden');
            } else {
                setupDiv.classList.add('hidden');
                notConnectedDiv.classList.remove('hidden');
                // Clear form
                document.getElementById('jira-domain').value = '';
                document.getElementById('jira-email').value = '';
                document.getElementById('jira-token').value = '';
            }
        }

        // Helper functions to persist Jira credentials (encrypted) in localStorage
        function saveJiraCredentials(domain, email, token, projectKey = '') {
            try {
                const encryptedToken = CryptoJS.AES.encrypt(token, email).toString();
                localStorage.setItem('jiraCredentials', JSON.stringify({ 
                    domain, 
                    email, 
                    token: encryptedToken, 
                    projectKey: projectKey || '' 
                }));
            } catch (e) {
                console.error('Failed to save Jira credentials', e);
            }
        }

        function loadJiraCredentials() {
            try {
                const raw = localStorage.getItem('jiraCredentials');
                if (!raw) return null;
                const { domain, email, token, projectKey } = JSON.parse(raw);
                const decryptedToken = CryptoJS.AES.decrypt(token, email).toString(CryptoJS.enc.Utf8);
                return { domain, email, token: decryptedToken, projectKey: projectKey || '' };
            } catch (e) {
                console.error('Failed to load Jira credentials', e);
                return null;
            }
        }

        function clearJiraCredentials() {
            localStorage.removeItem('jiraCredentials');
        }

        function configureJira() {
            const domain = document.getElementById('jira-domain').value.trim();
            const email = document.getElementById('jira-email').value.trim();
            const token = document.getElementById('jira-token').value.trim();
            const projectKey = document.getElementById('jira-project-key').value.trim().toUpperCase();
            const remember = document.getElementById('remember-jira').checked;

            if (!domain || !email || !token) {
                showNotification('Please fill in all Jira configuration fields', 'error');
                return;
            }

            // Remove https:// if user included it
            const cleanDomain = domain.replace(/^https?:\/\//, '');

            // Persist or clear credentials based on checkbox
            if (remember) {
                saveJiraCredentials(cleanDomain, email, token, projectKey);
            } else {
                clearJiraCredentials();
            }

            document.getElementById('connect-jira-btn').disabled = true;
            socket.emit('configure-jira', {
                roomCode: gameState.roomCode,
                domain: cleanDomain,
                email: email,
                token: token,
                projectKey: projectKey || null
            });
            console.log('configured jira');
        }

        function updateJiraUI() {
            const setupDiv = document.getElementById('jira-setup');
            const connectedDiv = document.getElementById('jira-connected');
            const notConnectedDiv = document.getElementById('jira-not-connected');

            if (gameState.jiraConfig && gameState.jiraConfig.hasToken) {
                setupDiv.classList.add('hidden');
                connectedDiv.classList.remove('hidden');
                notConnectedDiv.classList.add('hidden');
                document.getElementById('jira-domain-display').textContent = gameState.jiraConfig.domain;
            } else {
                setupDiv.classList.add('hidden');
                connectedDiv.classList.add('hidden');
                notConnectedDiv.classList.remove('hidden');
            }
        }

        function populateJiraBoards(boards) {
            const select = document.getElementById('jira-board-select');
            select.innerHTML = '<option value="">Choose a board...</option>';
            
            // Sort boards alphabetically by name (case-insensitive)
            const sortedBoards = [...boards].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
            
            sortedBoards.forEach(board => {
                const option = document.createElement('option');
                option.value = board.id;
                option.textContent = board.name;
                select.appendChild(option);
            });

            select.addEventListener('change', function() {
                document.getElementById('load-issues-btn').disabled = !this.value;
            });
        }

        function loadJiraIssues() {
            const boardId = document.getElementById('jira-board-select').value;
            if (!boardId) return;

            document.getElementById('load-issues-btn').disabled = true;
            socket.emit('get-jira-issues', {
                roomCode: gameState.roomCode,
                boardId: boardId
            });
        }

        function displayJiraIssues() {
            const container = document.getElementById('jira-issues-list');
            const section = document.getElementById('jira-issues-section');
            
            container.innerHTML = '';
            
            if (gameState.jiraIssues.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #6b7280;">No issues found in the selected board backlog.</p>';
                section.classList.remove('hidden');
                return;
            }

            // Separate issues with and without story points
            const unestimatedIssues = gameState.jiraIssues.filter(issue => !issue.currentStoryPoints);
            const estimatedIssues = gameState.jiraIssues.filter(issue => issue.currentStoryPoints);

            // Show unestimated issues first
            if (unestimatedIssues.length > 0) {
                const unestimatedHeader = document.createElement('div');
                unestimatedHeader.innerHTML = '<h4 style="margin: 15px 0 10px 0; color: #374151;">📋 Ready for Estimation</h4>';
                container.appendChild(unestimatedHeader);

                unestimatedIssues.forEach(issue => {
                    const div = document.createElement('div');
                    div.className = 'jira-issue';
                    div.onclick = () => selectJiraIssue(issue);
                    
                    div.innerHTML = `
                        <div class="jira-issue-key">${issue.key}</div>
                        <div class="jira-issue-summary">${issue.summary}</div>
                        <div class="jira-issue-meta">
                            <span>📋 ${issue.issueType}</span>
                            <span>🔺 ${issue.priority}</span>
                            <span>📊 ${issue.status}</span>
                            <span>👤 ${issue.assignee}</span>
                        </div>
                    `;
                    
                    container.appendChild(div);
                });
            }

            // Show estimated issues (read-only)
            if (estimatedIssues.length > 0) {
                const estimatedHeader = document.createElement('div');
                estimatedHeader.innerHTML = '<h4 style="margin: 25px 0 10px 0; color: #374151;">✅ Already Estimated</h4>';
                container.appendChild(estimatedHeader);

                estimatedIssues.forEach(issue => {
                    const div = document.createElement('div');
                    div.className = 'jira-issue';
                    div.style.opacity = '0.7';
                    div.style.cursor = 'default';
                    div.style.background = '#f9fafb';
                    
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
                    
                    container.appendChild(div);
                });
            }
            
            section.classList.remove('hidden');
            document.getElementById('load-issues-btn').disabled = false;
        }

        function selectJiraIssue(issue) {
            // Don't allow selection of already estimated issues
            if (issue.currentStoryPoints) {
                showNotification('This issue is already estimated. Choose an unestimated issue.', 'error');
                return;
            }

            // Remove previous selection
            document.querySelectorAll('.jira-issue').forEach(el => {
                el.classList.remove('selected');
            });
            
            // Add selection to clicked issue
            event.target.closest('.jira-issue').classList.add('selected');
            
            gameState.selectedIssue = issue;
            
            // Set the issue for voting
            socket.emit('set-jira-issue', {
                roomCode: gameState.roomCode,
                issue: issue
            });
        }

        function updateFacilitatorControls() {
            if (!gameState.isFacilitator) return;

            const hasVotes = gameState.participants.some(p => p.hasVoted && !p.isViewer);
            const revealBtn = document.getElementById('reveal-btn');
            const resetBtn = document.getElementById('reset-btn');
            const countdownBtn = document.getElementById('countdown-btn');

            revealBtn.disabled = (!hasVotes || gameState.votingRevealed) || gameState.countdownActive;
            resetBtn.disabled = !gameState.currentTicket;
            countdownBtn.disabled = !gameState.currentTicket || gameState.votingRevealed || gameState.countdownActive;
        }

        // Ticket Management
        function setCurrentTicket() {
            const ticket = document.getElementById('jira-ticket').value.trim();
            if (!ticket) {
                showNotification('Please enter a Jira ticket description', 'error');
                return;
            }

            socket.emit('set-ticket', { roomCode: gameState.roomCode, ticket });
        }

        function updateTicketDisplay() {
            if (gameState.currentTicket) {
                const ticketElement = document.getElementById('ticket-description');
                
                if (gameState.currentJiraIssue) {
                    // Enhanced display for Jira issues
                    const issue = gameState.currentJiraIssue;
                    const jiraBaseUrl = gameState.jiraConfig ? `https://${gameState.jiraConfig.domain}` : '#';
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
                    // Simple display for manual tickets
                    ticketElement.textContent = gameState.currentTicket;
                }
                
                document.getElementById('current-ticket').classList.remove('hidden');
            } else {
                document.getElementById('current-ticket').classList.add('hidden');
            }
        }

        // Voting
        function vote(value) {
            if (!gameState.currentTicket) {
                showNotification('Please wait for a ticket to be set', 'error');
                return;
            }

            if (gameState.isViewer) {
                showNotification('Viewers cannot vote', 'error');
                return;
            }

            if (gameState.votingRevealed) {
                showNotification('Voting is complete for this round. Wait for a new round.', 'error');
                return;
            }

            gameState.myVote = value;
            socket.emit('submit-vote', { roomCode: gameState.roomCode, vote: value });
            
            // Play voting sound
            playSound('vote');
            
            // Update card selection immediately for responsiveness
            updateCardSelection(value);
        }

        function updateCardSelection(selectedValue) {
            document.querySelectorAll('.card').forEach(card => {
                card.classList.remove('selected');
            });

            if (selectedValue !== null) {
                const selectedCard = Array.from(document.querySelectorAll('.card'))
                    .find(card => card.textContent === selectedValue.toString());
                if (selectedCard) {
                    selectedCard.classList.add('selected');
                }
            }
        }

        function updateVotingCards() {
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                if (gameState.isViewer || gameState.votingRevealed) {
                    card.classList.add('disabled');
                    card.style.cursor = 'not-allowed';
                } else {
                    card.classList.remove('disabled');
                    card.style.cursor = 'pointer';
                }
            });
        }

        function resetVotingUI() {
            gameState.myVote = null;
            gameState.countdownActive = false;
            updateCardSelection(null);
            updateVotingCards();
            document.getElementById('results').classList.add('hidden');
            document.getElementById('finalize-estimation').classList.add('hidden');
            hideCountdown();
            updateCountdownUI();
        }

        function revealVotes() {
            socket.emit('reveal-votes', { roomCode: gameState.roomCode });
        }

        function resetVoting() {
            socket.emit('reset-voting', { roomCode: gameState.roomCode });
        }

        // Results
        function showResults(results) {
            if (!results || results.totalVotes === 0) {
                document.getElementById('results').classList.add('hidden');
                return;
            }

            // Update statistics
            document.getElementById('average-vote').textContent = results.average.toFixed(1);
            document.getElementById('consensus-vote').textContent = results.consensus || '-';
            document.getElementById('total-voters').textContent = results.totalVotes;
            
            // Show vote breakdown
            const breakdown = document.getElementById('vote-breakdown');
            breakdown.innerHTML = '<h4>Vote Distribution:</h4>';
            
            Object.entries(results.voteCounts).forEach(([vote, count]) => {
                const percentage = ((count / results.totalVotes) * 100).toFixed(0);
                breakdown.innerHTML += `
                    <div style="margin: 5px 0; padding: 8px; background: white; border-radius: 4px;">
                        <strong>${vote}</strong>: ${count} vote${count > 1 ? 's' : ''} (${percentage}%)
                    </div>
                `;
            });
            
            // Show finalize estimation section for Jira issues (facilitator only)
            const finalizeSection = document.getElementById('finalize-estimation');
            if (gameState.isFacilitator && gameState.currentJiraIssue && gameState.jiraConfig) {
                finalizeSection.classList.remove('hidden');
                // Pre-populate with consensus or average
                const suggestedValue = results.consensus && !isNaN(results.consensus) ? 
                    parseFloat(results.consensus) : results.average;
                document.getElementById('final-estimate').value = suggestedValue.toFixed(1);
            } else {
                finalizeSection.classList.add('hidden');
            }
            
            document.getElementById('results').classList.remove('hidden');
            updateCardSelection(null); // Disable cards after reveal

            // Play consensus sound if unanimous
            if (results && results.totalVotes > 0 && results.min !== null && results.min === results.max) {
                playSound('consensus');
            }
        }

        function finalizeEstimation() {
            const finalEstimate = parseFloat(document.getElementById('final-estimate').value);
            
            if (isNaN(finalEstimate) || finalEstimate < 0) {
                showNotification('Please enter a valid story point value', 'error');
                return;
            }

            if (!gameState.currentJiraIssue) {
                showNotification('No Jira issue selected', 'error');
                return;
            }

            document.getElementById('finalize-btn').disabled = true;
            socket.emit('finalize-estimation', {
                roomCode: gameState.roomCode,
                finalEstimate: finalEstimate
            });
        }

        function endSession() {
            if (confirm('Are you sure you want to end this session? All participants will be disconnected.')) {
                clearActiveSession(); // clear before notifying server
                socket.emit('end-session', { roomCode: gameState.roomCode });
            }
        }

        // Countdown functionality
        function startCountdown() {
            if (!gameState.currentTicket) {
                showNotification('Please set a ticket first', 'error');
                return;
            }

            socket.emit('start-countdown', { 
                roomCode: gameState.roomCode,
                duration: 30 // 30 seconds
            });
        }

        function displayCountdown(seconds, totalDuration) {
            const display = document.getElementById('countdown-display');
            const numberEl = document.getElementById('countdown-number');
            const progressBar = document.getElementById('countdown-progress-bar');
            
            display.classList.remove('hidden');
            numberEl.textContent = seconds;
            
            // Update progress bar
            const progress = (seconds / totalDuration) * 100;
            progressBar.style.width = progress + '%';
            
            // Add urgent styling for last 10 seconds
            if (seconds <= 10) {
                display.classList.add('countdown-urgent');
            } else {
                display.classList.remove('countdown-urgent');
            }
        }

        function hideCountdown() {
            document.getElementById('countdown-display').classList.add('hidden');
            document.getElementById('countdown-display').classList.remove('countdown-urgent');
        }

        function updateCountdownUI() {
            const countdownBtn = document.getElementById('countdown-btn');
            const revealBtn = document.getElementById('reveal-btn');
            
            if (gameState.countdownActive) {
                countdownBtn.disabled = true;
                countdownBtn.textContent = 'Countdown Active...';
                revealBtn.disabled = true;
            } else {
                countdownBtn.disabled = !gameState.currentTicket || gameState.votingRevealed;
                countdownBtn.textContent = 'Start 30s Countdown';
                updateFacilitatorControls(); // Reset reveal button state
            }
        }

        // Facilitator observer toggle
        function updateToggleViewerButton() {
            const btn = document.getElementById('toggle-viewer-btn');
            if (!btn) return;
            btn.textContent = gameState.isViewer ? 'Switch to Participant' : 'Switch to Observer';
        }

        function toggleFacilitatorViewer() {
            if (!gameState.isFacilitator) {
                showNotification('Only the facilitator can change their observer status', 'error');
                return;
            }
            const newIsViewer = !gameState.isViewer;
            socket.emit('set-facilitator-viewer', {
                roomCode: gameState.roomCode,
                isViewer: newIsViewer
            });
        }

        // Moderation functions - Global scope for onclick handlers
        window.openModerationModal = function(participantName) {
            if (!gameState.isFacilitator) {
                showNotification('Only facilitators can moderate participants', 'error');
                return;
            }
            
            gameState.moderationTarget = participantName;
            document.getElementById('moderation-target').textContent = participantName;
            const modal = document.getElementById('moderation-modal');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        };

        window.closeModerationModal = function() {
            gameState.moderationTarget = null;
            const modal = document.getElementById('moderation-modal');
            modal.classList.add('hidden');
            modal.style.display = 'none';
        };

        window.moderateParticipant = function(action) {
            if (!gameState.moderationTarget || !gameState.isFacilitator) return;
            
            socket.emit('moderate-participant', {
                roomCode: gameState.roomCode,
                targetName: gameState.moderationTarget,
                action: action
            });
            
            window.closeModerationModal();
        };

        // Auto-uppercase room code input
        document.getElementById('room-code-input').addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });

        // Handle URL parameters for direct room joining
        window.onload = function() {
            initSocket();
            
            // Prefill Jira credentials if stored
            const storedCreds = loadJiraCredentials();
            if (storedCreds) {
                document.getElementById('jira-domain').value = storedCreds.domain;
                document.getElementById('jira-email').value = storedCreds.email;
                document.getElementById('jira-token').value = storedCreds.token;
                document.getElementById('jira-project-key').value = storedCreds.projectKey || '';
                const rememberJiraCheckbox = document.getElementById('remember-jira');
                if (rememberJiraCheckbox) rememberJiraCheckbox.checked = true;
            }
            
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room');
            
            if (roomCode) {
                document.getElementById('room-code-input').value = roomCode.toUpperCase();
                showNotification(`Ready to join room ${roomCode}. Enter your name and click Join Session.`, 'success');
            }

            // Enable click-to-copy for room code and share link
            const roomCodeEl = document.getElementById('room-code');
            const shareLinkEl = document.getElementById('session-link');

            if (roomCodeEl) {
                roomCodeEl.addEventListener('click', () => {
                    const text = roomCodeEl.textContent.trim();
                    if (!text) return;
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification('Room code copied to clipboard!', 'success');
                    }).catch(() => {
                        showNotification('Failed to copy room code', 'error');
                    });
                });
            }

            if (shareLinkEl) {
                shareLinkEl.addEventListener('click', () => {
                    const text = shareLinkEl.textContent.trim();
                    if (!text) return;
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification('Session link copied to clipboard!', 'success');
                    }).catch(() => {
                        showNotification('Failed to copy link', 'error');
                    });
                });
            }

            // NEW: Prefill facilitator/join name inputs if previously saved
            const savedName = loadUserName();
            if (savedName) {
                const facInput = document.getElementById('facilitator-name');
                const joinInput = document.getElementById('join-name');
                if (facInput) facInput.value = savedName;
                if (joinInput) joinInput.value = savedName;
            }

            // Attach sound toggle handler
            updateSoundIcon();
            const soundEl = document.getElementById('sound-toggle');
            if (soundEl) {
                soundEl.addEventListener('click', () => {
                    soundEnabled = !soundEnabled;
                    saveSoundSetting(soundEnabled);
                    updateSoundIcon();
                });
            }
        };

        // Handle Enter key presses
        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const activeElement = document.activeElement;
                
                if (activeElement.id === 'facilitator-name' || activeElement.id === 'session-name') {
                    startSession();
                } else if (activeElement.id === 'join-name' || activeElement.id === 'room-code-input') {
                    joinSession();
                } else if (activeElement.id === 'jira-ticket') {
                    setCurrentTicket();
                }
            }
        });

        /* -------------------- Responsive facilitator controls -------------------- */
        // Handles collapsing / expanding facilitator controls on small screens
        function toggleFacilitatorControlsVisibility() {
            const controls = document.getElementById('facilitator-controls');
            controls.classList.toggle('collapsed');
        }

        // Attach click handler to floating action button
        const toggleBtn = document.getElementById('toggle-controls-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleFacilitatorControlsVisibility);
        }

        // Helper invoked from updateSessionUI & on resize to decide whether to collapse controls
        function adaptFacilitatorControlsForViewport() {
            const controls = document.getElementById('facilitator-controls');
            const toggle = document.getElementById('toggle-controls-btn');
            if (!controls || !toggle) return;

            if (window.innerWidth <= 768) {
                // Show floating button, collapse controls initially
                toggle.classList.remove('hidden');
                if (!controls.classList.contains('collapsed')) {
                    controls.classList.add('collapsed');
                }
            } else {
                // Hide floating button, always show controls
                toggle.classList.add('hidden');
                controls.classList.remove('collapsed');
            }
        }

        // Listen for window resize events
        window.addEventListener('resize', adaptFacilitatorControlsForViewport);

        // Helper: persist active session details for auto-rejoin
        function saveActiveSession() {
            try {
                const data = {
                    roomCode: gameState.roomCode,
                    name: gameState.myName,
                    isViewer: gameState.isViewer
                };
                localStorage.setItem('activeSession', JSON.stringify(data));
            } catch (e) {
                console.error('Failed to save active session', e);
            }
        }

        function loadActiveSessionInfo() {
            try {
                const raw = localStorage.getItem('activeSession');
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        }

        function clearActiveSession() {
            localStorage.removeItem('activeSession');
        }

        // NEW: Update estimation history
        function updateHistoryUI() {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
            
            if (!gameState.history || gameState.history.length === 0) {
                // Hide the section if there's nothing to show
                const section = document.getElementById('history-section');
                if (section) section.classList.add('hidden');
                return;
            }

            const section = document.getElementById('history-section');
            if (section) section.classList.remove('hidden');

            gameState.history.forEach(entry => {
                const div = document.createElement('div');
                div.style.padding = '8px 12px';
                div.style.background = '#ffffff';
                div.style.border = '1px solid #e5e7eb';
                div.style.borderRadius = '6px';
                div.style.marginBottom = '6px';
                div.style.fontSize = '14px';

                const ticketText = entry.issueKey ? `${entry.issueKey}: ${entry.summary || ''}` : entry.ticket;
                const consensus = entry.stats ? entry.stats.consensus : (entry.estimate || entry.storyPoints || '-');
                const average = entry.stats ? entry.stats.average.toFixed(1) : '-';
                const range = entry.stats ? `${entry.stats.min}‒${entry.stats.max}` : '-';
                const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';

                div.innerHTML = `<strong>${ticketText}</strong><br><span style="color:#6b7280;">Consensus: ${consensus} | Avg: ${average} | Range: ${range} | ${timeStr}</span>`;
                historyList.appendChild(div);
            });
            updateStatsUI();
        }

        // NEW: Export history to CSV
        function exportHistory() {
            if (!gameState.history || gameState.history.length === 0) {
                showNotification('No history to export', 'error');
                return;
            }

            const header = ['Ticket', 'Consensus', 'Average', 'Min', 'Max', 'Timestamp'];

            // Build map to keep only last estimation per ticket
            const latest = new Map();
            gameState.history.forEach(entry => {
                const key = entry.issueKey || entry.ticket;
                latest.set(key, entry); // later entries overwrite earlier ones
            });

            let totalPoints = 0;
            const rows = [];
            latest.forEach(entry => {
                const ticketText = entry.issueKey ? `${entry.issueKey}: ${entry.summary || ''}` : entry.ticket;
                const consensus = entry.stats ? entry.stats.consensus : (entry.estimate || entry.storyPoints || '-');
                const avg = entry.stats ? entry.stats.average : '';
                const min = entry.stats ? entry.stats.min : '';
                const max = entry.stats ? entry.stats.max : '';
                const timeStr = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';

                if (typeof consensus === 'number') {
                    totalPoints += consensus;
                }

                rows.push([ticketText, consensus, avg, min, max, timeStr]);
            });

            // Team stats rows
            rows.push([]); // blank line
            rows.push(['Total Story Points', totalPoints]);
            if (gameState.aggregate) {
                const a = gameState.aggregate;
                const pct = ((a.consensusRounds / a.totalRounds) * 100).toFixed(0);
                rows.push(['Total Rounds', a.totalRounds]);
                rows.push(['Consensus Rounds', a.consensusRounds, pct + '%']);
            }

            const csvArray = [header, ...rows].map(r => r.map(v => `"${String(v??'').replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvArray], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${gameState.sessionName || 'estimation_history'}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        function updateStatsUI() {
            const section = document.getElementById('stats-section');
            const teamDiv = document.getElementById('team-stats');
            const userDiv = document.getElementById('user-stats');
            if (!section || !gameState.aggregate) {
                section.classList.add('hidden');
                return;
            }
            const agg = gameState.aggregate;
            if (agg.totalRounds === 0) {
                section.classList.add('hidden');
                return;
            }
            section.classList.remove('hidden');

            const consensusPct = ((agg.consensusRounds / agg.totalRounds) * 100).toFixed(0);

            // Compute total story points (unique tickets, last estimation)
            let totalSP = 0;
            if (gameState.history && gameState.history.length) {
                const latest = new Map();
                gameState.history.forEach(h => {
                    const key = h.issueKey || h.ticket;
                    latest.set(key, h); // overwrite to keep last estimation
                });
                latest.forEach(h => {
                    const consensus = h.stats ? h.stats.consensus : h.estimate || h.storyPoints;
                    if (typeof consensus === 'number') {
                        totalSP += consensus;
                    }
                });
            }

            teamDiv.innerHTML = `<strong>Total Rounds:</strong> ${agg.totalRounds} &nbsp; | &nbsp; <strong>Consensus Achieved:</strong> ${agg.consensusRounds} (${consensusPct}%) &nbsp; | &nbsp; <strong>Total Story Points:</strong> ${totalSP}`;

            // Build per-user table
            userDiv.innerHTML = '';
            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            const headerRow = document.createElement('tr');
            ['Member','Avg','High','Low','Votes'].forEach(h=>{
                const th=document.createElement('th');
                th.textContent=h;
                th.style.border='1px solid #e5e7eb';
                th.style.padding='4px';
                th.style.background='#f9fafb';
                headerRow.appendChild(th);
            });
            table.appendChild(headerRow);

            Object.entries(agg.perUser).forEach(([name, data])=>{
                const tr=document.createElement('tr');
                const avg = data.count ? (data.sum / data.count).toFixed(1) : '-';
                const cells=[name, avg, data.highCount, data.lowCount, data.count];
                cells.forEach(val=>{
                    const td=document.createElement('td');
                    td.textContent=val;
                    td.style.border='1px solid #e5e7eb';
                    td.style.padding='4px';
                    td.style.textAlign='center';
                    tr.appendChild(td);
                });
                table.appendChild(tr);
            });
            userDiv.appendChild(table);
        }

        // 🔊 Sound effects ---------------------------------------------
        const _audioCtx = typeof AudioContext !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;
        function _playTone(freq = 600, durationMs = 150, volume = 0.15, type = 'sine') {
            if (!_audioCtx) return;
            try {
                if (_audioCtx.state === 'suspended') {
                    _audioCtx.resume();
                }
                const osc = _audioCtx.createOscillator();
                const gain = _audioCtx.createGain();
                osc.type = type;
                osc.frequency.value = freq;
                gain.gain.value = volume;
                osc.connect(gain).connect(_audioCtx.destination);
                osc.start();
                osc.stop(_audioCtx.currentTime + durationMs / 1000);
            } catch (e) {
                /* Ignore playback errors (e.g., user has not interacted yet) */
            }
        }

        function playSound(eventName) {
            if (!soundEnabled) return; // global mute
            switch (eventName) {
                case 'vote':
                    _playTone(600, 120, 0.2);
                    break;
                case 'reveal':
                    _playTone(800, 200, 0.25, 'square');
                    break;
                case 'countdown':
                    _playTone(500, 180, 0.25, 'sawtooth');
                    break;
                case 'consensus':
                    // Two quick beeps for consensus
                    _playTone(1000, 120, 0.3, 'triangle');
                    setTimeout(() => _playTone(1200, 120, 0.3, 'triangle'), 130);
                    break;
                case 'ticket':
                    _playTone(650, 150, 0.22, 'square');
                    break;
            }
        }
        // --------------------------------------------------------------

        /* ---------------- Sound settings (persisted) ---------------- */
        let soundEnabled = true; // default on

        function loadSoundSetting() {
            try {
                const val = localStorage.getItem('soundEnabled');
                return val === null ? true : val === 'true';
            } catch(e) { return true; }
        }

        function saveSoundSetting(val) {
            try { localStorage.setItem('soundEnabled', val ? 'true' : 'false'); } catch(e){}
        }

        function updateSoundIcon() {
            const el = document.getElementById('sound-toggle');
            if (!el) return;
            el.textContent = soundEnabled ? '🔊' : '🔇';
            el.title = soundEnabled ? 'Sound on' : 'Sound off';
        }

        // Initialize setting from storage immediately
        soundEnabled = loadSoundSetting();
