import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.ScopeVariableData
import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! PMIS-ENTER-01, PMIS-END-01 and PMIS-CANCEL-01: atomic population entry and exact quiescent retirement. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Immutable facts of the paired entry; the Activity body alone owns iteration membership. -/
structure ParallelScopeEntry where
  id : OperationId
  elementId : NodeId
  input : ControlPlaceId
  childEntry : ControlPlaceId
  childScopeId : DefinitionScopeId
  normalOutput : ControlPlaceId
  collectionName : String
  itemName : String
  bodyInputs : List VariableMapping
  completionBooleanName : Option String
  deriving Repr, DecidableEq

/-- PMIS-ENTER-01 initializes each body without changing the enclosing snapshot used by later bodies. -/
def issueParallelBodies? (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) :
    List String → Nat → RuntimeState → Option (RuntimeState × List ParallelScopeIteration)
  | [], _, state => some (state, [])
  | item :: items, index, state => do
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId,
        scopeActivationCount state entry.childScopeId + 1⟩
      let variables ← initializeScopeVariables? state.variables child entry.bodyInputs
      let issued := { state with
        variables := variables,
        scopeOccurrences := insertScopeOccurrence ⟨child, some parent⟩ state.scopeOccurrences,
        scopeActivations := setScopeActivationCount state.scopeActivations entry.childScopeId child.activation,
        tokens := addToken state.tokens entry.childEntry child }
      let (successor, rest) ← issueParallelBodies? entry parent items (index + 1) issued
      some (successor, ⟨child, index, item⟩ :: rest)

def enterParallelScope? (entry : ParallelScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option RuntimeState := do
  if state.control != .running parent.processInstanceId ||
      (state.tokens.filter fun token => token.placeId == entry.input && token.owner == parent).length != 1 ||
      (state.scopeOccurrences.filter fun occurrence => occurrence.id == parent).length != 1 ||
      state.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) ||
      state.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) then none
  else
    let [binding] := state.variables.process.bindings.filter (·.name == entry.collectionName) | none
    let .stringList items := binding.value | none
    if items.length > 16 || !(items.all fun item => decide (item.utf8ByteSize ≤ 512)) ||
        canonicalJsonStringCollectionUtf8Bytes items > 8192 then none
    else
      let consumed := removeToken state.tokens entry.input parent
      match items with
      | [] => some { state with tokens := addToken consumed entry.normalOutput parent }
      | _ :: _ => do
          let (issued, first :: rest) ← issueParallelBodies? entry parent items 0 { state with tokens := consumed }
            | none
          let activation := activityActivationCount state ⟨entry.elementId.value⟩ + 1
          let record : ActivityOccurrence :=
            { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
              activation, owner := parent, body := .parallelChildScopes first rest, attachedHandlers := [] }
          some { issued with
            activityOccurrences := insertActivityOccurrence record issued.activityOccurrences,
            activityActivations := setActivationCount issued.activityActivations ⟨entry.elementId.value⟩ activation,
            parallelScopeControllers := issued.parallelScopeControllers ++
              [⟨⟨parent.processInstanceId, ⟨entry.elementId.value⟩, activation⟩, items.length, 0⟩] }

private def parallelRuntimeActivityId (record : ActivityOccurrence) : ActivityOccurrenceId :=
  ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩

/-- Exact ownership and one local frame are required for every body, including nonselected siblings. -/
def parallelScopeBodyBound (entry : ParallelScopeEntry) (state : RuntimeState)
    (record : ActivityOccurrence) (scope : ScopeOccurrenceId) : Bool :=
  match state.scopeOccurrences.filter (fun occurrence => occurrence.id == scope) with
  | [body] => scope.definitionScopeId == entry.childScopeId && body.parent == some record.owner &&
      (selectScopeVariables? state.variables scope).isSome &&
      decide ((state.activityOccurrences.filter fun candidate =>
        (activityBodyScopeClaims candidate.body).contains scope).length = 1)
  | _ => false

