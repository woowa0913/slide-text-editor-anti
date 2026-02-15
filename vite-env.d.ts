/// <reference types="vite/client" />

// Augment the NodeJS namespace to include API_KEY in ProcessEnv
// This merges with the definition in @types/node if present
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
  }
}
