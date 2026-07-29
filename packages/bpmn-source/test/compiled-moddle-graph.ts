/**
 * Test-side access to the package's compiled `bpmn-moddle` import.
 *
 * The adapter must run as built JavaScript because the package's contracts use
 * non-erasable syntax, and the module specifier stays non-literal so the
 * repository-wide no-emit gate never depends on build output. Both the loaded
 * module and the moddle object graph are therefore narrowed like any other
 * untrusted boundary; raw moddle objects stay inside this package.
 */
import type { ImportedBpmnGraph } from "../src/moddle-adapter.ts";

export type ModdleElement = Readonly<Record<string, unknown>>;

type ImportBpmnGraph = (
  xml: string,
  deadlineMs: number,
) => Promise<ImportedBpmnGraph>;

export async function importCompiledBpmnGraph(
  xml: string,
  deadlineMs: number,
): Promise<ImportedBpmnGraph> {
  const specifier = new URL("../dist/moddle-adapter.js", import.meta.url).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !("importBpmnGraph" in loaded) ||
    typeof loaded.importBpmnGraph !== "function"
  ) {
    throw new TypeError(
      "the compiled moddle adapter does not export importBpmnGraph",
    );
  }
  return (loaded.importBpmnGraph as ImportBpmnGraph)(xml, deadlineMs);
}

export function moddleElement(value: unknown, label: string): ModdleElement {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} is not a moddle element`);
  }
  return value as ModdleElement;
}

export function moddleElements(
  parent: ModdleElement,
  member: string,
): ReadonlyArray<ModdleElement> {
  const value = parent[member];
  if (!Array.isArray(value)) {
    throw new TypeError(`${member} is not a moddle element list`);
  }
  return value.map((entry, index) =>
    moddleElement(entry, `${member}[${index}]`),
  );
}

export function findModdleElement(
  elements: ReadonlyArray<ModdleElement>,
  member: string,
  expected: string,
): ModdleElement {
  const found = elements.find((element) => element[member] === expected);
  if (found === undefined) {
    throw new TypeError(`no moddle element has ${member} ${expected}`);
  }
  return found;
}
