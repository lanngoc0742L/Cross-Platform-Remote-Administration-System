export {};

declare global {
  interface Window {
    navigateTo: (path: string) => void;
    handleEncryptClick: (path: string) => void;
    handleExecuteClick: (path: string) => void;
    closeModal: () => void;
    handleSearch: () => void;
  }
}