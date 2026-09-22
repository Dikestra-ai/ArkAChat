export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface OrchestratorEvent {
  key: string;
  value: unknown;
  timestamp: number;
}
