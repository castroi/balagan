import { createTnyLv } from './tny-lv.js';

/**
 * The shortening service, used by the server function (`api/shorten.ts`) to
 * make the link and by the app for its name and to recognise its links.
 * To switch services: write a provider like `tny-lv.ts` and change this line.
 *
 * Imports in the server's files end in `.js`: Vercel runs them as ES modules
 * without bundling, and Node needs the extension.
 */
export const createService = createTnyLv;
