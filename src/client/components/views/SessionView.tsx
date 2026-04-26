import React from 'react';
import MetricsRibbon from '../session/MetricsRibbon';
import CurrentIssueCard from '../voting/CurrentIssueCard';
import VotingCards from '../voting/VotingCards';
import ActionBar from '../voting/ActionBar';
import EstimationHistory from '../history/EstimationHistory';

export default function SessionView() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <MetricsRibbon
        average={5.5}
        agreement={71}
        consensus={5}
        totalVoters={7}
      />

      <CurrentIssueCard
        issueKey="SF-222"
        title="Improve user onboarding experience with guided tour"
        description="As a new user, I want to see a guided tour so that I can understand the app's features quickly and start using it effectively."
        issueType="Story"
        priority="Medium"
        status="To Do"
      />

      <VotingCards
        options={['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕']}
        selectedValue={null}
        onVote={(value) => console.log('voted', value)}
      />

      <ActionBar
        onReveal={() => {}}
        onStartTimer={() => {}}
        onSkip={() => {}}
        onReset={() => {}}
      />

      <EstimationHistory />
    </div>
  );
}
