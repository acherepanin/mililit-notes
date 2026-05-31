import { useState, type ReactNode } from 'react';
import {
  ArrowDownUp,
  Bot,
  Eye,
  EyeOff,
  Folder,
  HardDrive,
  History,
  LayoutTemplate,
  Link2,
  NotebookPen,
  Power,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';

import { CustomSelect } from './CustomSelect';
import { IconButton } from './IconButton';
import { IconPopover } from './IconPopover';
import { IntegrationField, IntegrationFieldLabel } from './IntegrationField';
import type { Translator } from '../i18n';
import type { FeatureToggle, PlanEntitlements } from '../types';

interface PlanEditorFeatureIconsProps {
  draft: {
    entitlements: PlanEntitlements;
    isActive: boolean;
    isHidden: boolean;
  };
  editingId?: number | null;
  isFreePlan?: boolean;
  modelOptions: Array<{ value: string; label: string }>;
  t: Translator;
  onChange: (patch: {
    entitlements?: PlanEntitlements;
    isActive?: boolean;
    isHidden?: boolean;
  }) => void;
  onDelete?: () => void;
}

function bytesToGb(bytes: number | null): string {
  if (bytes == null) {
    return '';
  }
  return (bytes / 1024 ** 3).toFixed(1);
}

function gbToBytes(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 1024 ** 3);
}

function bytesToMb(bytes: number | null): string {
  if (bytes == null) {
    return '';
  }
  return (bytes / 1024 ** 2).toFixed(1);
}

function mbToBytes(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 1024 ** 2);
}

function patchEntitlements(
  draft: PlanEditorFeatureIconsProps['draft'],
  onChange: PlanEditorFeatureIconsProps['onChange'],
  entitlements: PlanEntitlements,
) {
  onChange({ entitlements });
}

function patchToggle(
  draft: PlanEditorFeatureIconsProps['draft'],
  onChange: PlanEditorFeatureIconsProps['onChange'],
  key: keyof Pick<
    PlanEntitlements,
    'publicShare' | 'templates' | 'versioning' | 'commands' | 'exportImport'
  >,
  enabled: boolean,
) {
  patchEntitlements(draft, onChange, {
    ...draft.entitlements,
    [key]: { enabled } satisfies FeatureToggle,
  });
}

function PlanEditorIconGroup({ children }: { children: ReactNode }) {
  return <div className="admin-plan-editor-icons__group">{children}</div>;
}

