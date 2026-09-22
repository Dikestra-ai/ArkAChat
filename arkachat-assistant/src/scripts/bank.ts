import type { Intent } from '../intent/types.js';
import type { AdelUser } from '../storage/users.js';

export type ScriptCategory = 'api' | 'cli' | 'dom' | 'memory';

export interface ScriptContext {
  rawQuery: string;
  user: AdelUser;
}

export interface Script {
  name: string;
  category: ScriptCategory;
  matches: (intent: Intent) => boolean;
  run: (intent: Intent, ctx: ScriptContext) => Promise<string>;
}

class ScriptsBank {
  private scripts: Script[] = [];

  register(script: Script): void {
    this.scripts.push(script);
  }

  find(intent: Intent): Script | null {
    return this.scripts.find((s) => s.matches(intent)) ?? null;
  }

  list(): readonly Script[] {
    return this.scripts;
  }
}

export const bank = new ScriptsBank();
