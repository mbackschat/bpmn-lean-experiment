import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type XmlElement = {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: XmlElement[];
};

type CandidateCounts = {
  callActivity: {
    occurrences: number;
    withCalledElement: number;
    withoutCalledElement: number;
  };
  eventSubProcess: {
    interruptingStarts: number;
    nonInterruptingStarts: number;
    occurrences: number;
    triggers: Record<string, number>;
  };
  intermediateThrowEvent: {
    occurrences: number;
    triggers: Record<string, number>;
  };
  multiInstance: {
    occurrences: number;
    parallel: number;
    sequential: number;
    withCompletionCondition: number;
    withLoopCardinality: number;
  };
  ordinarySubProcess: {
    occurrences: number;
  };
  receiveTask: {
    occurrences: number;
    instantiateTrue: number;
    withMessageRef: number;
    withOperationRef: number;
    withoutMessageRef: number;
  };
};

export type BpmnBreadthClassification = {
  structurallyMalformed: boolean;
  broad: Record<string, number>;
  candidates: CandidateCounts;
};

type CorpusMetric = {
  files: number;
  occurrences: number;
};

export type CibBpmnBreadthReport = {
  kind: "cibBpmnBreadthReport";
  corpusRoot: string;
  files: number;
  structurallyMalformedFiles: number;
  broad: Record<string, CorpusMetric>;
  candidates: Record<string, CorpusMetric>;
};

const broadElementNames = [
  "boundaryEvent",
  "businessRuleTask",
  "callActivity",
  "cancelEventDefinition",
  "compensateEventDefinition",
  "complexGateway",
  "conditionalEventDefinition",
  "errorEventDefinition",
  "eventBasedGateway",
  "escalationEventDefinition",
  "exclusiveGateway",
  "inclusiveGateway",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "linkEventDefinition",
  "manualTask",
  "messageEventDefinition",
  "multiInstanceLoopCharacteristics",
  "parallelGateway",
  "receiveTask",
  "scriptTask",
  "sendTask",
  "serviceTask",
  "signalEventDefinition",
  "subProcess",
  "terminateEventDefinition",
  "timerEventDefinition",
  "transaction",
  "userTask",
] as const;

const eventDefinitionTriggers = new Map<string, string>([
  ["cancelEventDefinition", "cancel"],
  ["compensateEventDefinition", "compensation"],
  ["conditionalEventDefinition", "conditional"],
  ["errorEventDefinition", "error"],
  ["escalationEventDefinition", "escalation"],
  ["linkEventDefinition", "link"],
  ["messageEventDefinition", "message"],
  ["signalEventDefinition", "signal"],
  ["terminateEventDefinition", "terminate"],
  ["timerEventDefinition", "timer"],
]);

const candidateMetricNames = [
  "callActivity.total",
  "callActivity.withCalledElement",
  "callActivity.withoutCalledElement",
  "eventSubProcess.interruptingStarts",
  "eventSubProcess.nonInterruptingStarts",
  "eventSubProcess.total",
  ...[...new Set(eventDefinitionTriggers.values())].map(
    (trigger) => `eventSubProcess.trigger.${trigger}`,
  ),
  "eventSubProcess.trigger.none",
  "intermediateThrowEvent.total",
  ...[...new Set(eventDefinitionTriggers.values())].map(
    (trigger) => `intermediateThrowEvent.trigger.${trigger}`,
  ),
  "intermediateThrowEvent.trigger.none",
  "multiInstance.parallel",
  "multiInstance.sequential",
  "multiInstance.total",
  "multiInstance.withCompletionCondition",
  "multiInstance.withLoopCardinality",
  "ordinarySubProcess.total",
  "receiveTask.instantiateTrue",
  "receiveTask.total",
  "receiveTask.withMessageRef",
  "receiveTask.withOperationRef",
  "receiveTask.withoutMessageRef",
] as const;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ?? path.resolve(
  projectRoot,
  "../oss",
);
const defaultCorpusRoot = path.join(
  externalRoot,
  "cibseven/cibseven/engine/src/test/resources/org/cibseven/bpm/engine/test/bpmn",
);

