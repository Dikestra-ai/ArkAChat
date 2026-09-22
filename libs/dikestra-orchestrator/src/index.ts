/**
 * @arkachat/dikestra-orchestrator
 *
 * Unified Gibraltar-Code orchestration layer for all ArkAChat services.
 *
 * Usage:
 *   import { createCoordinator, DikestTools } from '@arkachat/dikestra-orchestrator';
 *
 *   const coord = createCoordinator({ sessionName: 'web' });
 *   coord.setState('web.ready', { version: '1.0' });
 *
 *   // Read what the assistant last broadcast
 *   const pending = coord.getState('assistant.draft_pending');
 *
 *   // Gibraltar tools
 *   DikestTools.createTask(projectDir, { title: 'Fix auth', area: 'auth', dependencies: 'setup-001' });
 *   DikestTools.analyzeFile('/path/to/file.ts');
 */

export { createCoordinator } from './coordinator.js';
export type { CoordinatorOptions, DikestOrchestrator } from './coordinator.js';
export { DikestTools } from './tools/index.js';
export type { ToolCall, ToolResult, OrchestratorEvent } from './types.js';
