import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Locks that no testkit call of the named client publication observers reads with a single shot.
 *
 * The production publication clients return the transient `unavailable` arm when a Query misses its
 * 5 s deadline (TD-001 Query loss, widened by host load), so a one-shot read asserts that no Query was
 * lost instead of the property the test is about. Raw `handle.query` reads, which never yield that arm,
 * and other observers' `status` arms are outside this scan. The shared reader (`readPublicationUntilAnswered`) is the only sanctioned call
 * path; this scan is lexical because the property is "this call sits inside that call's arguments".
 * It covers both testkit directories because the harness in `src` makes the same reads for hosted
 * tests; the reader module itself is the one file that may not be scanned against itself.
 */
const observers = [
  "observeTemporalExecutionPublication",
  "observeTemporalFlowNodeOccurrences",
  "observeWorkflowPublicationSegment",
  "observeEngineProcessExecution",
  "observeEngineProcessFlowNodeOccurrences",
] as const;
const reader = "readPublicationUntilAnswered";
const readerModule = "src/publication-read-retry.ts";

/**
 * Files whose observer calls deliberately stay single-shot because the test asserts the
 * `unavailable` arm itself. Each entry names the exact number of such calls and the oracle that
 * needs the raw arm; an entry that no longer matches its file fails, so it cannot go stale.
 */
const deliberateUnavailableReads: ReadonlyMap<
  string,
  Readonly<{ unroutedCalls: number; reason: string }>
> = new Map();

type UnroutedCall = Readonly<{ line: number; observer: string }>;

/** Blanks comments, string contents and template text, keeping offsets and line breaks. */
function blankNonCode(source: string): string {
  const characters = source.split("");
  let index = 0;
  const blank = (from: number, to: number): void => {
    for (let at = from; at < to; at += 1) if (characters[at] !== "\n") characters[at] = " ";
  };
  const scanQuoted = (quote: string): void => {
    const start = index;
    index += 1;
    while (index < characters.length && characters[index] !== "\n") {
      if (characters[index] === "\\") index += 1;
      else if (characters[index] === quote) break;
      index += 1;
    }
    blank(start + 1, Math.min(index, characters.length));
    index += 1;
  };
  const scanTemplate = (): void => {
    let textStart = index;
    while (index < characters.length) {
      if (characters[index] === "\\") {
        index += 2;
      } else if (characters[index] === "`") {
        blank(textStart, index);
        index += 1;
        return;
      } else if (characters[index] === "$" && characters[index + 1] === "{") {
        blank(textStart, index + 2);
        index += 2;
        scanCode(true);
        textStart = index;
      } else {
        index += 1;
      }
    }
    throw new Error("unterminated template literal");
  };
  const scanCode = (insideSubstitution: boolean): void => {
    let depth = 0;
    while (index < characters.length) {
      const current = characters[index];
      const next = characters[index + 1];
      if (current === "/" && next === "/") {
        const end = source.indexOf("\n", index);
        const stop = end < 0 ? characters.length : end;
        blank(index, stop);
        index = stop;
      } else if (current === "/" && next === "*") {
        const end = source.indexOf("*/", index + 2);
        if (end < 0) throw new Error("unterminated block comment");
        blank(index, end + 2);
        index = end + 2;
      } else if (current === "'" || current === '"') {
        scanQuoted(current);
      } else if (current === "`") {
        index += 1;
        scanTemplate();
      } else if (insideSubstitution && current === "}" && depth === 0) {
        index += 1;
        return;
      } else {
        if (current === "{") depth += 1;
        if (current === "}") depth -= 1;
        index += 1;
      }
    }
    if (insideSubstitution) throw new Error("unterminated template substitution");
  };
  scanCode(false);
  return characters.join("");
}

/** Observer calls that are not lexically inside the arguments of a reader call. */
function unroutedObserverCalls(source: string): ReadonlyArray<UnroutedCall> {
  const code = blankNonCode(source);
  const openCallees: string[] = [];
  const unrouted: UnroutedCall[] = [];
  for (const match of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(|\(|\)/gu)) {
    const callee = match[1];
    if (match[0] === ")") {
      openCallees.pop();
      continue;
    }
    if (
      callee !== undefined &&
      (observers as ReadonlyArray<string>).includes(callee) &&
      !openCallees.includes(reader)
    ) {
      unrouted.push({
        line: code.slice(0, match.index).split("\n").length,
        observer: callee,
      });
    }
    openCallees.push(callee ?? "");
  }
  return unrouted;
}

