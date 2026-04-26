import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  Vote,
  JiraIssue,
} from '@shared/types/index.js';
import { useSessionDispatch } from '../context/SessionContext';

let sharedSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io();
  }
  return sharedSocket;
}

export function useSocket() {
  const dispatch = useSessionDispatch();
  const myNameRef = useRef<string>('');

  useEffect(() => {
    const socket = getSharedSocket();

    socket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: false });
    });

    socket.on('session-created', (data) => {
      if (data.success) {
        dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
        dispatch({ type: 'SET_IS_FACILITATOR', payload: true });
        dispatch({
          type: 'SET_NOTIFICATION',
          payload: { message: 'Session created successfully!', type: 'success' },
        });
      } else {
        dispatch({
          type: 'SET_NOTIFICATION',
          payload: { message: 'Failed to create session', type: 'error' },
        });
      }
    });

    socket.on('join-success', (data) => {
      // Look up "me" by myName (stored when joinSession is called)
      const myParticipant = data.sessionData.participants.find(
        (p: { name: string; isFacilitator?: boolean; isViewer?: boolean }) =>
          p.name === myNameRef.current
      );
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({
        type: 'SET_IS_FACILITATOR',
        payload: !!(myParticipant?.isFacilitator),
      });
      dispatch({
        type: 'SET_IS_VIEWER',
        payload: myParticipant ? !!myParticipant.isViewer : false,
      });
      if (data.yourVote !== null && data.yourVote !== undefined) {
        dispatch({ type: 'SET_MY_VOTE', payload: data.yourVote });
      }
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: 'Joined session successfully!', type: 'success' },
      });
    });

    socket.on('join-failed', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
    });

    socket.on('participant-joined', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: `${data.participantName} joined`, type: 'success' },
      });
    });

    socket.on('participant-left', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('participant-removed', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('participant-role-changed', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('facilitator-changed', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('removed-from-session', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
      dispatch({ type: 'RESET' });
    });

    socket.on('jira-config-success', (data) => {
      dispatch({ type: 'SET_JIRA_CONFIG', payload: data.sessionData.jiraConfig });
      dispatch({ type: 'SET_JIRA_BOARDS', payload: data.boards });
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: 'Connected to Jira!', type: 'success' },
      });
    });

    socket.on('jira-config-failed', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
    });

    socket.on('jira-issues-loaded', (data) => {
      dispatch({ type: 'SET_JIRA_ISSUES', payload: data.issues });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: {
          message: `Loaded ${data.issues.length} issues from Jira`,
          type: 'success',
        },
      });
    });

    socket.on('jira-issues-failed', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
    });

    socket.on('jira-issue-set', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({ type: 'RESET_VOTING' });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: `Jira issue: ${data.issue.key}`, type: 'success' },
      });
    });

    socket.on('jira-updated', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({ type: 'RESET_VOTING' });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: {
          message: `Updated ${data.issueKey} with ${data.storyPoints} story points`,
          type: 'success',
        },
      });
    });

    socket.on('jira-update-failed', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
    });

    socket.on('ticket-set', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({ type: 'RESET_VOTING' });
    });

    socket.on('vote-submitted', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('votes-revealed', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({ type: 'SET_VOTING_REVEALED', payload: true });
      dispatch({ type: 'SET_RESULTS', payload: data.results });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: 'Votes revealed!', type: 'success' },
      });
    });

    socket.on('voting-reset', (data) => {
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
      dispatch({ type: 'RESET_VOTING' });
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: 'New voting round!', type: 'success' },
      });
    });

    socket.on('countdown-started', (data) => {
      dispatch({
        type: 'SET_COUNTDOWN',
        payload: { active: true, seconds: data.duration },
      });
    });

    socket.on('countdown-tick', (data) => {
      dispatch({
        type: 'SET_COUNTDOWN',
        payload: { active: true, seconds: data.secondsLeft },
      });
    });

    socket.on('countdown-finished', (data) => {
      dispatch({
        type: 'SET_COUNTDOWN',
        payload: { active: false, seconds: 0 },
      });
      dispatch({ type: 'SET_SESSION_DATA', payload: data.sessionData });
    });

    socket.on('session-ended', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
      dispatch({ type: 'RESET' });
    });

    socket.on('chatMessage', (message) => {
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
    });

    socket.on('typingUpdate', (typingUsers) => {
      dispatch({ type: 'SET_TYPING_USERS', payload: typingUsers });
    });

    socket.on('discussion-timer-tick', () => {
      // Handled via session data updates
    });

    socket.on('error', (data) => {
      dispatch({
        type: 'SET_NOTIFICATION',
        payload: { message: data.message, type: 'error' },
      });
    });

    return () => {
      // Only remove listeners on unmount; do NOT disconnect the shared socket
      socket.removeAllListeners();
    };
  }, [dispatch]);

  const createSession = useCallback(
    (sessionName: string, facilitatorName: string) => {
      myNameRef.current = facilitatorName;
      getSharedSocket().emit('create-session', { sessionName, facilitatorName });
    },
    []
  );

  const joinSession = useCallback(
    (roomCode: string, participantName: string, asViewer = false) => {
      myNameRef.current = participantName;
      getSharedSocket().emit('join-session', { roomCode, participantName, asViewer });
    },
    []
  );

  const submitVote = useCallback(
    (roomCode: string, vote: Vote) => {
      dispatch({ type: 'SET_MY_VOTE', payload: vote });
      getSharedSocket().emit('submit-vote', { roomCode, vote });
    },
    [dispatch]
  );

  const revealVotes = useCallback(
    (roomCode: string) => {
      getSharedSocket().emit('reveal-votes', { roomCode });
    },
    []
  );

  const resetVoting = useCallback(
    (roomCode: string) => {
      getSharedSocket().emit('reset-voting', { roomCode });
    },
    []
  );

  const startCountdown = useCallback(
    (roomCode: string, duration: number) => {
      getSharedSocket().emit('start-countdown', { roomCode, duration });
    },
    []
  );

  const setTicket = useCallback(
    (roomCode: string, ticket: string) => {
      getSharedSocket().emit('set-ticket', { roomCode, ticket });
    },
    []
  );

  const configureJira = useCallback(
    (roomCode: string, domain: string, email: string, token: string, projectKey?: string) => {
      getSharedSocket().emit('configure-jira', { roomCode, domain, email, token, projectKey });
    },
    []
  );

  const getJiraIssues = useCallback(
    (roomCode: string, boardId: string) => {
      getSharedSocket().emit('get-jira-issues', { roomCode, boardId });
    },
    []
  );

  const setJiraIssue = useCallback(
    (roomCode: string, issue: JiraIssue) => {
      getSharedSocket().emit('set-jira-issue', { roomCode, issue });
    },
    []
  );

  const finalizeEstimation = useCallback(
    (roomCode: string, finalEstimate: number, moveToSprint = false) => {
      getSharedSocket().emit('finalize-estimation', { roomCode, finalEstimate, moveToSprint });
    },
    []
  );

  const endSession = useCallback(
    (roomCode: string) => {
      getSharedSocket().emit('end-session', { roomCode });
    },
    []
  );

  const moderateParticipant = useCallback(
    (roomCode: string, targetName: string, action: string) => {
      getSharedSocket().emit('moderate-participant', { roomCode, targetName, action });
    },
    []
  );

  const sendChatMessage = useCallback(
    (roomCode: string, message: string) => {
      getSharedSocket().emit('send-chat-message', { roomCode, message });
    },
    []
  );

  const sendTypingIndicator = useCallback(
    (roomCode: string, userName: string, isTyping: boolean) => {
      getSharedSocket().emit('typing-indicator', { roomCode, userName, isTyping });
    },
    []
  );

  return {
    createSession,
    joinSession,
    submitVote,
    revealVotes,
    resetVoting,
    startCountdown,
    setTicket,
    configureJira,
    getJiraIssues,
    setJiraIssue,
    finalizeEstimation,
    endSession,
    moderateParticipant,
    sendChatMessage,
    sendTypingIndicator,
    socket: getSharedSocket(),
  };
}
