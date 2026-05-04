import { useCallback, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  ttl: number;
  isClosing?: boolean;
}

const toastExitMs = 180;
const maxVisibleToasts = 3;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((items) =>
      items.map((item) => (item.id === id ? { ...item, isClosing: true } : item)),
    );
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, toastExitMs);
  }, []);

  const pushToast = useCallback((kind: ToastKind, message: string, ttl = 3200) => {
    const id = crypto.randomUUID();
    const nextToast = { id, kind, message, ttl };

    setToasts((items) => {
      if (items.length < maxVisibleToasts) {
        return [...items, nextToast];
      }

      const toastToClose = items.find((item) => !item.isClosing) ?? items[0];

      window.setTimeout(() => {
        setToasts((current) => [
          ...current.filter((item) => item.id !== toastToClose.id).slice(-(maxVisibleToasts - 1)),
          nextToast,
        ]);
      }, toastExitMs);

      return items.map((item) =>
        item.id === toastToClose.id ? { ...item, isClosing: true } : item,
      );
    });
  }, []);

  return { toasts, pushToast, dismiss };
}