function observerCallCount(source: string): number {
  const callee = /([A-Za-z_$][\w$]*)\s*\(/gu;
  return [...blankNonCode(source).matchAll(callee)]
    .filter((match) => (observers as ReadonlyArray<string>).includes(match[1] ?? "")).length;
}

const testkitRoot = new URL("../", import.meta.url);
const testSources = ["test", "src"]
  .flatMap((directory) => readdirSync(new URL(`${directory}/`, testkitRoot))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `${directory}/${name}`))
  .filter((name) => name !== readerModule)
  .map((name) => ({ name, source: readFileSync(new URL(name, testkitRoot), "utf8") }));

test("every hosted publication observer call is routed through the shared reader", () => {
  const violations = testSources.flatMap(({ name, source }) => {
    const unrouted = unroutedObserverCalls(source);
    const deliberate = deliberateUnavailableReads.get(name)?.unroutedCalls ?? 0;
    return unrouted.length === deliberate
      ? []
      : unrouted.map(({ line, observer }) => `${name}:${line} calls ${observer} outside ${reader}`);
  });
  assert.deepEqual(violations, []);
});

test("deliberate single-shot reads are listed only for files that still contain them", () => {
  for (const [name, entry] of deliberateUnavailableReads) {
    const found = testSources.find((candidate) => candidate.name === name);
    assert.ok(found !== undefined, `${name} no longer exists`);
    assert.ok(entry.reason.length > 0);
    assert.equal(unroutedObserverCalls(found.source).length, entry.unroutedCalls, name);
  }
});

test("the one unscanned module is the reader's own definition", () => {
  const source = readFileSync(new URL(readerModule, testkitRoot), "utf8");
  assert.match(source, new RegExp(`export async function ${reader}\\b`, "u"));
  assert.equal(testSources.some(({ name }) => name === readerModule), false);
});

test("the scan sees the observer calls it is meant to guard", () => {
  const total = testSources.reduce((sum, { source }) => sum + observerCallCount(source), 0);
  assert.ok(total >= 10, `expected the hosted tests' observer calls, found ${total}`);
});

test("flags a direct call and accepts calls inside the reader, in either form", () => {
  const direct = "const r = await observeTemporalExecutionPublication(client, id, who, { afterRevision });\n";
  assert.deepEqual(unroutedObserverCalls(direct), [
    { line: 1, observer: "observeTemporalExecutionPublication" },
  ]);
  const routed = [
    `const [e1, e2] = await Promise.all([`,
    `  ${reader}("E1", () => observeTemporalExecutionPublication(client, id, who, { afterRevision })),`,
    `  ${reader}("E2", async () => {`,
    `    return observeTemporalFlowNodeOccurrences(client, id, who, { afterRevision: \`\${a(1)}\` });`,
    `  }),`,
    `]);`,
  ].join("\n");
  assert.deepEqual(unroutedObserverCalls(routed), []);
});

test("flags an observer call that follows a reader call or hides in a sibling argument", () => {
  const sibling = [
    `${reader}("E1", () => 1);`,
    `foo(${reader}("E2", () => 2), observeTemporalFlowNodeOccurrences(client, id, who, request));`,
  ].join("\n");
  assert.deepEqual(unroutedObserverCalls(sibling), [
    { line: 2, observer: "observeTemporalFlowNodeOccurrences" },
  ]);
});

test("ignores observer names in comments, strings, imports and template text", () => {
  const inert = [
    `import { observeTemporalExecutionPublication } from "@bpmn-lean/temporal-testkit";`,
    `// observeTemporalExecutionPublication(client)`,
    `/* observeWorkflowPublicationSegment(client) */`,
    `const a = "observeTemporalFlowNodeOccurrences(client)";`,
    "const b = `observeTemporalExecutionPublication(client) ${1 + 1}`;",
  ].join("\n");
  assert.deepEqual(unroutedObserverCalls(inert), []);
  assert.equal(blankNonCode(inert).length, inert.length);
});

test("refuses to guess when the source cannot be lexed", () => {
  assert.throws(() => blankNonCode("const a = `open"), /unterminated template literal/u);
  assert.throws(() => blankNonCode("/* open"), /unterminated block comment/u);
});
