import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const maxEntries = 1000;

export class ThreadStore {
  private threads: Map<number, string>;

  constructor(private file: string) {
    this.threads = new Map(load(file));
  }

  threadFor = (signalTimestamp: number) => this.threads.get(signalTimestamp);

  remember(signalTimestamp: number, threadId: string) {
    this.threads.set(signalTimestamp, threadId);
    for (const oldest of this.threads.keys()) {
      if (this.threads.size <= maxEntries) break;
      this.threads.delete(oldest);
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.threads]));
  }
}

function load(file: string): [number, string][] {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
