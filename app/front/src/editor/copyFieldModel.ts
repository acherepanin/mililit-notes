export type CopyFieldKind = 'text' | 'login' | 'password' | 'credential' | 'token' | 'url';

export interface CopyFieldKindLabels {
  fieldKind: string;
  fieldKindText: string;
  fieldKindLogin: string;
  fieldKindPassword: string;
  fieldKindCredential: string;
  fieldKindToken: string;
  fieldKindUrl: string;
}

export const copyFieldKinds: CopyFieldKind[] = ['text', 'login', 'password', 'credential', 'token', 'url'];

export function getKindLabel(labels: CopyFieldKindLabels, kind: CopyFieldKind): string {
  const labelsByKind: Record<CopyFieldKind, string> = {
    text: labels.fieldKindText,
    login: labels.fieldKindLogin,
    password: labels.fieldKindPassword,
    credential: labels.fieldKindCredential,
    token: labels.fieldKindToken,
    url: labels.fieldKindUrl,
  };

  return labelsByKind[kind];
}
