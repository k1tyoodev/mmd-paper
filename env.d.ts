/// <reference types="vite-plus/client" />

interface ImportMetaEnv {
  readonly VITE_VERCEL_ANALYTICS?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
