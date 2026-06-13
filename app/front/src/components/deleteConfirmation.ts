import { createContext, useContext } from 'react';

export type DeleteConfirmationRequest = {
  title: string;
  description: string;
};

export type DeleteConfirmationContextValue = {
  confirmDelete: (request: DeleteConfirmationRequest) => Promise<boolean>;
};

export const DeleteConfirmationContext = createContext<DeleteConfirmationContextValue | null>(null);

export function useConfirmDelete() {
  const context = useContext(DeleteConfirmationContext);
  if (!context) {
    throw new Error('useConfirmDelete must be used within DeleteConfirmationProvider');
  }
  return context.confirmDelete;
}
