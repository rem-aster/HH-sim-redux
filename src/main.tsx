import { render } from 'preact';
import { startLoop } from './app/store';
import { initTheme } from './app/theme';
import { App } from './ui/App';
import './styles.css';

initTheme();
render(<App />, document.getElementById('app')!);
startLoop();
