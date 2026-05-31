import type { Translator } from '../../i18n';

const FEATURE_HINT_KEYS = [
  'subscriptionHintWorkspace',
  'subscriptionHintPublicShare',
  'subscriptionHintTemplates',
  'subscriptionHintVersioning',
  'subscriptionHintCommands',
  'subscriptionHintExportImport',
  'subscriptionHintAi',
  'subscriptionHintFiles',
] as const;

const FEATURE_TITLE_KEYS = [
  'planFeatureWorkspace',
  'planFeaturePublicShare',
  'planFeatureTemplates',
  'planFeatureVersioning',
  'planFeatureCommands',
  'planFeatureExportImport',
  'planFeatureAi',
  'planFeatureFiles',
] as const;

export function buildSubscriptionFeatureGuide(t: Translator) {
  return (
    <span className="app-tooltip-rich subscription-feature-guide">
      <strong>{t('subscriptionHintIntro')}</strong>
      {FEATURE_HINT_KEYS.map((hintKey, index) => (
        <span key={hintKey}>
          <strong>{t(FEATURE_TITLE_KEYS[index])}:</strong> {t(hintKey)}
        </span>
      ))}
    </span>
  );
}
