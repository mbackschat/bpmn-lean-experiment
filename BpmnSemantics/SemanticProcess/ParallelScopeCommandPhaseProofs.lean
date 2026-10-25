module

public import BpmnSemantics.SemanticProcess.ParallelScopeReachableInvariantTransport
public import BpmnSemantics.SemanticProcess.ParallelScopeInstanceIdentityProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Parallel command phase provenance

PMIS-SELECT-01 connects actual command boundaries and whole-selection prefixes to
one accepted Start, its submitted values and capacity, and the accounting phase.
The broader accounting history remains separate from actual reachability; this
certificate supplies its premises without claiming future scheduling or publication
success. Pending initiation is explicit and accepts no completion ingress.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess
open BpmnSemantics InternalCommutation ParallelScopeReplay

/-- Committed resumption exposes the successful capacity check used by admission at its exact predecessor. -/
theorem parallelScope_committed_resumption_capacity (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    (ParallelScopeStart.programStateCapacity program before).isSome = true := by
  have admitted : ParallelScopeCommand.stimulusAdmitted program before stimulus = true := by
    cases checked : ParallelScopeCommand.stimulusAdmitted program before stimulus with
    | false =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, checked] at committed
    | true => rfl
  simp only [ParallelScopeCommand.stimulusAdmitted, selected, Bool.not_true,
    Bool.false_eq_true, ↓reduceIte, analyzed] at admitted
  split at admitted <;> try contradiction
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance => exact (Bool.and_eq_true_iff.mp admitted).1
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    exact (Bool.and_eq_true_iff.mp admitted).1

/-- A committed Human or Service resumption supplies retirement's Process-data precondition at its actual predecessor. Exact binding supplies membership; no later retirement success is assumed. -/
theorem parallelScope_committed_resumption_retirement_ready (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed)
    (parent target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? analysis.entry before target = some binding)
    (quiescent : scopeQuiescent before target = true) :
    ∃ after, completeParallelScope? analysis.entry before target = some after := by
  have capacity := parallelScope_committed_resumption_capacity program analysis before stimulus
    selected analyzed completion committed
  obtain ⟨activities, _, owned⟩ := frame.bound_outer analysis.entry parent target before binding bound
  obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_member analysis.entry before target binding bound
  have childParent := parallelScopeBinding_body_parent analysis.entry before target binding bound iteration member
  rw [identity] at childParent
  have rootParent : occurrenceParent? before.scopeOccurrences parent = none := by
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  have different : parent ≠ target := by
    intro same
    rw [← same, rootParent] at childParent
    contradiction
  have noActivity : before.activityOccurrences.any (fun activity => activity.owner == target) = false := by
    simp [activities, owned, different]
  cases accepted : ParallelScopeStart.programStateCapacity program before with
  | none => simp [accepted] at capacity
  | some capacity =>
    exact ParallelScopeStart.programStateCapacity_retirement_ready program analysis before capacity
      target binding analyzed accepted bound quiescent noActivity

