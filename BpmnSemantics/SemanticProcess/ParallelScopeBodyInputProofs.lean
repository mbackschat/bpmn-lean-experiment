module

public import BpmnSemantics.SemanticProcess.ParallelScopeEffectMappingProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Repeated-body local input availability

PMIS-DATA-01 distinguishes a present scalar local, including null, from an absent
local eligible for Process fallback. Population ownership alone does not certify
the stored values; initialization and nearest-scope writes own that invariant.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- A body's local names stay exactly those initialized by its input declarations. -/
def ParallelScopeLocalBindings (names : List String) (bindings : List VariableBinding) : Prop :=
  (bindings.map (·.name)).Nodup ∧
    (∀ binding ∈ bindings, scopeVariableScalar binding.value = true) ∧
    ∀ name, name ∈ bindings.map (·.name) ↔ name ∈ names

/-- Every retained body frame has the same declared scalar name domain. -/
def ParallelScopeLocalsValid (names : List String) (variables : ScopedVariables) : Prop :=
  ∀ frame ∈ variables.scopes, ParallelScopeLocalBindings names frame.bindings

private theorem ordered_snapshot_fields (mappings : List VariableMapping) (bindings : List VariableBinding)
    (matched : orderedInputSnapshotMatches mappings bindings = true) :
    bindings.map (·.name) = mappings.map (·.target) ∧
      ∀ binding ∈ bindings, scopeVariableScalar binding.value = true := by
  induction mappings generalizing bindings with
  | nil => cases bindings <;> simp_all [orderedInputSnapshotMatches]
  | cons mapping rest ih =>
      cases bindings with
      | nil => simp [orderedInputSnapshotMatches] at matched
      | cons first tail =>
          simp only [orderedInputSnapshotMatches, Bool.and_eq_true] at matched
          obtain ⟨names, typed⟩ := ih tail matched.2
          have named : mapping.target = first.name := by simpa using matched.1.1
          have scalar : scopeVariableScalar first.value = true := by
            have expression := matched.1.2
            cases source : mapping.expression <;> cases value : first.value <;>
              simp_all [scopeVariableScalar]
          refine ⟨by simp [named, names], ?_⟩
          intro binding member
          rcases List.mem_cons.mp member with rfl | later
          · exact scalar
          · exact typed binding later

/-- Successful input evaluation yields distinct scalar bindings with exactly the declared targets. -/
theorem parallelScope_evaluated_local_bindings (read : String → Option VariableValue)
    (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateInputMappings? read mappings = some bindings) :
    ParallelScopeLocalBindings (mappings.map (·.target)) bindings := by
  unfold evaluateInputMappings? canonicalInputMappings? at evaluated
  split at evaluated <;> try contradiction
  rename_i unique
  obtain ⟨names, typed⟩ := ordered_snapshot_fields _ bindings
    (evaluateInputMappingsInOrder_snapshot read _ bindings evaluated)
  have permutation := (sortByTarget_perm mappings).map (·.target)
  refine ⟨?_, typed, ?_⟩
  · rw [names]
    exact permutation.nodup_iff.mpr unique
  · intro name
    rw [names]
    exact permutation.mem_iff

private theorem merged_unique (before patch : List VariableBinding)
    (beforeUnique : (before.map (·.name)).Nodup) (patchUnique : (patch.map (·.name)).Nodup) :
    ((mergeProcessVariableBindings before patch).map (·.name)).Nodup := by
  apply List.pairwise_map.mpr
  apply (mergeProcessVariableBindings_strictOrder before patch beforeUnique patchUnique).imp
  intro left right smaller equal
  rw [equal] at smaller
  exact String.lt_irrefl _ smaller