private def parallelCompletionCondition? (entry : ParallelScopeEntry) (state : RuntimeState) : Option Bool := do
  match entry.completionBooleanName with
  | none => some false
  | some name =>
      let [binding] := state.variables.process.bindings.filter (·.name == name) | none
      let .boolean condition := binding.value | none
      some condition

/-- Data access and retirement share the complete validated population; neither may select a sibling. -/
structure ParallelScopeBinding where
  activity : ActivityOccurrence
  controller : ParallelScopeController
  iterations : List ParallelScopeIteration
  deriving Repr, DecidableEq

def parallelScopeBinding? (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) : Option ParallelScopeBinding := do
  let .running instanceId := state.control | none
  let [record] := state.activityOccurrences.filter (fun candidate =>
    (activityBodyScopeClaims candidate.body).contains target) | none
  let .parallelChildScopes first rest := record.body | none
  if record.activityElementId != entry.elementId || record.processInstanceId != instanceId ||
      record.owner.processInstanceId != instanceId || !record.attachedHandlers.isEmpty ||
      (state.scopeOccurrences.filter fun occurrence => occurrence.id == record.owner).length != 1 then none
  else
    let [controller] := state.parallelScopeControllers.filter (fun controller =>
      controller.id == parallelRuntimeActivityId record) | none
    let iterations := first :: rest
    if controller.total > 16 || !validParallelScopePopulation controller iterations ||
        !(iterations.all fun iteration => parallelScopeBodyBound entry state record iteration.scope) then none
    else some ⟨record, controller, iterations⟩

def completeParallelScope? (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) : Option RuntimeState := do
  let binding ← parallelScopeBinding? entry state target
  let record := binding.activity
  let controller := binding.controller
  let iterations := binding.iterations
  if !scopeQuiescent state target ||
      state.activityOccurrences.any (fun candidate => candidate.owner == target) then none
  else
      let variables ← removeScopeVariables? state.variables target
      let disposed := { state with variables := variables }
      let condition ← parallelCompletionCondition? entry disposed
      let result ← retireParallelScopeIteration controller iterations target condition
      let detached := { disposed with
        activityOccurrences := state.activityOccurrences.filter (· != record),
        parallelScopeControllers := state.parallelScopeControllers.filter (· != controller) }
      let retired := cancelScopeSubtree detached target .remove
      match result with
      | .remaining successor _ first rest =>
          some (cancelScopeSubtree { disposed with
            activityOccurrences := state.activityOccurrences.map fun candidate =>
              if candidate == record then { candidate with body := .parallelChildScopes first rest } else candidate,
            parallelScopeControllers := state.parallelScopeControllers.map fun candidate =>
              if candidate == controller then successor else candidate } target .remove)
      | .naturalCompletion .. =>
          some { retired with tokens := addToken retired.tokens entry.normalOutput record.owner }
      | .earlyCompletion _ _ first rest =>
          let cancelled := (first :: rest).foldl
            (fun current iteration => cancelScopeSubtree current iteration.scope .remove) retired
          some { cancelled with tokens := addToken cancelled.tokens entry.normalOutput record.owner }

def parallelScopeEntry? : SemanticOperation → Option ParallelScopeEntry
  | .enterParallelMultiInstanceScope id origin input childEntry childScopeId output collection item mappings condition =>
      some ⟨id, origin.elementId, input, childEntry, childScopeId, output, collection, item, mappings, condition⟩
  | _ => none

