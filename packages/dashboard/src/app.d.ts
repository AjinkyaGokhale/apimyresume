// dashboard/src/app.d.ts
declare global {
  interface Window {
    __BOOTSTRAP__?: { apiKey: string; apiUrl: string };
  }
}

export {};