private theorem merge_existing_local_names (names : List String) (before patch : List VariableBinding)
    (valid : ParallelScopeLocalBindings names before)
    (unique : (patch.map (·.name)).Nodup)
    (typed : ∀ binding ∈ patch, scopeVariableScalar binding.value = true)
    (existing : ∀ binding ∈ patch, binding.name ∈ before.map (·.name)) :
    ParallelScopeLocalBindings names (mergeProcessVariableBindings before patch) := by
  refine ⟨merged_unique before patch valid.1 unique, ?_, ?_⟩
  · intro binding member
    rcases List.mem_append.mp ((mergeProcessVariableBindings_perm before patch).mem_iff.mp member) with written | retained
    · exact typed binding written
    · exact valid.2.1 binding (List.mem_filter.mp retained).1
  · intro name
    constructor
    · intro member
      obtain ⟨binding, member, named⟩ := List.mem_map.mp member
      apply (valid.2.2 name).mp
      rw [← named]
      rcases List.mem_append.mp ((mergeProcessVariableBindings_perm before patch).mem_iff.mp member) with written | retained
      · exact existing binding written
      · exact List.mem_map.mpr ⟨binding, (List.mem_filter.mp retained).1, rfl⟩
    · intro member
      obtain ⟨binding, included, named⟩ := List.mem_map.mp ((valid.2.2 name).mpr member)
      obtain ⟨after, present, same⟩ := SerialBusinessTask.merge_preserves_binding_presence before patch name ⟨binding, included, named⟩
      exact List.mem_map.mpr ⟨after, present, same⟩

