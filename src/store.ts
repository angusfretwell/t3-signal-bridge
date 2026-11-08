import { readFileSync } from "node:fs";
import { writeFileIn } from "./util.ts";

const maxEntries = 1000;

function load(file: string): [number, string][] {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export function openThreadStore(file: string) {
  const threads = new Map(load(file));

  return {
    threadFor: (signalTimestamp: number) => threads.get(signalTimestamp),
    remember: (signalTimestamp: number, threadId: string) => {
      threads.set(signalTimestamp, threadId);
      for (const oldest of threads.keys()) {
        if (threads.size <= maxEntries) break;
        threads.delete(oldest);
      }

      writeFileIn(file, JSON.stringify([...threads]));
    },
  };
}
