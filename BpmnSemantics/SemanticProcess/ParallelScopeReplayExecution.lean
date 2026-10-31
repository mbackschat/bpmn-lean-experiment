module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence

/-! # Executable selected parallel command replay

PMIS-SELECT-01 reuses exact-owner application after actual command admission, and
CEA-QUIESCE-01 merge-target records replay through the same application.
Operational replay is kept below its accounting and graph certificates so the
private publication runner does not import those proof dependencies.
-/

public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

/-- Whether `record` names its live occurrence rather than its definition: every PMIS record, and a merge-target record
in every profile, since several occurrences of its definition live at once (CEA-QUIESCE-01). The core's
`replayInternalTransitionRecord` dispatches the same way. -/
def occurrenceAddressed (program : Program) (record : InternalTransitionRecord) : Bool :=
  ParallelScopeStart.programSelected program ||
    program.operations.any fun operation => operation.id == record.operationId && isMergeTargetOperation program operation

def internalTransition? (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) : Option RuntimeState :=
  if occurrenceAddressed program record then
    InternalCommutation.replayInternalOperationOccurrence? program state record
  else replayInternalTransition? program state record

@[simp] theorem occurrenceAddressed_of_selected (program : Program) (record : InternalTransitionRecord)
    (selected : ParallelScopeStart.programSelected program = true) : occurrenceAddressed program record = true := by
  unfold occurrenceAddressed
  simp [selected]

theorem occurrenceAddressed_of_unselected (program : Program) (record : InternalTransitionRecord)
    (unselected : ParallelScopeStart.programSelected program = false)
    (other : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft") :
    occurrenceAddressed program record = false := by
  unfold occurrenceAddressed
  simp [unselected, other]

def internalTransitions? (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← internalTransition? program state record
      internalTransitions? program successor rest
  | _, .externalStimulus _ :: _ => none

/-- A Program without an occurrence-addressed operation keeps the definition-addressed legacy replay. -/
def committedTransitions? (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  if !(ParallelScopeStart.programSelected program || program.operations.any (isMergeTargetOperation program)) then
    replayCommittedTransitions program initial transitions
  else match program.compensationEventSubProcessSnapshots, transitions with
    | none, .externalStimulus stimulus :: rest =>
        let admission := admitStimulus program initial stimulus
        if admission.outcome == .committed then internalTransitions? program admission.state rest else none
    | _, _ => none

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