/-- Successful entry retains the immutable paired declaration checks used by later retirement dispatch. Only the current body binding is revalidated. -/
theorem parallelScope_entered_retirement_dispatch (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before issued current : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (replayed : replayInternalOperationOccurrence? program before record = some issued)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame record.owner current)
    (bound : parallelScopeBinding? analysis.entry current target = some binding) :
    ∃ (id : OperationId) (origin : BpmnElementOrigin) (ownership : OperationScopeOwnership),
      program.operations.filter (·.id == id) = [.completeParallelMultiInstanceScope id origin analysis.entry.id] ∧
      program.operationScopes.filter (·.operationId == id) = [ownership] ∧
      ownership.scopeId = target.definitionScopeId ∧
      applyParallelScopeOperation? program id current target = completeParallelScope? analysis.entry current target := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before issued record replayed
  have key := (resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved).2
  have unique := resolved_operation_unique program before ⟨record.operationId, record.owner⟩ operation resolved
  rw [kind] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  rename_i id origin input childEntry childScope output collection item mappings condition ignored
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control,
    resolved, bind, Option.bind_some] at applied <;> try contradiction
  simp only [SemanticOperation.id] at key
  rw [← key] at unique
  change program.operations.filter (·.id == id) =
    [.enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition] at unique
  change applyParallelScopeOperation? program id before record.owner = some issued at applied
  unfold applyParallelScopeOperation? at applied
  rw [unique] at applied
  simp only [bind, Option.bind_some] at applied
  rw [unique] at applied
  obtain ⟨entry, decoded, applied⟩ := Option.bind_eq_some_iff.mp applied
  have declared := (resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ _ resolved).1
  have parsed : entry ∈ program.operations.filterMap parallelScopeEntry? := List.mem_filterMap.mpr ⟨_, declared, decoded⟩
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  rw [entries] at parsed
  have identity : entry = analysis.entry := by simpa using parsed
  subst entry
  have entryId : analysis.entry.id = id := by
    simp only [parallelScopeEntry?, Option.some.injEq] at decoded
    rw [← decoded]
  split at applied <;> try contradiction
  rename_i completion pairedSelection
  have included := pairedSelection.symm ▸ List.mem_singleton_self completion
  obtain ⟨completionMember, paired⟩ := List.mem_filter.mp included
  cases completion <;> simp only [Bool.false_eq_true] at paired <;> try contradiction
  rename_i completionId completionOrigin pairedId
  have pairedIdEq : pairedId = analysis.entry.id := by simpa using paired
  subst pairedId
  split at applied <;> try contradiction
  rename_i sameOrigin
  split at applied <;> try contradiction
  rename_i entryOwner entryOwnership
  split at applied <;> try contradiction
  rename_i completionOwner completionOwnership
  split at applied <;> try contradiction
  rename_i childOwned
  split at applied <;> try contradiction
  rename_i parentOwned
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have idsUnique : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have selectedCompletion := filter_key_eq_singleton_of_nodup program.operations (·.id)
    (.completeParallelMultiInstanceScope completionId completionOrigin analysis.entry.id) idsUnique completionMember
  have selected : program.operations.filter (·.id == completionId) =
      [.completeParallelMultiInstanceScope completionId completionOrigin analysis.entry.id] := by
    have predicates : (fun operation : SemanticOperation => operation.id == completionId) =
        (fun operation => decide (operation.id = completionId)) := by
      funext operation
      apply Bool.eq_iff_iff.mpr
      simp
    rw [predicates]
    exact selectedCompletion
  obtain ⟨_, _, owner⟩ := frame.bound_outer analysis.entry record.owner target current binding bound
  obtain ⟨iteration, member, same⟩ := parallelScopeBinding_member analysis.entry current target binding bound
  have bodyBound := List.all_eq_true.mp (parallelScopeBinding_population analysis.entry current target binding bound).2 iteration member
  rw [same] at bodyBound
  unfold parallelScopeBodyBound at bodyBound
  split at bodyBound <;> try contradiction
  rename_i body bodySelection
  simp only [Bool.and_eq_true, beq_iff_eq] at bodyBound
  have targetScope := bodyBound.1.1.1
  have bodyParent := bodyBound.1.1.2
  rw [owner] at bodyParent
  have childScopeEq : completionOwner.scopeId = analysis.entry.childScopeId := by simpa using childOwned
  have parentScopeEq : record.owner.definitionScopeId = entryOwner.scopeId := by simpa using parentOwned
  have originEq : completionOrigin.elementId = analysis.entry.elementId := by simpa [SemanticOperation.origin] using sameOrigin
  refine ⟨completionId, completionOrigin, completionOwner, selected, completionOwnership,
    childScopeEq.trans targetScope.symm, ?_⟩
  simp only [applyParallelScopeOperation?, selected, bind, Option.bind_some, entryId, unique, decoded]
  simp only [entryId] at pairedSelection entryOwnership
  simp only [SemanticOperation.id] at completionOwnership
  simp [pairedSelection, SemanticOperation.id, SemanticOperation.origin, originEq, entryOwnership, completionOwnership, childScopeEq,
    bodySelection, targetScope, bodyParent, parentScopeEq]

