module

public import BpmnSemantics.SemanticProcess.CommandAdmission

/-! Admission inversion laws expose the committed-storage ingress guard without unfolding its dispatch. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

/-- Invalid committed collection storage is refused before any external mutation. -/
theorem admitStimulus_invalid_collection_storage (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (invalid : committedStateCollectionAdmitted state = false) :
    admitStimulus program state stimulus = { outcome := .rejected, state } := by
  cases declared : program.compensationEventSubProcessSnapshots <;>
    simp [admitStimulus, declared, invalid]

/-- Actual committed admission supplies the storage fact that downstream proofs may consume. -/
theorem admitStimulus_committed_collection_storage (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (committed : (admitStimulus program state stimulus).outcome = .committed) :
    committedStateCollectionAdmitted state = true := by
  cases valid : committedStateCollectionAdmitted state with
  | false =>
      rw [admitStimulus_invalid_collection_storage program state stimulus valid] at committed
      contradiction
  | true => rfl

end BpmnSemantics.SemanticProcess
