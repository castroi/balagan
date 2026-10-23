import './styles.css';
import { App } from './app';
import { NEWER_VERSION_MESSAGE } from './platform/storage';
import { isImportHash } from './platform/share-codec';
import { confirmDialog, prepareAnnouncer, toast } from './ui/dialog';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

// Screen readers ignore a live region added late, so create it before any message.
prepareAnnouncer();
const app = new App(root);
app.showHome();
if (app.readOnly) toast(NEWER_VERSION_MESSAGE, undefined, 7000);

// Ask the browser not to evict saved words when space is low.
void navigator.storage?.persist?.().catch(() => undefined);

// Opened from a share link: offer to load its content, then clean the address bar.
async function handleShareLink() {
  const hash = window.location.hash;
  if (!isImportHash(hash)) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  // A question is already on screen (e.g. a second link arrived): don't stack another.
  if (document.querySelector('.overlay')) return;
  if (app.refuseIfReadOnly()) return;

  const result = app.readImport(hash);
  if ('error' in result) {
    toast(result.error, undefined, 6000);
    return;
  }
  const hasContent = Object.keys(app.data.assignments).length > 0;
  const unsaved = app.hasUnsavedChanges();
  if (hasContent || unsaved) {
    const question = unsaved
      ? 'התקבלו משימות חדשות, ויש שינויים שלא נשמרו. להחליף את התוכן של השבוע?'
      : 'התקבלו משימות חדשות. להחליף את התוכן של השבוע?';
    if (!(await confirmDialog(question, 'להחליף'))) return;
  }
  if (app.applyImport(result.entries) !== 'saved') return;
  app.showHome();
  toast('המשימות נטענו');
}
void handleShareLink();
// A link opened while the app is already open in this tab only changes the hash.
window.addEventListener('hashchange', () => void handleShareLink());

// Offline support. Network-first, so a new version loads automatically when online.
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
