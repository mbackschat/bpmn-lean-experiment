module

public import BpmnSemantics.RuntimeStateInitializationConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormedInitialization
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # Committed initialization assurance witnesses

`RINIT-START-01` is checked against actual admission, beside the false selected-root raw-constructor claim. These compact structural Programs exercise the theorem's admission domain; an ordinary start does not establish full profile-capability admission. Message and Timer positives use their exact one-task profiles. Their declaration-bearing controls retain those profiles' refusal rather than inventing a new admitted shape.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.RuntimeStateInitializationConformance

open BpmnSemantics.SemanticProcess
theorem raw_root_snapshot_missing_reservation_refutes_full_invariant :
    compensationEventSubProcessSnapshotStateValid rootProgram rawRootStart = false ∧
      runtimeStateWellFormed rootProgram instanceId rawRootStart = false := by decide +kernel

theorem declaration_free_start_families_match_legacy_admission_exactly :
    admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger =
        admitStimulus minimalProgram initialState ordinaryTrigger ∧
      admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger =
        admitStimulus messageProgram initialState messageTrigger ∧
      admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger =
        admitStimulus timerProgram initialState timerTrigger := by
  exact ⟨admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl,
    admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl,
    admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl⟩

end BpmnSemantics.RuntimeStateInitializationConformance
