import { Workflow } from 'lucide-react';

type PreviewEmptyStateProps = {
  onInsertExample: () => void;
};

export default function PreviewEmptyState(props: PreviewEmptyStateProps) {
  return (
    <div className="preview-empty-state">
      <Workflow
        size={20}
        strokeWidth={1.7}
        className="preview-empty-state-icon"
        aria-hidden="true"
      />
      <p className="preview-empty-state-title">No diagram yet</p>
      <p className="preview-empty-state-description">
        Paste Mermaid source in the editor, or start from the example.
      </p>
      <button type="button" className="preview-empty-state-action" onClick={props.onInsertExample}>
        Insert example
      </button>
    </div>
  );
}
