"use client";

import type { CurrentUser } from "./auth-boundary";
import { ClientProviders } from "./client-providers";
import { WorkspaceShell } from "./workspace-shell";

export function AuthenticatedWorkspace({
  onSignOut,
  onUserChanged,
  user,
}: {
  onSignOut(): Promise<void>;
  onUserChanged(): Promise<void>;
  user: CurrentUser;
}) {
  return (
    <ClientProviders>
      <WorkspaceShell
        currentUser={user}
        onSignOut={onSignOut}
        onUserChanged={onUserChanged}
      />
    </ClientProviders>
  );
}