export function classifyBpmnXml(xml: string): BpmnBreadthClassification {
  const parsed = parseXmlElements(xml);
  const elements = flattenElements(parsed.roots);
  const broad: Record<string, number> = {};
  for (const name of broadElementNames) {
    const occurrences = elements.filter((element) => element.name === name).length;
    if (occurrences > 0) {
      broad[name] = occurrences;
    }
  }

  const subProcesses = elements.filter(
    (element) => element.name === "subProcess",
  );
  const eventSubProcesses = subProcesses.filter(
    (element) => element.attributes.triggeredByEvent === "true",
  );
  const receiveTasks = elements.filter(
    (element) => element.name === "receiveTask",
  );
  const multiInstances = elements.filter(
    (element) => element.name === "multiInstanceLoopCharacteristics",
  );
  const callActivities = elements.filter(
    (element) => element.name === "callActivity",
  );
  const throwEvents = elements.filter(
    (element) => element.name === "intermediateThrowEvent",
  );

  return {
    structurallyMalformed: parsed.structurallyMalformed,
    broad,
    candidates: {
      callActivity: {
        occurrences: callActivities.length,
        withCalledElement: countWhere(
          callActivities,
          (element) => element.attributes.calledElement !== undefined,
        ),
        withoutCalledElement: countWhere(
          callActivities,
          (element) => element.attributes.calledElement === undefined,
        ),
      },
      eventSubProcess: {
        interruptingStarts: countEventSubProcessStarts(
          eventSubProcesses,
          true,
        ),
        nonInterruptingStarts: countEventSubProcessStarts(
          eventSubProcesses,
          false,
        ),
        occurrences: eventSubProcesses.length,
        triggers: countEventSubProcessTriggers(eventSubProcesses),
      },
      intermediateThrowEvent: {
        occurrences: throwEvents.length,
        triggers: countEventTriggers(throwEvents),
      },
      multiInstance: {
        occurrences: multiInstances.length,
        parallel: countWhere(
          multiInstances,
          (element) => element.attributes.isSequential !== "true",
        ),
        sequential: countWhere(
          multiInstances,
          (element) => element.attributes.isSequential === "true",
        ),
        withCompletionCondition: countWhere(
          multiInstances,
          (element) => hasDirectChild(element, "completionCondition"),
        ),
        withLoopCardinality: countWhere(
          multiInstances,
          (element) => hasDirectChild(element, "loopCardinality"),
        ),
      },
      ordinarySubProcess: {
        occurrences: subProcesses.length - eventSubProcesses.length,
      },
      receiveTask: {
        occurrences: receiveTasks.length,
        instantiateTrue: countWhere(
          receiveTasks,
          (element) => element.attributes.instantiate === "true",
        ),
        withMessageRef: countWhere(
          receiveTasks,
          (element) => element.attributes.messageRef !== undefined,
        ),
        withOperationRef: countWhere(
          receiveTasks,
          (element) => element.attributes.operationRef !== undefined,
        ),
        withoutMessageRef: countWhere(
          receiveTasks,
          (element) => element.attributes.messageRef === undefined,
        ),
      },
    },
  };
}

