import { isDeepStrictEqual } from "node:util";

import { ProcessCommandResultKind } from "@bpmn-lean/temporal-testkit";

import { TemporalCaseRelation } from "./pipeline-types.ts";
import type { TemporalCaseRelation as TemporalCaseRelationType } from "./pipeline-types.ts";

/** Verifies adapter-only terminal lifecycle evidence separately from semantic equality. */
export function verifyTemporalPostTerminalLifecycle(
  scenario: Readonly<{
    id: string;
    stimuli: ReadonlyArray<Readonly<{ commandId: string }>>;
  }>,
  relation: TemporalCaseRelationType,
  execution: Readonly<{
    interactionEvidence: Readonly<{
      postTerminalResult: PostTerminalResult;
    }>;
    receipt: unknown;
  }>,
): typeof ProcessCommandResultKind.ProcessClosed | null {
  const result = execution.interactionEvidence.postTerminalResult;
  switch (relation) {
    case TemporalCaseRelation.ExactSemantic:
      if (result !== null) {
        throw new Error(
          `Temporal returned an unexpected post-terminal result for ${scenario.id}`,
        );
      }
      return null;
    case TemporalCaseRelation.PostTerminalClosed:
      requireClosedResult(result, scenario.stimuli.at(-1)?.commandId ?? null);
      return ProcessCommandResultKind.ProcessClosed;
    case TemporalCaseRelation.ExactSemanticWithClosedReceipt: {
      const commandId = scenario.stimuli.at(-1)?.commandId ?? null;
      requireClosedResult(
        result,
        commandId === null ? null : `${commandId}-after-close`,
      );
      if (
        result?.kind !== ProcessCommandResultKind.ProcessClosed ||
        execution.receipt === null ||
        !isDeepStrictEqual(result.receipt, execution.receipt)
      ) {
        throw new Error(
          `Temporal did not retain the terminal receipt for ${scenario.id}`,
        );
      }
      return ProcessCommandResultKind.ProcessClosed;
    }
  }
}

function requireClosedResult(
  result: PostTerminalResult,
  commandId: string | null,
): void {
  if (
    commandId === null ||
    result?.kind !== ProcessCommandResultKind.ProcessClosed ||
    result.commandId !== commandId
  ) {
    throw new Error(
      `Temporal did not classify ${commandId ?? "the required command"} as processClosed`,
    );
  }
}

type PostTerminalResult = Readonly<{
  kind: ProcessCommandResultKind;
  commandId: string;
  receipt?: unknown;
}> | null;
