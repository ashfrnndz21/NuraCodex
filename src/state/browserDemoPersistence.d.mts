export type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function readBrowserDemoSnapshot<T extends { version: number; demoOnly: boolean }>(
  storage: BrowserStorage | null,
  key: string,
  fallback: T,
): { snapshot: T; warning: string | null };

export function writeBrowserDemoSnapshot(
  storage: BrowserStorage | null,
  key: string,
  snapshot: unknown,
): void;
