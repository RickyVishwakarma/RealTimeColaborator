import { useState } from 'react';
import { TEMPLATES, type DocTemplate } from '../lib/templates';

interface Props {
  busy?: boolean;
  onCreate: (template: DocTemplate) => void;
  onClose: () => void;
}

export function NewDocDialog({ busy, onCreate, onClose }: Props) {
  const [selected, setSelected] = useState<string>('blank');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal new-doc-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New document</h2>
        <p className="muted">Pick a template to start from.</p>

        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`template-card${selected === t.id ? ' selected' : ''}`}
              onClick={() => setSelected(t.id)}
              type="button"
            >
              <strong>{t.name}</strong>
              <span className="muted">{t.description}</span>
            </button>
          ))}
        </div>

        <div className="row">
          <button
            onClick={() => {
              const tpl = TEMPLATES.find((t) => t.id === selected) ?? TEMPLATES[0];
              onCreate(tpl);
            }}
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