/-- PMIS-SELECT-01 binds the selected IL operation and full owner without choosing a sibling implicitly. -/
def applyParallelScopeOperation? (program : Program) (operationId : OperationId) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option RuntimeState := do
  let [operation] := program.operations.filter (·.id == operationId) | none
  let entryId ← match operation with
    | .enterParallelMultiInstanceScope id .. => some id
    | .completeParallelMultiInstanceScope _ _ entryId => some entryId
    | _ => none
  let [entryOperation] := program.operations.filter (·.id == entryId) | none
  let entry ← parallelScopeEntry? entryOperation
  let [completion] := program.operations.filter (fun candidate => match candidate with
    | .completeParallelMultiInstanceScope _ _ paired => paired == entry.id | _ => false) | none
  if completion.origin.elementId != entry.elementId then none
  else
    let [entryOwner] := program.operationScopes.filter (·.operationId == entry.id) | none
    let [completionOwner] := program.operationScopes.filter (·.operationId == completion.id) | none
    if completionOwner.scopeId != entry.childScopeId then none
    else match operation with
    | .enterParallelMultiInstanceScope .. =>
        if owner.definitionScopeId == entryOwner.scopeId then enterParallelScope? entry state owner else none
    | .completeParallelMultiInstanceScope id .. =>
        let [body] := state.scopeOccurrences.filter (·.id == owner) | none
        if id != completion.id || owner.definitionScopeId != entry.childScopeId ||
            body.parent.map (·.definitionScopeId) != some entryOwner.scopeId then none
        else completeParallelScope? entry state owner
    | _ => none