/-- Complete stable discovery excludes quiescent bound bodies before a committed resumption. The retirement candidate and all its dispatch checks come from successful entry and actual discovery, not an assumed enabled offer. -/
theorem parallelScope_stable_resumption_body_nonquiescent (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (entryBefore issued current : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (entered : replayInternalOperationOccurrence? program entryBefore record = some issued)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program current stimulus).outcome = .committed)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame record.owner current)
    (bound : parallelScopeBinding? analysis.entry current target = some binding)
    (empty : (deriveInternalExecutionFrontier program current).offers = [])
    (successful : (deriveInternalExecutionFrontier program current).preparationFailed = false) :
    scopeQuiescent current target = false := by
  cases quiet : scopeQuiescent current target with
  | false => rfl
  | true =>
    obtain ⟨after, retired⟩ := parallelScope_committed_resumption_retirement_ready program analysis current stimulus
      selected analyzed completion committed record.owner target binding frame bound quiet
    obtain ⟨id, origin, ownership, declaration, ownershipSelection, owned, dispatch⟩ :=
      parallelScope_entered_retirement_dispatch program analysis analyzed entryBefore issued current record kind entered
        target binding frame bound
    let operation := SemanticOperation.completeParallelMultiInstanceScope id origin analysis.entry.id
    have member : operation ∈ program.operations :=
      (List.mem_filter.mp (declaration.symm ▸ List.mem_singleton_self operation)).1
    have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
      simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
    have active : ∃ instanceId, current.control = .running instanceId := by
      cases control : current.control <;> simp only [parallelScopeBinding?, control] at bound <;> try contradiction
      exact ⟨_, rfl⟩
    obtain ⟨instanceId, running⟩ := active
    have reflected := deriveInternalExecutionFrontier_empty_reflects program current (by simp [running]) empty successful operation member
    have ordinary : (ordinaryExecutionFrontier program current operation).preparationFailed = false := by
      simpa only [operation, running] using reflected.2
    have discovery : ∃ offers, internalOperationOccurrenceOffers? program current operation = some offers := by
      simp only [ordinaryExecutionFrontier, profile, beq_self_eq_true, ↓reduceIte] at ordinary
      cases found : internalOperationOccurrenceOffers? program current operation with
      | none => simp [found] at ordinary
      | some offers => exact ⟨offers, rfl⟩
    obtain ⟨offers, discovered⟩ := discovery
    simp only [operation, internalOperationOccurrenceOffers?] at discovered
    obtain ⟨candidates, candidatesEq, _⟩ := Option.bind_eq_some_iff.mp discovered
    simp only [SemanticOperation.id] at candidatesEq
    have shape : candidates = (InternalCommutation.sortBy InternalCommutation.scopeBefore
        ((current.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == ownership.scopeId))).map
          (fun owner => InternalOperationOccurrence.mk id owner) := by
      have source := candidatesEq
      change internalOperationOccurrences? program current id = some candidates at source
      simp only [internalOperationOccurrences?, declaration, ownershipSelection] at source
      split at source <;> try contradiction
      exact (Option.some.inj source).symm
    obtain ⟨iteration, included, identity⟩ := parallelScopeBinding_member analysis.entry current target binding bound
    have parent := parallelScopeBinding_body_parent analysis.entry current target binding bound iteration included
    rw [identity] at parent
    unfold occurrenceParent? at parent
    obtain ⟨body, found, _⟩ := Option.bind_eq_some_iff.mp parent
    have bodyId : body.id = target := by
      have chosen := List.find?_some found
      simpa only [decide_eq_true_eq] using chosen
    have candidateMember : (⟨id, target⟩ : InternalOperationOccurrence) ∈ candidates := by
      rw [shape]
      apply List.mem_map.mpr
      refine ⟨target, ?_, rfl⟩
      apply (mem_sortBy _ _ _).mpr
      exact List.mem_filter.mpr ⟨List.mem_map.mpr ⟨body, List.mem_of_find?_eq_some found, bodyId⟩, by simp [owned]⟩
    have resolved : resolveInternalOperationOccurrence? program current ⟨id, target⟩ = some operation := by
      simp only [resolveInternalOperationOccurrence?, candidatesEq, bind, Option.bind_some,
        List.contains_iff_mem.mpr candidateMember, ↓reduceIte]
      rw [← List.head?_filter, declaration]
      rfl
    have executable : applyInternalOperationOccurrence? program current ⟨id, target⟩ = some after := by
      simpa only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some, operation, SemanticOperation.id]
        using dispatch.trans retired
    have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program current profile
      ⟨id, target⟩ operation resolved empty successful
    rw [executable] at refused
    contradiction


