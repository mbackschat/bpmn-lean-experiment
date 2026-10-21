import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! # Normal scope completion

This module owns the quiescence predicate and the normal completion transition for one scope
occurrence: whether a scope *may* complete, and what completing it does. Regional cancellation is
owned by `ScopeCancellation`; token operations and wait construction remain in `RuntimeState`.

Ordinary scopes use this completion rewrite. Sequential Multi-Instance bodies reuse its quiescence
predicate with their paired repetition policy in `SequentialScopeRuntime`; a body ending must not also
emit the ordinary parent continuation (SMIS-END-01).
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def scopeQuiescent (state : RuntimeState) (owner : ScopeOccurrenceId) : Bool :=
  !(state.tokens.any fun token => token.owner == owner) &&
    !(state.waits.any fun wait => wait.owner == owner) &&
    !(state.messageWaits.any fun wait => wait.owner == owner) &&
    !(state.timerWaits.any fun wait => wait.owner == owner) &&
    !(state.effectWaits.any fun wait => wait.owner == owner) &&
    !(state.effectIncidents.any fun incident => incident.wait.owner == owner) &&
    !(state.selectedBranchSets.any fun record => record.owner == owner) &&
    !(state.eventRaces.any fun race => race.owner == owner) &&
    !(state.calledProcessOccurrences.any fun record => record.caller == owner) &&
    !(state.compensationTriggers.any fun trigger =>
      trigger.lifecycle == .active && trigger.owner == owner) &&
    !(state.scopeOccurrences.any fun occurrence => occurrence.parent == some owner)

theorem quiescent_scope_has_no_child (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences) :
    occurrence.parent ≠ some owner := by
  intro parent
  have present : (state.scopeOccurrences.any fun candidate => candidate.parent == some owner) = true :=
    List.any_eq_true.mpr ⟨occurrence, member, by simp [parent]⟩
  simp [scopeQuiescent, present] at quiescent

theorem quiescent_scope_has_no_token (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiescent : scopeQuiescent state owner = true)
    (token : ControlToken) (member : token ∈ state.tokens) : token.owner ≠ owner := by
  intro same
  have present : (state.tokens.any fun candidate => candidate.owner == owner) = true :=
    List.any_eq_true.mpr ⟨token, member, by simp [same]⟩
  simp [scopeQuiescent, present] at quiescent

/-- An active Compensation trigger blocks its exact owner's normal completion independently of its frontier waits. -/
theorem scopeQuiescent_refuses_active_compensation_trigger
    (state : RuntimeState) (owner : ScopeOccurrenceId) (trigger : CompensationTriggerExecution)
    (member : trigger ∈ state.compensationTriggers)
    (active : trigger.lifecycle = .active) (owned : trigger.owner = owner) :
    scopeQuiescent state owner = false := by
  have present : (state.compensationTriggers.any fun candidate =>
      candidate.lifecycle == .active && candidate.owner == owner) = true := by
    apply List.any_eq_true.mpr
    exact ⟨trigger, member, by simp [active, owned]⟩
  simp [scopeQuiescent, present]

/-- The completion rewrite for one already-quiescent occurrence, selected by whether it is the root.

