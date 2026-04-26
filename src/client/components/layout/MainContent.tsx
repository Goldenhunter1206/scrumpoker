import SetupView from '../views/SetupView';
import SessionView from '../views/SessionView';

export type AppView = 'setup' | 'session';

interface Props {
  view: AppView;
}

export default function MainContent({ view }: Props) {
  if (view === 'setup') {
    return <SetupView />;
  }
  return <SessionView />;
}
