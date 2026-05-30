import { Trash2, Undo2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Translator } from '../i18n';
import { IconButton } from './IconButton';
import { Modal } from './Modal';

export const DELETE_CONFIRM_WORD = 'Delete';

export type DeleteConfirmationRequest = {
  title: string;
  description: string;
};

type DeleteConfirmationContextValue = {
  confirmDelete: (request: DeleteConfirmationRequest) => Promise<boolean>;
};

const DeleteConfirmationContext = createContext<DeleteConfirmationContextValue | null>(null);

export function DeleteConfirmationProvider({
  children,
  t,
}: {
  children: ReactNode;
  t: Translator;
}) {
  const [request, setRequest] = useState<DeleteConfirmationRequest | null>(null);
  const [typedWord, setTypedWord] = useState('');
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const inputId = useId();
  const descriptionId = useId();

  const confirmDelete = useCallback((nextRequest: DeleteConfirmationRequest) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setTypedWord('');
      setRequest(nextRequest);
    });
  }, []);

  const close = (confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
    setTypedWord('');
  };

  const canConfirm = typedWord === DELETE_CONFIRM_WORD;

  return (
    <DeleteConfirmationContext.Provider value={{ confirmDelete }}>
      {children}
      <DeleteConfirmationDialog
        canConfirm={canConfirm}
        descriptionId={descriptionId}
        inputId={inputId}
        isOpen={request !== null}
        request={request}
        t={t}
        typedWord={typedWord}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
        onTypedWordChange={setTypedWord}
      />
    </DeleteConfirmationContext.Provider>
  );
}

function DeleteConfirmationDialog({
  isOpen,
  request,
  t,
  typedWord,
  inputId,
  descriptionId,
  canConfirm,
  onTypedWordChange,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  request: DeleteConfirmationRequest | null;
  t: Translator;
  typedWord: string;
  inputId: string;
  descriptionId: string;
  canConfirm: boolean;
  onTypedWordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      title={request?.title ?? t('delete')}
      closeLabel={t('close')}
      panelClassName="modal-panel--confirm-delete"
      onClose={onCancel}
    >
      <div className="modal-form delete-confirm">
        <p id={descriptionId}>{request?.description}</p>
        <label className="delete-confirm__field" htmlFor={inputId}>
          <span>{t('deleteConfirmHint')}</span>
          <input
            id={inputId}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={typedWord}
            placeholder={DELETE_CONFIRM_WORD}
            aria-describedby={descriptionId}
            onChange={(event) => onTypedWordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm) {
                event.preventDefault();
                onConfirm();
              }
            }}
          />
        </label>
        <div className="modal-actions">
          <IconButton label={t('cancel')} icon={<Undo2 size={16} />} onClick={onCancel} />
          <IconButton
            label={t('delete')}
            icon={<Trash2 size={16} />}
            variant="danger"
            disabled={!canConfirm}
            onClick={onConfirm}
          />
        </div>
      </div>
    </Modal>
  );
}

export function useConfirmDelete() {
  const context = useContext(DeleteConfirmationContext);
  if (!context) {
    throw new Error('useConfirmDelete must be used within DeleteConfirmationProvider');
  }
  return context.confirmDelete;
}
