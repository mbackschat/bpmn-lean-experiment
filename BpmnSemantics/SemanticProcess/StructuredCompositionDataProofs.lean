import BpmnSemantics.SemanticProcess.StructuredCompositionControlProofs

/-! SPC-AVAILABLE-01 separates computed predecessor obligations from runtime lookup. Binding-presence and uniqueness laws connect actual start/completion rewrites to the data facts used by the reachable-state argument. -/

namespace BpmnSemantics.SemanticProcess.StructuredComposition

def BindingPresent (bindings : List VariableBinding) (name : String) : Prop :=
  ∃ binding ∈ bindings, binding.name = name

private theorem canonical_head_name_precedes_tail (first : VariableBinding)
    (rest : List VariableBinding)
    (canonical : SemanticProcessJson.bindingNamesStrictlyIncrease (first :: rest) = true) :
    ∀ binding ∈ rest, first.name < binding.name := by
  induction rest generalizing first with
  | nil => simp
  | cons next remaining ih =>
      have facts : first.name < next.name ∧
          SemanticProcessJson.bindingNamesStrictlyIncrease (next :: remaining) = true := by
        simpa [SemanticProcessJson.bindingNamesStrictlyIncrease] using canonical
      intro binding member
      rcases List.mem_cons.mp member with same | later
      · subst binding
        exact facts.1
      · exact String.lt_trans facts.1 (ih next facts.2 binding later)

theorem canonical_bindings_have_unique_names (bindings : List VariableBinding)
    (canonical : SemanticProcessJson.bindingNamesStrictlyIncrease bindings = true) :
    (bindings.map (·.name)).Nodup := by
  induction bindings with
  | nil => exact List.nodup_nil
  | cons first rest ih =>
      apply List.nodup_cons.mpr
      constructor
      · intro duplicate
        obtain ⟨binding, member, same⟩ := List.mem_map.mp duplicate
        have before := canonical_head_name_precedes_tail first rest canonical binding member
        rw [same] at before
        exact String.lt_irrefl _ before
      · apply ih
        cases rest with
        | nil => rfl
        | cons next remaining =>
            simp only [SemanticProcessJson.bindingNamesStrictlyIncrease,
              Bool.and_eq_true] at canonical
            exact canonical.2

theorem present_unique_name_has_exact_lookup (bindings : List VariableBinding) (name : String)
    (unique : (bindings.map (·.name)).Nodup) (present : BindingPresent bindings name) :
    ∃ binding, bindings.filter (fun candidate => decide (candidate.name = name)) = [binding] := by
  have included : name ∈ bindings.map (·.name) := by
    obtain ⟨binding, member, same⟩ := present
    exact List.mem_map.mpr ⟨binding, member, same⟩
  have count : ((bindings.map (·.name)).filter (· == name)).length = 1 := by
    rw [← List.count_eq_length_filter]
    simpa [included] using unique.count (a := name)
  have one : (bindings.filter (fun binding => decide (binding.name = name))).length = 1 := by
    simpa [List.filter_map, Function.comp_def, Bool.beq_eq_decide_eq] using count
  exact List.length_eq_one_iff.mp one

theorem present_unique_typed_input_is_available
    (state : RuntimeState) (owner : ScopeOccurrenceId) (input : DirectActivityDataInput)
    (running : state.control = .running owner.processInstanceId)
    (endpoint : input.source = .property input.source.id)
    (unique : (state.variables.process.bindings.map (·.name)).Nodup)
    (present : BindingPresent state.variables.process.bindings input.source.id)
    (typed : ∀ binding ∈ state.variables.process.bindings,
      variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart binding.value = true) :
    ∃ binding, dataInputOutputSourceBinding? state owner input = some binding := by
  obtain ⟨binding, filtered⟩ := present_unique_name_has_exact_lookup _ input.source.id unique present
  have member : binding ∈ state.variables.process.bindings := (List.mem_filter.mp
    (show binding ∈ state.variables.process.bindings.filter
      (fun candidate => decide (candidate.name = input.source.id)) by rw [filtered]; simp)).1
  exact ⟨binding, readActivityDataInput_root_property running endpoint filtered
    (by have scalar := typed binding member
        cases value : binding.value <;> simp [processInterfaceScalar, variableValueAdmitted,
          activityDataInputOutputUserTaskProfileId, value] at scalar ⊢)⟩

