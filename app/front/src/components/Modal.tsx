import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { IconButton } from './IconButton';

interface ModalProps {
  isOpen: boolean;
  title: string;
  closeLabel: string;
  children: ReactNode;
  panelClassName?: string;
  onClose: () => void;
}

export function Modal({
  isOpen,
  title,
  closeLabel,
  children,
  panelClassName = '',
  onClose,
}: ModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }

    if (!shouldRender) {
      return;
    }

    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={`modal-layer ${isClosing ? 'modal-layer--closing' : ''}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`modal-panel ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-panel__head">
          <h2>{title}</h2>
          <IconButton label={closeLabel} icon={<X size={16} />} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
