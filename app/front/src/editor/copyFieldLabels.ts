import type { Translator } from '../i18n';
import type { CopyFieldLabels } from './CopyField';

export function createCopyFieldLabels(t: Translator): CopyFieldLabels {
  return {
    defaultLabel: t('copy'),
    copiedLabel: t('copied'),
    fieldLabel: t('fieldLabel'),
    fieldValue: t('fieldValue'),
    fieldLabelPlaceholder: t('fieldLabelPlaceholder'),
    fieldValuePlaceholder: t('fieldValuePlaceholder'),
    fieldKind: t('fieldKind'),
    fieldKindText: t('fieldKindText'),
    fieldKindLogin: t('fieldKindLogin'),
    fieldKindPassword: t('fieldKindPassword'),
    fieldKindCredential: t('fieldKindCredential'),
    fieldKindToken: t('fieldKindToken'),
    fieldKindUrl: t('fieldKindUrl'),
    generatePassword: t('generatePassword'),
    copy: t('copy'),
  };
}
