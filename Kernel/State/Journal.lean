module

public import Kernel.State.Raise

/-! # The occurrence journal

The facts each micro-step records about the occurrences it began and ended, each named by its public key
(`Kernel.State.Key`'s `OccurrenceKey`), the transaction-boundary marks an occurrence carries and the activation counter
that numbers a key's activation. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

inductive Terminal where
  | completed
  | cancelled
  deriving DecidableEq, Repr

/-- What caused a micro-step. -/
inductive Cause where
  | input (tag : InputTag)
  | signal (name : String)
  | arrive (flow : FlowId)
  | idle (scope : ScopeOccurrenceId)
  deriving Repr

/-- An occurrence began: its key, its owning scope occurrence and its element's source type, which semantic publication
shows. -/
structure StartedFact where
  occurrence : OccurrenceKey
  owner : ScopeOccurrenceId
  sourceType : String
  deriving Repr

/-- One micro-step's occurrence facts. `ready` names the occurrences the micro-step leaves in BPMN's Ready state
([BPMN 2.0.2 §13.3.2](../../docs/reference/bpmn-2.0.2/README.md), Fig. 13.2): begun, their InputSet unavailable
(§10.4.2); `State.hold` is its only writer. -/
structure Transition where
  cause : Cause
  element : Option ElementId
  owner : ScopeOccurrenceId
  started : List StartedFact := []
  ended : List (OccurrenceKey × Terminal) := []
  ready : List OccurrenceKey := []
  deriving Repr

/-- The `asyncBefore` and `asyncAfter` marks of the occurrence `key`: a Multi-Instance Activity's envelope marks its
body, and its loop characteristics mark each instance (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`). -/
def marks (program : Program) (key : OccurrenceKey) : Bool × Bool :=
  match (program.element? key.element).bind (·.envelope?) with
  | none => (false, false)
  | some envelope =>
    match key.role, envelope.multiInstance with
    | .multiInstanceBody, _ => (envelope.asyncBefore, envelope.asyncAfter)
    -- CIB skips loop marks on a compensation handler (`BpmnParse.java:2416`); admission refuses a Multi-Instance
    -- handler (`compensation.handlerMultiInstance`).
    | .element, some loop => (loop.asyncBefore, loop.asyncAfter)
    | .element, none => (envelope.asyncBefore, envelope.asyncAfter)

/-- One activation counter (R8: per process instance, element and role). -/
structure ActivationCount where
  processInstance : String
  element : ElementId
  role : ActivationRole
  count : Nat
  deriving Repr

end Kernel
