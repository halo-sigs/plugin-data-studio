/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

import type { DefineComponent } from 'vue';

declare module 'vue' {
  export interface GlobalComponents {
    // FormKit is registered globally by the Halo console at runtime.
    FormKit: DefineComponent<Record<string, unknown>>;
  }
}
