/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Stickify API, set at build time. */
  readonly VITE_API_BASE?: string;
  /** Link to the source code shown in the footer. */
  readonly VITE_REPO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
