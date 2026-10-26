module

public import BpmnSemantics.SequentialScopeGraphConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.GraphValidation
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.SequentialScopeObservation
public import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
public import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.ScenarioAdmission
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.SequentialScopeHistoryTransportProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication
public import BpmnSemantics.SemanticProcess.ActivityDataInputOutput
public import BpmnSemantics.SemanticProcess.ContinuationMarkingLaws
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
import BpmnSemantics.SemanticProcess.SequentialScopeAdmissionValidityProofs
import BpmnSemantics.SemanticProcess.SequentialScopeOrdinaryExecutionProofs
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeValidityProofs
/-! SMIS-ADMIT-01: a repeated body has one paired completion and cannot choose another scope's continuation. -/

@[expose] public section

namespace BpmnSemantics.SequentialScopeGraphConformance

open SemanticProcess
open SemanticProcess.InternalCommutation
theorem paired_repeated_scope_graph_is_admitted : programGraphWellFormed program = true := by decide +kernel

theorem paired_graph_admission_is_declaration_order_independent : programGraphWellFormed { program with
    operations := operations.reverse
    operationScopes := program.operationScopes.reverse } = true := by decide +kernel

theorem completion_rejects_non_entry_binding : programGraphWellFormed (replacing "complete"
    (.completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"start"⟩)) = false := by decide +kernel

theorem completion_rejects_a_different_activity_origin : programGraphWellFormed (replacing "complete"
    (.completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "OtherBatch") ⟨"enter"⟩)) = false := by decide +kernel

theorem entry_rejects_a_child_owned_parent_continuation : programGraphWellFormed (replacing "enter"
    (.enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"body-out"⟩ "items" "item" [] none)) = false := by decide +kernel

theorem completion_rejects_parent_scope_ownership : programGraphWellFormed { program with operationScopes := program.operationScopes.map fun owner =>
    if owner.operationId.value == "complete" then { owner with scopeId := ⟨"root"⟩ } else owner } = false := by decide +kernel

theorem repeated_scope_requires_its_completion : programGraphWellFormed { program with
    operations := operations.filter fun operation => operation.id.value != "complete",
    operationScopes := program.operationScopes.filter fun owner => owner.operationId.value != "complete" } = false := by decide +kernel

theorem ordinary_completion_cannot_compete_with_repeated_completion : programGraphWellFormed { program with
    operations := operations ++ [.completeScope ⟨"ordinary"⟩ (origin "Batch") ⟨"body"⟩ (some ⟨"outgoing"⟩)],
    operationScopes := program.operationScopes ++ [{ operationId := ⟨"ordinary"⟩, scopeId := ⟨"body"⟩ }] } = false := by decide +kernel

theorem repeated_scope_requires_unique_completion : programGraphWellFormed { program with
    operations := operations ++ [.completeSequentialMultiInstanceScope ⟨"duplicate"⟩ (origin "Batch") ⟨"enter"⟩],
    operationScopes := program.operationScopes ++ [{ operationId := ⟨"duplicate"⟩, scopeId := ⟨"body"⟩ }] } = false := by decide +kernel

private theorem dataAnalysis_computed : SequentialScopeData.analyze dataProgram = some dataAnalysis := by
  have raw : SequentialScopeData.requirements dataProgram =
      some { dataAnalysis with requiredProcessScalars := ["seed", "account"] } := by decide +kernel
  simp only [SequentialScopeData.analyze, raw, Option.map_some]
  have sorted : (["seed", "account"] : List String).mergeSort (fun a b => a ≤ b) = ["account", "seed"] := by
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  simp only [sorted, dataAnalysis]

