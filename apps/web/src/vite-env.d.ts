/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 基址，默认 /api/v1 */
  readonly VITE_API_BASE_URL?: string;
  /** 辅导会话 WebSocket 网关基址，默认与页面同源 */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}