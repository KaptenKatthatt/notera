// Types for what the renderer finds on window but the DOM library does not declare.
interface Window {
  /** The API exposed by src/main/preload.js through contextBridge. */
  notera: any;
  /** Test hook read by the e2e suite (test/e2e). */
  __notera: any;
  /** Local Font Access API (Chromium). */
  queryLocalFonts?: () => Promise<Array<{ family: string }>>;
}
