module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence

/-! # Executable selected parallel command replay

PMIS-SELECT-01 reuses exact-owner application after actual command admission.
Operational replay is kept below its accounting and graph certificates so the
private publication runner does not import those proof dependencies.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

def internalTransition? (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) : Option RuntimeState :=
  if ParallelScopeStart.programSelected program then
    InternalCommutation.replayInternalOperationOccurrence? program state record
  else replayInternalTransition? program state record

def internalTransitions? (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← internalTransition? program state record
      internalTransitions? program successor rest
  | _, .externalStimulus _ :: _ => none

def committedTransitions? (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  if !ParallelScopeStart.programSelected program then
    replayCommittedTransitions program initial transitions
  else match program.compensationEventSubProcessSnapshots, transitions with
    | none, .externalStimulus stimulus :: rest =>
        let admission := admitStimulus program initial stimulus
        if admission.outcome == .committed then internalTransitions? program admission.state rest else none
    | _, _ => none

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
