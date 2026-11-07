/**
 * The payload of the Activity host operation, per the
 * [Activity host specification](../../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#host-operation).
 *
 * The host's work reuses the exact payload shapes of the legacy `AwaitUserTask` and `AwaitEffect` operations,
 * which the host-coverage census freezes until every such Task lowers onto the host, so neither representation can
 * gain a feature alone. The effect carries no BPMN Error route: a boundary handler becomes a host field.
 */
import type { DeepReadonly } from "./deep-readonly.js";
import type { SemanticOperation, SemanticOperationKind } from "./semantic-process-contract.js";

/**
 * One outgoing flow's place. A record rather than a bare place, so the later per-flow facts (a condition, the
 * default mark, the flow origin) become defaulted fields of one output instead of a parallel list.
 */
export type ActivityOutput = DeepReadonly<{ place: string }>;

export enum ActivityWorkKind {
  UserTask = "userTask",
  Effect = "effect",
}

export type ActivityWork = DeepReadonly<
  | { kind: ActivityWorkKind.UserTask; task: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitUserTask }>["task"] }
  | { kind: ActivityWorkKind.Effect; effect: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitEffect }>["effect"] }
>;
