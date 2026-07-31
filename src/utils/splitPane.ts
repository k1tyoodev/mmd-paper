import type { WorkspaceMode } from '@/types/playground';

export type DividerKeyboardAction = { type: 'resize'; delta: number } | { type: 'restore' } | null;

export function resolveDividerKeyboardAction(
  key: string,
  shiftKey: boolean,
  workspaceMode: WorkspaceMode,
): DividerKeyboardAction {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return null;
  }

  if (workspaceMode === 'editor-hidden' || workspaceMode === 'preview-hidden') {
    return { type: 'restore' };
  }

  if (workspaceMode !== 'split') {
    return null;
  }

  const step = shiftKey ? 0.1 : 0.02;
  return {
    type: 'resize',
    delta: key === 'ArrowLeft' ? -step : step,
  };
}