/-- Each successful initialization adds precisely its scalar input snapshot and preserves earlier body data. -/
theorem parallelScope_initialize_locals (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (mappings : List VariableMapping) (initialized : initializeScopeVariables? before owner mappings = some after)
    (valid : ParallelScopeLocalsValid (mappings.map (·.target)) before) :
    ParallelScopeLocalsValid (mappings.map (·.target)) after := by
  unfold initializeScopeVariables? at initialized
  split at initialized <;> try contradiction
  obtain ⟨bindings, evaluated, initialized⟩ := Option.bind_eq_some_iff.mp initialized
  split at initialized <;> try contradiction
  cases Option.some.inj initialized
  have fields := parallelScope_evaluated_local_bindings (enclosingVariable? before.process.bindings) mappings bindings evaluated
  have permutation : (mergeProcessVariableBindings [] bindings).Perm bindings := by
    simpa only [List.filter_nil, List.append_nil] using mergeProcessVariableBindings_perm [] bindings
  intro frame member
  rcases (mem_canonicalInsertBy _ _ _ _).mp member with rfl | old
  · refine ⟨(permutation.map (·.name)).nodup_iff.mpr fields.1, ?_, ?_⟩
    · intro binding present
      exact fields.2.1 binding (permutation.mem_iff.mp present)
    · intro name
      exact (permutation.map (·.name)).mem_iff.trans (fields.2.2 name)
  · exact valid frame old

/-- Nearest-scope writes preserve the scalar local domain and never introduce a new local name. -/
theorem parallelScope_write_locals (names : List String) (before after : ScopedVariables)
    (owner : ScopeOccurrenceId) (patch : List VariableBinding)
    (written : writeScopeVariables? before owner patch = some after)
    (valid : ParallelScopeLocalsValid names before) : ParallelScopeLocalsValid names after := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, selected, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  rename_i accepted
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at accepted
  have unique : (patch.map (·.name)).Nodup := by
    have checked : scopeVariableNamesUnique patch = true := by
      simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.1.2
    exact of_decide_eq_true checked
  have typed : patch.all (fun binding => scopeVariableScalar binding.value) = true := by
    simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.2
  cases Option.some.inj written
  intro frame member
  obtain ⟨original, present, edited⟩ := List.mem_map.mp member
  split at edited
  · rename_i sameOwner
    have same : original = scope := by
      have member : original ∈ before.scopes.filter (fun candidate => decide (candidate.owner = owner)) :=
        List.mem_filter.mpr ⟨present, by simp [sameOwner]⟩
      rw [selectScopeVariables_iff.mp selected] at member
      simpa using member
    subst original
    cases edited
    apply merge_existing_local_names names scope.bindings _ (valid scope present)
    · exact (List.filter_sublist.map (fun binding : VariableBinding => binding.name)).nodup unique
    · intro binding included
      exact List.all_eq_true.mp typed binding (List.mem_filter.mp included).1
    · intro binding included
      simpa using (List.mem_filter.mp included).2
  · cases edited
    exact valid _ present

/-- A valid local either supplies a scalar (including null) or leaves an available Process value visible. -/
theorem parallelScope_local_or_process_read (names : List String) (variables : ScopedVariables)
    (owner : ScopeOccurrenceId) (frame : ScopeVariableScope)
    (selected : selectScopeVariables? variables owner = some frame)
    (valid : ParallelScopeLocalBindings names frame.bindings) (name : String)
    (available : name ∈ names ∨ ∃ value, enclosingVariable? variables.process.bindings name = some value) :
    ∃ value, readScopeVariable? variables owner name = some value ∧ scopeVariableScalar value = true := by
  by_cases localName : name ∈ frame.bindings.map (·.name)
  · obtain ⟨binding, member, named⟩ := List.mem_map.mp localName
    have census := filter_key_eq_singleton_of_nodup frame.bindings (·.name) binding valid.1 member
    have exactName : frame.bindings.filter (·.name == name) = [binding] := by
      simpa only [named, Bool.beq_eq_decide_eq] using census
    exact ⟨binding.value, by simp [readScopeVariable?, selected, exactName, valid.2.1 binding member], valid.2.1 binding member⟩
  · have empty : frame.bindings.filter (·.name == name) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro binding member
      have different : binding.name ≠ name := by
        intro same
        exact localName (List.mem_map.mpr ⟨binding, member, same⟩)
      simpa using different
    rcases available with declared | ⟨value, found⟩
    · exact False.elim (localName ((valid.2.2 name).mpr declared))
    · have fallback : readScopeVariable? variables owner name = enclosingVariable? variables.process.bindings name := by
        simp only [readScopeVariable?, selected, bind, Option.bind_some, empty]
        change (match variables.process.bindings.filter (·.name == name) with
          | [binding] => if scopeVariableScalar binding.value then some binding.value else none
          | _ => none) = enclosingVariable? variables.process.bindings name
        unfold enclosingVariable?
        generalize census : variables.process.bindings.filter (·.name == name) = values
        cases values with
        | nil => rfl
        | cons binding rest =>
            cases rest with
            | nil => rcases binding with ⟨_, stored⟩; cases stored <;> rfl
            | cons _ _ => rfl
      refine ⟨value, fallback.trans found, ?_⟩
      have scalar := SerialBusinessTask.enclosing_value_scalar _ _ value found
      cases value <;> exact scalar

/-- The captured item replaces only its own Process lookup; other scalar reads survive. -/
theorem parallelScope_captured_item_read (bindings : List VariableBinding) (item captured name : String)
    (available : name = item ∨ ∃ value, enclosingVariable? bindings name = some value) :
    ∃ value, enclosingVariable? (⟨item, .string captured⟩ :: bindings.filter (·.name != item)) name = some value := by
  by_cases same : name = item
  · subst name
    have empty : (bindings.filter (·.name != item)).filter (·.name == item) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro binding member
      simpa using (List.mem_filter.mp member).2
    exact ⟨.string captured, by simp [enclosingVariable?, empty]⟩
  · rcases available with impossible | ⟨value, found⟩
    · exact False.elim (same impossible)
    · have predicate : (fun binding : VariableBinding => binding.name == name && binding.name != item) =
          (fun binding => binding.name == name) := by
        funext binding
        by_cases named : binding.name = name <;> simp [named, same]
      refine ⟨value, ?_⟩
      simpa only [enclosingVariable?, List.filter_cons, beq_eq_false_iff_ne.mpr (Ne.symm same),
        Bool.false_eq_true, ↓reduceIte, List.filter_filter, predicate] using found

/-- Successful body issuance establishes the local contract for the complete population. -/
theorem issueParallelBodies_locals (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (valid : ParallelScopeLocalsValid (entry.bodyInputs.map (·.target)) before.variables) :
    ParallelScopeLocalsValid (entry.bodyInputs.map (·.target)) after.variables := by
  induction items generalizing index before after iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      cases issued.1
      exact valid
  | cons item rest ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, tail⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have localData := parallelScope_initialize_locals before.variables variables _ entry.bodyInputs initialized valid
      have result := ih _ _ _ _ generated localData
      exact result

/-- Every live body selected by an actual binding has one exact frame and captured item. -/
private theorem selected_body_data (entry : ParallelScopeEntry) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state owner = some binding) :
    ∃ iteration frame, binding.iterations.filter (·.scope == owner) = [iteration] ∧
      selectScopeVariables? state.variables owner = some frame := by
  obtain ⟨iteration, member, same⟩ := parallelScopeBinding_member entry state owner binding bound
  obtain ⟨population, bodies⟩ := parallelScopeBinding_population entry state owner binding bound
  have order : binding.iterations.Pairwise (fun left right => left.loopCounter < right.loopCounter ∧
      left.scope ≠ right.scope ∧ left.scope.definitionScopeId = right.scope.definitionScopeId) := by
    simp only [validParallelScopePopulation, validParallelScopeIterations, Bool.and_eq_true] at population
    exact of_decide_eq_true population.1.2.2
  have unique : (binding.iterations.map (·.scope)).Nodup := by
    apply List.pairwise_map.mpr
    exact order.imp (fun ordered => ordered.2.1)
  have census := filter_key_eq_singleton_of_nodup binding.iterations (·.scope) iteration unique member
  have body := List.all_eq_true.mp bodies iteration member
  unfold parallelScopeBodyBound at body
  split at body <;> try contradiction
  simp only [Bool.and_eq_true] at body
  obtain ⟨frame, selected⟩ := Option.isSome_iff_exists.mp body.1.2
  exact ⟨iteration, frame, by simpa only [same, Bool.beq_eq_decide_eq] using census, by simpa only [same] using selected⟩

/-- Binding validates the empty input probe used before reserving either child wait family. -/
theorem parallelScopeBinding_empty_inputs (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (child : owner.definitionScopeId = analysis.entry.childScopeId)
    (binding : ParallelScopeBinding) (bound : parallelScopeBinding? analysis.entry state owner = some binding) :
    evaluateParallelScopeInputs? program state owner [] = some [] := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  obtain ⟨iteration, frame, chosen, _⟩ := selected_body_data analysis.entry state owner binding bound
  simp only [evaluateParallelScopeInputs?, entries, List.filter_cons, List.filter_nil, child,
    beq_self_eq_true, ↓reduceIte, bound, chosen, bind, Option.bind_some]
  simp [evaluateInputMappings?, canonicalInputMappings?, sortByTarget, evaluateInputMappingsInOrder]

namespace ParallelScopeLocalData

open InternalCommutation ParallelScopeReplay

abbrev Valid (names : List String) (state : RuntimeState) : Prop :=
  ParallelScopeLocalsValid names state.variables

variable {names : List String}

private theorem bound_write_locals (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (collection item : String) (condition : Option String) (handlers : List String)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (written : writeBoundMultiInstanceScopeValues? before owner collection item condition handlers values kind = some after)
    (valid : ParallelScopeLocalsValid names before) : ParallelScopeLocalsValid names after := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  obtain ⟨variables, updated, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  exact parallelScope_write_locals names before variables owner _ updated valid

private theorem parallel_write_locals (program : Program) (state : RuntimeState) (after : ScopedVariables)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (written : writeParallelScopeValues? program state owner values kind = some after)
    (valid : Valid names state) : ParallelScopeLocalsValid names after := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact bound_write_locals state.variables after owner _ _ _ _ values kind written valid

private theorem start_locals (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) : Valid names state := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  simp [Valid, ParallelScopeLocalsValid, runningStartState, initialState, emptyScopedVariables]

private theorem initiation_locals (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after) (valid : Valid names before) : Valid names after := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact valid

private theorem entry_locals (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after)
    (valid : Valid (entry.bodyInputs.map (·.target)) before) : Valid (entry.bodyInputs.map (·.target)) after := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact valid
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
      cases Option.some.inj entered
      exact issueParallelBodies_locals entry parent _ 0 _ issued (first :: rest) generated valid

private theorem cancelled_locals (state : RuntimeState) (owner : ScopeOccurrenceId)
    (valid : Valid names state) : Valid names (cancelScopeSubtree state owner .remove) := by
  intro frame member
  exact valid frame (List.filter_sublist.subset member)

private theorem cancelled_bodies_locals (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (valid : Valid names state) : Valid names
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) := by
  induction iterations generalizing state with
  | nil => exact valid
  | cons first rest ih => exact ih _ (cancelled_locals state first.scope valid)

private theorem retirement_locals (entry : ParallelScopeEntry) (owner : ScopeOccurrenceId)
    (before after : RuntimeState) (completed : completeParallelScope? entry before owner = some after)
    (valid : Valid names before) : Valid names after := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  have remaining : ParallelScopeLocalsValid names variables := by
    unfold removeScopeVariables? at removed
    obtain ⟨frame, _, removed⟩ := Option.bind_eq_some_iff.mp removed
    cases Option.some.inj removed
    exact fun frame member => valid frame (List.filter_sublist.subset member)
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact cancelled_locals _ owner remaining
  · exact cancelled_locals _ owner remaining
  · exact cancelled_bodies_locals (first :: rest) _ (cancelled_locals _ owner remaining)

private theorem body_locals (program : Program)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (valid : Valid names before) : Valid names after := by
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control, bind] at applied <;> try contradiction
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [resolved, Option.bind_some] at applied
  case awaitUserTask =>
    split at applied <;> try contradiction
    split at applied
    · obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact valid
    · cases Option.some.inj applied
      exact valid
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    split at applied
    all_goals obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
    all_goals cases Option.some.inj applied
    all_goals exact valid
  all_goals
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid

private theorem human_locals (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (valid : Valid names before) : Valid names after := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact parallel_write_locals program before variables _ _ .userTask written valid
  · obtain ⟨middle, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact valid

private theorem service_locals (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (valid : Valid names before) : Valid names after := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact parallel_write_locals program before variables _ _ .serviceTask written valid
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact valid

private theorem admission_locals (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true) (completion : waitCompletionStimulus stimulus)
    (valid : Valid names before) : Valid names (admitStimulus program before stimulus).state := by
  apply admitStimulus_wait_preserves program before stimulus selected completion (Valid names) valid
  · intro id values after completed
    exact human_locals program before after id values completed valid
  · intro id values after completed
    exact service_locals program before after id values completed valid

private theorem parent_locals (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program analysis.entry parent state) : Valid names state := by
  induction history with
  | start instanceId root values state selected started owner distinct => exact start_locals program instanceId values state started
  | @initiate before after history output declared applied ih => exact initiation_locals before after output applied ih
  | @body before after history candidate operation resolved kind applied ih =>
    exact body_locals program before after candidate operation resolved kind applied ih
  | @human before after history id values wait selected ordinary applied ih => exact human_locals program before after id values applied ih
  | @service before after history id values wait selected ordinary applied ih => exact service_locals program before after id values applied ih

private theorem replay_locals (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (valid : Valid names before) : Valid names after := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ := replayInternalOperationOccurrence_sound program before after record replayed
    exact body_locals program before after _ operation resolved (by rw [metadata]; exact body) applied valid
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact retirement_locals entry record.owner before after completed valid

private theorem internal_locals (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (before after : RuntimeState)
    (records : List CommittedTransition) (replayed : internalTransitions? program before records = some after)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (valid : Valid names before) : Valid names after := by
  induction records generalizing before with
  | nil =>
    have same : before = after := by simpa only [internalTransitions?, Option.some.injEq] using replayed
    exact same ▸ valid
  | cons record rest ih =>
    cases record with
    | externalStimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, applied, followed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program before record = some next := by
        simpa [internalTransition?, selected] using applied
      exact ih next followed (fun record member => kinds record (by simp [member]))
        (replay_locals program before next record (kinds _ (by simp)) actual valid)

private theorem history_locals (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (owner : ScopeOccurrenceId)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial current records)
    (valid : Valid names initial) : Valid names current := by
  induction history with
  | initial => exact valid
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact replay_locals program before after record kind replayed ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    simp only [committedTransitions?, selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at replayed
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | some value => simp [snapshot] at replayed
    | none =>
      simp only [snapshot] at replayed
      split at replayed <;> try contradiction
      exact internal_locals program selected _ after rest replayed kinds
        (admission_locals program before stimulus selected completion ih)

private theorem phase_locals (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true) (owner parent : ScopeOccurrenceId)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records) : Valid (analysis.entry.bodyInputs.map (·.target)) current := by
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parent_locals program analysis parent current parents
  · have initialValid := entry_locals analysis.entry parent before issued entered (parent_locals program analysis parent before parents)
    rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, _, _⟩
    · exact history_locals program selected owner issued current suffix history initialValid
    · have middleValid := history_locals program selected owner issued middle terminalPrefix history initialValid
      obtain ⟨scopeId, output, _, _, _, _, completed⟩ := replayed_scope_completion_execution program middle current record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis analyzed)
          (ParallelScopeStart.analyzed_not_embedded_completion program analysis analyzed)
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis analyzed scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program middle scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      split at completed <;> try contradiction
      all_goals repeat' (split at completed <;> try contradiction)
      all_goals cases Option.some.inj completed
      · exact fun _ member => False.elim (List.not_mem_nil member)
      · exact fun frame member => middleValid frame (List.filter_sublist.subset member)

/-- Actual command prefixes retain the declared scalar domain of every body frame. -/
theorem reachable_locals (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    ParallelScopeLocalsValid (analysis.entry.bodyInputs.map (·.target)) state.variables := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, _, _, phase⟩
  · exact start_locals program seed.instanceId seed.values seed.ready seed.started
  · exact phase_locals program analysis analyzed selected _ seed.parent initial state records phase

end ParallelScopeLocalData

/-- Child Service mappings evaluate from the bound item and local/Process values
established by actual command-prefix reachability.
-/
theorem ParallelScopeInternalPrefixReachable.child_effect_inputs (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (candidate : InternalCommutation.InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : InternalCommutation.resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId)
    (binding : ParallelScopeBinding) (bound : parallelScopeBinding? analysis.entry state candidate.owner = some binding) :
    ∃ arguments, evaluateParallelScopeInputs? program state candidate.owner effect.inputMappings = some arguments := by
  have locals := ParallelScopeLocalData.reachable_locals program analysis analyzed state reachable
  obtain ⟨mappings, reads⟩ := ParallelScopeStart.child_effect_requirements program analysis analyzed state candidate
    id origin input output effect route resolved child
  obtain ⟨handlers, _, _⟩ := ParallelScopeStart.analyzeProgram_body_input_admission program analysis analyzed
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  obtain ⟨iteration, frame, chosen, selected⟩ := selected_body_data analysis.entry state candidate.owner binding bound
  have frameMember : frame ∈ state.variables.scopes := by
    have member : frame ∈ state.variables.scopes.filter (fun candidate => decide (candidate.owner = frame.owner)) := by
      rw [selectScopeVariables_exact_owner selected, selectScopeVariables_iff.mp selected]
      simp
    exact (List.mem_filter.mp member).1
  let context : ScopedVariables := { state.variables with process := { bindings :=
    ⟨analysis.entry.itemName, .string iteration.item⟩ :: state.variables.process.bindings.filter (·.name != analysis.entry.itemName) } }
  have evaluated : ∃ arguments, evaluateInputMappings? (fun name => if analysis.handlers.contains name then none
      else readScopeVariable? context candidate.owner name) effect.inputMappings = some arguments := by
    apply evaluateInputMappings_evaluable
    · exact strictlySortedStrings_nodup _
        (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).1
    · intro mapping member
      have allowed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).2 mapping member
      cases expression : mapping.expression with
      | localVariable name => simp [expression] at allowed
      | stringLiteral value => exact ⟨.string value, rfl⟩
      | enclosingVariable name =>
          have read : name ∈ SerialBusinessTask.readNames effect.inputMappings :=
            List.mem_filterMap.mpr ⟨mapping, member, by simp [expression]⟩
          have named : SerialBusinessTask.nameAllowed analysis.handlers name = true := by
            simpa only [expression, Bool.and_eq_true] using (Bool.and_eq_true_iff.mp allowed).2
          have unreserved : analysis.handlers.contains name = false := by
            have excluded := congrArg Bool.not (Bool.and_eq_true_iff.mp named).2
            simpa only [Bool.not_not, Bool.not_true] using excluded
          have available : name ∈ analysis.entry.bodyInputs.map (·.target) ∨
              ∃ value, enclosingVariable? context.process.bindings name = some value := by
            rcases (reads name read).1 with localName | itemName | processName
            · exact Or.inl localName
            · exact Or.inr (parallelScope_captured_item_read _ _ _ name (Or.inl itemName))
            · exact Or.inr (parallelScope_captured_item_read _ _ _ name (Or.inr
                (reachable.required_scalar_read program analysis analyzed state name processName
                  (reads name read).2.1 (reads name read).2.2)))
          obtain ⟨value, found, scalar⟩ := parallelScope_local_or_process_read _ context candidate.owner frame
            selected (locals frame frameMember) name available
          refine ⟨value, ?_⟩
          simp only [scalarInputLookup?, unreserved, Bool.false_eq_true, ↓reduceIte, found, bind, Option.bind_some]
          cases value <;> simp_all only [scopeVariableScalar, Bool.false_eq_true]
  simp only [evaluateParallelScopeInputs?, entries, List.filter_cons, List.filter_nil, child,
    beq_self_eq_true, ↓reduceIte, bound, chosen, bind, Option.bind_some]
  obtain ⟨arguments, evaluated⟩ := evaluated
  refine ⟨arguments, ?_⟩
  rw [← handlers] at evaluated
  unfold SerialBusinessTask.programHandlers at evaluated
  rw [← evaluated]
  congr 1

end BpmnSemantics.SemanticProcess
