import { useSessionState } from '../../context/SessionContext';
import { useSocket } from '../../hooks/useSocket';
import type { Participant, Vote } from '@shared/types/index.js';
import MetricsRibbon from '../session/MetricsRibbon';
import CurrentIssueCard from '../voting/CurrentIssueCard';
import VotingCards from '../voting/VotingCards';
import ActionBar from '../voting/ActionBar';
import VotingResults from '../voting/VotingResults';
import EstimationHistory from '../history/EstimationHistory';
import ChatPanel from '../session/ChatPanel';

const FIBONACCI = ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'];

export default function SessionView() {
  const {
    sessionData,
    myVote,
    isViewer,
    isFacilitator,
    votingRevealed,
    results,
  } = useSessionState();
  const { submitVote, revealVotes, resetVoting, startCountdown, finalizeEstimation } = useSocket();

  const roomCode = sessionData?.id || '';
  const participants: Participant[] = sessionData?.participants || [];
  const votedCount = participants.filter((p: Participant) => p.hasVoted).length;

  // Current issue
  const jiraIssue = sessionData?.currentJiraIssue;
  const currentTicket = sessionData?.currentTicket;

  // Metrics
  let average = 0;
  let agreement = 0;
  let consensus: number | string = '—';
  let totalVoters = votedCount;

  if (votingRevealed && results) {
    average = typeof results.average === 'number' ? Math.round(results.average * 10) / 10 : 0;
    totalVoters = results.totalVotes || votedCount;

    if (results.voteCounts && totalVoters > 0) {
      const maxCount = Math.max(...Object.values(results.voteCounts));
      const maxVotes = Object.entries(results.voteCounts).filter(([, c]) => c === maxCount);
      if (maxVotes.length === 1) {
        consensus = maxVotes[0][0];
      } else {
        consensus = '—';
      }
      agreement = Math.round((maxCount / totalVoters) * 100);
    }
  }

  const handleVote = (value: string) => {
    if (isViewer || votingRevealed || !roomCode) return;
    let vote: Vote;
    if (value === '?' || value === '☕') {
      vote = value;
    } else {
      const n = parseFloat(value);
      vote = isNaN(n) ? 0 : n;
    }
    submitVote(roomCode, vote);
  };

  const handleReveal = () => {
    if (roomCode) revealVotes(roomCode);
  };

  const handleReset = () => {
    if (roomCode) resetVoting(roomCode);
  };

  const handleStartTimer = () => {
    if (roomCode) startCountdown(roomCode, 60);
  };

  const handleUpdateJira = () => {
    if (results && roomCode) {
      const est = typeof consensus === 'string' ? parseFloat(consensus) || 0 : consensus;
      finalizeEstimation(roomCode, est, false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <MetricsRibbon
        average={average}
        agreement={votingRevealed ? agreement : 0}
        consensus={consensus}
        totalVoters={totalVoters}
      />

      <CurrentIssueCard
        issueKey={jiraIssue?.key || currentTicket || undefined}
        title={jiraIssue?.summary || currentTicket || 'No issue selected'}
        description={jiraIssue?.description}
        issueType={jiraIssue?.issueType}
        priority={jiraIssue?.priority}
        status={jiraIssue?.status}
      />

      {votingRevealed && results ? (
        <VotingResults
          votes={
            participants
              .filter((p: Participant) => !p.isViewer && p.vote !== undefined)
              .map((p: Participant) => ({ name: p.name, vote: String(p.vote) })) || []
          }
          average={average}
          consensus={consensus}
        />
      ) : (
        <VotingCards
          options={FIBONACCI}
          selectedValue={myVote !== null ? String(myVote) : null}
          onVote={handleVote}
          disabled={isViewer || votingRevealed}
        />
      )}

      <ActionBar
        onReveal={handleReveal}
        onStartTimer={handleStartTimer}
        onSkip={() => { /* handled via sidebar / moderator controls */ }}
        onReset={handleReset}
        onUpdateJira={!!jiraIssue ? handleUpdateJira : undefined}
        canReveal={isFacilitator && votedCount > 0 && !votingRevealed}
        isRevealed={votingRevealed}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EstimationHistory />
        </div>
        <div>
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
