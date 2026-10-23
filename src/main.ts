import './styles.css';
import { App } from './app';
import { isImportHash } from './platform/share-codec';
import { confirmDialog, toast } from './ui/dialog';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

const app = new App(root);
app.showHome();

// Ask the browser not to evict saved words when space is low.
void navigator.storage?.persist?.().catch(() => undefined);

// Opened from a share link: offer to load its content, then clean the address bar.
async function handleShareLink() {
  const hash = window.location.hash;
  if (!isImportHash(hash)) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);

  const result = app.readImport(hash);
  if ('error' in result) {
    toast(result.error, undefined, 6000);
    return;
  }
  const hasContent = Object.keys(app.data.assignments).length > 0;
  const ok = hasContent
    ? await confirmDialog('התקבלו משימות חדשות. להחליף את התוכן של השבוע?', 'להחליף')
    : true;
  if (!ok) return;
  app.applyImport(result.entries);
  toast('המשימות נטענו');
  app.showHome();
}
void handleShareLink();

// Offline support. Network-first, so a new version loads automatically when online.
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
