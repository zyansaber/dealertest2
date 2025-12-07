export {};

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: File | Blob | string,
        langs: string,
        options?: {
          langPath?: string;
          logger?: (message: { status: string; progress?: number }) => void;
        }
      ) => Promise<{ data?: { text?: string; confidence?: number } }>;
    };
  }
}