theorem repeated_scope_data_distinguishes_initialization_from_body_reads :
    ((SequentialScopeData.analyze dataProgram).map (·.requiredProcessScalars)) = some ["account", "seed"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "local"])).map (·.requiredProcessScalars)) = some ["account", "local"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "item"])).map (·.requiredProcessScalars)) = some ["account", "item"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "seed"] "root")).map (·.requiredProcessScalars)) = some ["account", "item", "local", "seed"] := by
  refine ⟨?_, ?_, ?_, ?_⟩
  · rw [dataAnalysis_computed]; rfl
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "local"]) =
        some { dataAnalysis with
          entry := { dataAnalysis.entry with bodyInputs := [dataRead "local" "local"] },
          requiredProcessScalars := ["local", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "item"]) =
        some { dataAnalysis with
          entry := { dataAnalysis.entry with bodyInputs := [dataRead "local" "item"] },
          requiredProcessScalars := ["item", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "seed"] "root") =
        some { dataAnalysis with requiredProcessScalars := ["seed", "item", "local", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]

theorem repeated_scope_start_requires_pre_entry_data_and_accepts_present_null :
    SequentialScopeData.startAdmitted dataProgram dataBindings = true ∧
    SequentialScopeData.startAdmitted dataProgram (dataBindings.filter (·.name != "account")) = false ∧
    SequentialScopeData.startAdmitted dataProgram (dataBindings.filter (·.name != "stop")) = false ∧
    SequentialScopeData.startAdmitted dataProgram dataBindings.reverse = false := by
  simp only [SequentialScopeData.startAdmitted, dataAnalysis_computed]
  decide +kernel

theorem delayed_join_witness_has_full_program_and_profile_admission :
    programWellFormed delayedJoinProgram = true ∧ SequentialScopeProgram.admitted delayedJoinProgram = true ∧
      SequentialScopeControl.analyze delayedJoinProgram = some ⟨⟨"enter"⟩, ⟨"body"⟩, 6⟩ := by decide +kernel

theorem delayed_join_actual_start_establishes_runtime_invariant :
    runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩
      (admitStimulus delayedJoinProgram initialState delayedJoinStart).state = true := by
  exact sequentialScope_committed_start_wellFormed delayedJoinProgram ⟨⟨"enter"⟩, ⟨"body"⟩, 6⟩
    ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList ["first", "second"]⟩, ⟨"seed", .string "initial"⟩]
    delayed_join_witness_has_full_program_and_profile_admission.1
    delayed_join_witness_has_full_program_and_profile_admission.2.2
    delayed_join_witness_has_full_program_and_profile_admission.2.1 (by decide +kernel) (by decide +kernel)

theorem delayed_join_actual_start_first_entry_has_body_port_accounting :
    let raw := (admitStimulus delayedJoinProgram initialState delayedJoinStart).state
    let start := SemanticOperation.initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩
    let entry : SequentialScopeEntry :=
      ⟨⟨"enter"⟩, ⟨"Batch"⟩, ⟨"incoming"⟩, ⟨"body-in"⟩, ⟨"body"⟩, ⟨"outgoing"⟩,
        "items", "item", [⟨"status", .enclosingVariable "seed"⟩], none⟩
    let parent : ScopeOccurrenceId := ⟨⟨"instance"⟩, ⟨"root"⟩, 1⟩
    let before := (fire? delayedJoinProgram start raw).getD raw
    let after := ((enterSequentialScopeResult? entry before parent).map (·.state)).getD before
    (admitStimulus delayedJoinProgram initialState delayedJoinStart).outcome = .committed ∧
      fire? delayedJoinProgram start raw = some before ∧
      enterSequentialScopeResult? entry before parent = some (.first parent after) ∧
      ∃ child, child.definitionScopeId = entry.childScopeId ∧
        ({ id := child, parent := some parent } : RuntimeScopeOccurrence) ∈ after.scopeOccurrences ∧
        SequentialScopeBodyPortAccounting entry.childEntry child [] after := by
  refine ⟨by decide +kernel, by decide +kernel, by decide +kernel, ?_⟩
  exact sequentialScope_first_entry_port_accounting delayedJoinProgram ⟨"instance"⟩ _ _
    ((fire? delayedJoinProgram (.initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩)
      (admitStimulus delayedJoinProgram initialState delayedJoinStart).state).getD
        (admitStimulus delayedJoinProgram initialState delayedJoinStart).state) _
    (by decide +kernel) (by decide +kernel) (by decide +kernel)