export function PlanEditorFeatureIcons({
  draft,
  editingId = null,
  isFreePlan = false,
  modelOptions,
  t,
  onChange,
  onDelete,
}: PlanEditorFeatureIconsProps) {
  const { entitlements } = draft;
  const [workspacePopoverOpen, setWorkspacePopoverOpen] = useState(false);
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const [filesPopoverOpen, setFilesPopoverOpen] = useState(false);

  return (
    <div className="admin-plan-editor-icons">
      <PlanEditorIconGroup>
        {entitlements.workspace.enabled ? (
          <IconPopover
            active
            icon={<NotebookPen size={15} aria-hidden />}
            label={t('planWorkspaceOn')}
            open={workspacePopoverOpen}
            panelClassName="admin-plan-popover"
            tooltip={t('planWorkspaceSettingsHint')}
            onDisableWhenClosed={() => {
              setWorkspacePopoverOpen(false);
              patchEntitlements(draft, onChange, {
                ...entitlements,
                workspace: { ...entitlements.workspace, enabled: false },
              });
            }}
            onOpenChange={setWorkspacePopoverOpen}
          >
            <div className="admin-plan-popover__fields">
              <IntegrationField
                icon={<NotebookPen size={13} />}
                label={t('planMaxNotes')}
                labelTooltip={t('planMaxNotesHint')}
                wide
              >
                <input
                  className="admin-plan-tile__control-input"
                  type="number"
                  min={0}
                  step={1}
                  value={entitlements.workspace.maxNotes ?? ''}
                  onChange={(event) =>
                    patchEntitlements(draft, onChange, {
                      ...entitlements,
                      workspace: {
                        ...entitlements.workspace,
                        maxNotes: event.target.value ? Number(event.target.value) : null,
                      },
                    })
                  }
                  placeholder={t('planMaxNotesPlaceholder')}
                />
              </IntegrationField>
              <IntegrationField
                icon={<NotebookPen size={13} />}
                label={t('planMaxNoteSizeMb')}
                labelTooltip={t('planMaxNoteSizeMbHint')}
                wide
              >
                <input
                  className="admin-plan-tile__control-input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={bytesToMb(entitlements.workspace.maxNoteContentBytes)}
                  onChange={(event) =>
                    patchEntitlements(draft, onChange, {
                      ...entitlements,
                      workspace: {
                        ...entitlements.workspace,
                        maxNoteContentBytes: mbToBytes(event.target.value),
                      },
                    })
                  }
                  placeholder={t('planMaxNoteSizeMbPlaceholder')}
                />
              </IntegrationField>
            </div>
          </IconPopover>
        ) : (
          <IconButton
            label={t('planWorkspaceOn')}
            icon={<NotebookPen size={15} aria-hidden />}
            onClick={() => {
              patchEntitlements(draft, onChange, {
                ...entitlements,
                workspace: { ...entitlements.workspace, enabled: true },
              });
              setWorkspacePopoverOpen(true);
            }}
          />
        )}
      </PlanEditorIconGroup>

      <PlanEditorIconGroup>
        <IconButton
          label={t('planPublicShareOn')}
          icon={<Link2 size={15} aria-hidden />}
          variant={entitlements.publicShare.enabled ? 'active' : 'plain'}
          onClick={() =>
            patchToggle(draft, onChange, 'publicShare', !entitlements.publicShare.enabled)
          }
        />

        <IconButton
          label={t('planTemplatesOn')}
          icon={<LayoutTemplate size={15} aria-hidden />}
          variant={entitlements.templates.enabled ? 'active' : 'plain'}
          onClick={() => patchToggle(draft, onChange, 'templates', !entitlements.templates.enabled)}
        />

        <IconButton
          label={t('planVersioningOn')}
          icon={<History size={15} aria-hidden />}
          variant={entitlements.versioning.enabled ? 'active' : 'plain'}
          onClick={() =>
            patchToggle(draft, onChange, 'versioning', !entitlements.versioning.enabled)
          }
        />
      </PlanEditorIconGroup>

      <PlanEditorIconGroup>
        <IconButton
          label={t('planCommandsOn')}
          icon={<Terminal size={15} aria-hidden />}
          variant={entitlements.commands.enabled ? 'active' : 'plain'}
          onClick={() => patchToggle(draft, onChange, 'commands', !entitlements.commands.enabled)}
        />

        <IconButton
          label={t('planExportImportOn')}
          icon={<ArrowDownUp size={15} aria-hidden />}
          variant={entitlements.exportImport.enabled ? 'active' : 'plain'}
          onClick={() =>
            patchToggle(draft, onChange, 'exportImport', !entitlements.exportImport.enabled)
          }
        />
      </PlanEditorIconGroup>

      <PlanEditorIconGroup>
        {entitlements.ai.enabled ? (
          <IconPopover
            active
            icon={<Bot size={15} aria-hidden />}
            label={t('planAiOn')}
            open={aiPopoverOpen}
            panelClassName="admin-plan-popover"
            tooltip={t('planAiSettingsHint')}
            onDisableWhenClosed={() => {
              setAiPopoverOpen(false);
              patchEntitlements(draft, onChange, {
                ...entitlements,
                ai: { ...entitlements.ai, enabled: false },
              });
            }}
            onOpenChange={setAiPopoverOpen}
          >
            <div className="admin-plan-popover__fields">
              <IntegrationField
                icon={<Sparkles size={13} />}
                label={t('planAiTokenLimit')}
                labelTooltip={t('planAiTokenLimitHint')}
                wide
              >
                <input
                  className="admin-plan-tile__control-input"
                  type="number"
                  min={0}
                  step={1000}
                  value={entitlements.ai.monthlyTokenLimit ?? ''}
                  onChange={(event) =>
                    patchEntitlements(draft, onChange, {
                      ...entitlements,
                      ai: {
                        ...entitlements.ai,
                        monthlyTokenLimit: event.target.value ? Number(event.target.value) : null,
                      },
                    })
                  }
                  placeholder={t('planAiTokenLimitPlaceholder')}
                />
              </IntegrationField>
              <div className="admin-integration-field admin-integration-field--wide">
                <IntegrationFieldLabel
                  label={t('planAiDefaultModel')}
                  labelTooltip={t('planAiDefaultModelHint')}
                />
                {modelOptions.length > 0 ? (
                  <CustomSelect
                    className="admin-plan-tile__control"
                    value={entitlements.ai.defaultModel ?? modelOptions[0]?.value ?? ''}
                    options={modelOptions}
                    label={t('planAiDefaultModel')}
                    onChange={(value) =>
                      patchEntitlements(draft, onChange, {
                        ...entitlements,
                        ai: { ...entitlements.ai, defaultModel: value || null },
                      })
                    }
                  />
                ) : (
                  <div className="admin-integration-input admin-plan-tile__control">
                    <Sparkles size={13} aria-hidden />
                    <input
                      className="admin-plan-tile__control-input"
                      value={entitlements.ai.defaultModel ?? ''}
                      onChange={(event) =>
                        patchEntitlements(draft, onChange, {
                          ...entitlements,
                          ai: {
                            ...entitlements.ai,
                            defaultModel: event.target.value.trim() || null,
                          },
                        })
                      }
                      placeholder={t('planAiDefaultModelPlaceholder')}
                    />
                  </div>
                )}
              </div>
            </div>
          </IconPopover>
        ) : (
          <IconButton
            label={t('planAiOn')}
            icon={<Bot size={15} aria-hidden />}
            onClick={() => {
              patchEntitlements(draft, onChange, {
                ...entitlements,
                ai: { ...entitlements.ai, enabled: true },
              });
              setAiPopoverOpen(true);
            }}
          />
        )}

        {entitlements.files.enabled ? (
          <IconPopover
            active
            icon={<Folder size={15} aria-hidden />}
            label={t('planFilesOn')}
            open={filesPopoverOpen}
            panelClassName="admin-plan-popover"
            tooltip={t('planFilesSettingsHint')}
            onDisableWhenClosed={() => {
              setFilesPopoverOpen(false);
              patchEntitlements(draft, onChange, {
                ...entitlements,
                files: { ...entitlements.files, enabled: false },
              });
            }}
            onOpenChange={setFilesPopoverOpen}
          >
            <div className="admin-plan-popover__fields">
              <IntegrationField
                icon={<HardDrive size={13} />}
                label={t('planStorageGb')}
                labelTooltip={t('planStorageGbHint')}
                wide
              >
                <input
                  className="admin-plan-tile__control-input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={bytesToGb(entitlements.files.storageLimitBytes)}
                  onChange={(event) =>
                    patchEntitlements(draft, onChange, {
                      ...entitlements,
                      files: {
                        ...entitlements.files,
                        storageLimitBytes: gbToBytes(event.target.value),
                      },
                    })
                  }
                  placeholder={t('planStorageGbPlaceholder')}
                />
              </IntegrationField>
            </div>
          </IconPopover>
        ) : (
          <IconButton
            label={t('planFilesOn')}
            icon={<Folder size={15} aria-hidden />}
            onClick={() => {
              patchEntitlements(draft, onChange, {
                ...entitlements,
                files: { ...entitlements.files, enabled: true },
              });
              setFilesPopoverOpen(true);
            }}
          />
        )}
      </PlanEditorIconGroup>

      {!isFreePlan ? (
        <PlanEditorIconGroup>
          <IconButton
            label={draft.isActive ? t('planDisablePurchase') : t('planEnablePurchase')}
            icon={<Power size={15} aria-hidden />}
            variant={draft.isActive ? 'active' : 'plain'}
            onClick={() => onChange({ isActive: !draft.isActive })}
          />

          <IconButton
            label={draft.isHidden ? t('planShowInPurchaseList') : t('planHideFromPurchaseList')}
            icon={draft.isHidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            variant={draft.isHidden ? 'active' : 'plain'}
            onClick={() => onChange({ isHidden: !draft.isHidden })}
          />

          {editingId && onDelete ? (
            <IconButton
              label={t('delete')}
              icon={<Trash2 size={15} aria-hidden />}
              variant="danger"
              onClick={onDelete}
            />
          ) : null}
        </PlanEditorIconGroup>
      ) : null}
    </div>
  );
}
