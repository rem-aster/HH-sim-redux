import type { ComponentChildren } from 'preact';
import { openPanels, togglePanel, type PanelId } from '../app/store';
import { Icon } from './icons';

export function Card(p: {
  id: PanelId;
  title: string;
  accent: string;
  summary?: ComponentChildren;
  badge?: ComponentChildren;
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  const open = openPanels.value.includes(p.id);
  return (
    <section class={'card' + (open ? ' is-open' : '')} id={`panel-${p.id}`} style={{ '--card-accent': `var(${p.accent})` }}>
      <h2 class="card-head">
        <button type="button" class="card-toggle" aria-expanded={open} aria-controls={`panel-body-${p.id}`} onClick={() => togglePanel(p.id)}>
          <span class="card-dot" aria-hidden="true" />
          <span class="card-title">{p.title}</span>
          {p.badge}
          {!open && p.summary && <span class="card-summary">{p.summary}</span>}
          <Icon name="chevronDown" size={16} class="card-caret" />
        </button>
      </h2>
      {open && (
        <div class="card-body" id={`panel-body-${p.id}`}>
          {p.children}
          {p.actions && <div class="card-actions">{p.actions}</div>}
        </div>
      )}
    </section>
  );
}
