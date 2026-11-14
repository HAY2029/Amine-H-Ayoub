/// <reference types="vite/client" />

// وحدة افتراضية يولّدها إعداد Vite: أسماء صور صفحات المصحف دون استيراد الصور.
declare module "virtual:quran-page-files" {
  const fileNames: string[];
  export default fileNames;
}

declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: Error) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
