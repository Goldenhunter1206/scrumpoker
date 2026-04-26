import React from 'react';
import { AppView } from '../../App';
import SetupView from '../views/SetupView';
import SessionView from '../views/SessionView';

interface Props {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onSessionCreated: (name: string) => void;
}

export default function MainContent({ view, onViewChange, onSessionCreated }: Props) {
  if (view === 'setup') {
    return (
      <SetupView
        onSessionCreated={(name) => {
          onSessionCreated(name);
          onViewChange('session');
        }}
      />
    );
  }

  return <SessionView />;
}