Separate from the gating above so each owner has one responsibility: the caller decides *whether* a
scope may complete, and this decides *what completing it does*. Root completion ends the instance and
clears its occurrence; a child hands exactly one continuation token to its live parent. -/
def completeQuiescentScope? (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (parentOutput : Option ControlPlaceId) :
    Option RuntimeState :=
  match occurrence.parent, parentOutput, state.control with
  | none, none, .running instanceId =>
      if state.initiationPending then none
      else some ({ state with
          control := .completed instanceId
          scopeOccurrences := []
          variables := { state.variables with scopes := [] }
          eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
            decide (listener.owner ≠ occurrence.id)
          compensationActivityRetentions :=
            state.compensationActivityRetentions.filter fun retention =>
              decide (retention.owner ≠ occurrence.id) })
  | some parent, some output, .running _ =>
      if state.scopeOccurrences.any fun candidate => candidate.id == parent then
        some ({ state with
            tokens := addToken state.tokens output parent
            variables := { state.variables with scopes :=
              (state.variables.scopes.filter fun scope => decide (scope.owner ≠ occurrence.id)) }
            eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
              decide (listener.owner ≠ occurrence.id)
            scopeOccurrences := state.scopeOccurrences.filter fun candidate =>
              decide (candidate.id ≠ occurrence.id) })
      else none
  | _, _, _ => none

def completeScopeState? (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) : Option RuntimeState :=
  match state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.definitionScopeId = scopeId) with
  | [occurrence] =>
      if !scopeQuiescent state occurrence.id then none
      else completeQuiescentScope? state occurrence parentOutput
  | _ => none

/-- CEA-QUIESCE-01: completion of the named occurrence, whatever other occurrences of its definition are
live. It looks the occurrence up by id, requires its quiescence, and then applies the shared rewrite. -/
def completeScopeOccurrenceState? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) : Option RuntimeState := do
  let occurrence ← state.scopeOccurrences.find? (·.id == owner)
  if occurrence.id.definitionScopeId ≠ scopeId || !scopeQuiescent state occurrence.id then none
  else completeQuiescentScope? state occurrence parentOutput

private theorem find_unique_definition (values : List RuntimeScopeOccurrence)
    (scopeId : DefinitionScopeId) (occurrence : RuntimeScopeOccurrence)
    (unique : values.filter (fun candidate => decide (candidate.id.definitionScopeId = scopeId)) = [occurrence]) :
    occurrence.id.definitionScopeId = scopeId ∧ values.find? (·.id == occurrence.id) = some occurrence := by
  have inFilter : occurrence ∈ values.filter
      (fun candidate => decide (candidate.id.definitionScopeId = scopeId)) := by
    rw [unique]; simp
  obtain ⟨member, defined⟩ := List.mem_filter.mp inFilter
  have defined : occurrence.id.definitionScopeId = scopeId := by simpa using defined
  refine ⟨defined, ?_⟩
  cases found : values.find? (·.id == occurrence.id) with
  | none =>
      have absent := List.find?_eq_none.mp found occurrence member
      simp at absent
  | some selected =>
      have selectedMember := List.mem_of_find?_eq_some found
      have selectedId : selected.id = occurrence.id := by simpa using List.find?_some found
      have selectedIn : selected ∈ values.filter
          (fun candidate => decide (candidate.id.definitionScopeId = scopeId)) :=
        List.mem_filter.mpr ⟨selectedMember, by simp [selectedId, defined]⟩
      rw [unique] at selectedIn
      simp at selectedIn
      simp [selectedIn]

/-- Under a unique live occurrence of the definition, definition-addressed completion factors through
lookup by id, so the occurrence-addressed variant changes nothing where the existing one succeeds. -/
theorem completeScopeState_factors (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence]) :
    completeScopeState? state scopeId parentOutput =
      completeScopeOccurrenceState? state occurrence.id scopeId parentOutput := by
  obtain ⟨defined, found⟩ := find_unique_definition state.scopeOccurrences scopeId occurrence unique
  simp [completeScopeState?, completeScopeOccurrenceState?, unique, found, defined]

