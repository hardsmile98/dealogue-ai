/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL backend-API, например http://localhost:3000. Если не задан — включается демо-режим. */
  readonly VITE_API_URL?: string
}
