import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/** Type of event for streaming. */
export interface StreamEvent {
  type: 'thinking' | 'planning' | 'executing' | 'progress' | 'result' | 'error';
  agentId: string;
  message: string;
  timestamp: string;
  progress?: number;
}

/**
 * StreamManager emits events during planning/execution
 * and can export them to a file.
 */
export class StreamManager {
  private emitter = new EventEmitter();
  private events: StreamEvent[] = [];

  on(eventType: StreamEvent['type'], listener: (e: StreamEvent) => void) {
    this.emitter.on(eventType, listener);
  }

  emit(event: StreamEvent) {
    this.events.push(event);
    this.emitter.emit(event.type, event);
  }

  /** Export recorded events to a JSON file. */
  async exportEvents(agentId: string): Promise<string> {
    const dir = path.join(os.homedir(), '.nikcli', 'streams');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${agentId}-stream.json`);
    await fs.writeFile(file, JSON.stringify(this.events, null, 2), 'utf-8');
    return file;
  }
}
