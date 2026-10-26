module

public import BpmnSemantics.SemanticProcess.ParallelScopePopulationCapacityProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeLifetimeAccounting
public import BpmnSemantics.SemanticProcess.ParallelScopeCollectionStorageProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeWaitArmingPublicationProofs
public import BpmnSemantics.SemanticProcess.SequentialScopeDispatchLaws
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData

/-! Actual reachability supplies storage, reservation and population evidence; a later command's admission is not a capacity premise. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem start_capacity_data_frame (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : List VariableBinding)
    (capacity : ProgramCapacity) (accepted : programStartCapacity program before = some capacity)
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required after = true)
    (collection : after.filter (·.name == analysis.entry.collectionName) =
      before.filter (·.name == analysis.entry.collectionName)) :
    programStartCapacity program after = some capacity := by
  unfold programStartCapacity at accepted ⊢
  simp only [analyzed, bind, Option.bind_some] at accepted ⊢
  split at accepted <;> try contradiction
  simpa only [admitted, Bool.not_true, Bool.false_eq_true, ↓reduceIte, collection] using accepted

private theorem scope_write_start_data (analysis : ProgramAnalysis)
    (before after : ScopedVariables) (owner : ScopeOccurrenceId) (patch : List VariableBinding)
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required before.process.bindings = true)
    (unique : (patch.map (·.name)).Nodup)
    (typed : patch.all (fun value => SerialBusinessTask.nameAllowed analysis.handlers value.name &&
      SequentialScopeData.startBindingValueValid analysis.entry.collectionName
        analysis.entry.completionBooleanName value) = true)
    (written : writeScopeVariables? before owner patch = some after) :
    SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required after.process.bindings = true := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  cases Option.some.inj written
  exact repeatedScope_start_data_merge _ _ _ _ _ _ admitted
    ((List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique)
    (all_filter _ _ _ typed)

private theorem bound_write_start_data (analysis : ProgramAnalysis)
    (before after : ScopedVariables) (owner : ScopeOccurrenceId) (values : List VariableBinding)
    (kind : MultiInstanceScopeWriteKind)
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required before.process.bindings = true)
    (written : writeBoundMultiInstanceScopeValues? before owner analysis.entry.collectionName
      analysis.entry.itemName analysis.entry.completionBooleanName analysis.handlers values kind = some after) :
    SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required after.process.bindings = true := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  rename_i checks
  simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false,
    decide_eq_true_eq] at checks
  have unique : (values.map (·.name)).Nodup := by
    apply List.pairwise_map.mpr
    exact checks.2.imp String.ne_of_lt
  have typed : values.all (fun value => SerialBusinessTask.nameAllowed analysis.handlers value.name &&
      SequentialScopeData.startBindingValueValid analysis.entry.collectionName
        analysis.entry.completionBooleanName value) = true := by
    apply List.all_eq_true.mpr
    intro value member
    have permitted := List.all_eq_true.mp checks.1 value member
    simp only [Bool.and_eq_true] at permitted
    have collection : (value.name == analysis.entry.collectionName) = false := by
      simpa only [bne_iff_ne, beq_eq_false_iff_ne] using permitted.1.1.2
    simp only [SequentialScopeData.startBindingValueValid, collection, Bool.false_eq_true,
      ↓reduceIte, SerialBusinessTask.nameAllowed, Bool.and_eq_true]
    refine ⟨permitted.1.1.1, ?_⟩
    split
    · rename_i condition
      have permittedValue := permitted.2
      simp only [condition, ↓reduceIte, Bool.and_eq_true] at permittedValue
      exact permittedValue.2
    · rename_i condition
      have scalar : scopeVariableScalar value.value = true := by
        simpa only [condition, Bool.false_eq_true, ↓reduceIte] using permitted.2
      cases valueEq : value.value <;> simp_all [scopeVariableScalar, SerialBusinessTask.scalar]
  obtain ⟨variables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  exact repeatedScope_start_data_merge _ _ _ _ _ _
    (scope_write_start_data analysis before variables owner _ admitted
      ((List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique)
      (all_filter _ _ _ typed) bodyWrite)
    ((List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique)
    (all_filter _ _ _ typed)


private theorem accepted_start_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (seed : ParallelScopeAcceptedStart program)
    (storage : committedStateCollectionAdmitted seed.ready = true)
    (reservation : occurrenceReservationStateValid seed.ready = true) :
    programStateCapacity program seed.ready = some seed.capacity := by
  obtain ⟨selectedAnalysis, binding, items, selected, admitted, collection, value, _⟩ :=
    programStartCapacity_bound_certificate program seed.values seed.capacity seed.capacityAccepted
  rw [analyzed] at selected
  cases Option.some.inj selected
  have owner := admitted_entry_owner_census program analysis analyzed seed.root seed.rootSelected
  have ownerFilter : (fun binding : OperationScopeOwnership => binding.operationId == analysis.entry.id) =
      (fun binding => decide (binding.operationId = analysis.entry.id)) := by
    funext binding
    apply Bool.eq_iff_iff.mpr
    simp
  rw [← ownerFilter] at owner
  have different := analyzeProgram_child_root_distinct program analysis analyzed seed.root seed.rootSelected
  have started := seed.started
  simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some,
    pure, Option.some.injEq] at started
  change _ = seed.ready at started
  unfold programStateCapacity
  rw [storage, reservation]
  simp only [Bool.not_true, Bool.false_or, Bool.false_eq_true, ↓reduceIte, bind,
    Option.bind_some, analyzed]
  rw [← started]
  simp [runningStartState, initialState, emptyScopedVariables, seed.capacityAccepted,
    owner, collection, value, Ne.symm different]

private theorem parallel_write_start_data (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before : RuntimeState) (after : ScopedVariables)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (collection : VariableBinding)
    (unique : before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) = [collection])
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required before.variables.process.bindings = true)
    (written : writeParallelScopeValues? program before owner values kind = some after) :
    SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required after.process.bindings = true ∧
      after.process.bindings.filter (·.name == analysis.entry.collectionName) =
        before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis analyzed
  have handlers := (analyzeProgram_body_input_admission program analysis analyzed).1
  unfold writeParallelScopeValues? at written
  rw [entries] at written
  split at written <;> try contradiction
  rename_i selectedEntry selected
  have same : selectedEntry = analysis.entry := by
    have member := (List.mem_filter.mp (selected.symm ▸ List.mem_singleton_self selectedEntry)).1
    simpa using member
  subst selectedEntry
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  change writeBoundMultiInstanceScopeValues? before.variables owner analysis.entry.collectionName
    analysis.entry.itemName analysis.entry.completionBooleanName (SerialBusinessTask.programHandlers program) values kind = some after at written
  rw [handlers] at written
  refine ⟨bound_write_start_data analysis before.variables after owner values kind admitted written, ?_⟩
  rw [unique]
  exact writeBoundMultiInstanceScopeValues_preserves_collection before.variables after owner _ _ _ _
    values kind collection unique written

