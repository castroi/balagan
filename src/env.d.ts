/** Injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

/** Set by Vite: PROD is true in `vite build`, false in `vite dev`. */
interface ImportMeta {
  readonly env: { readonly PROD: boolean; readonly DEV: boolean };
}

/** CSS files are bundled by Vite. */
declare module '*.css';
