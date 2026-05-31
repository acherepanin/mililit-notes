import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { authApi } from '../../api';
import type { Translator } from '../../i18n';

interface VerifyEmailPageProps {
  t: Translator;
}

export function VerifyEmailPage({ t }: VerifyEmailPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <main className="auth-stage">
      <section className="auth-panel auth-panel--pending">
        <div className="auth-pending">
          {status === 'loading' ? (
            <>
              <Loader2 className="boot-spinner auth-pending__spinner" size={28} aria-hidden />
              <h1>{t('verifyEmailLoading')}</h1>
            </>
          ) : null}
          {status === 'success' ? (
            <>
              <CheckCircle2 size={28} aria-hidden />
              <h1>{t('verifyEmailSuccessTitle')}</h1>
              <p>{t('verifyEmailSuccessBody')}</p>
              <Link className="auth-link auth-link--solo" to="/login">
                {t('signIn')}
              </Link>
            </>
          ) : null}
          {status === 'error' ? (
            <>
              <XCircle size={28} aria-hidden />
              <h1>{t('verifyEmailErrorTitle')}</h1>
              <p>{t('verifyEmailErrorBody')}</p>
              <Link className="auth-link auth-link--solo" to="/register">
                {t('registerTitle')}
              </Link>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
