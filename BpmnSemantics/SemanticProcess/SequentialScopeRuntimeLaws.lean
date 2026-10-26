module

public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ActivityBodyClaimWriterPreservation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.NestedScopeData
public import BpmnSemantics.SemanticProcess.BoundedScopeArming
public import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
public import BpmnSemantics.SemanticProcess.SequentialScopeCheckedAdmission
public import BpmnSemantics.SemanticProcess.TokenPatch
import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TimerStart

/-! # Repeated-scope transition laws

SMIS-ENTER-01 distinguishes zero-item continuation from any issuance of Activity, scope or data identities.
These local laws do not replace the capsule's admitted-source reachability and progress obligations.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

/-- Empty input changes only the parent token frontier; no identity or local frame is generated. -/
theorem sequentialScope_empty_entry (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (enabled : sequentialScopeEntryEnabled entry state parent = true)
    (empty : sequentialScopeCollection? entry state = some []) :
    enterSequentialScopeState? entry state parent = some { state with
      tokens := addToken (removeToken state.tokens entry.input parent) entry.normalOutput parent } := by
  simp [enterSequentialScopeState?, enterSequentialScopeResult?, SequentialScopeEntryResult.state, enabled, empty]

/-- A running state and absent child definition suffice to issue the next retained ordinal, without a parent token. -/
theorem sequentialScope_fresh_child (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (instanceId : BpmnSemantics.SemanticId)
    (running : state.control = .running instanceId)
    (absent : (state.scopeOccurrences.any fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = false) :
    let child : ScopeOccurrenceId :=
      { processInstanceId := parent.processInstanceId,
        definitionScopeId := entry.childScopeId, activation := scopeActivationCount state entry.childScopeId + 1 }
    issueSequentialScope? entry state parent = some ({ state with
      tokens := addToken state.tokens entry.childEntry child
      scopeOccurrences := insertScopeOccurrence { id := child, parent := some parent } state.scopeOccurrences
      scopeActivations := setScopeActivationCount state.scopeActivations entry.childScopeId child.activation }, child) := by
  simp [issueSequentialScope?, running, absent]

/-- Entry refusal returns no speculative successor when either its owned frontier or collection is unavailable. -/
theorem sequentialScope_entry_refusal (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId)
    (refused : sequentialScopeEntryEnabled entry state parent = false ∨ sequentialScopeCollection? entry state = none) :
    enterSequentialScopeState? entry state parent = none := by
  rcases refused with disabled | missing
  · simp [enterSequentialScopeState?, enterSequentialScopeResult?, disabled]
  · simp [enterSequentialScopeState?, enterSequentialScopeResult?, missing]

/-- A present body-local null shadows both the captured item and enclosing Process values. -/
theorem sequentialScope_local_null (binding : SequentialScopeBinding) (state : RuntimeState)
    (name : String)
    (present : binding.locals.bindings.filter (·.name == name) = [{ name, value := .null }]) :
    readSequentialScopeVariable? binding state name = some .null := by
  simp [readSequentialScopeVariable?, present, scopeVariableScalar]

/-- A missing or stale current body binding cannot produce an input snapshot. -/
theorem sequentialScope_inputs_refuse_unbound (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (unbound : sequentialScopeBindingForOwner? program state owner = none) :
    evaluateSequentialScopeInputs? program state owner mappings = none := by
  simp [evaluateSequentialScopeInputs?, unbound]

/-- The current captured item is consulted only when no body-local name shadows it. -/
theorem sequentialScope_captured_item (binding : SequentialScopeBinding) (state : RuntimeState)
    (absent : binding.locals.bindings.filter (·.name == binding.entry.itemName) = []) :
    readSequentialScopeVariable? binding state binding.entry.itemName = some (.string binding.controller.currentItem) := by
  simp [readSequentialScopeVariable?, absent]

/-- A stale body cannot commit either human or Service result data. -/
theorem sequentialScope_writes_refuse_unbound (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : SequentialScopeWriteKind)
    (unbound : sequentialScopeBindingForOwner? program state owner = none) :
    writeSequentialScopeValues? program state owner values kind = none := by
  simp [writeSequentialScopeValues?, unbound]

/-- SMIS-DATA-01 commits only the selected effect frame, wait and child continuation. -/
theorem sequentialScope_effect_completion (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (wait : EffectWait) (patch : List BpmnSemantics.VariableBinding)
    (variables : ScopedVariables)
    (unique : state.effectWaits.filter (effectIdNamesWait effectId) = [wait])
    (owned : wait.processInstanceId = wait.owner.processInstanceId)
    (unrouted : wait.bpmnErrorRoute = none)
    (written : completeSequentialScopeEffectData? program state wait.owner effectId wait.outputMappings patch = some variables) :
    completeSequentialScopeEffect? program state effectId (.success patch) = some { state with
      effectWaits := state.effectWaits.erase wait
      variables
      tokens := addToken state.tokens wait.output wait.owner } := by
  simp [completeSequentialScopeEffect?, unique, owned, unrouted, written]

/-- Failed scoped result validation cannot release a continuation or consume its wait. -/
theorem sequentialScope_effect_data_refusal (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (wait : EffectWait) (patch : List BpmnSemantics.VariableBinding)
    (unique : state.effectWaits.filter (effectIdNamesWait effectId) = [wait])
    (refused : completeSequentialScopeEffectData? program state wait.owner effectId wait.outputMappings patch = none) :
    completeSequentialScopeEffect? program state effectId (.success patch) = none := by
  simp [completeSequentialScopeEffect?, unique, refused]

/-- Human completion preserves the surrounding lifecycle while committing the scoped data decision. -/
theorem sequentialScope_user_completion (program : Program) (state : RuntimeState)
    (taskId : BpmnSemantics.UserTaskInstanceId) (wait : UserTaskWait)
    (values : List BpmnSemantics.VariableBinding) (variables : ScopedVariables)
    (unique : sequentialScopeTaskWaits state taskId = [wait])
    (owned : wait.processInstanceId = wait.owner.processInstanceId)
    (written : writeSequentialScopeValues? program state wait.owner values .userTask = some variables) :
    completeSequentialScopeUserTask? program state taskId values = some { state with
      waits := state.waits.erase wait
      variables
      tokens := addToken state.tokens wait.output wait.owner } := by
  simp [completeSequentialScopeUserTask?, unique, owned, written]

/-- A stale body or protected human write cannot consume the selected wait. -/
theorem sequentialScope_user_data_refusal (program : Program) (state : RuntimeState)
    (taskId : BpmnSemantics.UserTaskInstanceId) (wait : UserTaskWait)
    (values : List BpmnSemantics.VariableBinding)
    (unique : sequentialScopeTaskWaits state taskId = [wait])
    (refused : writeSequentialScopeValues? program state wait.owner values .userTask = none) :
    completeSequentialScopeUserTask? program state taskId values = none := by
  simp [completeSequentialScopeUserTask?, unique, refused]

/-- Both input contexts produce snapshots checked against the same canonical target declarations. -/
theorem evaluateSequentialScopeInputs_snapshot (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (bindings : List BpmnSemantics.VariableBinding)
    (evaluated : evaluateSequentialScopeInputs? program state owner mappings = some bindings) :
    inputSnapshotMatches mappings bindings = true := by
  simp only [evaluateSequentialScopeInputs?, bind, Option.bind_eq_some_iff] at evaluated
  obtain ⟨binding, _, evaluated⟩ := evaluated
  exact evaluateInputMappings_snapshot _ mappings bindings evaluated

/-- The repeated-scope family is a scalar profile, so its input context never carries a structured value. -/
theorem sequentialScopeProgramSelected_effectMapping_scalar (program : Program)
    (selected : sequentialScopeProgramSelected program = true) :
    programEffectMappingValuePolicy program = .scalar := by
  apply programEffectMappingValuePolicy_eq_scalar <;> intro same <;>
    simp [sequentialScopeProgramSelected, same, portableEffectDataProfileId, nestedScopeDataProfileId] at selected

/-- Every input context produces a snapshot that the Program's own effect-mapping policy accepts. -/
theorem evaluateEffectInputs_snapshotUnder (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (bindings : List BpmnSemantics.VariableBinding)
    (evaluated : evaluateEffectInputs? program state owner mappings = some bindings) :
    inputSnapshotMatchesUnder (programEffectMappingValuePolicy program) mappings bindings = true := by
  unfold evaluateEffectInputs? at evaluated
  split at evaluated
  · rename_i selected
    have scalar := sequentialScopeProgramSelected_effectMapping_scalar program
      (by simpa using (Bool.and_eq_true_iff.mp selected).1)
    rw [scalar, inputSnapshotMatchesUnder_scalar]
    exact evaluateSequentialScopeInputs_snapshot program state owner mappings bindings evaluated
  · split at evaluated
    · rename_i nested
      have item : programEffectMappingValuePolicy program = .singletonBusinessItem := by
        simp only [nestedScopeDataProgram, beq_iff_eq] at nested
        simp [programEffectMappingValuePolicy, effectMappingValuePolicy, nested]
      rw [item]
      exact evaluateInputMappingsUnder?_snapshot _ _ mappings bindings evaluated
    · exact evaluateEnclosingInputMappingsUnder_snapshot _ _ mappings bindings evaluated

/-- The scalar reading of `evaluateEffectInputs_snapshotUnder`, for profiles that select the scalar policy. -/
theorem evaluateEffectInputs_snapshot (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (bindings : List BpmnSemantics.VariableBinding)
    (scalar : programEffectMappingValuePolicy program = .scalar)
    (evaluated : evaluateEffectInputs? program state owner mappings = some bindings) :
    inputSnapshotMatches mappings bindings = true := by
  have snapshot := evaluateEffectInputs_snapshotUnder program state owner mappings bindings evaluated
  rwa [scalar, inputSnapshotMatchesUnder_scalar] at snapshot

/-- Declaration order cannot change the canonical snapshot, including a present null source. -/
theorem canonical_input_target_order :
    evaluateEnclosingInputMappings [⟨"source", .null⟩]
      [⟨"z", .stringLiteral "last"⟩, ⟨"a", .enclosingVariable "source"⟩] =
      some [⟨"a", .null⟩, ⟨"z", .string "last"⟩] := by
  simp [evaluateEnclosingInputMappings, evaluateInputMappings?, canonicalInputMappings?, sortByTarget,
    insertByTarget, evaluateInputMappingsInOrder, scalarInputLookup?, enclosingVariable?]

theorem canonical_input_snapshot_target_order :
    inputSnapshotMatches [⟨"z", .stringLiteral "last"⟩, ⟨"a", .enclosingVariable "source"⟩]
      [⟨"a", .null⟩, ⟨"z", .string "last"⟩] = true := by
  simp [inputSnapshotMatches, canonicalInputMappings?, sortByTarget,
    insertByTarget, orderedInputSnapshotMatches]

theorem canonical_input_duplicate_targets_refused :
    evaluateEnclosingInputMappings [] [⟨"a", .stringLiteral "one"⟩, ⟨"a", .stringLiteral "two"⟩] = none := by decide +kernel

/-- A scalar effect policy excludes the nested scope-data profile, whose policy is the item domain. -/
theorem nestedScopeDataProgram_false_of_scalar {program : Program}
    (scalar : programEffectMappingValuePolicy program = .scalar) : nestedScopeDataProgram program = false := by
  cases nested : nestedScopeDataProgram program with
  | false => rfl
  | true =>
      simp only [nestedScopeDataProgram, beq_iff_eq] at nested
      simp [programEffectMappingValuePolicy, effectMappingValuePolicy, nested] at scalar

/-- Families without repeated-scope declarations retain ordinary Process input evaluation. -/
theorem evaluateEffectInputs_without_repeated_scope (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (scalar : programEffectMappingValuePolicy program = .scalar)
    (absent : ∀ operation ∈ program.operations, sequentialScopeEntry? operation = none) :
    evaluateEffectInputs? program state owner mappings =
      evaluateEnclosingInputMappings state.variables.process.bindings mappings := by
  have empty := List.filterMap_eq_nil_iff.mpr absent
  simp [evaluateEffectInputs?, hasSequentialScopeDefinition, empty, scalar,
    nestedScopeDataProgram_false_of_scalar scalar, evaluateEnclosingInputMappingsUnder_scalar]

theorem sequentialScopeBindingForEntry_insert_scope
    (entry : SequentialScopeEntry) (state : RuntimeState) (created : RuntimeScopeOccurrence)
    (binding : SequentialScopeBinding)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ created.id)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    sequentialScopeBindingForEntry? entry
      { state with scopeOccurrences := insertScopeOccurrence created state.scopeOccurrences } = some binding := by
  unfold sequentialScopeBindingForEntry? at bound ⊢
  cases control : state.control <;> simp only [control] at bound ⊢ <;> try contradiction
  split at bound <;> try contradiction
  rename_i records record recordsEq
  split at bound <;> try contradiction
  rename_i recordBody child bodyEq
  split at bound <;> try contradiction
  rename_i valid
  split at bound <;> try contradiction
  rename_i scopes body scopesEq
  have bodyFiltered : body ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) := by
    rw [scopesEq]
    simp
  have bodyMember := (List.mem_filter.mp bodyFiltered).1
  have bodyId : body.id = child := by simpa using (List.mem_filter.mp bodyFiltered).2
  have distinct : created.id ≠ child := fun same => fresh body bodyMember (bodyId.trans same.symm)
  have filterFrame : (insertScopeOccurrence created state.scopeOccurrences).filter
      (fun occurrence => occurrence.id == child) = state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) := by
    exact filter_canonicalInsertBy_rejected _ _ _ _ (by simp [distinct])
  split at bound <;> try contradiction
  rename_i controllers controller controllersEq
  obtain ⟨locals, localsEq, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  rename_i validBody
  have parentLive : state.scopeOccurrences.any (fun occurrence => occurrence.id == record.owner) = true := by
    cases present : state.scopeOccurrences.any (fun occurrence => occurrence.id == record.owner) with
    | false => simp [present] at validBody
    | true => rfl
  have parentAfter : (insertScopeOccurrence created state.scopeOccurrences).any
      (fun occurrence => occurrence.id == record.owner) = true := by
    obtain ⟨parent, member, matched⟩ := List.any_eq_true.mp parentLive
    exact List.any_eq_true.mpr ⟨parent, by simp [insertScopeOccurrence, mem_canonicalInsertBy, member], matched⟩
  simp_all

theorem sequentialScopeBindingForOwner_insert_scope
    (program : Program) (state : RuntimeState) (created : RuntimeScopeOccurrence)
    (owner : ScopeOccurrenceId) (binding : SequentialScopeBinding)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ created.id)
    (bound : sequentialScopeBindingForOwner? program state owner = some binding) :
    sequentialScopeBindingForOwner? program
      { state with scopeOccurrences := insertScopeOccurrence created state.scopeOccurrences } owner = some binding := by
  unfold sequentialScopeBindingForOwner? at bound ⊢
  split at bound <;> try contradiction
  rename_i entries entry entriesEq
  obtain ⟨selected, found, bound⟩ := Option.bind_eq_some_iff.mp bound
  rw [sequentialScopeBindingForEntry_insert_scope entry state created selected fresh found]
  simpa only [bind, Option.bind_some] using bound

theorem sequentialScope_entry_activity_identity (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (selected : enterSequentialScopeResult? entry state parent = some result) :
    activityIdentityIssuingDiscipline state result.state = true := by
  unfold enterSequentialScopeResult? at selected
  split at selected <;> try contradiction
  simp only [bind, Option.bind_eq_some_iff] at selected
  obtain ⟨items, _, selected⟩ := selected
  cases items with
  | nil =>
      simp only [Option.some.injEq] at selected
      subst result
      exact activityIdentityIssuingDiscipline_of_subset _ _ (fun _ member => member)
  | cons item rest =>
      simp only [Option.bind_eq_some_iff] at selected
      obtain ⟨⟨issued, child⟩, _, variables, _, selected⟩ := selected
      simp only [Option.some.injEq] at selected
      subst result
      simp only [SequentialScopeEntryResult.state, activityIdentityIssuingDiscipline,
        all_insertActivityOccurrence, Bool.and_eq_true, List.all_eq_true]
      constructor
      · simp [activityIdentityAdmittedAfter]
      · intro candidate member
        exact activityIdentityAdmittedAfter_of_mem member

theorem sequentialScope_issue_activity_frame (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (issued : RuntimeState) (child : ScopeOccurrenceId)
    (selected : issueSequentialScope? entry state parent = some (issued, child)) :
    issued.activityOccurrences = state.activityOccurrences := by
  unfold issueSequentialScope? at selected
  cases control : state.control <;> simp only [control] at selected <;> try contradiction
  split at selected <;> simp_all
  have projected := congrArg RuntimeState.activityOccurrences selected.1
  exact projected.symm

theorem sequentialScope_completion_activity_identity (entry : SequentialScopeEntry)
    (state : RuntimeState) (result : SequentialScopeCompletionResult)
    (selected : completeSequentialScopeResult? entry state = some result) :
    activityIdentityIssuingDiscipline state result.state = true := by
  unfold completeSequentialScopeResult? at selected
  simp only [bind, Option.bind_eq_some_iff] at selected
  obtain ⟨binding, _, selected⟩ := selected
  split at selected <;> try contradiction
  simp only [Option.bind_eq_some_iff] at selected
  obtain ⟨condition, _, variables, _, selected⟩ := selected
  split at selected
  · simp only [Option.some.injEq] at selected
    subst result
    apply activityIdentityIssuingDiscipline_of_subset
    intro record member
    exact (List.mem_filter.mp member).1
  · split at selected <;> try contradiction
    split at selected <;> try contradiction
    simp only [Option.bind_eq_some_iff] at selected
    obtain ⟨item, _, ⟨issued, child⟩, issuance, locals, _, selected⟩ := selected
    simp only [Option.some.injEq] at selected
    subst result
    have frame := sequentialScope_issue_activity_frame entry _ _ issued child issuance
    apply activityIdentityIssuingDiscipline_of_identity_witness
    intro record member
    simp only [SequentialScopeCompletionResult.state, List.mem_map] at member
    obtain ⟨previous, member, rfl⟩ := member
    rw [frame] at member
    refine ⟨previous, member, ?_⟩
    split <;> simp_all [sameActivityOccurrence]

theorem sequentialScope_issue_excludes_prior_definition (entry : SequentialScopeEntry)
    (state issued : RuntimeState) (parent child : ScopeOccurrenceId)
    (selected : issueSequentialScope? entry state parent = some (issued, child)) :
    child.definitionScopeId = entry.childScopeId ∧
      ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId ≠ entry.childScopeId := by
  unfold issueSequentialScope? at selected
  cases control : state.control <;> simp only [control] at selected <;> try contradiction
  split at selected <;> try contradiction
  simp only [Option.some.injEq, Prod.mk.injEq] at selected
  rcases selected with ⟨rfl, rfl⟩
  simp_all

theorem sequentialScope_entry_body_claims (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (selected : enterSequentialScopeResult? entry state parent = some result)
    (live : activityRecordsOwnLiveWork state = true)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique result.state.activityOccurrences = true := by
  unfold enterSequentialScopeResult? at selected
  split at selected <;> try contradiction
  simp only [bind, Option.bind_eq_some_iff] at selected
  obtain ⟨items, _, selected⟩ := selected
  cases items with
  | nil =>
      simp only [Option.some.injEq] at selected
      subst result
      exact unique
  | cons item rest =>
      simp only [Option.bind_eq_some_iff] at selected
      obtain ⟨⟨issued, child⟩, issuance, variables, _, selected⟩ := selected
      simp only [Option.some.injEq] at selected
      subst result
      have fresh := sequentialScope_issue_excludes_prior_definition entry state issued parent child issuance
      apply activityBodyClaimsUnique_insertActivityOccurrence _ _ _ unique
      apply List.all_eq_true.mpr
      intro other member
      apply activityBodyClaimsDisjoint_childScope_of_not_mem
        { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
          activation := activityActivationCount state ⟨entry.elementId.value⟩ + 1,
          owner := parent, body := .childScope child, attachedHandlers := [] } other child
      intro claimed
      have childLive := activityBodyScopeClaim_is_live state other child live member claimed
      simp only [exactLiveOccurrence, decide_eq_true_eq] at childLive
      obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp childLive
      have occurrenceMem : occurrence ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = child)) := by
        simp [singleton]
      obtain ⟨member, same⟩ := List.mem_filter.mp occurrenceMem
      have sameId : occurrence.id = child := by simpa using same
      exact fresh.2 occurrence member ((congrArg ScopeOccurrenceId.definitionScopeId sameId).trans fresh.1)

theorem sequentialScope_binding_activity (entry : SequentialScopeEntry) (state : RuntimeState)
    (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    state.activityOccurrences.filter (fun record => record.activityElementId == entry.elementId) =
      [binding.activity] ∧ binding.activity.body = .childScope binding.body.id := by
  unfold sequentialScopeBindingForEntry? at bound
  cases control : state.control <;> simp only [control] at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i records record recordsEq
  split at bound <;> try contradiction
  rename_i recordBody child bodyEq
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i scopes body scopesEq
  split at bound <;> try contradiction
  obtain ⟨locals, _, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  simp only [Option.some.injEq] at bound
  subst binding
  have bodyFiltered : body ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) := by
    simp [scopesEq]
  have bodyId : body.id = child := by simpa using (List.mem_filter.mp bodyFiltered).2
  exact ⟨recordsEq, by simpa [bodyId] using bodyEq⟩

theorem sequentialScope_completion_body_claims (entry : SequentialScopeEntry)
    (state : RuntimeState) (result : SequentialScopeCompletionResult)
    (selected : completeSequentialScopeResult? entry state = some result)
    (live : activityRecordsOwnLiveWork state = true)
    (unique : activityBodyClaimsUnique state.activityOccurrences = true) :
    activityBodyClaimsUnique result.state.activityOccurrences = true := by
  unfold completeSequentialScopeResult? at selected
  simp only [bind, Option.bind_eq_some_iff] at selected
  obtain ⟨binding, bound, selected⟩ := selected
  have ⟨recordsEq, oldBody⟩ := sequentialScope_binding_activity entry state binding bound
  have recordFiltered : binding.activity ∈ state.activityOccurrences.filter
      (fun record => record.activityElementId == entry.elementId) := by simp [recordsEq]
  have recordMem := (List.mem_filter.mp recordFiltered).1
  have recordSelected := (List.mem_filter.mp recordFiltered).2
  split at selected <;> try contradiction
  simp only [Option.bind_eq_some_iff] at selected
  obtain ⟨condition, _, variables, _, selected⟩ := selected
  split at selected
  · simp only [Option.some.injEq] at selected
    subst result
    exact activityBodyClaimsUnique_filter _ _ unique
  · split at selected <;> try contradiction
    split at selected <;> try contradiction
    simp only [Option.bind_eq_some_iff] at selected
    obtain ⟨item, _, ⟨issued, child⟩, issuance, locals, _, selected⟩ := selected
    simp only [Option.some.injEq] at selected
    subst result
    have frame := sequentialScope_issue_activity_frame entry _ _ issued child issuance
    have fresh := sequentialScope_issue_excludes_prior_definition entry _ issued _ child issuance
    change activityBodyClaimsUnique (issued.activityOccurrences.map _) = true
    rw [frame]
    apply activityBodyClaimsUnique_map_selected state.activityOccurrences
      (fun record => record.activityElementId == entry.elementId) _ unique
    · simp [recordsEq]
    · intro other notSelected
      have different : other ≠ binding.activity := by
        intro same
        subst other
        simp_all
      simp [different]
    · intro chosen chosenMem other otherMem chosenSelected otherNotSelected
      have chosenFiltered : chosen ∈ state.activityOccurrences.filter
          (fun record => record.activityElementId == entry.elementId) :=
        List.mem_filter.mpr ⟨chosenMem, chosenSelected⟩
      have same : chosen = binding.activity := by simpa [recordsEq] using chosenFiltered
      subst chosen
      simp only [ite_true]
      apply activityBodyClaimsDisjoint_childScope_of_not_mem binding.activity other child
      intro claimed
      have childLive := activityBodyScopeClaim_is_live state other child live otherMem claimed
      simp only [exactLiveOccurrence, decide_eq_true_eq] at childLive
      obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp childLive
      have occurrenceMem : occurrence ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = child)) := by
        simp [singleton]
      obtain ⟨member, same⟩ := List.mem_filter.mp occurrenceMem
      have sameId : occurrence.id = child := by simpa using same
      by_cases retired : occurrence = binding.body
      · have childOld : child = binding.body.id := by simpa [retired] using sameId.symm
        have different : binding.activity ≠ other := by
          intro same
          subst other
          simp_all
        have disjoint := activityBodyClaimsUnique_pair unique recordMem otherMem different
        apply activityBodyClaimsDisjoint_no_shared_scope disjoint (scope := child) _ claimed
        simp [oldBody, childOld, activityBodyScopeClaims]
      · have kept : occurrence ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate ≠ binding.body)) :=
          List.mem_filter.mpr ⟨member, by simp [retired]⟩
        exact fresh.2 occurrence kept ((congrArg ScopeOccurrenceId.definitionScopeId sameId).trans fresh.1)

/-- SMIS-IDENTITY-01 forbids controller-only terminal state once every Activity has retired. -/
theorem sequentialScopeStateValid_no_activities_no_controllers (program : Program) (state : RuntimeState)
    (valid : sequentialScopeStateValid program state = true)
    (empty : state.activityOccurrences = []) : state.sequentialScopeControllers = [] := by
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid
  have controllers := valid.1
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro controller member
  have accepted := List.all_eq_true.mp controllers controller member
  split at accepted <;> try contradiction
  rename_i entry selected
  have absent : sequentialScopeBindingForEntry? entry state = none := by
    cases control : state.control <;> simp [sequentialScopeBindingForEntry?, control, empty]
  rw [absent] at accepted
  contradiction

/-- SMIS-IDENTITY-01 has no residual ownership obligation after all three owning populations retire. -/
theorem sequentialScopeStateValid_empty (program : Program) (state : RuntimeState)
    (activities : state.activityOccurrences = [])
    (controllers : state.sequentialScopeControllers = [])
    (scopes : state.scopeOccurrences = []) : sequentialScopeStateValid program state = true := by
  simp only [sequentialScopeStateValid, activities, controllers, scopes, List.all_nil,
    List.filter_nil, Bool.true_and]
  exact List.all_eq_true.mpr (fun _ _ => rfl)

private theorem retained_singleton_filter {α : Type} (before after : List α)
    (selected : α → Bool) (value : α) (subset : after.Sublist before)
    (census : before.filter selected = [value]) (retained : value ∈ after) :
    after.filter selected = [value] := by
  have prior : value ∈ before.filter selected := by rw [census]; simp
  have present := List.mem_filter.mpr ⟨retained, (List.mem_filter.mp prior).2⟩
  have filtered := List.Sublist.filter selected subset
  rw [census] at filtered
  exact filtered.eq_of_length_le (List.length_pos_of_mem present)

/-- SMIS-IDENTITY-01 preserves a retained association under population removal, without assuming a valid successor. -/
theorem sequentialScopeBindingForEntry_retained (entry : SequentialScopeEntry)
    (before after : RuntimeState) (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (control : after.control = before.control)
    (activities : after.activityOccurrences.Sublist before.activityOccurrences)
    (activity : binding.activity ∈ after.activityOccurrences)
    (scopes : after.scopeOccurrences.Sublist before.scopeOccurrences)
    (body : binding.body ∈ after.scopeOccurrences)
    (controllers : after.sequentialScopeControllers.Sublist before.sequentialScopeControllers)
    (controller : binding.controller ∈ after.sequentialScopeControllers)
    (locals : after.variables.scopes.Sublist before.variables.scopes)
    (localFrame : binding.locals ∈ after.variables.scopes)
    (owner : after.scopeOccurrences.any (fun occurrence => occurrence.id == binding.activity.owner) = true) :
    sequentialScopeBindingForEntry? entry after = some binding := by
  unfold sequentialScopeBindingForEntry? at bound
  cases running : before.control <;> simp only [running] at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i records record recordsEq
  split at bound <;> try contradiction
  rename_i recordBody child bodyEq
  split at bound <;> try contradiction
  rename_i valid
  split at bound <;> try contradiction
  rename_i occurrences occurrence occurrencesEq
  split at bound <;> try contradiction
  rename_i controls current controlsEq
  obtain ⟨frame, frameEq, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  rename_i validBody
  simp only [Option.some.injEq] at bound
  subst binding
  have nextActivity := retained_singleton_filter _ _ _ _ activities recordsEq activity
  have nextBody := retained_singleton_filter _ _ _ _ scopes occurrencesEq body
  have nextController := retained_singleton_filter _ _ _ _ controllers controlsEq controller
  have frameCensus : before.variables.scopes.filter (fun scope => decide (scope.owner = child)) = [frame] := by
    unfold selectScopeVariables? at frameEq
    split at frameEq <;> simp_all
  have nextFrame := retained_singleton_filter _ _ _ _ locals frameCensus localFrame
  have selectedFrame : selectScopeVariables? after.variables child = some frame := by
    simp only [selectScopeVariables?, nextFrame]
  simp_all [sequentialScopeBindingForEntry?]

/-- SMIS-IDENTITY-01 permits regional removal only as a whole association: retained bindings and their collection stay exact. -/
theorem sequentialScopeStateValid_retention (program : Program) (before after : RuntimeState)
    (keep : SequentialScopeEntry → Bool)
    (valid : sequentialScopeStateValid program before = true)
    (controllers : ∀ controller ∈ after.sequentialScopeControllers, controller ∈ before.sequentialScopeControllers)
    (controllerEntries : ∀ controller ∈ after.sequentialScopeControllers,
      ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
        entry.elementId.value == controller.id.activityElementId.value → keep entry = true)
    (activities : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId) =
        if keep entry then before.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId) else [])
    (bodies : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        if keep entry then before.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) else [])
    (bindings : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, keep entry = true →
      sequentialScopeBindingForEntry? entry after = sequentialScopeBindingForEntry? entry before)
    (collections : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, keep entry = true →
      sequentialScopeCollection? entry after = sequentialScopeCollection? entry before) :
    sequentialScopeStateValid program after = true := by
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · apply List.all_eq_true.mpr
    intro controller retained
    have prior := List.all_eq_true.mp valid.1 controller (controllers controller retained)
    split at prior <;> try contradiction
    rename_i entry selected
    have held : entry ∈ (program.operations.filterMap sequentialScopeEntry?).filter
        (fun entry => entry.elementId.value == controller.id.activityElementId.value) := by rw [selected]; simp
    obtain ⟨declared, named⟩ := List.mem_filter.mp held
    have kept := controllerEntries controller retained entry declared named
    simpa only [selected, bindings entry declared kept] using prior
  · apply List.all_eq_true.mpr
    intro entry declared
    rw [activities entry declared, bodies entry declared]
    cases retained : keep entry with
    | false => rfl
    | true =>
        simp only [↓reduceIte, bindings entry declared retained, collections entry declared retained]
        exact List.all_eq_true.mp valid.2 entry declared

/-- SMIS-IDENTITY-01 permits unrelated work to change while every declared repeated census and successful binding survives. -/
theorem sequentialScopeStateValid_controller_frame (program : Program) (before after : RuntimeState)
    (valid : sequentialScopeStateValid program before = true)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (activities : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId) =
        before.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId))
    (bodies : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        before.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId))
    (bindings : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, ∀ binding,
      sequentialScopeBindingForEntry? entry before = some binding →
        ∃ nextBinding, sequentialScopeBindingForEntry? entry after = some nextBinding ∧
          nextBinding.controller = binding.controller)
    (collections : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      sequentialScopeCollection? entry after = sequentialScopeCollection? entry before) :
    sequentialScopeStateValid program after = true := by
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · rw [controllers]
    apply List.all_eq_true.mpr
    intro controller member
    have prior := List.all_eq_true.mp valid.1 controller member
    split at prior <;> try contradiction
    rename_i entry selected
    have present : entry ∈ (program.operations.filterMap sequentialScopeEntry?).filter
        (fun entry => entry.elementId.value == controller.id.activityElementId.value) := by rw [selected]; simp
    have declared := (List.mem_filter.mp present).1
    cases bindingEq : sequentialScopeBindingForEntry? entry before with
    | none => simp only [bindingEq] at prior; contradiction
    | some binding =>
        obtain ⟨nextBinding, nextBound, sameController⟩ := bindings entry declared binding bindingEq
        simpa only [selected, nextBound, bindingEq, sameController] using prior
  · apply List.all_eq_true.mpr
    intro entry declared
    have prior := List.all_eq_true.mp valid.2 entry declared
    rw [activities entry declared, bodies entry declared, collections entry declared]
    split at prior
    · assumption
    · cases bindingEq : sequentialScopeBindingForEntry? entry before with
      | none => simp only [bindingEq] at prior; contradiction
      | some binding =>
          obtain ⟨nextBinding, nextBound, sameController⟩ := bindings entry declared binding bindingEq
          cases collection : sequentialScopeCollection? entry before <;>
            simpa only [nextBound, bindingEq, collection, sameController] using prior
    · contradiction