private theorem human_patch_start_data (analysis : ProgramAnalysis) (before values : List VariableBinding)
    (collection : VariableBinding) (unique : before.filter (·.name == analysis.entry.collectionName) = [collection])
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required before = true)
    (patch : ParallelScopeCommand.humanValuesAdmitted analysis values = true) :
    SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required (mergeProcessVariableBindings before values) = true ∧
      (mergeProcessVariableBindings before values).filter (·.name == analysis.entry.collectionName) =
        before.filter (·.name == analysis.entry.collectionName) := by
  simp only [ParallelScopeCommand.humanValuesAdmitted, Bool.and_eq_true] at patch
  have untouched : ∀ value ∈ values, value.name ≠ analysis.entry.collectionName := by
    intro value member
    have allowed := List.all_eq_true.mp patch.2 value member
    simp only [Bool.and_eq_true] at allowed
    simpa only [bne_iff_ne] using allowed.1.1.2
  refine ⟨repeatedScope_start_data_merge _ _ _ _ _ _ admitted (strictlySortedStrings_nodup _ patch.1) ?_, ?_⟩
  rotate_left
  · rw [conditionMerge_untouched before values _ collection unique untouched, unique]
  apply List.all_eq_true.mpr
  intro value member
  have allowed := List.all_eq_true.mp patch.2 value member
  simp only [Bool.and_eq_true] at allowed
  have collection : (value.name == analysis.entry.collectionName) = false := by
    simpa only [bne_iff_ne, beq_eq_false_iff_ne] using allowed.1.1.2
  simp only [SequentialScopeData.startBindingValueValid, collection, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true]
  refine ⟨allowed.1.1.1, ?_⟩
  split
  · rename_i condition
    have boolean := allowed.2
    simp only [condition, ↓reduceIte] at boolean
    cases valueEq : value.value <;> simp_all
  · rename_i condition
    simpa only [condition, Bool.false_eq_true, ↓reduceIte] using allowed.2

