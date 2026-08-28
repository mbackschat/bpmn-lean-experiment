import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryPreservation

/-! # Parallel Multi-Instance entry evaluator preservation

This module owns the evaluator corollary of the nonempty and empty shared entry-step preservation
proofs. The relation-level owner remains independently buildable and below its source bound.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem enterSharedParallelMultiInstance_preserves_runtimeStateWellFormed (program : Program)
    (expectedInstanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (entryOperation : SemanticOperation)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (structural : programWellFormed program = true)
    (capabilities : programProfileCapabilitiesValid program = true)
    (entryMember : entryOperation ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entryOperation = some arm)
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (success : enterSharedParallelMultiInstance? arm before = some after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  obtain ⟨ownerScope, ⟨account⟩⟩ := sharedParallelProgramAccount_of_admission program arm
    entryOperation profile structural capabilities entryMember projects
  exact sharedParallelEntry_preserves_runtimeStateWellFormed program expectedInstanceId arm
    ownerScope account before after (enterSharedParallelMultiInstance_sound arm before after success)
      wellFormed

end BpmnSemantics.SemanticProcess