theorem definite_input_is_written_on_each_predecessor
    (vertices : List Vertex) (facts : List DataFact) (id name : String)
    (written : name ∈ definiteInputs vertices facts id) :
    ∀ predecessor ∈ incoming vertices id,
      ∃ fact, facts.find? (·.id == predecessor.id) = some fact ∧ name ∈ fact.written := by
  have everySet : ∀ names ∈ (incoming vertices id).map (fun predecessor =>
      ((facts.find? (·.id == predecessor.id)).map (·.written)).getD []), name ∈ names := by
    unfold definiteInputs at written
    dsimp only at written
    split at written
    · simp at written
    · rename_i first rest sets
      obtain ⟨inFirst, inRest⟩ := List.mem_filter.mp written
      intro names member
      rw [sets] at member
      rcases List.mem_cons.mp member with rfl | later
      · exact inFirst
      · simpa using List.all_eq_true.mp inRest names later
  intro predecessor member
  have included := everySet _ (List.mem_map.mpr ⟨predecessor, member, rfl⟩)
  cases found : facts.find? (·.id == predecessor.id) with
  | none => simp [found] at included
  | some fact =>
      exact ⟨fact, rfl, by simpa [found] using included⟩

/-- Required predecessor values at a control position, read from the actual completed analysis. -/
def InputsPresent (vertices : List Vertex) (analysis : Analysis)
    (bindings : List VariableBinding) (id : String) : Prop :=
  ∀ name ∈ definiteInputs vertices
    (analysis.ordered.foldl (accumulateDataFacts vertices) ([], [])).1 id,
    BindingPresent bindings name

theorem predecessor_supplies_successor_inputs
    (vertices : List Vertex) (analysis : Analysis) (source : Vertex) (targetId : String)
    (bindings : List VariableBinding)
    (analyzed : analyze vertices = some analysis) (member : source ∈ analysis.ordered)
    (edge : targetId ∈ source.outputs)
    (inputs : InputsPresent vertices analysis bindings source.id)
    (output : ∀ name, source.writes = some name → BindingPresent bindings name) :
    InputsPresent vertices analysis bindings targetId := by
  intro name needed
  have permutation := (analysis_computes_from_complete_forward_order vertices analysis analyzed).2.1
  have predecessor := (incoming_membership vertices source targetId).mpr
    ⟨permutation.mem_iff.mp member, edge⟩
  obtain ⟨fact, selected, written⟩ := definite_input_is_written_on_each_predecessor
    vertices _ targetId name needed source predecessor
  have equation := analysis_data_fact_equation vertices analysis source analyzed member
  dsimp only at equation
  have same := Option.some.inj (selected.symm.trans equation)
  rw [same] at written
  cases writes : source.writes with
  | none => exact inputs name (by simpa [writes] using written)
  | some produced =>
      have alternatives : name = produced ∨ name ∈ definiteInputs vertices
          (analysis.ordered.foldl (accumulateDataFacts vertices) ([], [])).1 source.id := by
        simpa [writes] using written
      rcases alternatives with rfl | inherited
      · exact output _ writes
      · exact inputs name inherited

theorem replacement_binding_present (existing replacements : List VariableBinding)
    (name : String) (present : BindingPresent replacements name) :
    BindingPresent (mergeProcessVariableBindings existing replacements) name := by
  obtain ⟨binding, member, named⟩ := present
  exact ⟨binding, (mergeProcessVariableBindings_perm existing replacements).mem_iff.mpr
    (List.mem_append_left _ member), named⟩

theorem merge_preserves_binding_presence (existing replacements : List VariableBinding)
    (name : String) (present : BindingPresent existing name) :
    BindingPresent (mergeProcessVariableBindings existing replacements) name := by
  by_cases replaced : BindingPresent replacements name
  · exact replacement_binding_present existing replacements name replaced
  · obtain ⟨binding, member, named⟩ := present
    refine ⟨binding, (mergeProcessVariableBindings_perm existing replacements).mem_iff.mpr ?_, named⟩
    apply List.mem_append_right
    refine List.mem_filter.mpr ⟨member, ?_⟩
    simp
    intro replacement included same
    exact replaced ⟨replacement, included, same.trans named⟩

