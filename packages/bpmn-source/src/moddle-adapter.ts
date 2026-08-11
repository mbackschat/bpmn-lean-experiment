import { BpmnModdle } from "bpmn-moddle";

import configuredTaskModdle from "./bpmn-lean-configured-task-moddle.json" with {
  type: "json",
};

import {
  locateContainedElements,
  locatedElement,
} from "./admission-diagnostics.js";
import type { ElementLocus } from "./admission-diagnostics.js";
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type { BpmnSourceDiagnostic } from "./contracts.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

export type ImportedBpmnGraph = Readonly<{
  rootElement: unknown;
  warnings: ReadonlyArray<BpmnSourceDiagnostic>;
  /**
   * Every contained element with the containment path that locates it.
   *
   * Built here because normalizing a parser warning already needs it, and returned so that a
   * document-wide admission rule can consume it without walking the tree a second time.
   */
  located: ReadonlyMap<ElementRecord, ElementLocus>;
}>;

export async function importBpmnGraph(
  xml: string,
  deadlineMs: number,
): Promise<ImportedBpmnGraph> {
  const moddle = new BpmnModdle({ bpmnLean: configuredTaskModdle });
  const result = await withDeadline(
    () => moddle.fromXML(xml),
    deadlineMs,
    "bpmn-moddle import",
  );
  if (
    typeof result !== "object" ||
    result === null ||
    !("rootElement" in result) ||
    !("warnings" in result) ||
    !Array.isArray(result.warnings)
  ) {
    throw new TypeError("bpmn-moddle returned an invalid parse result");
  }
  const root = asElement(result.rootElement);
  const located = root === undefined
    ? new Map<ElementRecord, ElementLocus>()
    : locateContainedElements(root);
  return {
    rootElement: result.rootElement,
    warnings: result.warnings.map((warning) =>
      normalizeWarning(warning, located)
    ),
    located,
  };
}

/**
 * One parser warning as an admission diagnostic, located when the parser named an element.
 *
 * `bpmn-moddle` reports an unresolvable IDREF as `{ message, element, property, value }`, where
 * `element` is the *referring* element and is identical to the one in the parsed tree. Carrying that
 * through is what lets a file with four malformed references tell its author about four distinct
 * places rather than four sentences.
 *
 * The parser's own message is kept as the evidence rather than a derived one, because the parser
 * knows facts this contract does not model, such as which value failed to resolve. No capability is
 * reported: a warning is a malformed source, and no profile admits it.
 */
function normalizeWarning(
  warning: unknown,
  located: ReadonlyMap<ElementRecord, ElementLocus>,
): BpmnSourceDiagnostic {
  const reported = asElement(warning);
  const element = asElement(reported?.element);
  const locus = element === undefined ? undefined : located.get(element);
  return {
    code: BpmnSourceDiagnosticCode.ParserWarning,
    element: element === undefined || locus === undefined
      ? null
      : locatedElement(
        element,
        locus,
        typeof reported?.property === "string"
          ? localName(reported.property)
          : null,
        null,
      ),
    evidence: readMessage(warning, "bpmn-moddle reported an unspecified warning"),
  };
}

/**
 * The property name without the descriptor's namespace prefix.
 *
 * The parser reports `bpmndi:bpmnElement` where the moddle descriptor and every other rule in this
 * package name the same property `bpmnElement`. Reporting both spellings for one property would make
 * two diagnostics about the same defect look unrelated.
 */
function localName(property: string): string {
  const separator = property.indexOf(":");
  return separator < 0 ? property : property.slice(separator + 1);
}

export function readMessage(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return fallback;
}

/**
 * The warnings a failed import collected, followed by the failure itself.
 *
 * A failed import produced no tree, so nothing here can be located and every record carries no
 * element. The warnings are still reported one by one for the same reason a successful parse reports
 * them that way.
 */
export function parserFailureDiagnostics(
  error: unknown,
): ReadonlyArray<BpmnSourceDiagnostic> {
  const unlocated = new Map<ElementRecord, ElementLocus>();
  const warnings =
    typeof error === "object" &&
    error !== null &&
    "warnings" in error &&
    Array.isArray(error.warnings)
      ? error.warnings.map((warning) => normalizeWarning(warning, unlocated))
      : [];
  return [
    ...warnings,
    {
      code: BpmnSourceDiagnosticCode.ParserFailure,
      element: null,
      evidence: readMessage(error, "bpmn-moddle import failed."),
    },
  ];
}

function withDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operationName} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  const operationPromise = Promise.resolve().then(operation);
  return Promise.race([operationPromise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
