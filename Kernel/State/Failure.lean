module

/-! # Step failures

Why a step does not commit. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- Why a semantic failure happened, which its producer states. `model`: the model's data reaches it, so CIB's job fails
alike (CIB-EXT-0027). `invariant`: admission or the kernel's own construction excludes it, so reaching it is a kernel
defect, which `Step.deferred` passes through every boundary unchanged. -/
inductive SemanticCause where
  | model
  | invariant
  deriving Repr

/-- Why a step does not commit, a semantic failure carrying `σ` beside its code. Harness failures never appear here.
`rolledBack` is a command whose closure could not continue (no outgoing flow to take): it ends the run with the state
before the command. A rejection's `stale` says the input arrived for an open item the instance no longer has, which a
host drops, where it suspends the instance on any other rejected arrival (PD7). No site sets it until P2 classifies the
arrival sites, and the record drops it, so a pattern names it explicitly: one that omits it matches only `false`. -/
inductive FailureOf (σ : Type) where
  | rejected (code : String) (stale : Bool := false)
  | rolledBack (code : String)
  | semanticFailure (cause : σ) (code : String)
  | unsupported (code : String)
  deriving DecidableEq, Repr

/-- A step's failure: a semantic failure carries its `SemanticCause`, which only the step reads. -/
abbrev Failure := FailureOf SemanticCause

/-- A failure as a contract records it (`Failure.recorded`): without a cause, so no decoder invents one and no equality
of records compares one. The wire never carries a cause. -/
abbrev RecordedFailure := FailureOf Unit

/-- `failure` without its cause, and a rejection without its `stale` flag, which no contract records yet. -/
def Failure.recorded : Failure → RecordedFailure
  | .rejected code _ => .rejected code
  | .rolledBack code => .rolledBack code
  | .semanticFailure _ code => .semanticFailure () code
  | .unsupported code => .unsupported code

end Kernel