theorem merge_single_write_has_exact_binding
    (existing : List VariableBinding) (written : VariableBinding) :
    (mergeProcessVariableBindings existing [written]).filter
      (fun binding => decide (binding.name = written.name)) = [written] := by
  have removed : (existing.filter (fun binding =>
      !([written].map (·.name)).contains binding.name)).filter
      (fun binding => decide (binding.name = written.name)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro binding member matching
    have different : binding.name ≠ written.name := by
      simpa using (List.mem_filter.mp member).2
    exact different (of_decide_eq_true matching)
  have exactMembers := (mergeProcessVariableBindings_perm existing [written]).filter
    (fun binding => decide (binding.name = written.name))
  rw [List.filter_append, removed] at exactMembers
  simpa using exactMembers

theorem merge_single_write_preserves_unique_names
    (existing : List VariableBinding) (written : VariableBinding)
    (unique : (existing.map (·.name)).Nodup) :
    ((mergeProcessVariableBindings existing [written]).map (·.name)).Nodup := by
  apply ((mergeProcessVariableBindings_perm existing [written]).map (·.name)).nodup_iff.mpr
  change (written.name :: (existing.filter
    (fun binding => !([written].map (·.name)).contains binding.name)).map (·.name)).Nodup
  apply List.nodup_cons.mpr
  constructor
  · intro duplicate
    obtain ⟨binding, member, same⟩ := List.mem_map.mp duplicate
    have different : binding.name ≠ written.name := by
      simpa using (List.mem_filter.mp member).2
    exact different same
  · have sub : List.Sublist (existing.filter
        (fun binding => !([written].map (·.name)).contains binding.name)) existing := List.filter_sublist
    exact (sub.map (·.name)).nodup unique

theorem composed_completion_preserves_binding_presence
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (name : String) (present : BindingPresent before.variables.process.bindings name)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) : BindingPresent after.variables.process.bindings name := by
  rcases dataInputOutputCompletionProcessEffect completed with unchanged | ⟨written, _, changed⟩
  · simpa only [unchanged] using present
  · rw [changed]
    exact merge_preserves_binding_presence _ _ name present

theorem composed_completion_preserves_unique_binding_names
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (unique : (before.variables.process.bindings.map (·.name)).Nodup)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) : (after.variables.process.bindings.map (·.name)).Nodup := by
  rcases dataInputOutputCompletionProcessEffect completed with unchanged | ⟨written, _, changed⟩
  · simpa only [unchanged] using unique
  · rw [changed]
    exact merge_single_write_preserves_unique_names _ _ unique

theorem composed_completion_supplies_associated_property
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (contract : DataInputOutputTaskContract)
    (endpoint : contract.directOutput.target = .property contract.directOutput.target.id)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) :
    BindingPresent after.variables.process.bindings contract.directOutput.target.id := by
  obtain ⟨_, selected, filled, _, _, _, _, _, selectedEq, supplied, _⟩ :=
    dataInputOutputCompletionJoin completed
  have same : selected = contract := Option.some.inj (selectedEq.symm.trans declared)
  subst selected
  rw [dataInputOutputCompletionWritesAssociatedProperty endpoint declared supplied completed]
  apply replacement_binding_present
  exact ⟨_, List.mem_singleton_self _, rfl⟩

theorem composed_completion_supplies_unique_associated_property
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (contract : DataInputOutputTaskContract)
    (endpoint : contract.directOutput.target = .property contract.directOutput.target.id)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) :
    ∃ binding,
      after.variables.process.bindings.filter
        (fun candidate => decide (candidate.name = contract.directOutput.target.id)) = [binding] ∧
      binding.name = contract.directOutput.target.id := by
  obtain ⟨_, selected, filled, _, _, _, _, _, selectedEq, supplied, _⟩ :=
    dataInputOutputCompletionJoin completed
  have same : selected = contract := Option.some.inj (selectedEq.symm.trans declared)
  subst selected
  rw [dataInputOutputCompletionWritesAssociatedProperty endpoint declared supplied completed]
  exact ⟨associatedProcessBinding contract.directOutput.target.id filled,
    merge_single_write_has_exact_binding before.variables.process.bindings
      (associatedProcessBinding contract.directOutput.target.id filled), rfl⟩

