module

public import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeValidityProofs
public import BpmnSemantics.SemanticProcess.SequentialScopeBodyAccountingProofs
public import BpmnSemantics.SemanticProcess.InternalLocalControlPositionTemplateOrder
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! SMIS-ADMIT-01 defines the joint phase, body-credit, data and population certificate, derives parent-credit consequences, and seeds it from actual committed Start. Transition preservation and actual-history transport remain above this owner. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Eligibility names a current occurrence and the existing payload account, independently of completion evaluation. -/
def SequentialScopeEligibleCompletion (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) : Prop :=
  SequentialScopeData.stimulusAdmitted program stimulus = true ∧
    match stimulus with
    | .completeUserTaskInstance _ taskId _ =>
        ∃ wait ∈ before.waits, taskIdNamesWait taskId wait = true
    | .completeEffect _ effectId (.success patch) =>
        ∃ wait ∈ before.effectWaits, effectIdNamesWait effectId wait = true ∧
          ∃ sources, wait.outputMappings.mapM (fun mapping => match mapping.expression with
            | .localVariable name => some name | _ => none) = some sources ∧
            sources.eraseDups.length = patch.length ∧
            sources.all (fun name => patch.any (·.name == name)) = true
    | _ => False


/-- SMIS-ADMIT-01 separates the evolving parent spine from the period holding its repeated body. -/
inductive SequentialScopeParentPhase where
  | before | held | released | completed
  deriving DecidableEq

def sequentialScopeParentProducedPorts : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output => [output]
  | operation => bodyProducedPorts operation

/-- Actual matching waits retain multiplicity; immutable Task payload correspondence is checked separately. -/
def sequentialScopeTaskWaitingCount (state : RuntimeState) (owner : ScopeOccurrenceId)
    (operation : SemanticOperation) : Nat :=
  match operation with
  | .awaitUserTask _ _ _ output task =>
      (state.waits.filter fun wait => decide (wait.owner = owner && wait.task = task && wait.output = output)).length
  | .awaitEffect _ _ _ output effect _ =>
      (state.effectWaits.filter fun wait => decide
        (wait.owner = owner && wait.elementId = effect.elementId && wait.output = output)).length
  | _ => 0

def sequentialScopeTaskCompletedCount (fired : List SemanticOperation) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (operation : SemanticOperation) : Nat :=
  fired.count operation - sequentialScopeTaskWaitingCount state owner operation

