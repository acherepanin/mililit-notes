import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { IconButton } from './IconButton';
import type { ToastItem } from './useToasts';

const icons = {
  success: <CheckCircle2 size={16} />,
  error: <TriangleAlert size={16} />,
  info: <Info size={16} />,
};

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
        <div className={`toast toast--${toast.kind} ${toast.isClosing ? 'toast--closing' : ''}`} key={toast.id}>
          <span className="toast__icon">{icons[toast.kind]}</span>
          <span className="toast__message">{toast.message}</span>
          <IconButton label={closeLabel} icon={<X size={14} />} onClick={() => onDismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