theorem admitted_internal_step_preserves_process_bindings
    (program : Program) (analysis : Analysis) (operation : SemanticOperation)
    (before after : RuntimeState)
    (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations)
    (fired : fire? program operation before = some after) :
    after.variables.process.bindings = before.variables.process.bindings := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have absent := fire_isSome_snapshotDeclaration_is_absent program operation before
    (congrArg Option.isSome fired)
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    have step := fire_sound program _ before after fired
    cases step with
    | initiate _ _ _ _ _ initiated =>
        obtain ⟨owner, owned, initiated⟩ := Option.bind_eq_some_iff.mp initiated
        split at initiated
        · cases Option.some.inj initiated
          rfl
        · contradiction
  case awaitUserTask id origin input output task =>
    rw [fire_awaitUserTask_withoutSnapshotDeclaration _ _ _ _ _ _ _ absent] at fired
    simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, owned, instanceId, hosted, fired⟩ := fired
    cases Option.some.inj fired
    rfl
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    have step := fire_sound program _ before after fired
    cases step with
    | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ activated =>
        simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at activated
        obtain ⟨owner, owned, instanceId, hosted, source, available, activated⟩ := activated
        split at activated
        · contradiction
        · cases Option.some.inj activated
          rfl
  case choose id origin input candidates defaultOutput defaultOrigin =>
    rw [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent] at fired
    simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, owned, output, chosen, fired⟩ := fired
    cases Option.some.inj fired
    rfl
  case mergeExclusive id origin inputs output =>
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · cases Option.some.inj fired
      rfl
    · contradiction
  case reachNoneEnd id origin input =>
    rw [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent] at fired
    simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at fired
    obtain ⟨owner, owned, instanceId, hosted, fired⟩ := fired
    cases Option.some.inj fired
    rfl
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
        have step := fire_sound program _ before after fired
        cases step with
        | completeScope _ _ _ _ _ _ completed =>
            rw [selected_scope_completion_delegates_to_root program before scope allowed] at completed
            unfold completeScopeState? at completed
            split at completed
            · split at completed
              · contradiction
              · unfold completeQuiescentScope? at completed
                split at completed
                · split at completed
                  · contradiction
                  · cases Option.some.inj completed
                    rfl
                · contradiction
                · contradiction
            · contradiction