/-- One joint certificate retains actual arming provenance and port credit; graph admission derives firing and burst bounds outside it. -/
def SequentialScopeExecutionCertificateCore (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (state : RuntimeState) (hosting : SemanticId)
    (phase : SequentialScopeParentPhase) (parentFired : List SemanticOperation) : Prop :=
    let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
    runtimeStateWellFormed program hosting state = true ∧
    (projectOpenFlowNodeOccurrences? program state).isSome = true ∧
    SequentialScopeBoundaryInvariant program state ∧
    (state.messageWaits = [] ∧
      state.eventSubProcessMessageSubscriptions = [] ∧
      state.timerWaits = [] ∧
      state.effectIncidents = [] ∧
      state.selectedBranchSets = [] ∧
      state.eventRaces = [] ∧
      state.calledProcessOccurrences = [] ∧
      state.parallelScopeControllers = [] ∧
      state.sequentialMultiInstanceControllers = [] ∧
      state.parallelMultiInstanceControllers = [] ∧
      state.compensationActivityRetentions = [] ∧
      state.compensationParentContextRetentions = [] ∧
      state.compensationTriggers = [] ∧
      state.compensationHandlerEffectWaits = []) ∧
    (∀ operation ∈ parentFired, operation ∈ program.operations ∧
      operation.kind ∈ [SemanticOperationKind.initiate, .awaitUserTask, .awaitEffect, .reachNoneEnd] ∧
      program.operationScopes.any (fun ownership =>
        decide (ownership.operationId = operation.id && ownership.scopeId = root.id)) = true) ∧
    state.initiationPending = !(parentFired.any (fun operation => operation.kind == .initiate)) ∧
    (parentFired.filter (fun operation => operation.kind == .initiate)).length ≤ 1 ∧
    (∀ place, continuationMarking state parent place +
        (parentFired.map (fun operation => ownedPortCount (bodyConsumedPorts operation) parent parent place)).sum +
        ownedPortCount (if phase = .before then [] else [entry.input]) parent parent place =
      (parentFired.map (fun operation => ownedPortCount (sequentialScopeParentProducedPorts operation) parent parent place)).sum +
        ownedPortCount (if phase = .released || phase = .completed then [entry.normalOutput] else []) parent parent place) ∧
    (∀ operation ∈ program.operations,
      sequentialScopeTaskWaitingCount state parent operation ≤ parentFired.count operation) ∧
    match phase with
    | .before | .released => state.control = .running hosting ∧
        state.scopeOccurrences = [⟨parent, none⟩] ∧ state.activityOccurrences = [] ∧ state.variables.scopes = []
    | .held => state.control = .running hosting ∧
        ∃ (binding : SequentialScopeBinding) (fired : List SemanticOperation),
        sequentialScopeBindingForEntry? entry state = some binding ∧ binding.activity.owner = parent ∧
        state.scopeOccurrences.Perm [⟨parent, none⟩, binding.body] ∧
        (∀ record ∈ state.activityOccurrences, record.activityElementId = entry.elementId) ∧
        state.variables.scopes = [binding.locals] ∧
        binding.body.id.activation ≤ scopeActivationCount state entry.childScopeId ∧
        SequentialScopeBodyPortAccounting entry.childEntry binding.body.id fired state ∧
        (∀ operation ∈ fired, operation ∈ program.operations ∧
          operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∧
          program.operationScopes.any (fun ownership => decide
            (ownership.operationId = operation.id && ownership.scopeId = entry.childScopeId)) = true) ∧
        (∀ operation ∈ program.operations,
          sequentialScopeTaskWaitingCount state binding.body.id operation ≤ fired.count operation) ∧
        (∀ place, continuationMarking state parent place = 0)
    | .completed => state.control = .completed hosting

private theorem smis_parent_port_totals (ports : List ControlPlaceId) (parent : ScopeOccurrenceId)
    (unique : ports.Nodup) (select : SemanticOperation → List ControlPlaceId)
    (operations : List SemanticOperation)
    (supported : ∀ operation ∈ operations, ∀ port ∈ select operation, port ∈ ports) :
    (ports.map (fun place => (operations.map (fun operation =>
      ownedPortCount (select operation) parent parent place)).sum)).sum =
    (operations.map (fun operation => (select operation).length)).sum := by
  induction operations with
  | nil =>
      simp only [List.map_nil, List.sum_nil]
      induction ports with
      | nil => rfl
      | cons port rest ih => simp_all
  | cons operation rest ih =>
      simp only [List.map_cons, List.sum_cons]
      rw [ContinuationMarkingLaws.sum_map_add,
        ContinuationMarkingLaws.ownedPortCount_sum ports (select operation) parent unique
          (supported operation (by simp)), ih (fun op member => supported op (by simp [member]))]

private theorem smis_parent_port_arities (operations : List SemanticOperation)
    (allowed : ∀ operation ∈ operations, operation.kind ∈
      [SemanticOperationKind.initiate, .awaitUserTask, .awaitEffect, .reachNoneEnd]) :
    (operations.map (fun operation => (sequentialScopeParentProducedPorts operation).length)).sum ≤
      (operations.map (fun operation => (bodyConsumedPorts operation).length)).sum +
        (operations.filter (fun operation => operation.kind == .initiate)).length := by
  have single (operation : SemanticOperation)
      (kind : operation.kind ∈ [SemanticOperationKind.initiate, .awaitUserTask, .awaitEffect, .reachNoneEnd]) :
      (sequentialScopeParentProducedPorts operation).length ≤
        (bodyConsumedPorts operation).length + (if operation.kind == .initiate then 1 else 0) := by
    clear operations allowed
    cases operation <;> simp_all [SemanticOperation.kind, sequentialScopeParentProducedPorts,
      bodyProducedPorts, bodyConsumedPorts]
  induction operations with
  | nil => simp
  | cons operation rest ih =>
      have first := single operation (allowed operation (by simp))
      have tail := ih (fun op member => allowed op (by simp [member]))
      simp only [List.map_cons, List.sum_cons, List.filter_cons]
      split <;> simp_all <;> omega

/-- The before-phase parent spine has one Start credit; blocked waits and raw tokens share that credit under the per-port certificate. -/
theorem sequentialScope_before_parent_credit_bound (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (state : RuntimeState) (hosting : SemanticId)
    (parentFired : List SemanticOperation)
    (certificate : SequentialScopeExecutionCertificateCore program entry root state hosting .before parentFired) :
    let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
    (state.tokens.filter (fun token => token.owner == parent)).length +
      (state.waits.filter (fun wait => wait.owner == parent)).length +
      (state.effectWaits.filter (fun wait => wait.owner == parent)).length ≤ 1 := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  rcases certificate with ⟨_, _, _, _, provenance, _, unitStart, balance, _, _⟩
  let ports := (state.tokens.map (·.placeId) ++ state.waits.map (·.output) ++
    state.effectWaits.map (·.output) ++ parentFired.flatMap bodyConsumedPorts ++
    parentFired.flatMap sequentialScopeParentProducedPorts).eraseDups
  have unique : ports.Nodup := localControl_eraseDups_nodup _
  have consumed : ∀ operation ∈ parentFired, ∀ port ∈ bodyConsumedPorts operation, port ∈ ports := by
    intro operation member port present
    simp only [ports, List.mem_eraseDups, List.mem_append, List.mem_flatMap]
    grind
  have produced : ∀ operation ∈ parentFired, ∀ port ∈ sequentialScopeParentProducedPorts operation, port ∈ ports := by
    intro operation member port present
    simp only [ports, List.mem_eraseDups, List.mem_append, List.mem_flatMap]
    grind
  have population := ContinuationMarkingLaws.continuationMarking_sum ports state parent unique
    (by intro token member _; simp only [ports, List.mem_eraseDups, List.mem_append, List.mem_map];
        grind)
    (by intro wait member _; simp only [ports, List.mem_eraseDups, List.mem_append, List.mem_map];
        grind)
    (by intro wait member _; simp only [ports, List.mem_eraseDups, List.mem_append, List.mem_map];
        grind)
  have summed := congrArg (fun f : ControlPlaceId → Nat => (ports.map f).sum)
    (funext fun place => balance place)
  change (ports.map (fun place => continuationMarking state parent place +
    (parentFired.map (fun operation => ownedPortCount (bodyConsumedPorts operation) parent parent place)).sum)).sum =
    (ports.map (fun place => (parentFired.map (fun operation =>
      ownedPortCount (sequentialScopeParentProducedPorts operation) parent parent place)).sum)).sum at summed
  rw [ContinuationMarkingLaws.sum_map_add, smis_parent_port_totals ports parent unique bodyConsumedPorts parentFired consumed,
    smis_parent_port_totals ports parent unique sequentialScopeParentProducedPorts parentFired produced, population] at summed
  have count := smis_parent_port_arities parentFired
    (fun operation member => (provenance operation member).2.1)
  dsimp only [parent] at summed
  omega

/-- An enabled entry consumes the sole parent credit, so no Human or effect wait can coexist with it. -/
theorem sequentialScope_before_entry_no_work (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (state : RuntimeState) (hosting : SemanticId)
    (parentFired : List SemanticOperation)
    (certificate : SequentialScopeExecutionCertificateCore program entry root state hosting .before parentFired)
    (enabled : sequentialScopeEntryEnabled entry state ⟨hosting, root.id, 1⟩ = true) :
    state.waits = [] ∧ state.effectWaits = [] ∧ state.activityOccurrences = [] := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  have credit := sequentialScope_before_parent_credit_bound program entry root state hosting parentFired certificate
  rcases certificate with ⟨wellFormed, _, _, _, _, _, _, _, _, running, forest, activities, _⟩
  have owners : waitOwnersLive state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    grind
  have liveParent : ∀ owner, exactLiveOccurrence state owner = true → owner = parent := by
    intro owner live
    by_cases same : owner = parent
    · exact same
    · simp [exactLiveOccurrence, forest, parent, same, Ne.symm same] at live
  have users : state.waits.all (fun wait => exactLiveOccurrence state wait.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
    exact owners.1
  have effects : state.effectWaits.all (fun wait => exactLiveOccurrence state wait.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
    exact owners.2.2.2.1
  have userFilter : state.waits.filter (fun wait => wait.owner == parent) = state.waits :=
    List.filter_eq_self.mpr (fun wait member => by
      simp [liveParent wait.owner (List.all_eq_true.mp users wait member)])
  have effectFilter : state.effectWaits.filter (fun wait => wait.owner == parent) = state.effectWaits :=
    List.filter_eq_self.mpr (fun wait member => by
      simp [liveParent wait.owner (List.all_eq_true.mp effects wait member)])
  have token : ({placeId := entry.input, owner := parent} : ControlToken) ∈ state.tokens := by
    apply ContinuationMarkingLaws.token_present
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabled
    exact of_decide_eq_true enabled.1.1.2
  have positive := List.length_pos_of_mem
    (List.mem_filter.mpr ⟨token, by simp⟩ :
      ({placeId := entry.input, owner := parent} : ControlToken) ∈
        state.tokens.filter (fun candidate => candidate.owner == parent))
  change (state.tokens.filter (fun token => token.owner == parent)).length +
    (state.waits.filter (fun wait => wait.owner == parent)).length +
    (state.effectWaits.filter (fun wait => wait.owner == parent)).length ≤ 1 at credit
  rw [userFilter, effectFilter] at credit
  exact ⟨List.length_eq_zero_iff.mp (by omega), List.length_eq_zero_iff.mp (by omega), activities⟩

/-- A held body's actual completion has no residual Human/effect work: live owners are either its quiescent body or its zero-credit parent. -/
theorem sequentialScope_held_completion_no_work (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId)
    (parentFired : List SemanticOperation) (binding : SequentialScopeBinding)
    (certificate : SequentialScopeExecutionCertificateCore program entry root before hosting .held parentFired)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (quiet : scopeQuiescent before binding.body.id = true) : before.waits = [] ∧ before.effectWaits = [] := by
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  rcases certificate with ⟨wellFormed, _, _, _, _, _, _, _, _, _, prior, _, priorBound, owner, forest, _, _, _, _, _, _, zero⟩
  have same : prior = binding := Option.some.inj (priorBound.symm.trans bound)
  subst prior
  have owners : waitOwnersLive before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    grind
  have liveCases (owner : ScopeOccurrenceId) (live : exactLiveOccurrence before owner = true) :
      owner = parent ∨ owner = binding.body.id := by
    obtain ⟨occurrence, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have filtered : occurrence ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by rw [census]; simp
    have present := forest.mem_iff.mp (List.mem_filter.mp filtered).1
    have same := of_decide_eq_true (List.mem_filter.mp filtered).2
    simp only [List.mem_cons, List.not_mem_nil, or_false] at present
    rcases present with rfl | rfl <;> simp_all [parent]
  have users : before.waits.all (fun wait => exactLiveOccurrence before wait.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
    exact owners.1
  have effects : before.effectWaits.all (fun wait => exactLiveOccurrence before wait.owner) = true := by
    simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
    exact owners.2.2.2.1
  constructor
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro wait member
    rcases liveCases wait.owner (List.all_eq_true.mp users wait member) with parentOwner | bodyOwner
    · have present : wait ∈ before.waits.filter (fun candidate => candidate.owner == parent && candidate.output == wait.output) :=
        List.mem_filter.mpr ⟨member, by simp [parentOwner]⟩
      have positive := List.length_pos_of_mem present
      have empty := zero wait.output
      simp only [continuationMarking] at empty
      change _ + (before.waits.filter (fun candidate => candidate.owner == parent && candidate.output == wait.output)).length + _ = 0 at empty
      omega
    · have present : before.waits.any (fun candidate => candidate.owner == binding.body.id) = true :=
        List.any_eq_true.mpr ⟨wait, member, by simp [bodyOwner]⟩
      simp [scopeQuiescent, present] at quiet
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro wait member
    rcases liveCases wait.owner (List.all_eq_true.mp effects wait member) with parentOwner | bodyOwner
    · have present : wait ∈ before.effectWaits.filter (fun candidate => candidate.owner == parent && candidate.output == wait.output) :=
        List.mem_filter.mpr ⟨member, by simp [parentOwner]⟩
      have positive := List.length_pos_of_mem present
      have empty := zero wait.output
      simp only [continuationMarking] at empty
      change _ + _ + (before.effectWaits.filter (fun candidate => candidate.owner == parent && candidate.output == wait.output)).length = 0 at empty
      omega
    · have present : before.effectWaits.any (fun candidate => candidate.owner == binding.body.id) = true :=
        List.any_eq_true.mpr ⟨wait, member, by simp [bodyOwner]⟩
      simp [scopeQuiescent, present] at quiet

/-- A successful body writer requires the held phase; parent tasks use ordinary admission outside these SMIS evaluators. -/
theorem sequentialScope_write_certificate_held (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (before : RuntimeState) (hosting : SemanticId)
    (phase : SequentialScopeParentPhase) (parentFired : List SemanticOperation)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : SequentialScopeWriteKind)
    (variables : ScopedVariables)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (certificate : SequentialScopeExecutionCertificateCore program entry root before hosting phase parentFired)
    (written : writeSequentialScopeValues? program before owner values kind = some variables) : phase = .held := by
  rcases certificate with ⟨_, _, _, _, _, _, _, _, _, lifecycle⟩
  have absent (running : before.control = .running hosting) (activities : before.activityOccurrences = []) :
      sequentialScopeBindingForOwner? program before owner = none := by
    by_cases named : entry.childScopeId == owner.definitionScopeId
    all_goals simp [sequentialScopeBindingForOwner?, entries, named, sequentialScopeBindingForEntry?, running, activities]
  cases phase with
  | held => rfl
  | before | released =>
      have rejected := sequentialScope_writes_refuse_unbound program before owner values kind (absent lifecycle.1 lifecycle.2.2.1)
      rw [rejected] at written
      contradiction
  | completed =>
      have unbound : sequentialScopeBindingForOwner? program before owner = none := by
        by_cases named : entry.childScopeId == owner.definitionScopeId
        all_goals simp [sequentialScopeBindingForOwner?, entries, named, sequentialScopeBindingForEntry?, lifecycle]
      rw [sequentialScope_writes_refuse_unbound program before owner values kind unbound] at written
      contradiction

/-- Erasing blocked work only decreases the per-operation wait census; neither ingress records another internal firing. -/
theorem sequentialScopeTaskWaitingCount_sublist (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (operation : SemanticOperation) (humans : after.waits.Sublist before.waits)
    (effects : after.effectWaits.Sublist before.effectWaits) :
    sequentialScopeTaskWaitingCount after owner operation ≤ sequentialScopeTaskWaitingCount before owner operation := by
  cases operation <;> simp [sequentialScopeTaskWaitingCount]
  · exact (humans.filter _).length_le
  · exact (effects.filter _).length_le

/-- The existing open projection's unique anchors supply the raw Human/Service keys required by ingress projection preservation. -/
theorem sequentialScope_projectable_wait_keys (program : Program) (state : RuntimeState) (hosting : SemanticId)
    (running : state.control = .running hosting)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (empty : state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectIncidents = []) :
    ((state.waits.map fun wait => (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) ++
      state.effectWaits.map fun wait => (⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ : OccurrenceId)).Nodup := by
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have flow := (projectOpenFlowNodeOccurrences_validities program state current hosting running projected).1
  have waitValid : flowNodeOccurrenceWaitProgramValidity program state = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at flow
    exact flow.1.1.2
  have owners := flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state waitValid
  have unique := projectOpenFlowNodeOccurrences_anchor_nodup program state current projected
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected <;> try contradiction
  obtain ⟨waits, selectedWaits, projected⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨scopes, _, projected⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨calls, _, projected⟩ := Option.bind_eq_some_iff.mp projected
  split at projected <;> try contradiction
  cases Option.some.inj projected
  have raw := ((sortFlowNodeOccurrenceStarts_perm _).map (·.anchor)).nodup_iff.mp unique
  have waitAnchors : (waits.map (·.anchor)).Nodup :=
    (List.nodup_append.mp (by simpa only [List.map_append, List.append_assoc] using raw)).1
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq, effectsEq, incidentsEq, waitEq⟩ :=
    (projectWaits_eq_some_iff program state waits).mp selectedWaits
  have tasksAnchor := mapM_waitStart_anchor_map program state state.waits (·.owner)
    (fun wait => ⟨wait.task.id.value⟩) (·.activation) tasks tasksEq
  have effectsAnchor := mapM_waitStart_anchor_map program state state.effectWaits (·.owner) (·.elementId) (·.activation) effects effectsEq
  have taskKeys : tasks.map (·.anchor) = state.waits.map (fun wait =>
      SemanticFlowNodeOccurrenceAnchor.wait ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩) := by
    rw [tasksAnchor]
    apply List.map_congr_left
    intro wait member
    simp only [owners.1 wait member]
  have effectKeys : effects.map (·.anchor) = state.effectWaits.map (fun wait =>
      SemanticFlowNodeOccurrenceAnchor.wait ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩) := by
    rw [effectsAnchor]
    apply List.map_congr_left
    intro wait member
    simp only [owners.2.2.2.1 wait member]
  simp only [empty.1, empty.2.1, empty.2.2, List.filter_nil, List.mapM_nil, pure, Option.some.injEq] at messagesEq timersEq incidentsEq
  subst messages timers incidents
  rw [waitEq] at waitAnchors
  apply List.Pairwise.of_map (S := (· ≠ ·)) SemanticFlowNodeOccurrenceAnchor.wait
    (fun _ _ different same => different (congrArg _ same))
  simpa only [List.Nodup, List.append_nil, List.nil_append, List.map_append, taskKeys, effectKeys, List.map_map, Function.comp_def] using waitAnchors

/-- Existential lifecycle data keeps the public history predicate independent of a selected internal phase. -/
def SequentialScopeExecutionCertificate (program : Program) (entry : SequentialScopeEntry)
    (root : DefinitionScope) (state : RuntimeState) : Prop :=
  ∃ hosting phase parentFired, SequentialScopeExecutionCertificateCore program entry root state hosting phase parentFired

/-- Actual committed Start seeds the joint certificate before initiation; no successor validity or projection premise is supplied. -/
theorem sequentialScope_committed_start_execution_certificate (program : Program)
    (control : SequentialScopeControl.Analysis) (entry : SequentialScopeEntry)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (valid : programWellFormed program = true)
    (analyzed : SequentialScopeControl.analyze program = some control)
    (admitted : SequentialScopeProgram.admitted program = true)
    (selected : sequentialScopeProgramSelected program = true)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ root, rootDefinitionScope? program = some root ∧
      SequentialScopeExecutionCertificate program entry root
        (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state := by
  have wellFormed := sequentialScope_committed_start_wellFormed program control commandId processId instanceId
    bindings valid analyzed admitted selected committed
  have invariant := sequentialScope_invariant_start program control commandId processId instanceId
    bindings valid analyzed selected committed
  have excluded : program.compensationActivityRetention = none ∧
      program.interruptingMessageEventSubProcesses = [] := by
    have checked := analyzed
    unfold SequentialScopeControl.analyze at checked
    split at checked <;> try contradiction
    have retention : program.compensationActivityRetention.isSome = false := by grind
    have subscriptions : program.interruptingMessageEventSubProcesses.isEmpty = true := by grind
    have noRetention : program.compensationActivityRetention = none := by
      cases value : program.compensationActivityRetention <;> simp_all
    exact ⟨noRetention, List.isEmpty_iff.mp subscriptions⟩
  have built := sequentialScope_committed_start_builder program commandId processId instanceId bindings selected committed
  unfold runningProgramStartState? at built
  obtain ⟨root, rootSelected, built⟩ := Option.bind_eq_some_iff.mp built
  simp only [excluded.1, excluded.2, pure, Option.some.injEq] at built
  rw [← built] at wellFormed invariant ⊢
  refine ⟨root, rootSelected, instanceId, .before, [], wellFormed, ?_, invariant, ?_, ?_, rfl, by simp, ?_, ?_, ?_⟩
  · exact sequentialScope_start_projectable program instanceId root bindings wellFormed
  · simp [runningStartState, initialState, emptyScopedVariables]
  · simp
  · intro place
    simp [continuationMarking, ownedPortCount, runningStartState, initialState]
  · intro operation _
    cases operation <;> simp [sequentialScopeTaskWaitingCount, runningStartState, initialState]
  · simp [runningStartState, initialState, emptyScopedVariables]

end BpmnSemantics.SemanticProcess
