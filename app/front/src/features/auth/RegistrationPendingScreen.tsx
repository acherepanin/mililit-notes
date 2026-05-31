import { Loader2, MailCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '../../api';
import type { Translator } from '../../i18n';

interface RegistrationPendingScreenProps {
  t: Translator;
  email: string;
  pendingId: number;
  onStatusChange: (status: 'pending' | 'verified' | 'expired' | 'not_found') => void;
}

export function RegistrationPendingScreen({
  t,
  email,
  pendingId,
  onStatusChange,
}: RegistrationPendingScreenProps) {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await authApi.getRegistrationPendingStatus(pendingId);
        if (cancelled) {
          return;
        }
        onStatusChange(result.status);
        if (result.status === 'verified') {
          navigate('/login', { replace: true, state: { emailConfirmed: true } });
        }
      } catch {
        if (!cancelled) {
          onStatusChange('not_found');
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [navigate, onStatusChange, pendingId]);

  return (
    <main className="auth-stage">
      <section className="auth-panel auth-panel--pending">
        <div className="auth-pending">
          <MailCheck size={28} aria-hidden />
          <h1>{t('registrationPendingTitle')}</h1>
          <p>{t('registrationPendingBody').replace('{email}', email)}</p>
          <p className="auth-pending__hint">{t('registrationPendingHint')}</p>
          <Loader2 className="boot-spinner auth-pending__spinner" size={22} aria-hidden />
        </div>
      </section>
    </main>
  );
}
