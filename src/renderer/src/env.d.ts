/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<string[]>
    }
  }
}