theorem ordinary_completion_preserves_process_bindings
    (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    after.variables.process.bindings = before.variables.process.bindings := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · cases Option.some.inj completed
    rfl

theorem completion_admission_preserves_binding_presence
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (name : String) (present : BindingPresent before.variables.process.bindings name)
    (analyzed : programAnalysis program = some analysis) :
    BindingPresent (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state.variables.process.bindings name := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    refused | ⟨after, completed, _, result⟩ | ⟨after, completed, _, _, result⟩ |
      ⟨after, completed, _, _, result⟩
  · simpa [refused] using present
  · rw [result]
    exact composed_completion_preserves_binding_presence program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings name present completed
  · rw [result]
    apply merge_preserves_binding_presence
    rw [ordinary_completion_preserves_process_bindings before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation completed]
    exact present
  · rw [result]
    change BindingPresent after.variables.process.bindings name
    rw [ordinary_completion_preserves_process_bindings before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation completed]
    exact present

/-- The existing runtime lookup requires one binding per name and the scalar input domain. -/
def ProcessBindingsValid (bindings : List VariableBinding) : Prop :=
  (bindings.map (·.name)).Nodup ∧ ∀ binding ∈ bindings,
    variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart binding.value = true

theorem composition_scalar_domains_agree (value : VariableValue) :
    variableValueAdmitted structuredCompositionCheckpointProfileId .processStart value =
      variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart value ∧
    variableValueAdmitted structuredCompositionCheckpointProfileId .userTaskCompletion value =
      variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart value := by
  cases value <;> exact ⟨rfl, rfl⟩

theorem ordinary_composition_completion_has_empty_patch
    (program : Program) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (accepted : structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true) :
    bindings = [] := by
  simp [structuredCompositionOrdinaryCompletionAdmitted, profile] at accepted
  exact accepted.1

theorem composed_completion_preserves_valid_bindings
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (_profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (valid : ProcessBindingsValid before.variables.process.bindings)
    (_accepted : processDataBindingsAdmitted program.identity.semanticProfile
      .userTaskCompletion bindings = true)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) : ProcessBindingsValid after.variables.process.bindings := by
  rcases dataInputOutputCompletionProcessEffect completed with unchanged | ⟨written, scalar, changed⟩
  · simpa only [unchanged] using valid
  · rw [changed]
    refine ⟨merge_single_write_preserves_unique_names _ written valid.1, ?_⟩
    intro binding included
    rcases List.mem_append.mp ((mergeProcessVariableBindings_perm before.variables.process.bindings
      [written]).mem_iff.mp included) with replaced | retained
    · have same := List.mem_singleton.mp replaced
      subst binding
      cases value : written.value <;> simp [processInterfaceScalar, variableValueAdmitted,
        activityDataInputOutputUserTaskProfileId, value] at scalar ⊢
    · exact valid.2 binding (List.mem_filter.mp retained).1

theorem completion_admission_preserves_valid_bindings
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (valid : ProcessBindingsValid before.variables.process.bindings) :
    ProcessBindingsValid (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state.variables.process.bindings := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    refused | ⟨after, completed, accepted, result⟩ | ⟨after, completed, ordinary, _, result⟩ |
      ⟨after, completed, call, _, result⟩
  · simpa [refused] using valid
  · rw [result]
    exact composed_completion_preserves_valid_bindings program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings profile valid accepted completed
  · have empty := ordinary_composition_completion_has_empty_patch program taskId bindings profile ordinary
    rw [result]
    change ProcessBindingsValid (mergeProcessVariableBindings after.variables.process.bindings bindings)
    rw [empty, ordinary_completion_preserves_process_bindings before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation completed]
    have permutation : (mergeProcessVariableBindings before.variables.process.bindings []).Perm
        before.variables.process.bindings := by
      have unchanged : before.variables.process.bindings.filter (fun _ => true) =
          before.variables.process.bindings := List.filter_eq_self.mpr (by simp)
      simpa [unchanged] using mergeProcessVariableBindings_perm before.variables.process.bindings []
    exact ⟨(permutation.map (·.name)).nodup_iff.mpr valid.1,
      fun binding member => valid.2 binding (permutation.mem_iff.mp member)⟩
  · simp [isCallActivityProgram, profile, structuredCompositionCheckpointProfileId] at call

theorem composed_completion_supplies_successor_inputs
    (program : Program) (analysis : Analysis) (vertices : List Vertex)
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (bindings : List VariableBinding) (contract : DataInputOutputTaskContract)
    (source : Vertex) (targetId : String)
    (analyzed : analyze vertices = some analysis) (member : source ∈ analysis.ordered)
    (edge : targetId ∈ source.outputs)
    (writes : source.writes = some contract.directOutput.target.id)
    (inputs : InputsPresent vertices analysis before.variables.process.bindings source.id)
    (endpoint : contract.directOutput.target = .property contract.directOutput.target.id)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) : InputsPresent vertices analysis after.variables.process.bindings targetId := by
  apply predecessor_supplies_successor_inputs vertices analysis source targetId
    after.variables.process.bindings analyzed member edge
  · intro name needed
    exact composed_completion_preserves_binding_presence program before after instanceId taskId
      activation bindings name (inputs name needed) completed
  · intro name same
    have target := Option.some.inj (same.symm.trans writes)
    rw [target]
    exact composed_completion_supplies_associated_property program before after instanceId taskId
      activation bindings contract endpoint declared completed

theorem declared_completion_transports_input_obligations
    (program : Program) (analysis : Analysis) (vertices : List Vertex)
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (bindings : List VariableBinding) (contract : DataInputOutputTaskContract)
    (analyzed : programAnalysis program = some analysis)
    (graph : analyze vertices = some analysis)
    (inputs : InputsPresent vertices analysis before.variables.process.bindings contract.operationId.value)
    (declared : dataInputOutputTaskContract? program taskId = some contract)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation
      bindings = some after) :
    ∃ target, consumer? program contract.output = some target ∧
      InputsPresent vertices analysis after.variables.process.bindings target := by
  obtain ⟨vertex, member, target, consumer, shape, _, endpoint⟩ :=
    completion_contract_has_analyzed_vertex program analysis taskId contract analyzed declared
  refine ⟨target, consumer, ?_⟩
  apply composed_completion_supplies_successor_inputs program analysis vertices before after instanceId
    taskId activation bindings contract vertex target graph member
  · simp [shape]
  · simp [shape]
  · simpa [shape] using inputs
  · exact endpoint
  · exact declared
  · exact completed

/-- A wait retains the declaration that supplied its task identity and continuation. -/
def WaitMatchesOperation (wait : UserTaskWait) : SemanticOperation → Prop
  | .awaitUserTask _ _ _ output task => wait.task.id = task.id ∧ wait.output = output
  | .awaitDataInputOutputUserTask _ _ _ output taskId .. =>
      wait.task.id = taskId ∧ wait.output = output
  | _ => False

/-- Token obligations apply before the consuming operation; wait obligations apply before its output write. -/
def RuntimeInputPositions (program : Program) (vertices : List Vertex) (analysis : Analysis)
    (state : RuntimeState) : Prop :=
  (∀ token ∈ state.tokens, ∃ target, consumer? program token.placeId = some target ∧
    InputsPresent vertices analysis state.variables.process.bindings target) ∧
  (∀ wait ∈ state.waits, ∃ operation ∈ program.operations,
    WaitMatchesOperation wait operation ∧
      InputsPresent vertices analysis state.variables.process.bindings operation.id.value)

theorem committed_start_has_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    RuntimeInputPositions program vertices analysis
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state := by
  obtain ⟨tokens, waits, _⟩ := committed_initial_start_control_fields program commandId processId
    instanceId bindings profile committed
  simp [RuntimeInputPositions, tokens, waits]

theorem input_position_supplies_data_task_lookup
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (state : RuntimeState)
    (token : ControlToken) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId taskName
      directInput directOutput ∈ program.operations)
    (running : state.control = .running token.owner.processInstanceId)
    (live : token ∈ state.tokens) (position : token.placeId = input)
    (positions : RuntimeInputPositions program vertices analysis state)
    (valid : ProcessBindingsValid state.variables.process.bindings)
    (required : ∀ name ∈ analysis.required, BindingPresent state.variables.process.bindings name) :
    ∃ binding, dataInputOutputSourceBinding? state token.owner directInput = some binding := by
  obtain ⟨target, consumer, present⟩ := positions.1 token live
  rw [position] at consumer
  have named := consumer_names_the_input_operation program input target _ consumer member (by
    simp [operationInputs])
  obtain ⟨vertex, included, projected⟩ := program_analysis_projects_each_executable_operation
    program analysis _ analyzed member rfl
  have identity := projected_operation_preserves_identity program _ vertex projected
  cases source : directInput.source <;> cases destination : directOutput.target <;>
    simp [operationVertex?, source, destination, bind, Option.bind_eq_some_iff] at projected
  obtain ⟨next, _, same⟩ := projected
  have reads : vertex.reads = some directInput.source.id := by
    simp [← same, source, ActivityDataInputSource.id]
  apply present_unique_typed_input_is_available state token.owner directInput running
    (by simp [source, ActivityDataInputSource.id]) valid.1 _ valid.2
  rcases analysis_read_obligation vertices analysis vertex directInput.source.id graph included reads
      with initial | inherited
  · exact required _ initial
  · have same : vertex.id = target := identity.trans named.symm
    rw [same] at inherited
    exact present _ inherited

