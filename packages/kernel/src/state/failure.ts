/**
 * Why a step does not commit, transcribed from `Kernel/State/Failure.lean`. Part of `state.ts`, which re-exports it.
 */

/**
 * Why a step does not commit. Harness failures never appear here. `rolledBack` is a command whose closure could not
 * continue (no outgoing flow to take): it ends the run with the state before the command.
 */
export enum FailureTag {
  Rejected = "rejected",
  RolledBack = "rolledBack",
  SemanticFailure = "semanticFailure",
  Unsupported = "unsupported",
}

/**
 * Why a semantic failure happened, which its producer states. `Model`: the model's data reaches it, so CIB's job fails
 * alike (CIB-EXT-0027). `Invariant`: admission or the kernel's own construction excludes it, so reaching it is a kernel
 * defect, which `step/jobs.ts#deferred` passes through every boundary unchanged.
 */
export enum SemanticCause {
  Model = "model",
  Invariant = "invariant",
}

/**
 * A step's failure (Lean's `Failure`): a semantic failure carries its `SemanticCause`, which only the step reads. A
 * rejection's `stale` says the input arrived for an open item the instance no longer has, which a host drops, where it
 * suspends the instance on any other rejected arrival (PD7); Lean's `false` is its absence. No site sets it until P2
 * classifies the arrival sites, and the record drops it.
 */
export type Failure =
  | { readonly tag: FailureTag.Rejected; readonly code: string; readonly stale?: true }
  | { readonly tag: FailureTag.RolledBack | FailureTag.Unsupported; readonly code: string }
  | { readonly tag: FailureTag.SemanticFailure; readonly code: string; readonly cause: SemanticCause };

/**
 * A failure as a contract records it (`recorded`): without a cause, so no decoder invents one and no equality of records
 * compares one. The wire never carries a cause; `cause?: never` makes passing a step's `Failure` here a type error.
 */
export interface RecordedFailure { readonly tag: FailureTag; readonly code: string; readonly cause?: never }

/** `failure` without its cause, and a rejection without its `stale` flag, which no contract records yet. */
export function recorded(failure: Failure): RecordedFailure { return { tag: failure.tag, code: failure.code }; }

/** Lean's `Except Failure α`. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: Failure };

export function committed<T>(value: T): Result<T> { return { ok: true, value }; }

export function failed<T>(tag: Exclude<FailureTag, FailureTag.SemanticFailure>, code: string): Result<T> {
  return { ok: false, failure: { tag, code } };
}

export function semanticFailure<T>(cause: SemanticCause, code: string): Result<T> {
  return { ok: false, failure: { tag: FailureTag.SemanticFailure, code, cause } };
}

/** An `Except` failure carried to another result type. */
export function failedWith<T>(failure: Failure): Result<T> { return { ok: false, failure }; }
