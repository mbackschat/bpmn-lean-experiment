/** A command's verdict as Product 2 records it. */
import type { EngineCommandResult } from "@bpmn-lean/engine-api";

/** The kernel's outcome names (`failureName`, and `committed`). */
export type ProcessCommandOutcome = "committed" | "rolledBack" | "rejected" | "semanticFailure" | "unsupported";

/**
 * The kernel's verdict with its refusal code, or the instance having ended before the command arrived, with its final
 * status (`null` when the ended instance's state could not be read).
 */
export type ProcessCommandResult =
  | Readonly<{ kind: "semantic"; commandId: string; outcome: ProcessCommandOutcome; code: string | null }>
  | Readonly<{
      kind: "processClosed";
      commandId: string;
      receipt: Readonly<{ processInstanceId: string; status: string | null }>;
    }>;

const outcomes: ReadonlySet<string> = new Set<ProcessCommandOutcome>(
  ["committed", "rolledBack", "rejected", "semanticFailure", "unsupported"]);

export function processCommandResult(result: EngineCommandResult): ProcessCommandResult {
  if (result.kind === "processClosed") return result;
  if (!outcomes.has(result.outcome)) throw new TypeError(`unknown command outcome ${result.outcome}`);
  return { ...result, outcome: result.outcome as ProcessCommandOutcome };
}