theorem initiation_establishes_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.initiate id origin output ∈ program.operations)
    (bounded : ControlUnitBound before)
    (fired : fire? program (.initiate id origin output) before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have pending : before.initiationPending = true := by
    have step := fire_sound program _ before after fired
    cases step with
    | initiate _ _ _ _ _ initiated =>
        obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
        by_cases pending : before.initiationPending = true
        · exact pending
        · simp [pending] at initiated
  have empty := bounded
  simp [ControlUnitBound, pending] at empty
  obtain ⟨_, waits, _, token, single, place⟩ :=
    initiation_creates_single_control_token program before after id origin output empty.1 fired
  obtain ⟨vertex, included, projected⟩ := program_analysis_projects_each_executable_operation
    program analysis _ analyzed member rfl
  simp only [operationVertex?, bind, pure, Option.bind_eq_some_iff] at projected
  obtain ⟨target, consumer, same⟩ := projected
  have shape := Option.some.inj same
  have noPredecessors := analyzed_start_has_no_predecessors vertices analysis vertex graph included
    (by rw [← shape])
  have supplied : InputsPresent vertices analysis after.variables.process.bindings target := by
    apply predecessor_supplies_successor_inputs vertices analysis vertex target _ graph included
    · simp [← shape]
    · intro name needed
      simp [definiteInputs, noPredecessors] at needed
    · intro name written
      simp [← shape] at written
  constructor
  · intro current live
    have sameToken : current = token := by simpa [single] using live
    subst current
    exact ⟨target, by simpa [place] using consumer, supplied⟩
  · simp [waits, empty.2]

theorem arming_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (token : ControlToken)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before)
    (live : token ∈ before.tokens) (input : token.placeId ∈ operationInputs operation)
    (noTokens : after.tokens = [])
    (waits : ∀ wait ∈ after.waits, WaitMatchesOperation wait operation)
    (fired : fire? program operation before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  obtain ⟨target, consumer, present⟩ := positions.1 token live
  have named := consumer_names_the_input_operation program token.placeId target operation consumer member input
  have unchanged := admitted_internal_step_preserves_process_bindings program analysis operation before after
    analyzed member fired
  constructor
  · simp [noTokens]
  · intro wait included
    refine ⟨operation, member, waits wait included, ?_⟩
    rw [unchanged, ← named]
    exact present

theorem data_arming_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (analyzed : programAnalysis program = some analysis)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId taskName
      directInput directOutput ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.awaitDataInputOutputUserTask id origin input output taskId taskName
      directInput directOutput) before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ activated =>
      obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp activated
      obtain ⟨token, single, noWait, _⟩ := enabled_token_under_bound_is_single before input owner bounded owned
      obtain ⟨noTokens, _, _, place, waits⟩ := data_arming_replaces_single_token_with_single_wait
        program before after token id origin input output taskId taskName directInput directOutput single noWait fired
      exact arming_preserves_input_positions program vertices analysis before after _ token analyzed member
        positions (by simp [single]) (by simp [operationInputs, place]) noTokens waits fired

