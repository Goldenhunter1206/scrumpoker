import { useEffect } from 'react';
import { useSessionState, useSessionDispatch } from '../../context/SessionContext';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

export default function NotificationToast() {
  const { notification } = useSessionState();
  const dispatch = useSessionDispatch();

  useEffect(() => {
    if (!notification) return;
    const id = setTimeout(() => {
      dispatch({ type: 'CLEAR_NOTIFICATION' });
    }, 4000);
    return () => clearTimeout(id);
  }, [notification, dispatch]);

  if (!notification) return null;

  const isSuccess = notification.type === 'success';

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-4 fade-in duration-300">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
          isSuccess
            ? 'bg-[var(--sp-card)] border-[var(--sp-success)]/30'
            : 'bg-[var(--sp-card)] border-[var(--sp-danger)]/30'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600" />
        )}
        <span className={`text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-[var(--sp-danger)]'}`}>
          {notification.message}
        </span>
        <button
          onClick={() => dispatch({ type: 'CLEAR_NOTIFICATION' })}
          className="ml-2 p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