theorem parallelScope_start_occurrence_initiates (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready after : RuntimeState) (rootSelected : rootDefinitionScope? program = some root)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (started : runningProgramStartState? program instanceId values = some ready)
    (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program ready candidate = some after) :
    ∃ id origin output, SemanticOperation.initiate id origin output ∈ program.operations ∧
      initiateState? ready output = some after := by
  let parent : ScopeOccurrenceId := ⟨instanceId, root.id, 1⟩
  have parents : ParallelScopeParentHistory program analysis.entry parent ready :=
    .start instanceId root values ready rootSelected started rfl distinct
  have raw := started
  simp only [runningProgramStartState?, rootSelected, bind, Option.bind_some, pure,
    Option.some.injEq] at raw
  have tokens : ready.tokens = [] := by rw [← raw]; rfl
  have running : ready.control = .running instanceId := by rw [← raw]; rfl
  obtain ⟨operation, record, resolved, member, identity, owned, metadata, recordOwned, replayed, phases⟩ :=
    parents.pre_entry_occurrence_phases program analysis admitted parent ready after candidate applied
  rcases phases with ⟨kind, output, initiated, _⟩ | ⟨kind, _⟩ | ⟨kind, entered⟩ | ⟨kind, _⟩
  · have operationKind : operation.kind = .initiate := by simpa only [metadata] using kind
    cases operation <;> simp [SemanticOperation.kind] at operationKind
    rename_i id origin declaredOutput
    refine ⟨id, origin, declaredOutput, member, ?_⟩
    simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
    split at applied <;> try contradiction
    split at applied <;> try contradiction
    exact applied
  · have operationKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
        .duplicate, .synchronize, .reachNoneEnd] := by simpa only [metadata] using kind
    cases operation <;> simp [SemanticOperation.kind] at operationKind
    all_goals simp [applyInternalOperationOccurrence?, running, resolved, tokens] at applied
    rename_i id origin inputs output
    cases inputs with
    | nil => exact False.elim (applied.1.1.1 rfl)
    | cons head tail => exact False.elim (applied.1.2 head (by simp))
  · simp [enterParallelScope?, tokens] at entered
  · exact False.elim (parents.no_root_completion_replay program analysis admitted parent ready after record kind replayed)

private theorem empty_tokens_refuse_batch (program : Program) (state : RuntimeState)
    (empty : state.tokens = []) (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors)
    (nonempty : successors ≠ []) : False := by
  obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program state batch successors applied
  cases members : batch.members with
  | nil => cases successors <;> simp_all
  | cons patch rest =>
    cases successors with
    | nil => exact nonempty rfl
    | cons after later =>
      have first := steps (patch, state, after) (by simp [members])
      cases patch with
      | arm arm =>
        obtain ⟨_, _, _, _, _, _, _, _, unit, _⟩ := ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance
          program state ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation arm first.2.2.2
        simp [empty] at unit
      | token token =>
        obtain ⟨applied, resolved, kind⟩ := ParallelScopeReplay.prepareOccurrenceTokenPatch_application
          program state ⟨token.operation.id, token.tokens.owner⟩ token first.2
        cases control : state.control <;> simp only [applyInternalOperationOccurrence?, control] at applied <;> try contradiction
        simp only [resolved, bind, Option.bind_some] at applied
        cases operation : token.operation <;> simp [operation, SemanticOperation.kind] at kind
        all_goals simp [operation, empty] at applied
        rename_i id origin inputs output
        cases inputs with
        | nil => exact applied.1.1.1 rfl
        | cons head tail => exact applied.1.2 head (by simp)

/-- Exact accepted Start data is retained across later commands instead of being
reconstructed from mutable Process values. -/
structure ParallelScopeAcceptedStart (program : Program) where
  commandId : SemanticId
  processId : SemanticId
  instanceId : SemanticId
  values : List VariableBinding
  root : DefinitionScope
  capacity : ParallelScopeStart.ProgramCapacity
  committed : (admitStimulus program initialState (.startProcess commandId processId instanceId values)).outcome = .committed
  rootSelected : rootDefinitionScope? program = some root
  started : runningProgramStartState? program instanceId values =
    some (admitStimulus program initialState (.startProcess commandId processId instanceId values)).state
  capacityAccepted : ParallelScopeStart.programStartCapacity program values = some capacity

def ParallelScopeAcceptedStart.ready (seed : ParallelScopeAcceptedStart program) : RuntimeState :=
  (admitStimulus program initialState (.startProcess seed.commandId seed.processId seed.instanceId seed.values)).state

def ParallelScopeAcceptedStart.parent (seed : ParallelScopeAcceptedStart program) : ScopeOccurrenceId :=
  ⟨seed.instanceId, seed.root.id, 1⟩