/-- PMIS-DATA-01: issuing siblings cannot make an earlier body's locals visible to later input mappings. -/
theorem issueParallelBodies_preserves_process {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.variables.process = state.variables.process := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; rfl
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact (ih generated).trans (initializeScopeVariables_preserves_other_data initialized).1

/-- PMIS-ENTER-01 preserves the collection's multiplicity and assigns consecutive immutable indices. -/
theorem issueParallelBodies_preserves_items_and_indices {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    iterations.map (·.item) = items ∧ iterations.map (·.loopCounter) = List.range' index items.length := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      obtain ⟨itemsEqual, indicesEqual⟩ := ih generated
      simp [itemsEqual, indicesEqual, List.range']

/-- PMIS-DATA-01 covers the complete atomic entry, including empty populations and the outer controller. -/
theorem enterParallelScope_preserves_process {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result) :
    result.variables.process = state.variables.process := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    rfl
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have frame := issueParallelBodies_preserves_process generated
        exact frame

private theorem cancelParallelBody_preserves_process (state : RuntimeState) (scope : ScopeOccurrenceId) :
    (cancelScopeSubtree state scope .remove).variables.process = state.variables.process := rfl

private theorem cancelParallelBodies_preserves_process (iterations : List ParallelScopeIteration)
    (state : RuntimeState) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).variables.process =
      state.variables.process := by
  induction iterations generalizing state with
  | nil => rfl
  | cons iteration rest ih => exact ih (cancelScopeSubtree state iteration.scope .remove)

/-- PMIS-END-01/PMIS-CANCEL-01 dispose body-local data without rolling back committed Process writes. -/
theorem completeParallelScope_preserves_process {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    result.variables.process = state.variables.process := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have frame := removeScopeVariables_preserves_other_data removed
  cases retirement <;> cases Option.some.inj completed <;>
    simpa only [cancelParallelBodies_preserves_process, cancelParallelBody_preserves_process] using frame.1

private theorem scopeCounter_insert_missing (scopeId : DefinitionScopeId) (count : Nat)
    (values : List ScopeActivation) (absent : ∀ value ∈ values, value.scopeId ≠ scopeId) :
    (((canonicalInsertBy scopeActivationBefore ⟨scopeId, count⟩ values).find?
      fun value => decide (value.scopeId = scopeId)).map (·.count)).getD 0 = count := by
  induction values with
  | nil => simp [canonicalInsertBy]
  | cons current rest ih =>
      have different := absent current (by simp)
      have restAbsent : ∀ value ∈ rest, value.scopeId ≠ scopeId :=
        fun value member => absent value (by simp [member])
      simp only [canonicalInsertBy]
      split
      · simp
      · simpa [different] using ih restAbsent

private theorem scopeCounter_set (state : RuntimeState) (scopeId : DefinitionScopeId) (count : Nat) :
    scopeActivationCount { state with scopeActivations := setScopeActivationCount state.scopeActivations scopeId count }
      scopeId = count := by
  unfold scopeActivationCount setScopeActivationCount
  apply scopeCounter_insert_missing
  intro value member equal
  have different := (List.mem_filter.mp member).2
  simp [equal] at different

/-- PMIS-ENTER-01 allocates one fresh ordinal per body, independently of item equality. -/
theorem issueParallelBodies_scope_ordinals {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    iterations.map (·.scope.activation) = List.range' (scopeActivationCount state entry.childScopeId + 1) items.length ∧
    scopeActivationCount result entry.childScopeId = scopeActivationCount state entry.childScopeId + items.length := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      obtain ⟨ordinals, count⟩ := ih generated
      have updated := scopeCounter_set state entry.childScopeId (scopeActivationCount state entry.childScopeId + 1)
      simp only [scopeActivationCount] at updated
      simp only [scopeActivationCount] at ordinals count ⊢
      simp only [updated] at ordinals count
      constructor
      · simpa [List.range'] using congrArg
          (List.cons (scopeActivationCount state entry.childScopeId + 1)) ordinals
      · simpa [Nat.add_assoc, Nat.add_comm 1] using count

/-- PMIS-ENTER-01: equal item values cannot alias the generated body identities. -/
theorem issueParallelBodies_distinct_scopes {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    (iterations.map (·.scope)).Nodup := by
  have ordinals := (issueParallelBodies_scope_ordinals issued).1
  have unique : (iterations.map (·.scope.activation)).Nodup := by
    rw [ordinals]
    exact List.nodup_range'
  apply List.Pairwise.of_map (S := fun a b : Nat => a ≠ b) ScopeOccurrenceId.activation
    (fun _ _ different equal => different (congrArg ScopeOccurrenceId.activation equal))
  simpa only [List.map_map, Function.comp_def] using List.nodup_iff_pairwise_ne.mp unique

/-- PMIS-ENTER-01 adds exactly the generated bodies under their parent, preserving existing occurrences with multiplicity. -/
theorem issueParallelBodies_scope_population {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.scopeOccurrences.Perm
      (iterations.map (fun iteration => (⟨iteration.scope, some parent⟩ : RuntimeScopeOccurrence)) ++ state.scopeOccurrences) := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId,
        scopeActivationCount state entry.childScopeId + 1⟩
      have inserted : (insertScopeOccurrence ⟨child, some parent⟩ state.scopeOccurrences).Perm
          (⟨child, some parent⟩ :: state.scopeOccurrences) := by
        have filterAll (values : List RuntimeScopeOccurrence) : values.filter (fun _ => true) = values :=
          List.filter_eq_self.mpr (by intros; rfl)
        simpa only [insertScopeOccurrence, filterAll] using filter_canonicalInsertBy_perm scopeOccurrenceBefore
          (fun _ => true) ⟨child, some parent⟩ state.scopeOccurrences rfl
      exact (ih generated).trans ((List.Perm.append_left _ inserted).trans List.perm_middle)

/-- PMIS-ENTER-01 keeps every generated body in the selected definition and Process instance. -/
theorem issueParallelBodies_scope_domain {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    ∀ iteration ∈ iterations, iteration.scope.processInstanceId = parent.processInstanceId ∧
      iteration.scope.definitionScopeId = entry.childScopeId := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      intro iteration member
      rcases List.mem_cons.mp member with equal | member
      · subst iteration; exact ⟨rfl, rfl⟩
      · exact ih generated iteration member

private theorem issueParallelBodies_preserves_scope_uniqueness {entry : ParallelScopeEntry}
    {parent : ScopeOccurrenceId} {items : List String} {index : Nat}
    {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations))
    (distinct : (state.scopeOccurrences.map (·.id)).Nodup)
    (absent : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId ≠ entry.childScopeId) :
    (result.scopeOccurrences.map (·.id)).Nodup := by
  have population := (issueParallelBodies_scope_population issued).map RuntimeScopeOccurrence.id
  have combined : ((iterations.map (·.scope)) ++ state.scopeOccurrences.map (·.id)).Nodup := by
    apply List.nodup_append.mpr
    refine ⟨issueParallelBodies_distinct_scopes issued, distinct, ?_⟩
    intro scope member old oldMember equal
    obtain ⟨iteration, iterationMember, rfl⟩ := List.mem_map.mp member
    obtain ⟨occurrence, occurrenceMember, rfl⟩ := List.mem_map.mp oldMember
    have domain := (issueParallelBodies_scope_domain issued iteration iterationMember).2
    exact absent occurrence occurrenceMember (by rw [← equal]; exact domain)
  apply population.symm.nodup
  simpa only [List.map_append, List.map_map, Function.comp_def] using combined

/-- PMIS-ENTER-01 preserves global scope-identity uniqueness from the actual entry guard. -/
theorem enterParallelScope_preserves_scope_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result)
    (distinct : (state.scopeOccurrences.map (·.id)).Nodup) :
    (result.scopeOccurrences.map (·.id)).Nodup := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i admitted
  have absent : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId ≠ entry.childScopeId := by
    intro occurrence member equal
    have present : state.scopeOccurrences.any (fun value => value.id.definitionScopeId == entry.childScopeId) = true :=
      List.any_eq_true.mpr ⟨occurrence, member, by simp [equal]⟩
    simp [present] at admitted
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact distinct
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have unique := issueParallelBodies_preserves_scope_uniqueness generated distinct absent
        exact unique

private theorem initializeParallelBody_frames {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping} {bindings : List VariableBinding}
    (evaluated : evaluateEnclosingInputMappings variables.process.bindings mappings = some bindings)
    (initialized : initializeScopeVariables? variables owner mappings = some result) :
    result.scopes.Perm
      ((⟨owner, mergeProcessVariableBindings [] bindings⟩ : ScopeVariableScope) :: variables.scopes) := by
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · simp [evaluated] at initialized
    rcases initialized with ⟨_, rfl⟩
    have filterAll (values : List ScopeVariableScope) : values.filter (fun _ => true) = values :=
      List.filter_eq_self.mpr (by intros; rfl)
    simpa only [filterAll] using filter_canonicalInsertBy_perm
      (fun left right : ScopeVariableScope => scopeOwnerBefore left.owner right.owner)
      (fun _ => true) ⟨owner, mergeProcessVariableBindings [] bindings⟩ variables.scopes rfl

/-- PMIS-DATA-01 gives each body the same pre-entry input snapshot and retains every existing local frame with multiplicity. -/
theorem issueParallelBodies_local_frames {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState}
    {iterations : List ParallelScopeIteration} {bindings : List VariableBinding}
    (evaluated : evaluateEnclosingInputMappings state.variables.process.bindings entry.bodyInputs = some bindings)
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.variables.scopes.Perm
      (iterations.map (fun iteration => (⟨iteration.scope, mergeProcessVariableBindings [] bindings⟩ : ScopeVariableScope)) ++ state.variables.scopes) := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have processFrame := (initializeScopeVariables_preserves_other_data initialized).1
      have nextEvaluation : evaluateEnclosingInputMappings variables.process.bindings entry.bodyInputs = some bindings := by
        rw [processFrame]
        exact evaluated
      have insertion := initializeParallelBody_frames evaluated initialized
      exact (ih nextEvaluation generated).trans
        ((List.Perm.append_left _ insertion).trans List.perm_middle)

private theorem initializeParallelBody_frame_uniqueness {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping}
    (initialized : initializeScopeVariables? variables owner mappings = some result)
    (distinct : (variables.scopes.map (·.owner)).Nodup) :
    (result.scopes.map (·.owner)).Nodup := by
  have original := initialized
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · rename_i absent
    obtain ⟨bindings, evaluated, _⟩ := Option.bind_eq_some_iff.mp initialized
    have fresh : owner ∉ variables.scopes.map (·.owner) := by
      intro member
      obtain ⟨frame, frameMember, identity⟩ := List.mem_map.mp member
      exact absent (List.any_eq_true.mpr ⟨frame, frameMember, by simp [identity]⟩)
    have population := (initializeParallelBody_frames evaluated original).map ScopeVariableScope.owner
    apply population.symm.nodup
    simpa only [List.map_cons] using List.nodup_cons.mpr ⟨fresh, distinct⟩

/-- PMIS-DATA-01 preserves unique local-frame ownership through arbitrary successful population issuance. -/
theorem issueParallelBodies_preserves_frame_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations))
    (distinct : (state.variables.scopes.map (·.owner)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; exact distinct
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact ih generated (initializeParallelBody_frame_uniqueness initialized distinct)

/-- PMIS-ENTER-01/PMIS-DATA-01 extend frame ownership to the actual entry operation, including zero-item entry. -/
theorem enterParallelScope_preserves_frame_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result)
    (distinct : (state.variables.scopes.map (·.owner)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact distinct
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have unique := issueParallelBodies_preserves_frame_uniqueness generated distinct
        exact unique

private theorem cancelParallelBody_surviving_population (state : RuntimeState) (scope : ScopeOccurrenceId) :
    (cancelScopeSubtree state scope .remove).variables.scopes.Sublist state.variables.scopes ∧
    (cancelScopeSubtree state scope .remove).scopeOccurrences.Sublist state.scopeOccurrences :=
  ⟨List.filter_sublist, List.filter_sublist⟩

private theorem cancelParallelBodies_surviving_population (iterations : List ParallelScopeIteration)
    (state : RuntimeState) :
    ((iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).variables.scopes).Sublist state.variables.scopes ∧
    ((iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).scopeOccurrences).Sublist state.scopeOccurrences := by
  induction iterations generalizing state with
  | nil => exact ⟨List.Sublist.refl _, List.Sublist.refl _⟩
  | cons iteration rest ih =>
      have tail := ih (cancelScopeSubtree state iteration.scope .remove)
      have head := cancelParallelBody_surviving_population state iteration.scope
      exact ⟨tail.1.trans head.1, tail.2.trans head.2⟩

/-- PMIS-END-01/PMIS-CANCEL-01 dispose the selected frame and never rewrite, reorder or duplicate survivors. This does not characterize all owners removed by cancellation. -/
theorem completeParallelScope_surviving_population {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    result.variables.scopes.Sublist (state.variables.scopes.filter fun frame => decide (frame.owner ≠ target)) ∧
    result.scopeOccurrences.Sublist state.scopeOccurrences := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have removedFrames : variables.scopes.Sublist
      (state.variables.scopes.filter fun frame => decide (frame.owner ≠ target)) := by
    obtain ⟨_, shape⟩ := removeScopeVariables_success_iff.mp removed
    rw [shape]
    exact List.Sublist.refl _
  cases retirement <;> cases Option.some.inj completed
  · exact ⟨List.filter_sublist.trans removedFrames, List.filter_sublist⟩
  · exact ⟨List.filter_sublist.trans removedFrames, List.filter_sublist⟩
  · constructor
    · apply List.Sublist.trans (cancelParallelBodies_surviving_population (_ :: _) _).1
      exact List.filter_sublist.trans removedFrames
    · apply List.Sublist.trans (cancelParallelBodies_surviving_population (_ :: _) _).2
      exact List.filter_sublist

/-- Retirement preserves both initially unique populations in all three retirement arms; cancellation cannot manufacture aliases. -/
theorem completeParallelScope_preserves_population_uniqueness {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result)
    (frames : (state.variables.scopes.map (·.owner)).Nodup)
    (scopes : (state.scopeOccurrences.map (·.id)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup ∧ (result.scopeOccurrences.map (·.id)).Nodup := by
  have retained := completeParallelScope_surviving_population completed
  exact ⟨frames.sublist ((retained.1.trans List.filter_sublist).map _), scopes.sublist (retained.2.map _)⟩

/-- The selected body's local data cannot survive any successful retirement arm. -/
theorem completeParallelScope_disposes_target_frame {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    ∀ frame ∈ result.variables.scopes, frame.owner ≠ target := by
  intro frame member
  have retained := (completeParallelScope_surviving_population completed).1.subset member
  exact of_decide_eq_true (List.mem_filter.mp retained).2

end BpmnSemantics.SemanticProcess
