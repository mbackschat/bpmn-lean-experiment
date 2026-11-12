/**
 * The correlation, Message and effect records that Triggers, Throws and Work share, transcribed from
 * `Kernel/IL/Types/Message.lean`. Part of `il/types.ts`, which re-exports it.
 */
import type { Expression, ValueSource } from "./expression.js";

export interface CorrelationCriterion { readonly key: string; readonly value: Expression; }

/**
 * `messageRef` is the BPMN Message's identifier, `null` for an unspecified Message (a Receive Task without
 * `messageRef`, which only its waiting occurrence addresses); `name` is that Message's `name` (BPMN 2.0.2 Table 8.48),
 * `null` when it has none; `interfaceRef` and `operationRef` name the Operation that carries it, when the model gives one;
 * `itemRef` is the identifier of the ItemDefinition the Message carries, which a Data Output that receives it must be
 * equivalent to (§10.4.1, §10.5.1).
 */
export interface MessageTrigger {
  readonly messageRef: string | null;
  readonly name: ValueSource | null;
  readonly correlation: readonly CorrelationCriterion[];
  readonly interfaceRef: string | null;
  readonly operationRef: string | null;
  readonly itemRef: string | null;
}

/**
 * A Data Output an Activity or Event declares: its identifier, which its Data Output Association reads, and the
 * identifier of its `itemSubjectRef` ItemDefinition (BPMN 2.0.2 §10.4.1).
 */
export interface DataOutputDecl { readonly id: string; readonly itemRef: string | null; }

export interface EffectBinding { readonly protocol: string; readonly operation: string; }
