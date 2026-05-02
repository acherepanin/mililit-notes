import { useCallback, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  isClosing?: boolean;
}

const toastExitMs = 180;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.map((item) => (item.id === id ? { ...item, isClosing: true } : item)));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, toastExitMs);
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string, ttl = 3200) => {
      const id = crypto.randomUUID();
      setToasts((items) => [...items, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  return { toasts, pushToast, dismiss };
}
