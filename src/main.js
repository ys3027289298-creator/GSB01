import './styles.css';
import { makeStore } from './state.js';
import { renderShell } from './shell.js';

const store = makeStore();

class HashRouter {
  constructor(onChange) {
    this.onChange = onChange;
    window.addEventListener('hashchange', () => this.onChange());
  }
  get route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = hash.split('?');
    return { path: path || 'home', params: Object.fromEntries(new URLSearchParams(query)) };
  }
  go(path, params) {
    let hash = `#/${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) hash += `?${qs}`;
    }
    location.hash = hash;
  }
}

function render() {
  renderShell(document.getElementById('app'), { store, router });
}

function renderUnlessTesting() {
  if (router.route.path === 'test') return;
  render();
}

const router = new HashRouter(render);
store.subscribe(() => renderUnlessTesting());

store.init().then(() => {
  if (!location.hash) location.hash = '#/home';
  render();
});
