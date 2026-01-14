export interface LoginResponse {
  token: string;
  expires_in: number;
}

export interface SessionInfo {
  id: string;
  created_at: string;
}

export interface WSMessage {
  type: 'input' | 'output' | 'resize' | 'ping' | 'pong';
  data: unknown;
}

export interface ResizeData {
  rows: number;
  cols: number;
}
