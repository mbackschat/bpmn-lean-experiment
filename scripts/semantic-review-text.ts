import { createHash } from "node:crypto";

export function sha256(value: string | Uint8Array): string {
  const hash = createHash("sha256");
  return typeof value === "string"
    ? hash.update(value, "utf8").digest("hex")
    : hash.update(value).digest("hex");
}

/** Provides a locale-independent total order over exact JavaScript strings. */
export function compareExactStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function exactSecondLevelSection(document: string, heading: string): string {
  const marker = `## ${heading}`;
  const lines = document.split("\n");
  const starts = lines.flatMap((line, index) => line === marker ? [index] : []);
  if (starts.length !== 1) {
    throw new Error(`${heading} heading must occur exactly once`);
  }
  const start = starts[0];
  if (start === undefined) {
    throw new Error(`${heading} heading is absent`);
  }
  const following = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  const end = following === -1 ? lines.length : following;
  return `${lines.slice(start, end).join("\n").trimEnd()}\n`;
}
