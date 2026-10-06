import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Repeated-scope dispatch contract

The same four-case account must drive actual operation execution; these equations detect an unwired or misrouted dispatcher.
-/

namespace BpmnSemantics.SemanticProcess

/-- SMIS-ENTER-01 is executed through the ordinary operation boundary. -/
theorem fire_sequential_scope_entry (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input childEntry output : ControlPlaceId)
    (childScope : DefinitionScopeId) (collection item : String) (inputs : List VariableMapping) (condition : Option String)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    let operation := SemanticOperation.enterSequentialMultiInstanceScope id origin input childEntry childScope output collection item inputs condition
    fire? program operation state = (enterSequentialScope? operation state).map SequentialScopeEntryResult.state := by
  simp only [fire?, absent]
  rfl

/-- SMIS-END-01 resolves its paired entry through the same operation boundary. -/
theorem fire_sequential_scope_completion (program : Program) (state : RuntimeState)
    (id entry : OperationId) (origin : BpmnElementOrigin)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    let operation := SemanticOperation.completeSequentialMultiInstanceScope id origin entry
    fire? program operation state = (completeSequentialScope? program operation state).map SequentialScopeCompletionResult.state := by
  simp only [fire?, absent]
  rfl

/-- Successful scoped Service results reach ordinary command dispatch without Process-data fallback. -/
theorem dispatch_sequential_scope_effect (program : Program) (state after : RuntimeState)
    (commandId instanceId : BpmnSemantics.SemanticId) (effectId : EffectOccurrenceId)
    (result : BpmnSemantics.EffectExecutionResult) (wait : EffectWait)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (running : state.control = .running instanceId)
    (compensation : state.compensationHandlerEffectWaits.filter (fun wait => wait.id == effectId) = [])
    (unique : state.effectWaits.filter (effectOccurrenceMatches effectId) = [wait])
    (selected : sequentialScopeProgramSelected program = true)
    (bodyDeclared : hasSequentialScopeDefinition program wait.owner = true)
    (completed : completeSequentialScopeEffect? program state effectId result = some after)
    (owned : effectId.processInstanceId = instanceId) :
    dispatchStimulus program state (.completeEffect commandId effectId result) =
      { outcome := .committed, state := after } := by
  simp only [sequentialScopeProgramSelected] at selected
  simp [dispatchStimulus, absent, running, compensation, unique, selected, bodyDeclared, completed, owned]

/-- Human completion uses the same selected body for data writes and command commitment. -/
theorem dispatch_sequential_scope_user (program : Program) (state after : RuntimeState)
    (commandId instanceId : BpmnSemantics.SemanticId) (taskId : BpmnSemantics.UserTaskInstanceId)
    (values : List BpmnSemantics.VariableBinding)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (running : state.control = .running instanceId)
    (selected : sequentialScopeProgramSelected program = true)
    (bodyDeclared : (sequentialScopeTaskWaits state taskId).any
      (fun wait => hasSequentialScopeDefinition program wait.owner) = true)
    (completed : completeSequentialScopeUserTask? program state taskId values = some after)
    (owned : taskId.processInstanceId = instanceId) :
    dispatchStimulus program state (.completeUserTaskInstance commandId taskId values) =
      { outcome := .committed, state := after } := by
  simp only [sequentialScopeProgramSelected] at selected
  simp [dispatchStimulus, absent, running, selected, bodyDeclared, completed, owned]

