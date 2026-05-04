import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IconButton } from './IconButton';
import type { ToastItem } from './useToasts';

const icons = {
  success: <CheckCircle2 size={16} />,
  error: <TriangleAlert size={16} />,
  info: <Info size={16} />,
};

function ToastCard({
  toast,
  closeLabel,
  onDismiss,
}: {
  toast: ToastItem;
  closeLabel: string;
  onDismiss: (id: string) => void;
}) {
  const [progress, setProgress] = useState(1);
  const remainingMsRef = useRef(toast.ttl);
  const startedAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    startedAtRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const nextRemaining = Math.max(0, remainingMsRef.current - elapsed);
      setProgress(nextRemaining / toast.ttl);

      if (nextRemaining > 0 && !isPausedRef.current) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);
    timeoutRef.current = window.setTimeout(() => onDismiss(toast.id), remainingMsRef.current);
  }, [clearTimers, onDismiss, toast.id, toast.ttl]);

  const pauseTimers = () => {
    if (toast.isClosing || isPausedRef.current) {
      return;
    }

    const elapsed = performance.now() - startedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
    setProgress(remainingMsRef.current / toast.ttl);
    isPausedRef.current = true;
    clearTimers();
  };

  const resumeTimers = () => {
    if (toast.isClosing || !isPausedRef.current) {
      return;
    }

    isPausedRef.current = false;
    startTimers();
  };

  useEffect(() => {
    if (!toast.isClosing) {
      remainingMsRef.current = toast.ttl;
      setProgress(1);
      startTimers();
    }

    return clearTimers;
  }, [clearTimers, startTimers, toast.id, toast.isClosing, toast.ttl]);

  useEffect(() => {
    if (toast.isClosing) {
      clearTimers();
    }
  }, [clearTimers, toast.isClosing]);

  return (
    <div
      className={`toast toast--${toast.kind} ${toast.isClosing ? 'toast--closing' : ''}`}
      onPointerEnter={pauseTimers}
      onPointerLeave={resumeTimers}
    >
      <span className="toast__icon">{icons[toast.kind]}</span>
      <span className="toast__message">{toast.message}</span>
      <IconButton label={closeLabel} icon={<X size={13} />} onClick={() => onDismiss(toast.id)} />
      <span className="toast__progress" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

export function ToastHost({
  toasts,
  closeLabel,
  onDismiss,
}: {
  toasts: ToastItem[];
  closeLabel: string;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} closeLabel={closeLabel} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