export async function inventoryCibBpmnCorpus(
  corpusRoot: string,
): Promise<CibBpmnBreadthReport> {
  const files = await discoverBpmnFiles(corpusRoot);
  const broad = zeroMetrics(broadElementNames);
  const candidates = zeroMetrics(candidateMetricNames);
  let structurallyMalformedFiles = 0;

  for (const file of files) {
    let classification: BpmnBreadthClassification;
    try {
      classification = classifyBpmnXml(await readFile(file, "utf8"));
    } catch (error: unknown) {
      throw new TypeError(
        `cannot classify ${file}: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    if (classification.structurallyMalformed) {
      structurallyMalformedFiles += 1;
    }
    collectMetrics(broad, classification.broad);
    collectMetrics(candidates, flattenCandidateCounts(classification.candidates));
  }

  return {
    kind: "cibBpmnBreadthReport",
    corpusRoot,
    files: files.length,
    structurallyMalformedFiles,
    broad: sortRecord(broad),
    candidates: sortRecord(candidates),
  };
}

function parseXmlElements(xml: string): {
  roots: XmlElement[];
  structurallyMalformed: boolean;
} {
  const roots: XmlElement[] = [];
  const stack: XmlElement[] = [];
  let structurallyMalformed = false;
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) {
      break;
    }
    if (xml.startsWith("<!--", start)) {
      cursor = afterTerminator(xml, start + 4, "-->", "XML comment");
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      cursor = afterTerminator(xml, start + 9, "]]>", "CDATA section");
      continue;
    }
    if (xml.startsWith("<?", start)) {
      cursor = afterTerminator(
        xml,
        start + 2,
        "?>",
        "processing instruction",
      );
      continue;
    }

    const end = findMarkupEnd(xml, start + 1);
    const markup = xml.slice(start + 1, end).trim();
    cursor = end + 1;
    if (markup.length === 0 || markup.startsWith("!")) {
      continue;
    }
    if (markup.startsWith("/")) {
      const closingName = localName(markup.slice(1).trim());
      const matchingIndex = stack.findLastIndex(
        (element) => element.name === closingName,
      );
      if (matchingIndex < 0) {
        structurallyMalformed = true;
      } else {
        if (matchingIndex !== stack.length - 1) {
          structurallyMalformed = true;
        }
        stack.length = matchingIndex;
      }
      continue;
    }

    const selfClosing = markup.endsWith("/");
    const body = selfClosing ? markup.slice(0, -1).trim() : markup;
    const nameEnd = body.search(/\s/u);
    const qualifiedName = nameEnd < 0 ? body : body.slice(0, nameEnd);
    const attributeText = nameEnd < 0 ? "" : body.slice(nameEnd + 1);
    const element: XmlElement = {
      name: localName(qualifiedName),
      attributes: parseAttributes(attributeText),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent === undefined) {
      roots.push(element);
    } else {
      parent.children.push(element);
    }
    if (!selfClosing) {
      stack.push(element);
    }
  }

  if (stack.length > 0) {
    structurallyMalformed = true;
  }
  return { roots, structurallyMalformed };
}

function parseAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(["'])(.*?)\2/gsu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const value = match[3];
    if (name !== undefined && value !== undefined) {
      attributes[name] = value;
    }
  }
  return attributes;
}

function findMarkupEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (character === '"' || character === "'") {
      quote = quote === undefined ? character : quote === character ? undefined : quote;
    } else if (character === ">" && quote === undefined) {
      return index;
    }
  }
  throw new TypeError("unterminated XML markup");
}

function afterTerminator(
  xml: string,
  start: number,
  terminator: string,
  description: string,
): number {
  const end = xml.indexOf(terminator, start);
  if (end < 0) {
    throw new TypeError(`unterminated ${description}`);
  }
  return end + terminator.length;
}

function localName(qualifiedName: string): string {
  const separator = qualifiedName.lastIndexOf(":");
  return separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1);
}

function flattenElements(roots: readonly XmlElement[]): XmlElement[] {
  const flattened: XmlElement[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const element = pending.shift();
    if (element !== undefined) {
      flattened.push(element);
      pending.unshift(...element.children);
    }
  }
  return flattened;
}

function countWhere(
  elements: readonly XmlElement[],
  predicate: (element: XmlElement) => boolean,
): number {
  return elements.filter(predicate).length;
}

function hasDirectChild(element: XmlElement, name: string): boolean {
  return element.children.some((child) => child.name === name);
}

function countEventSubProcessTriggers(
  subProcesses: readonly XmlElement[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const subProcess of subProcesses) {
    const startEvents = subProcess.children.filter(
      (child) => child.name === "startEvent",
    );
    for (const startEvent of startEvents) {
      collectTriggerCounts(counts, startEvent);
    }
  }
  return sortRecord(counts);
}

function countEventSubProcessStarts(
  subProcesses: readonly XmlElement[],
  interrupting: boolean,
): number {
  return subProcesses.flatMap((subProcess) =>
    subProcess.children.filter((child) => child.name === "startEvent"),
  ).filter((startEvent) =>
    interrupting
      ? startEvent.attributes.isInterrupting !== "false"
      : startEvent.attributes.isInterrupting === "false",
  ).length;
}

function countEventTriggers(events: readonly XmlElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    collectTriggerCounts(counts, event);
  }
  return sortRecord(counts);
}

function collectTriggerCounts(
  counts: Record<string, number>,
  event: XmlElement,
): void {
  const triggers = event.children
    .map((child) => eventDefinitionTriggers.get(child.name))
    .filter((trigger): trigger is string => trigger !== undefined);
  if (triggers.length === 0) {
    increment(counts, "none", 1);
    return;
  }
  for (const trigger of triggers) {
    increment(counts, trigger, 1);
  }
}

async function discoverBpmnFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverBpmnFiles(target)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".bpmn") || entry.name.endsWith(".bpmn20.xml"))
    ) {
      files.push(target);
    }
  }
  return files;
}

function flattenCandidateCounts(candidates: CandidateCounts): Record<string, number> {
  const flattened: Record<string, number> = {
    "callActivity.total": candidates.callActivity.occurrences,
    "callActivity.withCalledElement": candidates.callActivity.withCalledElement,
    "callActivity.withoutCalledElement":
      candidates.callActivity.withoutCalledElement,
    "eventSubProcess.interruptingStarts":
      candidates.eventSubProcess.interruptingStarts,
    "eventSubProcess.nonInterruptingStarts":
      candidates.eventSubProcess.nonInterruptingStarts,
    "eventSubProcess.total": candidates.eventSubProcess.occurrences,
    "intermediateThrowEvent.total": candidates.intermediateThrowEvent.occurrences,
    "multiInstance.parallel": candidates.multiInstance.parallel,
    "multiInstance.sequential": candidates.multiInstance.sequential,
    "multiInstance.total": candidates.multiInstance.occurrences,
    "multiInstance.withCompletionCondition":
      candidates.multiInstance.withCompletionCondition,
    "multiInstance.withLoopCardinality": candidates.multiInstance.withLoopCardinality,
    "ordinarySubProcess.total": candidates.ordinarySubProcess.occurrences,
    "receiveTask.instantiateTrue": candidates.receiveTask.instantiateTrue,
    "receiveTask.total": candidates.receiveTask.occurrences,
    "receiveTask.withMessageRef": candidates.receiveTask.withMessageRef,
    "receiveTask.withOperationRef": candidates.receiveTask.withOperationRef,
    "receiveTask.withoutMessageRef": candidates.receiveTask.withoutMessageRef,
  };
  for (const [trigger, count] of Object.entries(candidates.eventSubProcess.triggers)) {
    flattened[`eventSubProcess.trigger.${trigger}`] = count;
  }
  for (const [trigger, count] of Object.entries(
    candidates.intermediateThrowEvent.triggers,
  )) {
    flattened[`intermediateThrowEvent.trigger.${trigger}`] = count;
  }
  return flattened;
}

function collectMetrics(
  destination: Record<string, CorpusMetric>,
  counts: Readonly<Record<string, number>>,
): void {
  for (const [name, occurrences] of Object.entries(counts)) {
    if (occurrences === 0) {
      continue;
    }
    const metric = destination[name] ?? { files: 0, occurrences: 0 };
    metric.files += 1;
    metric.occurrences += occurrences;
    destination[name] = metric;
  }
}

function increment(
  counts: Record<string, number>,
  name: string,
  amount: number,
): void {
  counts[name] = (counts[name] ?? 0) + amount;
}

function zeroMetrics(names: readonly string[]): Record<string, CorpusMetric> {
  return Object.fromEntries(
    names.map((name) => [name, { files: 0, occurrences: 0 }]),
  );
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const [, , suppliedRoot, extra] = process.argv;
  if (extra !== undefined) {
    throw new TypeError(
      "usage: node scripts/cib-bpmn-breadth.ts [cib-bpmn-resource-root]",
    );
  }
  const corpusRoot = path.resolve(suppliedRoot ?? defaultCorpusRoot);
  if (suppliedRoot === undefined) {
    try {
      await access(corpusRoot);
    } catch {
      throw new Error(
        `pinned CIB Seven checkout is absent at ${corpusRoot}; run ./scripts/setup-external-sources.sh all`,
      );
    }
  }
  const report = await inventoryCibBpmnCorpus(corpusRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  await main();
}
