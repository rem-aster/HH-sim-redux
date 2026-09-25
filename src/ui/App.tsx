import { useEffect, useRef } from 'preact/hooks';
import { clearPlots, nudge, recall, runOrStop, stim } from '../app/actions';
import { hideCursor, moveCursor } from '../app/cursor';
import { cursor, engine, mode, resetView, sidebarWidth, toast, zoomView } from '../app/store';
import { HelpDialog, helpOpen } from './HelpDialog';
import { Icon } from './icons';
import { ChannelsPanel } from './panels/ChannelsPanel';
import { DrugsPanel } from './panels/DrugsPanel';
import { MembranePanel } from './panels/MembranePanel';
import { StimuliPanel } from './panels/StimuliPanel';
import { VclampPanel } from './panels/VclampPanel';
import { PlotArea } from './PlotArea';
import { PanelToggles, Toolbar } from './Toolbar';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' || (e.key === '?' && !isTyping(e))) {
        e.preventDefault();
        helpOpen.value = true;
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || helpOpen.value) return;
      const cc = engine.mode === 'cc';
      let handled = true;
      switch (e.code) {
        case 'Digit1':
        case 'Numpad1':
          if (cc) stim(0);
          break;
        case 'Digit2':
        case 'Numpad2':
          if (cc) stim(1);
          break;
        case 'Space':
          if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
          if (cc && engine.running) engine.stop();
          else runOrStop();
          break;
        case 'KeyS':
          if (cc) nudge();
          break;
        case 'KeyC':
          clearPlots();
          break;
        case 'KeyR':
          if (cc) recall();
          break;
        case 'ArrowLeft':
          if (!cursor.value) return;
          moveCursor(e.shiftKey ? -2 : -1);
          break;
        case 'ArrowRight':
          if (!cursor.value) return;
          moveCursor(e.shiftKey ? 2 : 1);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          if (!cursor.value) return;
          moveCursor(0);
          break;
        case 'Escape':
          if (!cursor.value) return;
          hideCursor();
          break;
        case 'Equal':
        case 'NumpadAdd':
          zoomView(0.5);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          zoomView(2);
          break;
        case 'Digit0':
        case 'Numpad0':
          resetView();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Splitter() {
  const ref = useRef<HTMLDivElement>(null);
  const onDown = (e: PointerEvent) => {
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    const move = (ev: PointerEvent) => {
      sidebarWidth.value = Math.max(320, Math.min(720, startW - (ev.clientX - startX)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  return (
    <div
      class="splitter"
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина панели параметров"
      tabIndex={0}
      onPointerDown={(e) => onDown(e as unknown as PointerEvent)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') sidebarWidth.value = Math.min(720, sidebarWidth.value + 20);
        if (e.key === 'ArrowRight') sidebarWidth.value = Math.max(320, sidebarWidth.value - 20);
      }}
    />
  );
}

function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" role="status" key={t.id}>
      {t.text}
      <button type="button" class="btn btn-ghost btn-icon btn-xs" onClick={() => (toast.value = null)} aria-label="Закрыть">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function App() {
  useShortcuts();
  const m = mode.value;
  return (
    <div class="app" style={{ '--sidebar-w': `${sidebarWidth.value}px` }}>
      <Toolbar />
      <div class="workspace">
        <PlotArea />
        <Splitter />
        <aside class="sidebar" aria-label="Параметры модели">
          <PanelToggles />
          <div class="cards">
            {m === 'cc' ? <StimuliPanel /> : <VclampPanel />}
            <MembranePanel />
            <ChannelsPanel />
            <DrugsPanel />
          </div>
          <footer class="side-foot">
            HHsim 3.7 · веб-версия ·{' '}
            <a href="https://www.cs.cmu.edu/~dst/HHsim/" target="_blank" rel="noopener">
              оригинал
            </a>{' '}
            · GPL
          </footer>
        </aside>
      </div>
      <HelpDialog />
      <Toast />
    </div>
  );
}