theorem ordinary_arming_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (analyzed : programAnalysis program = some analysis)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.awaitUserTask id origin input output task) before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitUserTask _ _ _ _ _ _ _ activated =>
      obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp activated
      obtain ⟨token, single, noWait, _⟩ := enabled_token_under_bound_is_single before input owner bounded owned
      obtain ⟨noTokens, _, _, place, waits⟩ := ordinary_arming_replaces_single_token_with_single_wait
        program before after token id origin input output task single noWait fired
      exact arming_preserves_input_positions program vertices analysis before after _ token analyzed member
        positions (by simp [single]) (by simp [operationInputs, place]) noTokens waits fired

theorem nonwriting_step_moves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (source : Vertex) (token next : ControlToken)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : operation ∈ program.operations) (included : source ∈ analysis.ordered)
    (projected : operationVertex? program operation = some source) (noWrite : source.writes = none)
    (positions : RuntimeInputPositions program vertices analysis before)
    (live : token ∈ before.tokens) (input : token.placeId ∈ operationInputs operation)
    (single : after.tokens = [next]) (noWaits : after.waits = [])
    (output : next.placeId ∈ SemanticProcess.operationOutputs operation)
    (fired : fire? program operation before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  obtain ⟨current, consumer, present⟩ := positions.1 token live
  have named := consumer_names_the_input_operation program token.placeId current operation consumer member input
  have identity := projected_operation_preserves_identity program operation source projected
  obtain ⟨target, edge, nextConsumer⟩ := projected_output_has_analyzed_edge program operation source next.placeId projected output
  have unchanged := admitted_internal_step_preserves_process_bindings program analysis operation before after analyzed member fired
  have ready : InputsPresent vertices analysis after.variables.process.bindings target := by
    rw [unchanged]
    apply predecessor_supplies_successor_inputs vertices analysis source target _ graph included edge
    · simpa [identity, named] using present
    · intro name written
      simp [noWrite] at written
  constructor
  · intro current live
    have same : current = next := by simpa [single] using live
    subst current
    exact ⟨target, nextConsumer, ready⟩
  · simp [noWaits]

theorem choice_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input defaultOutput : ControlPlaceId)
    (candidates : List ConditionalCandidate) (defaultOrigin : BpmnSequenceFlowOrigin)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.choose id origin input candidates defaultOutput defaultOrigin ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.choose id origin input candidates defaultOutput defaultOrigin) before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  have active := fired
  rw [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent] at active
  obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
  obtain ⟨token, single, noWait, _⟩ := enabled_token_under_bound_is_single before input owner bounded owned
  obtain ⟨_, waits, _, place, next, tokens, output⟩ := choice_preserves_single_control_token
    program before after token id origin input defaultOutput candidates defaultOrigin single fired
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
  have noWrite : source.writes = none := by
    have selected := projected
    simp [operationVertex?, bind, Option.bind_eq_some_iff] at selected
    obtain ⟨_, _, _, same⟩ := selected
    cases same
    rfl
  exact nonwriting_step_moves_input_positions program vertices analysis before after _ source token next
    analyzed graph member included projected noWrite positions (by simp [single])
    (by simp [operationInputs, place]) tokens (waits.trans noWait) output fired

theorem merge_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.mergeExclusive id origin inputs output) before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  have active := fired
  rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at active
  unfold mergeExclusiveState? at active
  split at active
  · rename_i token selected
    have offered : token ∈ exclusiveMergeInputTokens before inputs := by rw [selected]; simp
    have live := (List.mem_filter.mp offered).1
    obtain ⟨single, noWait, _⟩ := live_token_under_bound_is_single before token bounded live
    obtain ⟨input, waits, next, tokens, outputEq⟩ := merge_moves_single_token_to_output program before after token id origin inputs output single fired
    obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
    have noWrite : source.writes = none := by
      have projection := projected
      simp [operationVertex?, bind, Option.bind_eq_some_iff] at projection
      obtain ⟨_, _, _, same⟩ := projection
      cases same
      rfl
    exact nonwriting_step_moves_input_positions program vertices analysis before after _ source token next
      analyzed graph member included projected noWrite positions live input tokens (waits.trans noWait)
      (by simp [SemanticProcess.operationOutputs, outputEq]) fired
  · contradiction