private theorem declared_output_contract (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (declared : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations) :
    SerialBusinessTask.mappingsValid analysis.handlers effect.inputMappings effect.outputMappings = true ∧
      ∀ mapping ∈ effect.outputMappings, mapping.target ≠ analysis.entry.collectionName ∧
        analysis.entry.completionBooleanName ≠ some mapping.target := by
  have requirements := analyzeProgram_data_requirements program analysis analyzed
  have handlers := (analyzeProgram_body_input_admission program analysis analyzed).1
  unfold SequentialScopeData.requirementsFor at requirements
  dsimp only at requirements
  split at requirements <;> try contradiction
  split at requirements <;> try contradiction
  obtain ⟨reads, mapped, _⟩ := Option.bind_eq_some_iff.mp requirements
  obtain ⟨names, _, checked⟩ := mapped_member _ program.operations reads mapped _ declared
  simp only at checked
  split at checked <;> try contradiction
  split at checked <;> try contradiction
  rename_i valid
  have mappings : SerialBusinessTask.mappingsValid analysis.handlers effect.inputMappings effect.outputMappings = true := by
    cases choice : SerialBusinessTask.mappingsValid analysis.handlers effect.inputMappings effect.outputMappings with
    | false => simp [handlers, choice] at valid
    | true => rfl
  simp at valid
  refine ⟨mappings, ?_⟩
  intro mapping member
  exact ⟨(valid.1.2 mapping member).1, (valid.1.2 mapping member).2.2⟩

private theorem serial_patch_start_data (analysis : ProgramAnalysis)
    (before after patch : List VariableBinding) (inputs outputs : List VariableMapping) (collection : VariableBinding)
    (admitted : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required before = true)
    (selected : before.filter (·.name == analysis.entry.collectionName) = [collection])
    (mappings : SerialBusinessTask.mappingsValid analysis.handlers inputs outputs = true)
    (reserved : ∀ mapping ∈ outputs, mapping.target ≠ analysis.entry.collectionName ∧
      analysis.entry.completionBooleanName ≠ some mapping.target)
    (written : serialEffectPatch? analysis.handlers outputs before patch = some after) :
    SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName
      analysis.entry.completionBooleanName analysis.handlers analysis.required after = true ∧
      after.filter (·.name == analysis.entry.collectionName) = before.filter (·.name == analysis.entry.collectionName) := by
  obtain ⟨_, _, writes, _, _, _, mapped, merged⟩ := serial_patch_sound analysis.handlers outputs before patch after written
  obtain ⟨names, domain⟩ := SerialBusinessTask.output_writes_domain analysis.handlers outputs patch writes
    (Bool.and_eq_true_iff.mp mappings).2 mapped
  have unique : (writes.map (·.name)).Nodup := by
    rw [names]
    exact strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).2
  have untouched : ∀ value ∈ writes, value.name ≠ analysis.entry.collectionName ∧
      analysis.entry.completionBooleanName ≠ some value.name := by
    intro value member
    have target : value.name ∈ outputs.map (·.target) := names ▸ List.mem_map.mpr ⟨value, member, rfl⟩
    obtain ⟨mapping, present, same⟩ := List.mem_map.mp target
    simpa only [same] using reserved mapping present
  rw [merged]
  refine ⟨repeatedScope_start_data_merge _ _ _ _ _ _ admitted unique ?_, ?_⟩
  · apply List.all_eq_true.mpr
    intro value member
    have allowed := List.all_eq_true.mp domain value member
    simpa only [SequentialScopeData.startBindingValueValid, beq_eq_false_iff_ne.mpr (untouched value member).1,
      beq_eq_false_iff_ne.mpr (untouched value member).2, Bool.false_eq_true, ↓reduceIte] using allowed
  · rw [conditionMerge_untouched before writes analysis.entry.collectionName collection selected
      (fun value member => (untouched value member).1), selected]

