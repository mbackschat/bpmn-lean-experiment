module

public import Kernel.State.Raise

/-! # The occurrence journal

An occurrence's public key, the facts each micro-step records about the occurrences it began and ended, and the
transaction-boundary marks an occurrence carries. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- Which counter numbers an occurrence: a Multi-Instance body and its instances number apart, as CIB gives the body
an activity id of its own (`BpmnParse:185`). -/
inductive ActivationRole where
  | element
  | multiInstanceBody
  deriving DecidableEq, Repr

/-- An occurrence's public key in the journal. -/
structure OccurrenceKey where
  processInstanceId : String
  element : ElementId
  activation : Nat
  role : ActivationRole := .element
  deriving DecidableEq, Repr

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

/-- One micro-step's occurrence facts. -/
structure Transition where
  cause : Cause
  element : Option ElementId
  owner : ScopeOccurrenceId
  started : List StartedFact := []
  ended : List (OccurrenceKey × Terminal) := []
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

end Kernel