/-- CEA-QUIESCE-01: an occurrence that still owns work does not complete. -/
theorem completeScopeOccurrenceState_refuses_nonquiescent (state : RuntimeState)
    (owner : ScopeOccurrenceId) (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (busy : scopeQuiescent state owner = false) :
    completeScopeOccurrenceState? state owner scopeId parentOutput = none := by
  unfold completeScopeOccurrenceState?
  cases found : state.scopeOccurrences.find? (·.id == owner) with
  | none => rfl
  | some occurrence =>
      have same : occurrence.id = owner := by simpa using List.find?_some found
      simp [same, busy]

/-- CEA-QUIESCE-01: a completion selects exactly the named live, quiescent occurrence of the definition. -/
theorem completeScopeOccurrenceState_selected (state completed : RuntimeState)
    (owner : ScopeOccurrenceId) (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (completion : completeScopeOccurrenceState? state owner scopeId parentOutput = some completed) :
    ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = owner ∧
      occurrence.id.definitionScopeId = scopeId ∧ scopeQuiescent state owner = true ∧
      completeQuiescentScope? state occurrence parentOutput = some completed := by
  unfold completeScopeOccurrenceState? at completion
  obtain ⟨occurrence, found, completion⟩ := Option.bind_eq_some_iff.mp completion
  have same : occurrence.id = owner := by simpa using List.find?_some found
  split at completion
  · contradiction
  · next ready =>
      simp only [Bool.or_eq_true, decide_eq_true_eq, Bool.not_eq_true', not_or] at ready
      exact ⟨occurrence, List.mem_of_find?_eq_some found, same, Decidable.of_not_not ready.1,
        same ▸ (by simpa using ready.2), completion⟩

/-- CEA-ISOLATE-01 for a child's completion: tokens gain only the parent's continuation, only the completed
occurrence and its variable scopes leave, and no wait changes, so every other occurrence of the same
definition keeps its tasks, tokens, variables and parent. -/
theorem completeQuiescentScope_child_frame (state completed : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) (output : ControlPlaceId)
    (child : occurrence.parent = some parent)
    (completion : completeQuiescentScope? state occurrence (some output) = some completed) :
    completed.tokens = addToken state.tokens output parent ∧
      completed.scopeOccurrences = state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id ≠ occurrence.id)) ∧
      completed.variables.scopes = state.variables.scopes.filter (fun scope =>
        decide (scope.owner ≠ occurrence.id)) ∧
      completed.waits = state.waits ∧ completed.messageWaits = state.messageWaits ∧
      completed.timerWaits = state.timerWaits ∧ completed.effectWaits = state.effectWaits ∧
      completed.control = state.control := by
  unfold completeQuiescentScope? at completion
  rw [child] at completion
  cases control : state.control <;> simp only [control] at completion
  all_goals first
    | contradiction
    | (split at completion
       · simp only [Option.some.injEq] at completion
         subst completion
         exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩
       · contradiction)

/-- Successful completion exposes its exact selected rewrite so downstream preservation proofs
need not unfold the private completion implementation or assume its resulting field values. -/
theorem completeScopeState_selected_update (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    scopeQuiescent state occurrence.id = true ∧
      (match (generalizing := false) occurrence.parent, parentOutput, state.control with
      | none, none, .running instanceId =>
          if state.initiationPending then none
          else some { state with
            control := .completed instanceId
            scopeOccurrences := []
            variables := { state.variables with scopes := [] }
            eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
              decide (listener.owner ≠ occurrence.id)
            compensationActivityRetentions := state.compensationActivityRetentions.filter fun retention =>
              decide (retention.owner ≠ occurrence.id) }
      | some parent, some output, .running _ =>
          if state.scopeOccurrences.any (fun candidate => candidate.id == parent) then
            some { state with
              tokens := addToken state.tokens output parent
              variables := { state.variables with scopes :=
                (state.variables.scopes.filter fun scope => decide (scope.owner ≠ occurrence.id)) }
              eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
                decide (listener.owner ≠ occurrence.id)
              scopeOccurrences := state.scopeOccurrences.filter fun candidate => decide (candidate.id ≠ occurrence.id) }
          else none
      | _, _, _ => none) = some completed := by
  simp only [completeScopeState?, unique] at completion
  split at completion
  · simp at completion
  · rename_i quiet
    exact ⟨by simpa using quiet, completion⟩

/-- SMIS-DATA-01 retires exactly the completed child frame, or all frames when the root closes. -/
theorem completeScopeState_variable_fields (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    completed.variables = { state.variables with scopes := match occurrence.parent with
      | none => []
      | some _ => state.variables.scopes.filter fun scope => decide (scope.owner ≠ occurrence.id) } := by
  have update := (completeScopeState_selected_update state completed scopeId parentOutput occurrence unique completion).2
  repeat' split at update
  all_goals first
    | (simp at update; done)
    | (simp only [Option.some.injEq] at update; subst completed; simp_all)

/-- Completion preserves Process, Activity and interface data while disposing scope-local frames. -/
theorem completeScopeState_preserves_unrelated_variables (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    { completed.variables with scopes := state.variables.scopes } = state.variables := by
  have original := completion
  unfold completeScopeState? at completion
  split at completion
  · rename_i occurrence unique
    split at completion
    · simp at completion
    · rw [completeScopeState_variable_fields state completed scopeId parentOutput occurrence unique original]
  · simp at completion

private theorem completeQuiescentScope_preserves_unrelated_components
    (state completed : RuntimeState) (occurrence : RuntimeScopeOccurrence)
    (parentOutput : Option ControlPlaceId)
    (completion : completeQuiescentScope? state occurrence parentOutput = some completed) :
    completed.timerWaits = state.timerWaits ∧
      completed.waits = state.waits ∧
      completed.scopeActivations = state.scopeActivations ∧
      completed.timerActivations = state.timerActivations ∧
      completed.endOccurrences = state.endOccurrences ∧
      completed.logicalTimeMs = state.logicalTimeMs := by
  unfold completeQuiescentScope? at completion
  -- Each arm either refuses or returns a record update; `simp at completion` is guarded by `done` so a
  -- partial rewrite cannot be mistaken for a closed branch.
  repeat' split at completion
  all_goals
    first
      | (simp at completion; done)
      | (simp only [Option.some.injEq] at completion
         subst completion
         exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩)

/-- Layered family proofs use this frame to isolate their own withdrawal and logical-time cases.

The six equalities below remain valid when `completeQuiescentScope?` disposes root-owned Compensation
retentions; they do not frame every component of RuntimeState. -/
theorem completeScopeState_preserves_unrelated_components
    (state completed : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    completed.timerWaits = state.timerWaits ∧
      completed.waits = state.waits ∧
      completed.scopeActivations = state.scopeActivations ∧
      completed.timerActivations = state.timerActivations ∧
      completed.endOccurrences = state.endOccurrences ∧
      completed.logicalTimeMs = state.logicalTimeMs := by
  unfold completeScopeState? at completion
  split at completion
  · split at completion
    · simp at completion
    · exact completeQuiescentScope_preserves_unrelated_components state completed _
        parentOutput completion
  · simp at completion

/-- Regional retention needs the actual root/child scope mask, not just the unrelated-field frame. -/
theorem completeScopeState_reference_fields (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    completed.scopeOccurrences = (match occurrence.parent with
      | none => []
      | some _ => state.scopeOccurrences.filter fun candidate => decide (candidate.id ≠ occurrence.id)) ∧
    completed.activityOccurrences = state.activityOccurrences ∧
    completed.waits = state.waits ∧ completed.messageWaits = state.messageWaits ∧
    completed.timerWaits = state.timerWaits ∧ completed.eventRaces = state.eventRaces := by
  simp only [completeScopeState?, unique] at completion
  split at completion
  · simp at completion
  · unfold completeQuiescentScope? at completion
    repeat' split at completion
    all_goals
      first
        | (simp at completion; done)
        | (simp only [Option.some.injEq] at completion
           subst completed
           simp_all)

/-- A uniquely identified live scope cannot complete while any owned token, wait, or child occurrence remains. -/
theorem completeScopeState_refuses_nonquiescent
    (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (unique :
      state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (blocked : scopeQuiescent state occurrence.id = false) :
    completeScopeState? state scopeId parentOutput = none := by
  simp [completeScopeState?, unique, blocked]

end BpmnSemantics.SemanticProcess