private theorem human_completion_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding) (capacity : ProgramCapacity)
    (accepted : programStateCapacity program before = some capacity)
    (dataAdmitted : ParallelScopeCommand.humanValuesAdmitted analysis values = true)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (storage : committedStateCollectionAdmitted after = true)
    (reservation : occurrenceReservationStateValid after = true) :
    programStateCapacity program after = some capacity := by
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  obtain ⟨selectedAnalysis, collection, items, selected, admitted, unique, _⟩ :=
    programStartCapacity_bound_certificate program before.variables.process.bindings capacity start
  rw [analyzed] at selected
  cases Option.some.inj selected
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    obtain ⟨data, preserved⟩ := parallel_write_start_data program analysis analyzed before variables _ values
      .userTask collection unique admitted written
    exact programStateCapacity_population_frame program analysis analyzed before _ capacity accepted storage reservation
      (start_capacity_data_frame program analysis analyzed _ _ capacity start data preserved)
      preserved rfl rfl rfl rfl (writeParallelScopeValues_preserves_owner_census (result := variables) written)
  · obtain ⟨middle, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    obtain ⟨data, preserved⟩ := human_patch_start_data analysis before.variables.process.bindings values
      collection unique admitted dataAdmitted
    exact programStateCapacity_population_frame program analysis analyzed before _ capacity accepted storage reservation
      (start_capacity_data_frame program analysis analyzed _ _ capacity start data preserved)
      preserved rfl rfl rfl rfl rfl

private theorem effect_completion_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding) (capacity : ProgramCapacity)
    (accepted : programStateCapacity program before = some capacity)
    (valid : flowNodeOccurrenceEffectProgramValidity program before = true)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (storage : committedStateCollectionAdmitted after = true)
    (reservation : occurrenceReservationStateValid after = true) :
    programStateCapacity program after = some capacity := by
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  obtain ⟨selectedAnalysis, collection, items, selected, admitted, unique, _⟩ :=
    programStartCapacity_bound_certificate program before.variables.process.bindings capacity start
  rw [analyzed] at selected
  cases Option.some.inj selected
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selectedWait
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    obtain ⟨data, preserved⟩ := parallel_write_start_data program analysis analyzed before variables _ _
      .serviceTask collection unique admitted written
    exact programStateCapacity_population_frame program analysis analyzed before _ capacity accepted storage reservation
      (start_capacity_data_frame program analysis analyzed _ _ capacity start data preserved)
      preserved rfl rfl rfl rfl (writeParallelScopeValues_preserves_owner_census (result := variables) written)
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · have member : wait ∈ before.effectWaits :=
      (List.mem_filter.mp (selectedWait.symm ▸ List.mem_singleton_self wait)).1
    obtain ⟨_, operationId, origin, input, output, effect, route, declared, _, mappingsEq, _⟩ :=
      flowNodeOccurrenceEffectProgramValidity_declaration program before wait valid member
    obtain ⟨mappings, reserved⟩ := declared_output_contract program analysis analyzed _ _ _ _ _ _ declared
    rw [mappingsEq] at mappings reserved
    simp only [completeSerialEffect?, selectedWait] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, mapped, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    rw [(analyzeProgram_body_input_admission program analysis analyzed).1] at mapped
    obtain ⟨data, preserved⟩ := serial_patch_start_data analysis _ _ _ _ _ collection admitted unique mappings reserved mapped
    exact programStateCapacity_population_frame program analysis analyzed before _ capacity accepted storage reservation
      (start_capacity_data_frame program analysis analyzed _ _ capacity start data preserved)
      preserved rfl rfl rfl rfl rfl

