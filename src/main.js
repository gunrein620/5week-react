// ── main.js ───────────────────────────────────────────────────────────────────
import { mount } from './framework/component.js';
import { App } from './components/App.js';

const appEl = document.getElementById('app');
mount(App, appEl);