/-- Exact binding retention is the unchanged-data instance of controller retention. -/
theorem sequentialScopeStateValid_binding_frame (program : Program) (before after : RuntimeState)
    (valid : sequentialScopeStateValid program before = true)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (activities : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId) =
        before.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId))
    (bodies : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      after.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        before.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId))
    (bindings : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, ∀ binding,
      sequentialScopeBindingForEntry? entry before = some binding →
        sequentialScopeBindingForEntry? entry after = some binding)
    (collections : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      sequentialScopeCollection? entry after = sequentialScopeCollection? entry before) :
    sequentialScopeStateValid program after = true := by
  apply sequentialScopeStateValid_controller_frame program before after valid controllers activities bodies _ collections
  intro entry declared binding bound
  exact ⟨binding, bindings entry declared binding bound, rfl⟩

/-- SMIS-IDENTITY-01 derives live progress bounds from the selected binding, without assuming completion succeeds. -/
theorem sequentialScope_bound_controller_progress (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    binding.controller.completed < binding.controller.total ∧ binding.controller.total ≤ 16 ∧
      binding.body.parent = some binding.activity.owner := by
  unfold sequentialScopeBindingForEntry? at bound
  cases control : state.control <;> simp only [control] at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  obtain ⟨locals, _, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  simp only [Option.some.injEq] at bound
  subst binding
  simp_all

/-- SMIS-ENTER-01's fixed collection size and a live nonfinal controller guarantee the next indexed item exists. -/
theorem sequentialScope_nonfinal_item_exists (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding) (items : List String)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (fixedTotal : binding.controller.total = items.length)
    (nonfinal : binding.controller.completed + 1 ≠ binding.controller.total) :
    ∃ item, items[binding.controller.completed + 1]? = some item := by
  have progress := (sequentialScope_bound_controller_progress entry state binding bound).1
  have within : binding.controller.completed + 1 < items.length := by omega
  exact ⟨items[binding.controller.completed + 1], by simp [within]⟩

/-- SMIS-IDENTITY-01's selected binding supplies the running instance and the exact removable body frame. -/
theorem sequentialScope_binding_body_data (entry : SequentialScopeEntry) (state : RuntimeState)
    (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    (∃ instanceId, state.control = .running instanceId) ∧
      selectScopeVariables? state.variables binding.body.id = some binding.locals ∧
      binding.body ∈ state.scopeOccurrences ∧ binding.body.id.definitionScopeId = entry.childScopeId := by
  unfold sequentialScopeBindingForEntry? at bound
  cases control : state.control <;> simp only [control] at bound <;> try contradiction
  rename_i instanceId
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i recordBody child recordBodyEq
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i bodies body bodiesEq
  split at bound <;> try contradiction
  obtain ⟨locals, selected, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  simp only [Option.some.injEq] at bound
  subst binding
  have member : body ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) := by
    rw [bodiesEq]
    simp
  have same := (List.mem_filter.mp member).2
  simp only [beq_iff_eq] at same
  refine ⟨⟨instanceId, rfl⟩, by simpa only [same] using selected, (List.mem_filter.mp member).1, ?_⟩
  simp_all

/-- SMIS-IDENTITY-01's two-way census excludes another live body of the repeated definition. -/
theorem sequentialScope_valid_body_census (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
      [binding.body] := by
  have facts := sequentialScope_binding_body_data entry state binding bound
  have member : binding.body ∈ state.scopeOccurrences.filter
      (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
    List.mem_filter.mpr ⟨facts.2.2.1, by simpa using facts.2.2.2⟩
  have entryValid := List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).2 entry declared
  have activity := (sequentialScope_binding_activity entry state binding bound).1
  simp only [activity] at entryValid
  split at entryValid <;> simp_all

/-- SMIS-DATA-01 requires exact protected-value preservation, including uniqueness, across non-target patches. -/
theorem sequentialScope_merge_preserves_protected (existing patch : List VariableBinding)
    (name : String) (binding : VariableBinding)
    (unique : existing.filter (fun value => decide (value.name = name)) = [binding])
    (untouched : ∀ value ∈ patch, value.name ≠ name) :
    (mergeProcessVariableBindings existing patch).filter (fun value => decide (value.name = name)) = [binding] := by
  have absent : name ∉ patch.map (·.name) := by
    intro present
    obtain ⟨value, member, named⟩ := List.mem_map.mp present
    exact untouched value member named
  have noNew : patch.filter (fun value => decide (value.name = name)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member
    simp [untouched value member]
  have kept : (existing.filter (fun value => !(patch.map (·.name)).contains value.name)).filter
      (fun value => decide (value.name = name)) = existing.filter (fun value => decide (value.name = name)) := by
    rw [List.filter_filter]
    apply List.filter_congr
    intro value _
    by_cases named : value.name = name <;> simp [named, absent]
  have preserved := (mergeProcessVariableBindings_perm existing patch).filter (fun value => decide (value.name = name))
  rw [List.filter_append, noNew, List.nil_append, kept, unique] at preserved
  simpa using preserved

/-- Nearest-scope routing cannot alter a protected Process binding absent from the submitted patch. -/
theorem sequentialScope_scoped_patch_preserves_protected (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (patch : List VariableBinding) (name : String) (binding : VariableBinding)
    (unique : variables.process.bindings.filter (fun value => decide (value.name = name)) = [binding])
    (untouched : ∀ value ∈ patch, value.name ≠ name)
    (written : writeScopeVariables? variables owner patch = some result) :
    result.process.bindings.filter (fun value => decide (value.name = name)) = [binding] := by
  unfold writeScopeVariables? at written
  cases selected : selectScopeVariables? variables owner with
  | none => simp [selected] at written
  | some scope =>
      simp [selected] at written
      rcases written with ⟨_, rfl⟩
      apply sequentialScope_merge_preserves_protected _ _ name binding unique
      intro value member
      exact untouched value (List.mem_filter.mp member).1

/-- SMIS-IDENTITY-01 separates the generated body definition from the actual hosting root. -/
theorem sequentialScope_admitted_root_separation (program : Program) (entry : SequentialScopeEntry)
    (analysis : SequentialScopeControl.Analysis) (root : DefinitionScope)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some analysis)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (selected : rootDefinitionScope? program = some root) : entry.childScopeId ≠ root.id := by
  have forest := programWellFormed_scopeForest program valid
  unfold SequentialScopeControl.analyze at analyzed
  split at analyzed <;> try contradiction
  split at analyzed <;> try contradiction
  rename_i entries selectedEntry entryCensus
  rw [entryCensus] at declared
  have sameEntry := List.mem_singleton.mp declared
  subst entry
  split at analyzed <;> try contradiction
  rename_i roots selectedRoot rootCensus
  split at analyzed <;> try contradiction
  rename_i checks
  have childPresent : program.definitionScopes.any (fun scope =>
      scope.id == selectedEntry.childScopeId && scope.parentScopeId == some selectedRoot.id) = true := by
    simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false] at checks
    exact checks.1.1.1
  obtain ⟨child, childMember, childFacts⟩ := List.any_eq_true.mp childPresent
  simp only [Bool.and_eq_true, beq_iff_eq] at childFacts
  simp only [scopeForestWellFormed, Bool.and_eq_true] at forest
  have childValid := List.all_eq_true.mp forest.1.2 child childMember
  simp only [childFacts.2, Bool.and_eq_true, decide_eq_true_eq] at childValid
  have rootMember : root ∈ program.definitionScopes ∧ root.parentScopeId.isNone = true := by
    unfold rootDefinitionScope? at selected
    split at selected <;> try contradiction
    rename_i candidates candidate candidatesEq
    cases Option.some.inj selected
    have member : root ∈ program.definitionScopes.filter (fun scope =>
        scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by
      rw [candidatesEq]
      exact List.mem_singleton_self _
    exact ⟨(List.mem_filter.mp member).1, (Bool.and_eq_true_iff.mp (List.mem_filter.mp member).2).1⟩
  have rootFiltered : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
    List.mem_filter.mpr rootMember
  rw [rootCensus] at rootFiltered
  have sameRoot := List.mem_singleton.mp rootFiltered
  simpa only [childFacts.1, sameRoot] using childValid.1

/-- Mutable local values cannot break an unchanged lifecycle association when the exact owner census survives. -/
theorem sequentialScope_binding_owner_frame (entry : SequentialScopeEntry) (before after : RuntimeState)
    (binding : SequentialScopeBinding)
    (control : after.control = before.control)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (bodies : after.scopeOccurrences = before.scopeOccurrences)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (owners : after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner))
    (bound : sequentialScopeBindingForEntry? entry before = some binding) :
    ∃ nextBinding, sequentialScopeBindingForEntry? entry after = some nextBinding ∧
      nextBinding.controller = binding.controller := by
  unfold sequentialScopeBindingForEntry? at bound
  cases running : before.control <;> simp only [running] at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  obtain ⟨locals, selected, bound⟩ := Option.bind_eq_some_iff.mp bound
  obtain ⟨nextLocals, nextSelected⟩ := selectScopeVariables_owner_census before.variables after.variables _ owners ⟨locals, selected⟩
  split at bound <;> try contradiction
  cases Option.some.inj bound
  simp_all [sequentialScopeBindingForEntry?]

end BpmnSemantics.SemanticProcess