def RunningCapacity (program : Program) (state : RuntimeState) : Prop :=
  ∀ instanceId, state.control = .running instanceId →
    committedStateCollectionAdmitted state = true → occurrenceReservationStateValid state = true →
      ∃ capacity, programStateCapacity program state = some capacity

private theorem ingress_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (before : RuntimeState) (boundary : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (prior : RunningCapacity program before)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    RunningCapacity program (admitStimulus program before stimulus).state := by
  have commandAdmitted : ParallelScopeCommand.stimulusAdmitted program before stimulus = true := by
    cases checked : ParallelScopeCommand.stimulusAdmitted program before stimulus with
    | false => cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, checked] at committed
    | true => rfl
  rcases parallelScope_committed_ingress_kind program selected before stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, _⟩ | completion
  · obtain ⟨rfl, _, _⟩ := boundary.committed_start_from_initial program analysis analyzed selected
      before commandId processId instanceId values committed
    obtain ⟨started, capacity, capacityEq⟩ := parallelScope_committed_start_exact program selected
      commandId processId instanceId values committed
    have builder := started
    unfold runningProgramStartState? at builder
    obtain ⟨root, rootSelected, _⟩ := Option.bind_eq_some_iff.mp builder
    let seed : ParallelScopeAcceptedStart program := {
      commandId, processId, instanceId, values, root, capacity, committed, rootSelected, started, capacityAccepted := capacityEq }
    intro _ _ storage reservation
    exact ⟨capacity, accepted_start_capacity program analysis analyzed seed storage reservation⟩
  · apply admitStimulus_wait_preserves_input program before stimulus selected completion
      (RunningCapacity program) prior
    · intro commandId id values after submitted completed instanceId running storage reservation
      rw [submitted] at commandAdmitted
      simp only [ParallelScopeCommand.stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true,
        ↓reduceIte, analyzed] at commandAdmitted
      split at commandAdmitted <;> try contradiction
      obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp (Bool.and_eq_true_iff.mp commandAdmitted).1
      exact ⟨capacity, human_completion_capacity program analysis analyzed before after id values capacity
        accepted (Bool.and_eq_true_iff.mp commandAdmitted).2 completed storage reservation⟩
    · intro commandId id values after submitted completed instanceId running storage reservation
      rw [submitted] at commandAdmitted
      simp only [ParallelScopeCommand.stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true,
        ↓reduceIte, analyzed] at commandAdmitted
      split at commandAdmitted <;> try contradiction
      obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp (Bool.and_eq_true_iff.mp commandAdmitted).1
      have beforeRunning := (ParallelScopeCommand.completeEffect_success_control_frame program before after id values completed).symm.trans running
      have valid := boundary.program_valid program analysis analyzed before instanceId beforeRunning
      simp only [flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at valid
      exact ⟨capacity, effect_completion_capacity program analysis analyzed before after id values capacity
        accepted valid.1.1.2.2 completed storage reservation⟩

private theorem singleton_population_origin (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ seed : ParallelScopeAcceptedStart program,
      ParallelScopeStructuralFrame seed.parent before ∧
      (parallelScopeEntry? operation = some analysis.entry →
        candidate.owner = seed.parent ∧ ParallelScopeCleanEntry analysis.entry seed.parent before) := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed before
  refine ⟨seed, ?_⟩
  have parentCase (parents : ParallelScopeParentHistory program analysis.entry seed.parent before) :
      ParallelScopeStructuralFrame seed.parent before ∧
        (parallelScopeEntry? operation = some analysis.entry →
          candidate.owner = seed.parent ∧ ParallelScopeCleanEntry analysis.entry seed.parent before) := by
    refine ⟨parents.structural_frame program analysis.entry seed.parent before, ?_⟩
    intro _
    obtain ⟨_, _, _, _, _, owner, _⟩ :=
      parents.pre_entry_occurrence_phases program analysis analyzed seed.parent before after candidate applied
    exact ⟨owner, (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1⟩
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases observer rfl with ready | ⟨startId, origin, output, initial, records, declared, initiated, phase⟩
  · apply parentCase
    rw [ready]
    exact .start seed.instanceId seed.root seed.values seed.ready seed.rootSelected seed.started rfl
      (analyzeProgram_child_root_distinct program analysis analyzed seed.root seed.rootSelected)
  rcases phase with ⟨parents, _⟩ | ⟨preEntry, issued, prior, entryRecord, suffix, _, parents, preceding, _, _, entered, following⟩
  · exact parentCase parents
  rcases following with history | ⟨_, _, _, _, _, _, _, ⟨_, completed⟩, _⟩
  · have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent preEntry).1
    have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry seed.parent preEntry issued clean
      (parents.structural_frame program analysis.entry seed.parent preEntry) entered
    refine ⟨history.structural_frame program observer seed.parent selected issued before suffix issuedFrame, ?_⟩
    intro parsed
    obtain ⟨actual, record, actualResolved, _, _, metadata, _, kinds⟩ :=
      preceding.post_entry_occurrence_phases program analysis analyzed observer seed.parent seed.instanceId seed.values
        seed.root seed.ready initial preEntry issued before after startId origin output declared seed.rootSelected rfl
        seed.started initiated prior suffix parents entered history candidate applied
    have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
    subst actual
    have kind : operation.kind = .enterParallelMultiInstanceScope := by
      cases operation <;> simp_all [parallelScopeEntry?, SemanticOperation.kind]
    simp [metadata, kind] at kinds
  · rw [running] at completed
    contradiction

private theorem batch_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program before)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (prior : RunningCapacity program before)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (endpoint : successors.getLast? = some after) : RunningCapacity program after := by
  intro instanceId running storage reservation
  obtain ⟨control, scopes, activities, controllers, frames, process⟩ :=
    applyInternalOccurrenceBatch_retirement_frames program before batch successors applied after (List.mem_of_getLast? endpoint)
  obtain ⟨capacity, accepted⟩ := prior instanceId (control.symm.trans running)
    (reachable.collection_storage program analysis analyzed before) (reachable.reservation_valid program analysis analyzed before)
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  refine ⟨capacity, programStateCapacity_population_frame program analysis analyzed before after capacity accepted storage reservation
    ?_ ?_ control scopes activities controllers (congrArg (fun scopes => scopes.map ScopeVariableScope.owner) frames)⟩
  · rw [process]; exact start
  · rw [process]

private theorem singleton_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (prior : RunningCapacity program before)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) : RunningCapacity program after := by
  intro hosting afterRunning storage reservation
  obtain ⟨instanceId, operation, running, resolved, _, classified⟩ :=
    parallelScope_singleton_execution_cases program analysis analyzed profile before after candidate applied
  obtain ⟨capacity, accepted⟩ := prior instanceId running
    (reachable.collection_storage program analysis analyzed before) (reachable.reservation_valid program analysis analyzed before)
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  obtain ⟨seed, frame, entryOrigin⟩ := singleton_population_origin program analysis analyzed selected before after reachable
    instanceId running candidate operation resolved applied
  have ownerSelection : program.operationScopes.filter (·.operationId == analysis.entry.id) =
      [{ operationId := analysis.entry.id, scopeId := seed.parent.definitionScopeId }] := by
    simpa only [Bool.beq_eq_decide_eq, ParallelScopeAcceptedStart.parent] using
      admitted_entry_owner_census program analysis analyzed seed.root seed.rootSelected
  refine ⟨capacity, ?_⟩
  cases classified with
  | body kind =>
    obtain ⟨control, scopes, activities, controllers, frames, process⟩ :=
      applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved kind applied
    apply programStateCapacity_population_frame program analysis analyzed before after capacity accepted storage reservation
      _ _ control scopes activities controllers (congrArg (fun scopes => scopes.map ScopeVariableScope.owner) frames)
    · rw [process]; exact start
    · rw [process]
  | initiation _ _ output _ initiated =>
    unfold initiateState? at initiated
    obtain ⟨_, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
    split at initiated <;> try contradiction
    cases Option.some.inj initiated
    exact programStateCapacity_population_frame program analysis analyzed before _ capacity accepted storage reservation
      start rfl rfl rfl rfl rfl rfl
  | entry parsed entered =>
    obtain ⟨owner, clean⟩ := entryOrigin parsed
    rw [owner] at entered
    exact enterParallelScope_preserves_capacity program analysis analyzed seed.parent before after capacity accepted
      ownerSelection clean frame entered storage reservation
  | retirement _ completed =>
    have bindingExists : ∃ binding, parallelScopeBinding? analysis.entry before candidate.owner = some binding := by
      unfold completeParallelScope? at completed
      obtain ⟨binding, found, _⟩ := Option.bind_eq_some_iff.mp completed
      exact ⟨binding, found⟩
    obtain ⟨binding, bound⟩ := bindingExists
    exact completeParallelScope_preserves_capacity program analysis analyzed seed.parent candidate.owner before after capacity
      binding accepted ownerSelection frame bound completed storage reservation
  | rootCompletion _ _ _ _ _ completed =>
    rw [afterRunning] at completed
    contradiction