theorem delayed_join_actual_start_establishes_execution_certificate :
    ∃ root, rootDefinitionScope? delayedJoinProgram = some root ∧
      SequentialScopeExecutionCertificate delayedJoinProgram delayedJoinEntry root
        (admitStimulus delayedJoinProgram initialState delayedJoinStart).state := by
  exact sequentialScope_committed_start_execution_certificate delayedJoinProgram ⟨⟨"enter"⟩, ⟨"body"⟩, 6⟩
    delayedJoinEntry ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩
    [⟨"items", .stringList ["first", "second"]⟩, ⟨"seed", .string "initial"⟩]
    delayed_join_witness_has_full_program_and_profile_admission.1
    delayed_join_witness_has_full_program_and_profile_admission.2.2
    delayed_join_witness_has_full_program_and_profile_admission.2.1 (by decide +kernel)
    delayed_join_actual_start_first_entry_has_body_port_accounting.1

theorem delayed_join_actual_first_body_prepared_fork_preserves_port_accounting :
    let fork := SemanticOperation.duplicate ⟨"fork"⟩ (origin "Fork") ⟨"body-in"⟩ [⟨"effect-in"⟩, ⟨"task-in"⟩]
    ∃ binding prepared,
      sequentialScopeBindingForEntry? delayedJoinEntry delayedJoinEntered = some binding ∧
      prepareInternalTransition? delayedJoinProgram delayedJoinEntered fork = some prepared ∧
      applyPreparedInternalTransition? delayedJoinProgram delayedJoinEntered prepared =
        some (prepared.apply delayedJoinProgram delayedJoinEntered) ∧
      SequentialScopeBodyPortAccounting delayedJoinEntry.childEntry binding.body.id [fork]
        (prepared.apply delayedJoinProgram delayedJoinEntered) ∧
      (prepared.apply delayedJoinProgram delayedJoinEntered).scopeActivations = delayedJoinEntered.scopeActivations := by
  obtain ⟨binding, bound⟩ := Option.isSome_iff_exists.mp
    (show (sequentialScopeBindingForEntry? delayedJoinEntry delayedJoinEntered).isSome = true from by decide +kernel)
  obtain ⟨prepared, selected⟩ := Option.isSome_iff_exists.mp
    (show (prepareInternalTransition? delayedJoinProgram delayedJoinEntered
      (.duplicate ⟨"fork"⟩ (origin "Fork") ⟨"body-in"⟩ [⟨"effect-in"⟩, ⟨"task-in"⟩])).isSome = true from by decide +kernel)
  obtain ⟨child, scope, member, accounting⟩ := delayed_join_actual_start_first_entry_has_body_port_accounting.2.2.2
  change SequentialScopeBodyPortAccounting delayedJoinEntry.childEntry child [] delayedJoinEntered at accounting
  have wellFormed : runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩ delayedJoinEntered = true := by decide +kernel
  have declared : delayedJoinEntry ∈ delayedJoinProgram.operations.filterMap sequentialScopeEntry? := by decide +kernel
  have valid : sequentialScopeStateValid delayedJoinProgram delayedJoinEntered = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    grind
  have census := sequentialScope_valid_body_census delayedJoinProgram delayedJoinEntry delayedJoinEntered
    binding declared valid bound
  have inBody : ({ id := child, parent := some ⟨⟨"instance"⟩, ⟨"root"⟩, 1⟩ } : RuntimeScopeOccurrence) ∈
      delayedJoinEntered.scopeOccurrences.filter (fun occurrence =>
        occurrence.id.definitionScopeId == delayedJoinEntry.childScopeId) :=
    List.mem_filter.mpr ⟨member, by simpa only [beq_iff_eq, delayedJoinEntry] using scope⟩
  rw [census] at inBody
  have same : child = binding.body.id := congrArg RuntimeScopeOccurrence.id (List.mem_singleton.mp inBody)
  rw [same] at accounting
  refine ⟨binding, prepared, bound, selected, ?_⟩
  exact SequentialScopeBodyPortAccounting.prepared delayedJoinProgram ⟨"instance"⟩ delayedJoinEntry binding []
    delayedJoinEntered _ prepared accounting wellFormed (by decide +kernel) declared bound
    (by decide +kernel) (by decide +kernel) (by decide +kernel)
    (by intro port member; simp [bodyConsumedPorts] at member;
        subst port; decide +kernel) selected