/-- Direct Service arming commits exactly the input snapshot selected before activation. -/
theorem fire_scoped_effect_snapshot (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (owner : ScopeOccurrenceId)
    (instanceId : BpmnSemantics.SemanticId) (arguments : List BpmnSemantics.VariableBinding)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (token : onlyTokenOwner? state input = some owner)
    (running : state.control = .running instanceId)
    (evaluated : evaluateEffectInputs? program state owner effect.inputMappings = some arguments)
    (available : state.variables.activities.any (activityScopeMatches
      ⟨owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount state effect.elementId + 1⟩) = false) :
    fire? program (.awaitEffect id origin input output effect route) state =
      some (activateEffect state owner.processInstanceId owner input output effect route arguments) := by
  rw [fire_awaitEffect_withoutSnapshotDeclaration program state id origin input output effect route absent]
  simp only [awaitEffectState?, token, runningInstance?, running, bind, pure, Option.bind_some, evaluated, available]
  rfl

/-- SMIS-DATA-01 rejects invalid Start, human and Service payloads before any state mutation, including parent-scope commands. -/
theorem admit_sequential_scope_invalid_data (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (invalid : SequentialScopeData.stimulusAdmitted program stimulus = false) :
    admitStimulus program state stimulus = { outcome := .rejected, state } := by
  cases declared : program.compensationEventSubProcessSnapshots <;>
    simp [admitStimulus, declared, invalid]

/-- SMIS-EARLY-01 samples the condition only after whole-body quiescence, for every condition value. -/
theorem sequentialScope_incomplete_body_cannot_complete (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (busy : scopeQuiescent state binding.body.id = false) :
    completeSequentialScopeResult? entry state = none := by
  simp [completeSequentialScopeResult?, bound, busy]

/-- SMIS-ENTER-01's runtime invariant supplies the immutable collection and exact captured index. -/
theorem sequentialScope_valid_binding_collection (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    ∃ items, sequentialScopeCollection? entry state = some items ∧
      binding.controller.total = items.length ∧
      items[binding.controller.completed]? = some binding.controller.currentItem := by
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid
  have entryValid := List.all_eq_true.mp valid.2 entry declared
  split at entryValid
  · rename_i activities bodies
    unfold sequentialScopeBindingForEntry? at bound
    cases control : state.control <;> simp [control, activities] at bound
  · rw [bound] at entryValid
    cases collection : sequentialScopeCollection? entry state with
    | none => simp [collection] at entryValid
    | some items =>
      simp only [collection, Bool.and_eq_true, beq_iff_eq] at entryValid
      exact ⟨items, rfl, entryValid⟩
  · contradiction

/-- SMIS-END-01 derives nonfinal item availability from validated state rather than a fixed-total premise. -/
theorem sequentialScope_valid_nonfinal_item_exists (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (nonfinal : binding.controller.completed + 1 ≠ binding.controller.total) :
    ∃ items item, sequentialScopeCollection? entry state = some items ∧
      items[binding.controller.completed + 1]? = some item := by
  obtain ⟨items, collection, fixedTotal, _⟩ :=
    sequentialScope_valid_binding_collection program entry state binding declared valid bound
  obtain ⟨item, available⟩ := sequentialScope_nonfinal_item_exists entry state binding items bound fixedTotal nonfinal
  exact ⟨items, item, collection, available⟩


/-- SMIS-ADMIT-01 supplies a real bounded collection from accepted Start data, rather than assuming input availability. -/
theorem sequentialScope_admitted_start_collection (program : Program)
    (bindings : List VariableBinding) (admitted : SequentialScopeData.startAdmitted program bindings = true) :
    ∃ analysis items, SequentialScopeData.analyze program = some analysis ∧
      bindings.filter (·.name == analysis.entry.collectionName) =
        [{ name := analysis.entry.collectionName, value := VariableValue.stringList items }] ∧
      sequentialScopeCollectionWithinLimits items = true := by
  cases analyzed : SequentialScopeData.analyze program with
  | none => simp [SequentialScopeData.startAdmitted, analyzed] at admitted
  | some analysis =>
      simp only [SequentialScopeData.startAdmitted, SequentialScopeData.startBindingsAdmitted, analyzed, Bool.and_eq_true] at admitted
      obtain ⟨⟨⟨⟨sorted, values⟩, collection⟩, _⟩, _⟩ := admitted
      obtain ⟨binding, member, named⟩ := List.any_eq_true.mp collection
      have nameEq : binding.name = analysis.entry.collectionName := by simpa using named
      have valid := (Bool.and_eq_true _ _).mp (List.all_eq_true.mp values binding member)
      have valueValid := valid.2
      cases value : binding.value <;>
        simp [SequentialScopeData.startBindingValueValid, nameEq, value] at valueValid
      rename_i items
      refine ⟨analysis, items, rfl, ?_, valueValid⟩
      have exactBinding : binding = { name := analysis.entry.collectionName, value := .stringList items } := by
        cases binding
        simp_all
      have single := filter_key_eq_singleton_of_nodup bindings (·.name) binding
        (strictlySortedStrings_nodup _ sorted) member
      simpa only [exactBinding, Bool.beq_eq_decide_eq] using single

/-- SMIS-DATA-01 preserves the exact collection through both human and Service scoped writes. -/
theorem sequentialScope_write_preserves_collection (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : SequentialScopeWriteKind)
    (binding : SequentialScopeBinding) (collection : VariableBinding) (result : ScopedVariables)
    (bound : sequentialScopeBindingForOwner? program state owner = some binding)
    (unique : state.variables.process.bindings.filter
      (fun value => decide (value.name = binding.entry.collectionName)) = [collection])
    (written : writeSequentialScopeValues? program state owner values kind = some result) :
    result.process.bindings.filter (fun value => decide (value.name = binding.entry.collectionName)) = [collection] := by
  unfold writeSequentialScopeValues? writeBoundMultiInstanceScopeValues? at written
  simp only [bound, bind, Option.bind] at written
  split at written <;> try contradiction
  rename_i allowed
  have untouched : ∀ value ∈ values, value.name ≠ binding.entry.collectionName := by
    simp only [Bool.or_eq_true, Bool.not_eq_true', not_or, Bool.not_eq_false] at allowed
    intro value member
    have checks := List.all_eq_true.mp allowed.1 value member
    simp_all
  obtain ⟨variables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  simp only [Option.some.injEq] at written
  subst result
  apply sequentialScope_merge_preserves_protected _ _ binding.entry.collectionName collection
  · apply sequentialScope_scoped_patch_preserves_protected state.variables variables owner _
      binding.entry.collectionName collection unique _ bodyWrite
    intro value member
    exact untouched value (List.mem_filter.mp member).1
  · intro value member
    exact untouched value (List.mem_filter.mp member).1

private theorem sequentialScope_analysis_initial_reads (program : Program)
    (analysis : SequentialScopeData.Analysis)
    (analyzed : SequentialScopeData.analyze program = some analysis) :
    SequentialScopeData.bodyMappingsValid analysis.handlers analysis.entry.bodyInputs = true ∧
      SequentialScopeData.scalarReadsValid analysis.entry (SerialBusinessTask.readNames analysis.entry.bodyInputs) = true ∧
      (∀ name ∈ SerialBusinessTask.readNames analysis.entry.bodyInputs, name ∈ analysis.requiredProcessScalars) ∧
      program.operations.filterMap sequentialScopeEntry? = [analysis.entry] ∧
      analysis.handlers = sequentialScopeHandlerNames program ∧
      analysis.entry.completionBooleanName ≠ some analysis.entry.collectionName := by
  unfold SequentialScopeData.analyze at analyzed
  obtain ⟨raw, requirements, same⟩ := Option.map_eq_some_iff.mp analyzed
  subst analysis
  unfold SequentialScopeData.requirements at requirements
  split at requirements <;> try contradiction
  rename_i candidates entry entries
  dsimp only at requirements
  obtain ⟨values, dataAccepted, rawEq⟩ := Option.bind_eq_some_iff.mp requirements
  simp only [pure, Option.some.injEq] at rawEq
  subst raw
  unfold SequentialScopeData.requirementsFor at dataAccepted
  dsimp only at dataAccepted
  split at dataAccepted <;> try contradiction
  rename_i checks
  split at dataAccepted <;> try contradiction
  rename_i scalarReads
  obtain ⟨reads, _, resultFields⟩ := Option.bind_eq_some_iff.mp dataAccepted
  simp only [pure, Option.some.injEq] at resultFields
  subst values
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · simp_all
  · simpa [SequentialScopeData.scalarReadsValid] using scalarReads
  · intro name member
    simpa only [List.mem_mergeSort, List.mem_eraseDups, List.mem_append] using Or.inl member
  · assumption
  · rfl
  · intro same
    by_cases collision : entry.itemName = entry.collectionName <;>
      simp_all [List.eraseDups_cons]

/-- SMIS-DATA-01 derives every initial body read from accepted Start data and the immutable read analysis. -/
theorem sequentialScope_admitted_start_inputs (program : Program)
    (analysis : SequentialScopeData.Analysis) (bindings : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program bindings = true) :
    ∃ inputs, evaluateEnclosingInputMappings bindings analysis.entry.bodyInputs = some inputs := by
  obtain ⟨mappings, reads, required, _, _⟩ := sequentialScope_analysis_initial_reads program analysis analyzed
  simp only [SequentialScopeData.startAdmitted, SequentialScopeData.startBindingsAdmitted, analyzed, Bool.and_eq_true] at admitted
  obtain ⟨⟨⟨⟨sorted, values⟩, _⟩, _⟩, supplied⟩ := admitted
  apply evaluateInputMappings_evaluable (enclosingVariable? bindings) analysis.entry.bodyInputs
    (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp mappings).1)
  intro mapping member
  have allowed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp mappings).2 mapping member
  cases expression : mapping.expression with
  | localVariable name => simp [expression] at allowed
  | stringLiteral value => exact ⟨.string value, rfl⟩
  | enclosingVariable name =>
      have read : name ∈ SerialBusinessTask.readNames analysis.entry.bodyInputs :=
        List.mem_filterMap.mpr ⟨mapping, member, by simp [expression]⟩
      have permitted := List.all_eq_true.mp reads name read
      have available := List.all_eq_true.mp supplied name (required name read)
      obtain ⟨binding, present, named⟩ := List.any_eq_true.mp available
      have nameEq : binding.name = name := by simpa using named
      have single := filter_key_eq_singleton_of_nodup bindings (·.name) binding
        (strictlySortedStrings_nodup _ sorted) present
      have census : bindings.filter (·.name == name) = [binding] := by
        simpa only [nameEq, Bool.beq_eq_decide_eq] using single
      have typed := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp values binding present)).2
      have notCollection : name ≠ analysis.entry.collectionName := by
        simpa only [Bool.and_eq_true, bne_iff_ne] using (Bool.and_eq_true_iff.mp permitted).1
      have notCondition : analysis.entry.completionBooleanName ≠ some name := by
        simpa only [bne_iff_ne] using (Bool.and_eq_true_iff.mp permitted).2
      have scalar : SerialBusinessTask.scalar binding.value = true := by
        simpa only [SequentialScopeData.startValueValid, SequentialScopeData.startBindingValueValid, nameEq, beq_eq_false_iff_ne.mpr notCollection,
          beq_eq_false_iff_ne.mpr notCondition, Bool.false_eq_true, ↓reduceIte] using typed
      refine ⟨binding.value, ?_⟩
      simp only [scalarInputLookup_enclosing, enclosingVariable?, census]
      cases value : binding.value <;> simp_all [SerialBusinessTask.scalar]

private theorem sequentialScope_snapshot_names (mappings : List VariableMapping) (bindings : List VariableBinding)
    (matched : orderedInputSnapshotMatches mappings bindings = true) :
    bindings.map (·.name) = mappings.map (·.target) := by
  induction mappings generalizing bindings with
  | nil => cases bindings <;> simp_all [orderedInputSnapshotMatches]
  | cons mapping rest ih =>
      cases bindings with
      | nil => simp [orderedInputSnapshotMatches] at matched
      | cons binding tail =>
          simp only [orderedInputSnapshotMatches, Bool.and_eq_true] at matched
          have name : mapping.target = binding.name := by simpa using matched.1.1
          simp only [List.map_cons, name, ih tail matched.2]

/-- SMIS-DATA-01 turns evaluated, distinct input declarations into an actual fresh body frame. -/
theorem sequentialScope_admitted_start_initialization (program : Program)
    (analysis : SequentialScopeData.Analysis) (bindings : List VariableBinding)
    (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program bindings = true)
    (process : variables.process.bindings = bindings)
    (fresh : variables.scopes.any (fun scope => decide (scope.owner = owner)) = false) :
    ∃ after, initializeScopeVariables? variables owner analysis.entry.bodyInputs = some after := by
  obtain ⟨inputs, evaluated⟩ := sequentialScope_admitted_start_inputs program analysis bindings analyzed admitted
  have mappings := (sequentialScope_analysis_initial_reads program analysis analyzed).1
  have unique := strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp mappings).1
  have snapshot := evaluateEnclosingInputMappings_snapshot bindings analysis.entry.bodyInputs inputs evaluated
  simp only [inputSnapshotMatches, canonicalInputMappings?, unique, ↓reduceIte] at snapshot
  have names := sequentialScope_snapshot_names _ _ snapshot
  have inputUnique : scopeVariableNamesUnique inputs = true := by
    simp only [scopeVariableNamesUnique, decide_eq_true_eq, names]
    exact ((List.mergeSort_perm analysis.entry.bodyInputs _).map (·.target)).nodup_iff.mpr unique
  unfold initializeScopeVariables?
  simp only [fresh, Bool.false_eq_true, ↓reduceIte, process, evaluated, bind, Option.bind, inputUnique,
    Bool.not_true]
  exact ⟨_, rfl⟩

theorem sequentialScope_committed_start_admitted (program : Program) (before : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program before (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    SequentialScopeData.startAdmitted program bindings = true := by
  cases accepted : SequentialScopeData.startAdmitted program bindings with
  | true => rfl
  | false =>
      have invalid : SequentialScopeData.stimulusAdmitted program (.startProcess commandId processId instanceId bindings) = false := by
        simp only [SequentialScopeData.stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
        cases analyzed : SequentialScopeData.analyze program with
        | none => rfl
        | some analysis => simp only [accepted, Bool.and_false]
      rw [admit_sequential_scope_invalid_data program before _ invalid] at committed
      contradiction

/-- SMIS-ADMIT-01 connects the actual committed Start ingress to body-input totality, without assuming an evaluator result. -/
theorem sequentialScope_committed_start_inputs (program : Program) (before : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program before (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ analysis inputs, SequentialScopeData.analyze program = some analysis ∧
      evaluateEnclosingInputMappings bindings analysis.entry.bodyInputs = some inputs := by
  have admitted := sequentialScope_committed_start_admitted program before commandId processId instanceId bindings selected committed
  obtain ⟨analysis, _, analyzed, _, _⟩ := sequentialScope_admitted_start_collection program bindings admitted
  obtain ⟨inputs, evaluated⟩ := sequentialScope_admitted_start_inputs program analysis bindings analyzed admitted
  exact ⟨analysis, inputs, analyzed, evaluated⟩

/-- SMIS-ADMIT-01 retains the submitted bindings in the actual committed Start builder. -/
theorem sequentialScope_committed_start_builder (program : Program)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    runningProgramStartState? program instanceId bindings =
      some (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state := by
  have snapshots := (admitStimulus_committed_start_shape program _ instanceId rfl committed).1
  simp only [sequentialScopeProgramSelected, beq_iff_eq] at selected
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
      simp [admitStimulus, snapshots, initialState, selected, created] at committed
      repeat' (split at committed <;> simp_all)
  | some started =>
      simp [admitStimulus, snapshots, initialState, selected, created] at committed ⊢
      repeat' (split at committed <;> simp_all)

/-- SMIS-DATA-01 initializes body locals from the actual committed Start state, without an input-availability or successful-initialization premise. -/
theorem sequentialScope_committed_start_initialization (program : Program)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (owner : ScopeOccurrenceId)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ analysis after, SequentialScopeData.analyze program = some analysis ∧
      initializeScopeVariables?
        (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state.variables
        owner analysis.entry.bodyInputs = some after := by
  obtain ⟨analysis, inputs, analyzed, evaluated⟩ := sequentialScope_committed_start_inputs program initialState
    commandId processId instanceId bindings selected committed
  have built := sequentialScope_committed_start_builder program commandId processId instanceId bindings selected committed
  unfold runningProgramStartState? at built
  obtain ⟨root, _, built⟩ := Option.bind_eq_some_iff.mp built
  simp only [pure, Option.some.injEq] at built
  rw [← built]
  have admitted := sequentialScope_committed_start_admitted program initialState commandId processId instanceId bindings selected committed
  obtain ⟨after, initialized⟩ := sequentialScope_admitted_start_initialization program analysis bindings
    (runningStartState instanceId bindings).variables owner analyzed admitted rfl rfl
  exact ⟨analysis, after, analyzed, initialized⟩

/-- SMIS-ENTER-01 derives successful entry from admitted data and an enabled, unoccupied body frontier; no collection or initialization result is assumed. -/
theorem sequentialScope_admitted_entry_total (program : Program)
    (analysis : SequentialScopeData.Analysis) (bindings : List VariableBinding)
    (state : RuntimeState) (parent : ScopeOccurrenceId)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program bindings = true)
    (process : state.variables.process.bindings = bindings)
    (enabled : sequentialScopeEntryEnabled analysis.entry state parent = true)
    (noBody : state.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = false)
    (noLocals : state.variables.scopes.any (fun scope => scope.owner.definitionScopeId == analysis.entry.childScopeId) = false) :
    ∃ result, enterSequentialScopeResult? analysis.entry state parent = some result := by
  obtain ⟨actual, items, found, census, within⟩ := sequentialScope_admitted_start_collection program bindings admitted
  have same : actual = analysis := Option.some.inj (found.symm.trans analyzed)
  subst actual
  have collection : sequentialScopeCollection? analysis.entry state = some items := by
    simp only [sequentialScopeCollection?, process, census, within, ↓reduceIte]
  have running : state.control = .running parent.processInstanceId := by
    have parts := enabled
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at parts
    simpa only [beq_iff_eq] using parts.1.1.1
  cases items with
  | nil =>
      simp only [enterSequentialScopeResult?, enabled, Bool.not_true, Bool.false_eq_true, ↓reduceIte,
        collection, bind, Option.bind]
      exact ⟨_, rfl⟩
  | cons item rest =>
      let child : ScopeOccurrenceId :=
        { processInstanceId := parent.processInstanceId,
          definitionScopeId := analysis.entry.childScopeId, activation := scopeActivationCount state analysis.entry.childScopeId + 1 }
      have issued := sequentialScope_fresh_child analysis.entry state parent parent.processInstanceId running noBody
      have fresh : state.variables.scopes.any (fun scope => decide (scope.owner = child)) = false := by
        apply Bool.eq_false_iff.mpr
        intro present
        obtain ⟨scope, member, owner⟩ := List.any_eq_true.mp present
        have ownerEq := of_decide_eq_true owner
        have collision : state.variables.scopes.any (fun scope => scope.owner.definitionScopeId == analysis.entry.childScopeId) = true :=
          List.any_eq_true.mpr ⟨scope, member, by simp only [ownerEq, child, beq_self_eq_true]⟩
        rw [noLocals] at collision
        contradiction
      obtain ⟨variables, initialized⟩ := sequentialScope_admitted_start_initialization program analysis bindings
        state.variables child analyzed admitted process fresh
      simp only [enterSequentialScopeResult?, enabled, Bool.not_true, Bool.false_eq_true, ↓reduceIte,
        collection, bind, Option.bind, issued]
      change ∃ result, (initializeScopeVariables? state.variables child analysis.entry.bodyInputs >>= _) = some result
      rw [initialized]
      exact ⟨_, rfl⟩

private theorem sequentialScope_merge_presence (existing patch : List VariableBinding) (name : String)
    (present : existing.any (·.name == name) = true) :
    (mergeProcessVariableBindings existing patch).any (·.name == name) = true := by
  apply List.any_eq_true.mpr
  by_cases replaced : name ∈ patch.map (·.name)
  · obtain ⟨binding, member, same⟩ := List.mem_map.mp replaced
    exact ⟨binding, (mergeProcessVariableBindings_perm existing patch).mem_iff.mpr
      (List.mem_append_left _ member), by simpa only [beq_iff_eq] using same⟩
  · obtain ⟨binding, member, named⟩ := List.any_eq_true.mp present
    have same : binding.name = name := by simpa only [beq_iff_eq] using named
    exact ⟨binding, (mergeProcessVariableBindings_perm existing patch).mem_iff.mpr
      (List.mem_append_right _ (List.mem_filter.mpr ⟨member, by simp [same, replaced]⟩)), named⟩

private theorem sequentialScope_pairwise_sorted (bindings : List VariableBinding)
    (ordered : bindings.Pairwise (fun left right => left.name < right.name)) :
    strictlySortedStrings (bindings.map (·.name)) = true := by
  induction bindings with
  | nil => rfl
  | cons first rest ih =>
      cases rest with
      | nil => rfl
      | cons second tail =>
          have parts := List.pairwise_cons.mp ordered
          simp only [List.map_cons, strictlySortedStrings, Bool.and_eq_true, decide_eq_true_eq]
          exact ⟨parts.1 second (by simp), ih parts.2⟩

/-- SMIS-DATA-01's required Process domain survives typed merges: replacement preserves presence, and untouched names remain exact. -/
theorem sequentialScope_start_data_merge (program : Program) (analysis : SequentialScopeData.Analysis)
    (existing patch : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program existing = true)
    (unique : (patch.map (·.name)).Nodup)
    (typed : patch.all (fun value => SerialBusinessTask.nameAllowed analysis.handlers value.name &&
      SequentialScopeData.startValueValid analysis.entry value) = true) :
    SequentialScopeData.startAdmitted program (mergeProcessVariableBindings existing patch) = true := by
  simp only [SequentialScopeData.startAdmitted, SequentialScopeData.startBindingsAdmitted, analyzed, Bool.and_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨sorted, values⟩, collection⟩, condition⟩, required⟩ := valid
  refine ⟨⟨⟨⟨sequentialScope_pairwise_sorted _ (mergeProcessVariableBindings_strictOrder existing patch
    (strictlySortedStrings_nodup _ sorted) unique), ?_⟩,
    sequentialScope_merge_presence existing patch _ collection⟩, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro value member
    rcases List.mem_append.mp ((mergeProcessVariableBindings_perm existing patch).mem_iff.mp member) with written | retained
    · exact List.all_eq_true.mp typed value written
    · exact List.all_eq_true.mp values value (List.mem_filter.mp retained).1
  · cases declared : analysis.entry.completionBooleanName with
    | none => rfl
    | some name =>
        simp only [declared] at condition ⊢
        exact sequentialScope_merge_presence existing patch name condition
  · exact List.all_eq_true.mpr (fun name member =>
      sequentialScope_merge_presence existing patch name (List.all_eq_true.mp required name member))

private theorem sequentialScope_human_start_types (analysis : SequentialScopeData.Analysis)
    (values : List VariableBinding) (admitted : SequentialScopeData.humanValuesAdmitted analysis values = true) :
    (values.map (·.name)).Nodup ∧ values.all (fun value =>
      SerialBusinessTask.nameAllowed analysis.handlers value.name && SequentialScopeData.startValueValid analysis.entry value) = true := by
  obtain ⟨sorted, valid⟩ := Bool.and_eq_true_iff.mp admitted
  refine ⟨strictlySortedStrings_nodup _ sorted, List.all_eq_true.mpr ?_⟩
  intro value member
  have allowed := List.all_eq_true.mp valid value member
  simp only [Bool.and_eq_true] at allowed
  have collection : (value.name == analysis.entry.collectionName) = false := by
    simpa only [bne_iff_ne, beq_eq_false_iff_ne] using allowed.1.1.2
  simp only [SequentialScopeData.startValueValid, SequentialScopeData.startBindingValueValid, collection, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true]
  exact ⟨allowed.1.1.1, allowed.2⟩

private theorem sequentialScope_scoped_start_data (program : Program) (analysis : SequentialScopeData.Analysis)
    (before after : ScopedVariables) (owner : ScopeOccurrenceId) (patch : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program before.process.bindings = true)
    (unique : (patch.map (·.name)).Nodup)
    (typed : patch.all (fun value => SerialBusinessTask.nameAllowed analysis.handlers value.name &&
      SequentialScopeData.startValueValid analysis.entry value) = true)
    (written : writeScopeVariables? before owner patch = some after) :
    SequentialScopeData.startAdmitted program after.process.bindings = true := by
  unfold writeScopeVariables? at written
  cases selected : selectScopeVariables? before owner with
  | none => simp [selected] at written
  | some scope =>
      simp only [selected, bind, Option.bind] at written
      split at written <;> try contradiction
      simp only [Option.some.injEq] at written
      subst after
      apply sequentialScope_start_data_merge program analysis _ _ analyzed valid
      · exact (List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique
      · exact all_filter _ _ _ typed

private theorem sequentialScope_binding_entry (entry : SequentialScopeEntry) (state : RuntimeState)
    (binding : SequentialScopeBinding) (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    binding.entry = entry := by
  unfold sequentialScopeBindingForEntry? at bound
  cases running : state.control <;> simp only [running] at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  obtain ⟨_, _, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  cases Option.some.inj bound
  rfl

theorem sequentialScope_owner_binding_entry (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (binding : SequentialScopeBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (bound : sequentialScopeBindingForOwner? program state owner = some binding) : binding.entry = analysis.entry := by
  have entries := (sequentialScope_analysis_initial_reads program analysis analyzed).2.2.2.1
  unfold sequentialScopeBindingForOwner? at bound
  rw [entries] at bound
  cases named : analysis.entry.childScopeId == owner.definitionScopeId with
  | false => simp [named] at bound
  | true =>
      simp only [List.filter_cons, List.filter_nil, named, ↓reduceIte] at bound
      obtain ⟨actual, found, bound⟩ := Option.bind_eq_some_iff.mp bound
      split at bound <;> try contradiction
      cases Option.some.inj bound
      exact sequentialScope_binding_entry analysis.entry state _ found

private theorem sequentialScope_written_values_admitted (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (values : List VariableBinding)
    (kind : SequentialScopeWriteKind) (after : ScopedVariables)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (written : writeSequentialScopeValues? program state owner values kind = some after) :
    SequentialScopeData.humanValuesAdmitted analysis values = true := by
  unfold writeSequentialScopeValues? writeBoundMultiInstanceScopeValues? at written
  obtain ⟨binding, bound, written⟩ := Option.bind_eq_some_iff.mp written
  have entry := sequentialScope_owner_binding_entry program analysis state owner binding analyzed bound
  have handlers := (sequentialScope_analysis_initial_reads program analysis analyzed).2.2.2.2.1
  dsimp only at written
  split at written <;> try contradiction
  rename_i allowed
  simp only [Bool.or_eq_true, Bool.not_eq_true', not_or, Bool.not_eq_false] at allowed
  simp only [SequentialScopeData.humanValuesAdmitted, Bool.and_eq_true]
  refine ⟨sequentialScope_pairwise_sorted values (of_decide_eq_true allowed.2), ?_⟩
  apply List.all_eq_true.mpr
  intro value member
  have permitted := List.all_eq_true.mp allowed.1 value member
  simp only [entry, SerialBusinessTask.nameAllowed, handlers, Bool.and_eq_true] at permitted ⊢
  refine ⟨permitted.1, ?_⟩
  split
  · rename_i condition
    have checked := permitted.2
    simp only [condition, ↓reduceIte, Bool.and_eq_true] at checked
    exact checked.2
  · rename_i condition
    have checked := permitted.2
    simp only [condition, Bool.false_eq_true, ↓reduceIte] at checked
    cases valueEq : value.value with
    | string _ | null => rfl
    | boolean _ | integer _ | stringList _ => simp [valueEq, scopeVariableScalar] at checked

/-- SMIS-DATA-01 preserves next-iteration input availability through either scoped writer, including human Boolean routing. -/
theorem sequentialScope_write_preserves_start_data (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (values : List VariableBinding)
    (kind : SequentialScopeWriteKind) (after : ScopedVariables)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program state.variables.process.bindings = true)
    (written : writeSequentialScopeValues? program state owner values kind = some after) :
    SequentialScopeData.startAdmitted program after.process.bindings = true := by
  have admitted := sequentialScope_written_values_admitted program analysis state owner values kind after analyzed written
  obtain ⟨unique, typed⟩ := sequentialScope_human_start_types analysis values admitted
  unfold writeSequentialScopeValues? writeBoundMultiInstanceScopeValues? at written
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  dsimp only at written
  split at written <;> try contradiction
  obtain ⟨variables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  simp only [Option.some.injEq] at written
  subst after
  apply sequentialScope_start_data_merge program analysis _ _ analyzed
    (sequentialScope_scoped_start_data program analysis state.variables variables owner _ analyzed valid
      ((List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique) (all_filter _ _ _ typed) bodyWrite)
    ((List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique) (all_filter _ _ _ typed)

/-- SMIS-DATA-01 carries the required Process domain through actual body User Task completion. -/
theorem sequentialScope_user_completion_preserves_start_data (program : Program)
    (analysis : SequentialScopeData.Analysis) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program before.variables.process.bindings = true)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    SequentialScopeData.startAdmitted program after.variables.process.bindings = true := by
  unfold completeSequentialScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  simp only [Option.some.injEq] at completed
  subst after
  exact sequentialScope_write_preserves_start_data program analysis before _ values .userTask variables
    analyzed valid written

private theorem sequentialScope_effect_data_preserves_start_data (program : Program)
    (analysis : SequentialScopeData.Analysis) (before : RuntimeState) (after : ScopedVariables)
    (owner : ScopeOccurrenceId) (effectId : EffectOccurrenceId)
    (outputs : List VariableMapping) (patch : List VariableBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program before.variables.process.bindings = true)
    (completed : completeSequentialScopeEffectData? program before owner effectId outputs patch = some after) :
    SequentialScopeData.startAdmitted program after.process.bindings = true := by
  unfold completeSequentialScopeEffectData? at completed
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact sequentialScope_write_preserves_start_data program analysis before owner _ .serviceTask variables
    analyzed valid written

/-- SMIS-DATA-01 carries the required Process domain through actual mapped Service completion and effect-frame disposal. -/
theorem sequentialScope_effect_completion_preserves_start_data (program : Program)
    (analysis : SequentialScopeData.Analysis) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (valid : SequentialScopeData.startAdmitted program before.variables.process.bindings = true)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    SequentialScopeData.startAdmitted program after.variables.process.bindings = true := by
  unfold completeSequentialScopeEffect? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact sequentialScope_effect_data_preserves_start_data program analysis before variables _ effectId _ _
    analyzed valid written

/-- SMIS-DATA-01 installs body-local snapshots without changing the Process inputs that future iterations require. -/
theorem sequentialScope_entry_process_data_frame (entry : SequentialScopeEntry) (before : RuntimeState)
    (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    result.state.variables.process = before.variables.process := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  simp only [bind, Option.bind_eq_some_iff] at entered
  obtain ⟨items, _, entered⟩ := entered
  cases items with
  | nil => cases Option.some.inj entered; rfl
  | cons item rest =>
      simp only [Option.bind_eq_some_iff] at entered
      obtain ⟨⟨issued, child⟩, _, variables, initialized, entered⟩ := entered
      cases Option.some.inj entered
      exact (initializeScopeVariables_preserves_other_data initialized).1

/-- SMIS-DATA-01 preserves Process inputs across both body turnover and terminal retirement; only body locals are disposed. -/
theorem sequentialScope_completion_process_data_frame (entry : SequentialScopeEntry) (before : RuntimeState)
    (result : SequentialScopeCompletionResult)
    (completed : completeSequentialScopeResult? entry before = some result) :
    result.state.variables.process = before.variables.process := by
  unfold completeSequentialScopeResult? at completed
  simp only [bind, Option.bind_eq_some_iff] at completed
  obtain ⟨binding, _, completed⟩ := completed
  split at completed <;> try contradiction
  simp only [Option.bind_eq_some_iff] at completed
  obtain ⟨condition, _, variables, removed, completed⟩ := completed
  have retained := (removeScopeVariables_preserves_other_data removed).1
  split at completed
  · cases Option.some.inj completed
    exact retained
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨item, _, ⟨issued, child⟩, _, locals, initialized, completed⟩ := completed
    cases Option.some.inj completed
    exact (initializeScopeVariables_preserves_other_data initialized).1.trans retained

/-- SMIS-EARLY-01 derives a readable condition from the preserved admitted Process-data domain. -/
theorem sequentialScope_admitted_condition (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program state.variables.process.bindings = true) :
    ∃ value, sequentialScopeCondition? analysis.entry state = some value := by
  cases condition : analysis.entry.completionBooleanName with
  | none => exact ⟨false, by simp [sequentialScopeCondition?, condition]⟩
  | some name =>
      have distinct := (sequentialScope_analysis_initial_reads program analysis analyzed).2.2.2.2.2
      have notCollection : name ≠ analysis.entry.collectionName := by simpa [condition] using distinct
      simp only [SequentialScopeData.startAdmitted, SequentialScopeData.startBindingsAdmitted, analyzed, Bool.and_eq_true] at admitted
      obtain ⟨⟨⟨⟨sorted, values⟩, _⟩, present⟩, _⟩ := admitted
      simp only [condition, Option.all_some] at present
      obtain ⟨binding, member, named⟩ := List.any_eq_true.mp present
      have nameEq : binding.name = name := by simpa using named
      have census := filter_key_eq_singleton_of_nodup state.variables.process.bindings (·.name) binding
        (strictlySortedStrings_nodup _ sorted) member
      have typed := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp values binding member)).2
      simp only [SequentialScopeData.startBindingValueValid, nameEq, beq_eq_false_iff_ne.mpr notCollection,
        condition, beq_self_eq_true, Bool.false_eq_true, ↓reduceIte] at typed
      cases value : binding.value <;> simp only [value, Bool.false_eq_true] at typed
      rename_i flag
      refine ⟨flag, ?_⟩
      cases binding
      simp_all [sequentialScopeCondition?, Bool.beq_eq_decide_eq]

/-- SMIS-END-01 derives terminal retirement or next-body issuance from the data and ownership invariants, without assuming a successful completion helper. -/
theorem sequentialScope_admitted_completion_total (program : Program) (analysis : SequentialScopeData.Analysis)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (admitted : SequentialScopeData.startAdmitted program state.variables.process.bindings = true)
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? analysis.entry state = some binding)
    (quiet : scopeQuiescent state binding.body.id = true)
    (noActivity : state.activityOccurrences.any (fun candidate => candidate.owner == binding.body.id) = false)
    (localOwners : ∀ scope ∈ state.variables.scopes,
      ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = scope.owner) :
    ∃ result, completeSequentialScopeResult? analysis.entry state = some result := by
  have declared : analysis.entry ∈ program.operations.filterMap sequentialScopeEntry? := by
    rw [(sequentialScope_analysis_initial_reads program analysis analyzed).2.2.2.1]
    exact List.mem_singleton_self _
  obtain ⟨⟨instanceId, running⟩, selected, _, _⟩ := sequentialScope_binding_body_data analysis.entry state binding bound
  have census := sequentialScope_valid_body_census program analysis.entry state binding declared valid bound
  obtain ⟨condition, conditionRead⟩ := sequentialScope_admitted_condition program analysis state analyzed admitted
  let variables := { state.variables with scopes := state.variables.scopes.filter (fun scope => decide (scope.owner ≠ binding.body.id)) }
  have removed : removeScopeVariables? state.variables binding.body.id = some variables := by
    simp only [removeScopeVariables?, selected, bind, Option.bind]
    rfl
  let retired := { state with variables, scopeOccurrences := state.scopeOccurrences.filter (fun candidate => decide (candidate ≠ binding.body)) }
  simp only [completeSequentialScopeResult?, bound, bind, Option.bind, quiet, noActivity,
    Bool.not_true, Bool.false_or, Bool.false_eq_true, ↓reduceIte, conditionRead, removed]
  by_cases terminal : binding.controller.completed + 1 = binding.controller.total ∨ condition = true
  · have stop : (decide (binding.controller.completed + 1 = binding.controller.total) || condition) = true := by
      simpa only [Bool.or_eq_true, decide_eq_true_eq] using terminal
    simp only [stop, ↓reduceIte]
    exact ⟨_, rfl⟩
  · have nonfinal : binding.controller.completed + 1 ≠ binding.controller.total := fun same => terminal (Or.inl same)
    have continueBody : condition = false := Bool.eq_false_iff.mpr (fun yes => terminal (Or.inr yes))
    obtain ⟨items, collection, fixedTotal, _⟩ := sequentialScope_valid_binding_collection
      program analysis.entry state binding declared valid bound
    obtain ⟨item, available⟩ := sequentialScope_nonfinal_item_exists analysis.entry state binding items bound fixedTotal nonfinal
    have noBody : retired.scopeOccurrences.any
        (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = false := by
      apply Bool.eq_false_iff.mpr
      intro present
      obtain ⟨occurrence, member, definition⟩ := List.any_eq_true.mp present
      have old : occurrence ∈ state.scopeOccurrences.filter
          (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) :=
        List.mem_filter.mpr ⟨(List.mem_filter.mp member).1, definition⟩
      rw [census] at old
      have same := List.mem_singleton.mp old
      simpa only [same, ne_eq, not_true_eq_false, decide_false, Bool.false_eq_true] using (List.mem_filter.mp member).2
    let child : ScopeOccurrenceId :=
      { processInstanceId := binding.activity.owner.processInstanceId, definitionScopeId := analysis.entry.childScopeId,
        activation := scopeActivationCount retired analysis.entry.childScopeId + 1 }
    have fresh : variables.scopes.any (fun scope => decide (scope.owner = child)) = false := by
      apply Bool.eq_false_iff.mpr
      intro present
      obtain ⟨scope, member, owner⟩ := List.any_eq_true.mp present
      have ownerEq := of_decide_eq_true owner
      obtain ⟨occurrence, occurrenceMem, occurrenceOwner⟩ := localOwners scope (List.mem_filter.mp member).1
      have old : occurrence ∈ state.scopeOccurrences.filter
          (fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) :=
        List.mem_filter.mpr ⟨occurrenceMem, by simp only [occurrenceOwner, ownerEq, child, beq_self_eq_true]⟩
      rw [census] at old
      have same : scope.owner = binding.body.id := occurrenceOwner.symm.trans (congrArg RuntimeScopeOccurrence.id (List.mem_singleton.mp old))
      simpa only [same, ne_eq, not_true_eq_false, decide_false, Bool.false_eq_true] using (List.mem_filter.mp member).2
    obtain ⟨locals, initialized⟩ := sequentialScope_admitted_start_initialization program analysis
      state.variables.process.bindings variables child analyzed admitted rfl fresh
    have issued := sequentialScope_fresh_child analysis.entry retired binding.activity.owner instanceId running noBody
    obtain ⟨actual, sourceItems, analyzedAgain, sourceCensus, within⟩ :=
      sequentialScope_admitted_start_collection program state.variables.process.bindings admitted
    have sameAnalysis : actual = analysis := Option.some.inj (analyzedAgain.symm.trans analyzed)
    subst actual
    have sameItems : sourceItems = items := by
      simpa only [sequentialScopeCollection?, sourceCensus, within, ↓reduceIte, Option.some.injEq] using collection
    subst sourceItems
    simp only [continueBody, Bool.or_false, decide_eq_false nonfinal, Bool.false_eq_true, ↓reduceIte,
      sourceCensus, available]
    change ∃ result, (issueSequentialScope? analysis.entry retired binding.activity.owner >>= _) = some result
    rw [issued]
    change ∃ result, (initializeScopeVariables? variables child analysis.entry.bodyInputs >>= _) = some result
    rw [initialized]
    exact ⟨_, rfl⟩

/-- SMIS-ADMIT-01's data analysis identifies the unique repeated entry used by runtime preservation. -/
theorem sequentialScope_analyzed_entry_census (program : Program) (analysis : SequentialScopeData.Analysis)
    (analyzed : SequentialScopeData.analyze program = some analysis) :
    program.operations.filterMap sequentialScopeEntry? = [analysis.entry] :=
  (sequentialScope_analysis_initial_reads program analysis analyzed).2.2.2.1

/-- Both permitted writer kinds preserve the complete body-local owner census. -/
theorem sequentialScope_write_preserves_owner_census (program : Program) (before : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : SequentialScopeWriteKind)
    (after : ScopedVariables) (written : writeSequentialScopeValues? program before owner values kind = some after) :
    after.scopes.map (·.owner) = before.variables.scopes.map (·.owner) := by
  unfold writeSequentialScopeValues? writeBoundMultiInstanceScopeValues? at written
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  dsimp only at written
  split at written <;> try contradiction
  obtain ⟨variables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  exact writeScopeVariables_preserves_owner_census (result := variables) bodyWrite

end BpmnSemantics.SemanticProcess