private theorem analyzed_selected (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) : programSelected program = true := by
  cases selected : programSelected program with
  | false => simp [analyzeProgram, selected] at analyzed
  | true => rfl

/-- Actual Start, admitted completions and executed prefixes establish capacity without a later command-admission premise. -/
theorem ParallelScopeInternalPrefixReachable.running_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState) (instanceId : SemanticId)
    (reachable : ParallelScopeInternalPrefixReachable program state) (running : state.control = .running instanceId) :
    ∃ capacity, programStateCapacity program state = some capacity := by
  have selected := analyzed_selected program analysis analyzed
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  have invariant := reachable.invariant_transport program profile (RunningCapacity program)
    (by intro _ running; simp [initialState] at running)
    (ingress_capacity program analysis analyzed selected)
    (singleton_capacity program analysis analyzed selected profile)
    (batch_capacity program analysis analyzed) state
  exact invariant instanceId running (reachable.collection_storage program analysis analyzed state)
    (reachable.reservation_valid program analysis analyzed state)

/-- Every actual Running command boundary retains capacity, including unchanged rejection and atomic rollback. -/
theorem ParallelScopeCommandBoundaryReachable.running_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState) (instanceId : SemanticId)
    (reachable : ParallelScopeCommandBoundaryReachable program state) (running : state.control = .running instanceId) :
    ∃ capacity, programStateCapacity program state = some capacity := by
  have selected := analyzed_selected program analysis analyzed
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  rcases reachable.initial_or_prefix program profile state with initial | preceding
  · subst state; simp [initialState] at running
  · exact preceding.running_capacity program analysis analyzed state instanceId running

end BpmnSemantics.SemanticProcess