theorem admitted_fire_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : operation ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program operation before = some after) :
    RuntimeInputPositions program vertices analysis after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have unchanged := admitted_internal_step_preserves_process_bindings program analysis operation before after analyzed member fired
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    exact initiation_establishes_input_positions program vertices analysis before after id origin output analyzed graph member bounded fired
  case awaitUserTask id origin input output task =>
    exact ordinary_arming_preserves_input_positions program vertices analysis before after id origin input output task analyzed member positions bounded fired
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    exact data_arming_preserves_input_positions program vertices analysis before after id origin input output taskId taskName directInput directOutput analyzed member positions bounded fired
  case choose id origin input candidates defaultOutput defaultOrigin =>
    exact choice_preserves_input_positions program vertices analysis before after id origin input defaultOutput candidates defaultOrigin analyzed graph member positions bounded fired
  case mergeExclusive id origin inputs output =>
    exact merge_preserves_input_positions program vertices analysis before after id origin inputs output analyzed graph member positions bounded fired
  case reachNoneEnd id origin input =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    have active := fired
    rw [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent] at active
    obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
    obtain ⟨token, single, noWait, _⟩ := enabled_token_under_bound_is_single before input owner bounded owned
    obtain ⟨tokens, waits, _⟩ := none_end_consumes_single_control_token program before after token id origin input single fired
    simp [RuntimeInputPositions, tokens, waits, noWait]
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
        obtain ⟨tokens, waits, _⟩ := root_completion_preserves_control_fields program before after id origin scope allowed fired
        simpa only [RuntimeInputPositions, tokens, waits, unchanged] using positions

theorem unique_bindings_make_conditions_total
    (bindings : List VariableBinding) (unique : (bindings.map (·.name)).Nodup)
    (expression : SimpleBooleanExpression) : ∃ value, evaluateSimpleBooleanExpression expression bindings = some value := by
  have lookup : ∀ name, bindings.filter (fun binding => decide (binding.name = name)) = [] ∨
      ∃ binding, bindings.filter (fun binding => decide (binding.name = name)) = [binding] := by
    intro name
    by_cases present : BindingPresent bindings name
    · exact Or.inr (present_unique_name_has_exact_lookup bindings name unique present)
    · apply Or.inl
      apply List.filter_eq_nil_iff.mpr
      intro binding member matched
      exact present ⟨binding, member, by simpa using matched⟩
  cases expression with
  | literal value => exact ⟨value, rfl⟩
  | isPresent name =>
    rcases lookup name with absent | ⟨binding, singleton⟩
    · simp [evaluateSimpleBooleanExpression, absent]
    · simp [evaluateSimpleBooleanExpression, singleton]
  | isNull name =>
    rcases lookup name with absent | ⟨binding, singleton⟩
    · simp [evaluateSimpleBooleanExpression, absent]
    · rcases binding with ⟨bindingName, value⟩
      cases value <;> simp [evaluateSimpleBooleanExpression, singleton]
  | stringEquals name expected =>
    rcases lookup name with absent | ⟨binding, singleton⟩
    · simp [evaluateSimpleBooleanExpression, absent]
    · rcases binding with ⟨bindingName, value⟩
      cases value <;> simp [evaluateSimpleBooleanExpression, singleton]

theorem unique_bindings_make_choice_total
    (bindings : List VariableBinding) (unique : (bindings.map (·.name)).Nodup)
    (candidates : List ConditionalCandidate) (fallback : ControlPlaceId) :
    ∃ output, selectConditionalOutput candidates fallback bindings = some output := by
  induction candidates with
  | nil => exact ⟨fallback, rfl⟩
  | cons candidate rest ih =>
    obtain ⟨value, evaluated⟩ := unique_bindings_make_conditions_total bindings unique candidate.condition
    cases value with
    | true => exact ⟨candidate.output, by simp [selectConditionalOutput, evaluated]⟩
    | false => simpa [selectConditionalOutput, evaluated] using ih

theorem exact_data_contract_selects_data_dispatch
    (program : Program) (taskId : TaskDefinitionId) (contract : DataInputOutputTaskContract)
    (found : dataInputOutputTaskContract? program taskId = some contract) :
    isDataInputOutputTaskDefinition program taskId = true := by
  unfold dataInputOutputTaskContract? at found
  split at found
  · rename_i selected singleton
    have member : selected ∈ (dataInputOutputTaskContracts program).filter (fun candidate => decide (candidate.taskId = taskId)) :=
      by rw [singleton]; simp
    exact List.any_eq_true.mpr ⟨selected, (List.mem_filter.mp member).1, (List.mem_filter.mp member).2⟩
  · contradiction

end BpmnSemantics.SemanticProcess.StructuredComposition