/-- Initiation is outside body accounting, so an untouched Start and its initialized
phase remain distinct until actual execution supplies the bridge. -/
def ParallelScopeStartedPhase (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (seed : ParallelScopeAcceptedStart program) (owner : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  state = seed.ready ∨ ∃ id origin output initial records,
    SemanticOperation.initiate id origin output ∈ program.operations ∧
    initiateState? seed.ready output = some initial ∧
    ParallelScopeSchedulerPhase program analysis owner seed.parent initial state records

/-- Every child-owner accounting view refers to the same accepted Start and capacity.
Actual reachability remains a separate premise of the certificate theorems. -/
def ParallelScopeCommandCertificate (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (state : RuntimeState) : Prop :=
  ∃ seed : ParallelScopeAcceptedStart program, state.compensationHandlerEffectWaits = [] ∧
    ∀ owner, owner.definitionScopeId = analysis.entry.childScopeId →
      ParallelScopeStartedPhase program analysis seed owner state

theorem parallelScope_committed_ingress_kind (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (state : RuntimeState) (stimulus : Stimulus)
    (committed : (admitStimulus program state stimulus).outcome = .committed) :
    (∃ commandId processId instanceId values, stimulus = .startProcess commandId processId instanceId values ∧
      state.control = .notStarted) ∨ waitCompletionStimulus stimulus := by
  cases stimulus
  case startProcess commandId processId instanceId values =>
    left
    refine ⟨commandId, processId, instanceId, values, rfl, ?_⟩
    cases snapshot : program.compensationEventSubProcessSnapshots <;> cases control : state.control <;>
      cases incidents : state.effectIncidents <;> simp [admitStimulus, snapshot, control, incidents] at committed ⊢
  case completeUserTaskInstance commandId taskId values => exact Or.inr trivial
  case completeEffect commandId effectId result =>
    cases result
    case success values => exact Or.inr trivial
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases analysis : ParallelScopeStart.analyzeProgram program <;>
          simp [admitStimulus, snapshot, ParallelScopeCommand.stimulusAdmitted, selected, analysis] at committed
  all_goals
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases analysis : ParallelScopeStart.analyzeProgram program <;>
        simp [admitStimulus, snapshot, ParallelScopeCommand.stimulusAdmitted, selected, analysis] at committed

theorem InternalCommutation.ParallelScopeSchedulerPhase.not_notStarted (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (owner parent : ScopeOccurrenceId) (initial state : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial state records) :
    state.control ≠ .notStarted := by
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · rw [parents.running_control program analysis.entry parent state]
    simp
  · rcases later with history | ⟨_, _, _, _, _, _, _, ⟨instanceId, completed⟩, _⟩
    · rw [history.control_frame program owner selected issued state suffix,
        enterParallelScope_control_frame analysis.entry parent before issued entered,
        parents.running_control program analysis.entry parent before]
      simp
    · rw [completed]
      simp

private theorem pending_start_refuses_completion (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (seed : ParallelScopeAcceptedStart program) (stimulus : Stimulus)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program seed.ready stimulus).outcome = .committed) : False := by
  have raw := seed.started
  simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure,
    Option.some.injEq] at raw
  change _ = seed.ready at raw
  have running : seed.ready.control = .running seed.instanceId := by rw [← raw]; rfl
  have waits : seed.ready.waits = [] := by rw [← raw]; rfl
  have effects : seed.ready.effectWaits = [] := by rw [← raw]; rfl
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;> cases incidents : seed.ready.effectIncidents <;>
      simp [admitStimulus, snapshot, running, selected, incidents, ParallelScopeCommand.completeTask?, waits] at committed
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    cases snapshot : program.compensationEventSubProcessSnapshots <;> cases incidents : seed.ready.effectIncidents <;>
      simp [admitStimulus, snapshot, running, selected, incidents, ParallelScopeCommand.completeEffect?, effects] at committed

theorem parallelScope_initial_committed_is_start (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (stimulus : Stimulus)
    (committed : (admitStimulus program initialState stimulus).outcome = .committed) :
    ∃ commandId processId instanceId values, stimulus = .startProcess commandId processId instanceId values := by
  rcases parallelScope_committed_ingress_kind program selected initialState stimulus committed with ⟨id, processId, instanceId, values, same, _⟩ | completion
  · exact ⟨id, processId, instanceId, values, same⟩
  · cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
    case completeUserTaskInstance commandId taskId values =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, initialState] at committed
    case completeEffect commandId effectId result =>
      cases result <;> simp only at completion <;> try contradiction
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshot, initialState] at committed

private theorem started_phase_occurrence_execution (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (seed : ParallelScopeAcceptedStart program) (owner : ScopeOccurrenceId)
    (child : owner.definitionScopeId = analysis.entry.childScopeId) (before after : RuntimeState)
    (phase : ParallelScopeStartedPhase program analysis seed owner before)
    (absent : before.compensationHandlerEffectWaits = [])
    (count : Nat)
    (witness : (∃ candidate, count = 1 ∧ applyInternalOperationOccurrence? program before candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program before batch = some successors ∧
        successors.length = count ∧ successors.getLast? = some after)) :
    after.compensationHandlerEffectWaits = [] ∧ ParallelScopeStartedPhase program analysis seed owner after := by
  have distinct := ParallelScopeStart.analyzeProgram_child_root_distinct program analysis admitted seed.root seed.rootSelected
  have different : owner ≠ seed.parent := by
    intro same
    exact distinct (child.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same))
  rcases phase with rfl | ⟨id, origin, output, initial, records, declared, initiated, phase⟩
  · rcases witness with ⟨candidate, _, applied⟩ | ⟨batch, successors, applied, _, endpoint⟩
    · obtain ⟨id, origin, output, declared, initiated⟩ := parallelScope_start_occurrence_initiates program analysis admitted
        seed.instanceId seed.values seed.root seed.ready after seed.rootSelected distinct seed.started candidate applied
      have parents : ParallelScopeParentHistory program analysis.entry seed.parent after :=
        .initiate (.start seed.instanceId seed.root seed.values seed.ready seed.rootSelected seed.started rfl distinct)
          output ⟨id, origin, declared⟩ initiated
      exact ⟨applyInternalOperationOccurrence_compensation_absent program analysis admitted seed.ready after candidate applied absent,
        Or.inr ⟨id, origin, output, after, [], declared, initiated, Or.inl ⟨parents, .initial after⟩⟩⟩
    · have raw := seed.started
      simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
      change _ = seed.ready at raw
      have tokens : seed.ready.tokens = [] := by rw [← raw]; rfl
      exact False.elim (empty_tokens_refuse_batch program seed.ready tokens batch successors applied
        (by intro empty; simp [empty] at endpoint))
  · obtain ⟨added, _, nextAbsent, nextPhase⟩ := phase.occurrence_execution program analysis admitted owner seed.parent different
      seed.instanceId seed.values seed.root seed.ready initial id origin output declared seed.rootSelected rfl distinct
      seed.started initiated before after records absent count witness
    exact ⟨nextAbsent, Or.inr ⟨id, origin, output, initial, records ++ added, declared, initiated, nextPhase⟩⟩

private theorem certificate_wait_admission (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (state : RuntimeState) (certificate : ParallelScopeCommandCertificate program analysis state)
    (stimulus : Stimulus) (committed : (admitStimulus program state stimulus).outcome = .committed) :
    ParallelScopeCommandCertificate program analysis (admitStimulus program state stimulus).state := by
  obtain ⟨seed, absent, phases⟩ := certificate
  have alreadyStarted : state.control ≠ .notStarted := by
    rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
      ⟨id, origin, output, initial, records, declared, initiated, phase⟩
    · rw [runningProgramStartState_control program seed.instanceId seed.values seed.ready seed.started]
      simp
    · exact InternalCommutation.ParallelScopeSchedulerPhase.not_notStarted program analysis selected _ _ initial state records phase
  have completion : waitCompletionStimulus stimulus := by
    rcases parallelScope_committed_ingress_kind program selected state stimulus committed with ⟨_, _, _, _, _, control⟩ | completion
    · exact False.elim (alreadyStarted control)
    · exact completion
  have next : ∀ owner, owner.definitionScopeId = analysis.entry.childScopeId →
      (admitStimulus program state stimulus).state.compensationHandlerEffectWaits = [] ∧
        ParallelScopeStartedPhase program analysis seed owner (admitStimulus program state stimulus).state := by
    intro owner child
    rcases phases owner child with rfl | ⟨id, origin, output, initial, records, declared, initiated, phase⟩
    · exact False.elim (pending_start_refuses_completion program selected seed stimulus completion committed)
    · obtain ⟨nextPhase, nextAbsent⟩ := phase.wait_admission program analysis admitted owner seed.parent initial state records
        stimulus completion committed absent
      exact ⟨nextAbsent, Or.inr ⟨id, origin, output, initial, records, declared, initiated, nextPhase⟩⟩
  exact ⟨seed, (next ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl).1, fun owner child => (next owner child).2⟩

private theorem certificate_admission (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (state : RuntimeState) (before : state = initialState ∨ ParallelScopeCommandCertificate program analysis state)
    (stimulus : Stimulus) (committed : (admitStimulus program state stimulus).outcome = .committed) :
    ParallelScopeCommandCertificate program analysis (admitStimulus program state stimulus).state := by
  rcases before with rfl | certificate
  · obtain ⟨commandId, processId, instanceId, values, rfl⟩ := parallelScope_initial_committed_is_start program selected stimulus committed
    obtain ⟨started, capacity, capacityEq⟩ := parallelScope_committed_start_exact program selected
      commandId processId instanceId values committed
    have builder := started
    unfold runningProgramStartState? at builder
    obtain ⟨root, rootSelected, _⟩ := Option.bind_eq_some_iff.mp builder
    let seed : ParallelScopeAcceptedStart program := {
      commandId, processId, instanceId, values, root, capacity, committed, rootSelected, started, capacityAccepted := capacityEq }
    exact ⟨seed, (runningProgramStartState_reservation_valid program instanceId values _ started).2,
      fun _ _ => Or.inl rfl⟩
  · exact certificate_wait_admission program analysis admitted selected state certificate stimulus committed

private theorem certificate_occurrence_execution (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (before after : RuntimeState)
    (certificate : ParallelScopeCommandCertificate program analysis before)
    (count : Nat)
    (witness : (∃ candidate, count = 1 ∧ applyInternalOperationOccurrence? program before candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program before batch = some successors ∧
        successors.length = count ∧ successors.getLast? = some after)) :
    ParallelScopeCommandCertificate program analysis after := by
  obtain ⟨seed, absent, phases⟩ := certificate
  have result := fun owner child => started_phase_occurrence_execution program analysis admitted seed owner child
    before after (phases owner child) absent count witness
  exact ⟨seed, (result ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl).1,
    fun owner child => (result owner child).2⟩

/-- Actual ingress from completed commands and exact whole selections retain Start
and phase provenance; this does not admit ingress inside an unfinished closure. -/
theorem ParallelScopeInternalPrefixReachable.start_certificate (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    ParallelScopeCommandCertificate program analysis state := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  exact ParallelScopeInternalPrefixReachable.invariant_from_ingress program profile
    (ParallelScopeCommandCertificate program analysis)
    (fun before _ stimulus prior committed =>
      certificate_admission program analysis admitted selected before prior stimulus committed)
    (fun before after _ candidate prior applied =>
      certificate_occurrence_execution program analysis admitted before after prior 1 (Or.inl ⟨candidate, rfl, applied⟩))
    (fun before after _ batch successors prior applied endpoint =>
      certificate_occurrence_execution program analysis admitted before after prior successors.length
        (Or.inr ⟨batch, successors, applied, rfl, endpoint⟩))
    state reachable

/-- Complete actual commands retain one Start certificate, including exact predecessor
preservation on refusal and atomic rollback. -/
theorem ParallelScopeCommandBoundaryReachable.start_certificate (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    state = initialState ∨ ParallelScopeCommandCertificate program analysis state := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selection
  exact (reachable.initial_or_prefix program profile state).imp id
    (fun prefixReachable => prefixReachable.start_certificate program analysis admitted state)

/-- Admitted scope ownership resolves the real Start occurrence and executes its
initiation; an empty successful frontier cannot hide this enabled step. -/
theorem ParallelScopeAcceptedStart.initiation_enabled (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (seed : ParallelScopeAcceptedStart program) :
    ∃ candidate operation after,
      resolveInternalOperationOccurrence? program seed.ready candidate = some operation ∧
      applyInternalOperationOccurrence? program seed.ready candidate = some after := by
  obtain ⟨root, operations, counts, start, completion, output, path, roots, parentEq, _, startSelected, _, startEq, _⟩ :=
    ParallelScopeStart.analyzeProgram_parent_spine program analysis admitted
  have sameRoot : seed.root = root := by
    have selected := seed.rootSelected
    unfold rootDefinitionScope? at selected
    split at selected <;> try contradiction
    rename_i scopes chosen census
    cases Option.some.inj selected
    have member : seed.root ∈ program.definitionScopes.filter (fun scope =>
        scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by rw [census]; simp
    obtain ⟨present, checks⟩ := List.mem_filter.mp member
    have rootMember : seed.root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
      List.mem_filter.mpr ⟨present, (Bool.and_eq_true_iff.mp checks).1⟩
    simpa [roots] using rootMember
  have startPresent : start ∈ operations :=
    (List.mem_filter.mp (startSelected.symm ▸ (show start ∈ [start] from by simp))).1
  rw [parentEq] at startPresent
  obtain ⟨declared, owner⟩ := List.mem_filter.mp startPresent
  obtain ⟨binding, bindingMember, selected⟩ := List.any_eq_true.mp owner
  have key : binding.operationId = start.id := eq_of_beq (Bool.and_eq_true_iff.mp selected).1
  have scope : binding.scopeId = seed.root.id := (eq_of_beq (Bool.and_eq_true_iff.mp selected).2).trans (congrArg DefinitionScope.id sameRoot).symm
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  have unique : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program (programWellFormed_graph program wellFormed)
  simp only [scopedOwnershipComplete, Bool.and_eq_true, decide_eq_true_eq] at ownership
  have bindingUnique : (program.operationScopes.map (·.operationId)).Nodup := by rw [ownership.1.1]; exact unique
  have declaration : program.operations.filter (·.id == start.id) = [start] := by
    simpa only [Bool.beq_eq_decide_eq] using filter_key_eq_singleton_of_nodup program.operations (·.id) start unique declared
  have bindingCensus : program.operationScopes.filter (·.operationId == start.id) = [binding] := by
    simpa only [key, Bool.beq_eq_decide_eq] using
      filter_key_eq_singleton_of_nodup program.operationScopes (·.operationId) binding bindingUnique bindingMember
  have found : program.operations.find? (·.id == start.id) = some start := by
    have filtered : (program.operations.filter (·.id == start.id)).find? (fun _ => true) = some start := by
      rw [declaration]; rfl
    simpa [Bool.beq_eq_decide_eq] using filtered
  have raw := seed.started
  simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
  change _ = seed.ready at raw
  have scopes : seed.ready.scopeOccurrences = [⟨seed.parent, none⟩] := by rw [← raw]; rfl
  have running : seed.ready.control = .running seed.instanceId := by rw [← raw]; rfl
  have pending : seed.ready.initiationPending = true := by rw [← raw]; rfl
  let candidate : InternalOperationOccurrence := ⟨start.id, seed.parent⟩
  have resolved : resolveInternalOperationOccurrence? program seed.ready candidate = some start := by
    simp [candidate, resolveInternalOperationOccurrence?, internalOperationOccurrences?, declaration,
      bindingCensus, scopes, scope, ParallelScopeAcceptedStart.parent, InternalCommutation.sortBy, InternalCommutation.sortInsertBy, found]
  have applied : applyInternalOperationOccurrence? program seed.ready candidate = some
      { seed.ready with initiationPending := false, tokens := addToken seed.ready.tokens output seed.parent } := by
    simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some]
    rw [startEq]
    simp [scopes, candidate, initiateState?, rootScopeOccurrence?, pending, running]
  exact ⟨candidate, start, _, resolved, applied⟩

theorem ParallelScopeAcceptedStart.not_stable (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (seed : ParallelScopeAcceptedStart program) :
    ¬ ((deriveInternalExecutionFrontier program seed.ready).offers.isEmpty &&
      !(deriveInternalExecutionFrontier program seed.ready).preparationFailed) = true := by
  intro stable
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selected : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selected] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  obtain ⟨candidate, operation, after, resolved, applied⟩ := seed.initiation_enabled program analysis admitted
  obtain ⟨empty, successful⟩ := Bool.and_eq_true_iff.mp stable
  have offersEmpty : (deriveInternalExecutionFrontier program seed.ready).offers = [] := by simpa using empty
  have preparationSucceeded : (deriveInternalExecutionFrontier program seed.ready).preparationFailed = false := by simpa using successful
  have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program seed.ready profile candidate operation
    resolved offersEmpty preparationSucceeded
  rw [refused] at applied
  contradiction

/-- A completed command is either the original not-started state or has crossed
actual initiation. Pending Start is excluded by complete-frontier stability. -/
theorem ParallelScopeCommandBoundaryReachable.initialized_certificate (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    state = initialState ∨ ∃ seed : ParallelScopeAcceptedStart program,
      state.compensationHandlerEffectWaits = [] ∧
      ∀ owner, owner.definitionScopeId = analysis.entry.childScopeId →
        ∃ id origin output initial records,
          SemanticOperation.initiate id origin output ∈ program.operations ∧
          initiateState? seed.ready output = some initial ∧
          ParallelScopeSchedulerPhase program analysis owner seed.parent initial state records := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases reachable.start_certificate program analysis admitted state with original | ⟨seed, absent, phases⟩
  · exact Or.inl original
  · rcases reachable.initial_or_stable program selected state with original | stable
    · exact Or.inl original
    · refine Or.inr ⟨seed, absent, ?_⟩
      intro owner child
      rcases phases owner child with rfl | initialized
      · exact False.elim (seed.not_stable program analysis admitted stable)
      · exact initialized

end BpmnSemantics.SemanticProcess