theorem delayed_join_actual_start_arms_both_current_tasks :
    delayedJoinStarted.outcome = .committed ∧ delayedJoinStarted.state.waits.length = 1 ∧
      delayedJoinStarted.state.effectWaits.length = 1 := by decide +kernel

theorem delayed_join_current_service_result_is_eligible :
    SequentialScopeEligibleCompletion delayedJoinProgram delayedJoinStarted.state delayedJoinEffect := by
  constructor
  · decide +kernel
  · obtain ⟨wait, member, selected⟩ := List.any_eq_true.mp
      (show delayedJoinStarted.state.effectWaits.any (fun wait =>
        effectIdNamesWait ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩ wait &&
          decide (wait.outputMappings = [⟨"audit", .localVariable "result"⟩, ⟨"status", .localVariable "result"⟩])) = true
        from by decide +kernel)
    obtain ⟨identity, mappings⟩ := Bool.and_eq_true_iff.mp selected
    have outputs := of_decide_eq_true mappings
    refine ⟨wait, member, identity, ["result", "result"], ?_, ?_, ?_⟩
    · rw [outputs]; rfl
    · decide +kernel
    · decide +kernel

theorem delayed_join_actual_turnover_resets_body_port_accounting :
    let after := ((completeSequentialScopeResult? delayedJoinEntry delayedJoinQuietBody).map (·.state)).getD delayedJoinQuietBody
    ∃ binding, sequentialScopeBindingForEntry? delayedJoinEntry delayedJoinQuietBody = some binding ∧
      completeSequentialScopeResult? delayedJoinEntry delayedJoinQuietBody = some (.next binding.body.id after) ∧
      (∀ place, continuationMarking delayedJoinQuietBody binding.body.id place = 0) ∧
      ∃ child, child.definitionScopeId = delayedJoinEntry.childScopeId ∧
        child.activation = scopeActivationCount delayedJoinQuietBody delayedJoinEntry.childScopeId + 1 ∧
        child ≠ binding.body.id ∧
        ({ id := child, parent := some binding.activity.owner } : RuntimeScopeOccurrence) ∈ after.scopeOccurrences ∧
        SequentialScopeBodyPortAccounting delayedJoinEntry.childEntry child [] after ∧
        child.activation ≤ scopeActivationCount after delayedJoinEntry.childScopeId ∧
        (∀ place, continuationMarking after binding.body.id place = 0) := by
  obtain ⟨binding, bound⟩ := Option.isSome_iff_exists.mp
    (show (sequentialScopeBindingForEntry? delayedJoinEntry delayedJoinQuietBody).isSome = true from by decide +kernel)
  have bodyId : binding.body.id = ⟨⟨"instance"⟩, ⟨"body"⟩, 1⟩ := by
    have projected : (sequentialScopeBindingForEntry? delayedJoinEntry delayedJoinQuietBody).map (fun value => value.body.id) =
        some ⟨⟨"instance"⟩, ⟨"body"⟩, 1⟩ := by decide +kernel
    rw [bound] at projected
    exact Option.some.inj projected
  have counter : binding.body.id.activation ≤ scopeActivationCount delayedJoinQuietBody delayedJoinEntry.childScopeId := by
    rw [bodyId]; decide +kernel
  have completed : completeSequentialScopeResult? delayedJoinEntry delayedJoinQuietBody = some (.next binding.body.id
      (((completeSequentialScopeResult? delayedJoinEntry delayedJoinQuietBody).map (·.state)).getD delayedJoinQuietBody)) := by
    rw [bodyId]; decide +kernel
  obtain ⟨zero, result⟩ := sequentialScope_completion_port_accounting delayedJoinProgram ⟨"instance"⟩ delayedJoinEntry
    delayedJoinQuietBody binding _ (by decide +kernel) (by decide +kernel) (by decide +kernel) bound counter completed
  exact ⟨binding, bound, completed, zero, result.2⟩

theorem delayed_join_completion_has_actual_start_history :
    SequentialScopeActualHistory delayedJoinProgram .boundary delayedJoinArrived.state := by
  apply SequentialScopeActualHistory.command delayedJoinStarted.state scenarioClosureLimit delayedJoinEffect
  exact SequentialScopeActualHistory.start scenarioClosureLimit ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩
    [⟨"items", .stringList ["first", "second"]⟩, ⟨"seed", .string "initial"⟩]
    delayed_join_actual_start_arms_both_current_tasks.1

