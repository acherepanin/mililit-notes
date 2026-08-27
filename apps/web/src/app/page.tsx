"use client";

import dynamic from "next/dynamic";

import { AuthBoundary } from "./auth-boundary";

const AuthenticatedWorkspace = dynamic(
  () =>
    import("./authenticated-workspace").then(
      (module) => module.AuthenticatedWorkspace,
    ),
  {
    loading: () => (
      <main className="auth-shell auth-shell--loading" aria-busy="true" />
    ),
    ssr: false,
  },
);

export default function Home() {
  return (
    <AuthBoundary>
      {(user, signOut, refreshUser) => (
        <AuthenticatedWorkspace
          onSignOut={signOut}
          onUserChanged={refreshUser}
          user={user}
        />
      )}
    </AuthBoundary>
  );
}
