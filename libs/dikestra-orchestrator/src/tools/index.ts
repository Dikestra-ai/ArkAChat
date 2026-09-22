import { execSync } from 'child_process';
import type { ToolResult } from '../types.js';

const run = (cmd: string, cwd?: string): string =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], cwd }).trim();

export const DikestTools = {
  /** Gibraltar-Task: create a tracked task. */
  createTask(projectDir: string, args: {
    title: string; area: string; dependencies: string; priority?: string;
  }): ToolResult {
    const t = Date.now();
    try {
      const flags = [
        `--title "${args.title}"`,
        `--area ${args.area}`,
        `--dependencies "${args.dependencies}"`,
        args.priority ? `--priority ${args.priority}` : '',
      ].filter(Boolean).join(' ');
      const data = run(`gibraltar-task create ${flags}`, projectDir);
      return { ok: true, data, durationMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: String(err), durationMs: Date.now() - t };
    }
  },

  /** Gibraltar-Task: mark a task done. */
  doneTask(projectDir: string, id: string): ToolResult {
    const t = Date.now();
    try {
      const data = run(`gibraltar-task update status ${id} done`, projectDir);
      return { ok: true, data, durationMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: String(err), durationMs: Date.now() - t };
    }
  },

  /** Gibraltar-Flow: return the call-graph / structure of a source file. */
  analyzeFile(filePath: string): ToolResult {
    const t = Date.now();
    try {
      const data = run(`gibraltar-flow analyze ${filePath}`);
      return { ok: true, data, durationMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: String(err), durationMs: Date.now() - t };
    }
  },

  /** Gibraltar-Api: parse an OpenAPI / GraphQL / proto spec → Markdown. */
  parseApiSpec(specPath: string, outputPath?: string): ToolResult {
    const t = Date.now();
    try {
      const out = outputPath ? `--output ${outputPath}` : '';
      const data = run(`gibraltar-api ${specPath} ${out}`);
      return { ok: true, data, durationMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: String(err), durationMs: Date.now() - t };
    }
  },
};