theorem delayed_join_current_human_completion_is_eligible :
    SequentialScopeEligibleCompletion delayedJoinProgram delayedJoinArrived.state delayedJoinHuman := by
  constructor
  · decide +kernel
  · exact List.any_eq_true.mp (show delayedJoinArrived.state.waits.any
      (taskIdNamesWait ⟨⟨"instance"⟩, ⟨"Review"⟩, 1⟩) = true from by decide +kernel)

theorem delayed_join_actual_completions_exchange_blocked_credit_and_retain_scope_counters :
    let serviceAfter := (admitStimulus delayedJoinProgram delayedJoinStarted.state delayedJoinEffect).state
    let humanAfter := (admitStimulus delayedJoinProgram delayedJoinArrived.state delayedJoinHuman).state
    (∃ wait, delayedJoinStarted.state.effectWaits.filter
        (effectIdNamesWait ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩) = [wait] ∧
      (∀ queried place, continuationMarking serviceAfter queried place =
          continuationMarking delayedJoinStarted.state queried place ∧
        ContinuationMarkingLaws.tokenCount serviceAfter.tokens queried place =
          ContinuationMarkingLaws.tokenCount delayedJoinStarted.state.tokens queried place +
            ownedPortCount [wait.output] wait.owner queried place) ∧
      serviceAfter.scopeActivations = delayedJoinStarted.state.scopeActivations) ∧
    (∃ wait, sequentialScopeTaskWaits delayedJoinArrived.state ⟨⟨"instance"⟩, ⟨"Review"⟩, 1⟩ = [wait] ∧
      (∀ queried place, continuationMarking humanAfter queried place =
          continuationMarking delayedJoinArrived.state queried place ∧
        ContinuationMarkingLaws.tokenCount humanAfter.tokens queried place =
          ContinuationMarkingLaws.tokenCount delayedJoinArrived.state.tokens queried place +
            ownedPortCount [wait.output] wait.owner queried place) ∧
      humanAfter.scopeActivations = delayedJoinArrived.state.scopeActivations) := by
  have service : completeSequentialScopeEffect? delayedJoinProgram delayedJoinStarted.state
      ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩ (.success [⟨"result", .null⟩]) =
        some (admitStimulus delayedJoinProgram delayedJoinStarted.state delayedJoinEffect).state := by decide +kernel
  have human : completeSequentialScopeUserTask? delayedJoinProgram delayedJoinArrived.state
      ⟨⟨"instance"⟩, ⟨"Review"⟩, 1⟩ [] =
        some (admitStimulus delayedJoinProgram delayedJoinArrived.state delayedJoinHuman).state := by decide +kernel
  constructor
  · obtain ⟨wait, variables, selected, changed⟩ := sequentialScope_effect_completion_frame
      delayedJoinProgram delayedJoinStarted.state _ _ _ service
    have present : wait ∈ delayedJoinStarted.state.effectWaits := (List.mem_filter.mp
      (show wait ∈ delayedJoinStarted.state.effectWaits.filter
        (effectIdNamesWait ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩) from by rw [selected]; simp)).1
    refine ⟨wait, selected, ?_, ?_⟩
    · intro queried place
      rw [changed]
      exact effect_port_exchange delayedJoinStarted.state wait variables present queried place
    · rw [changed]
  · obtain ⟨wait, variables, selected, changed⟩ := sequentialScope_user_completion_frame
      delayedJoinProgram delayedJoinArrived.state _ _ _ human
    have present : wait ∈ delayedJoinArrived.state.waits := (List.mem_filter.mp
      (show wait ∈ sequentialScopeTaskWaits delayedJoinArrived.state
        ⟨⟨"instance"⟩, ⟨"Review"⟩, 1⟩ from by rw [selected]; simp)).1
    refine ⟨wait, selected, ?_, ?_⟩
    · intro queried place
      rw [changed]
      exact human_port_exchange delayedJoinArrived.state wait variables present queried place
    · rw [changed]

end BpmnSemantics.SequentialScopeGraphConformance
