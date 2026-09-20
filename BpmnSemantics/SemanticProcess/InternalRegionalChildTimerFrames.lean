import BpmnSemantics.SemanticProcess.InternalRegionalChildTimerBinding
import BpmnSemantics.SemanticProcess.InternalRegionalChildWaitValidity

/-! Child completion preserves the complete candidate census for surviving Timers.
Exact Activity body and tagged-handler selection keep a surviving Timer from naming
the removed child, independently of activation-counter coincidences. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem regional_child_scope_filter_frame (before after : RuntimeState)
    (root : RuntimeScopeOccurrence) (scopeId : DefinitionScopeId)
    (predicate : RuntimeScopeOccurrence → Bool)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (excluded : predicate root = false) :
    after.scopeOccurrences.filter predicate = before.scopeOccurrences.filter predicate := by
  have rootMember := List.mem_filter.mp (show root ∈ before.scopeOccurrences.filter
    (fun child => decide (child.id.definitionScopeId = scopeId)) from by rw [children]; simp)
  rw [scopes, List.filter_filter]
  apply List.filter_congr
  intro child member
  by_cases equal : child.id = root.id
  · have childMember : child ∈ before.scopeOccurrences.filter
        (fun candidate => decide (candidate.id.definitionScopeId = scopeId)) :=
      List.mem_filter.mpr ⟨member, by simpa only [equal] using rootMember.2⟩
    rw [children] at childMember
    have identical := List.mem_singleton.mp childMember
    subst child
    simp only [excluded, Bool.false_and]
  · simp [equal]

theorem completionWithdrawal_timer_host_filter_frame (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal) (timer : TimerWait)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (definition : DefinitionScopeId) (boundary : BoundaryTimerArm)
    (record : ActivityOccurrence) (recordMember : record ∈ before.activityOccurrences)
    (unique : waitIdentitiesUnique before = true)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits
      | .bounded _ deadline => before.timerWaits.erase deadline)
    (retained : timer ∈ after.timerWaits)
    (entryMember : .enterBoundedScope id origin input entry definition boundary ∈ program.operations)
    (attached : recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = true) :
    after.scopeOccurrences.filter (fun child =>
      decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
        activityBodyScope? record == some child.id) =
    before.scopeOccurrences.filter (fun child =>
      decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
        activityBodyScope? record == some child.id) := by
  apply regional_child_scope_filter_frame before after root scopeId _ children scopes
  cases withdrawal with
  | unbounded =>
      have absent := completionWithdrawal_unbounded_facts program before scopeId selected
      have rootMember := List.mem_filter.mp (show root ∈ before.scopeOccurrences.filter
        (fun child => decide (child.id.definitionScopeId = scopeId)) from by rw [children]; simp)
      have different : root.id.definitionScopeId ≠ definition := by
        intro equal
        have definitionEq := equal.symm.trans (of_decide_eq_true rootMember.2)
        have present : boundary ∈ boundedCompletionDeclarations program scopeId := by
          unfold boundedCompletionDeclarations
          exact List.mem_filterMap.mpr ⟨_, entryMember, by simp only [definitionEq, ↓reduceIte]⟩
        rw [absent] at present
        contradiction
      simp [different]
  | bounded selectedRecord deadline =>
      have survives : timer ∈ before.timerWaits.erase deadline := by simpa only [timers] using retained
      have different : record.body ≠ .childScope root.id := by
        intro body
        have absent := completionWithdrawal_retained_timer_not_attached program before scopeId selectedRecord deadline
          timer root record unique children selected survives recordMember body
        rw [absent] at attached
        contradiction
      cases body : record.body <;> simp_all [activityBodyScope?]

theorem regional_child_activity_filter_frame (before after : RuntimeState)
    (root : ScopeOccurrenceId) (withdrawal : InternalCompletionWithdrawal)
    (predicate : ActivityOccurrence → Bool)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. => !decide (record.body = .childScope root)))
    (excluded : ∀ record ∈ before.activityOccurrences, record.body = .childScope root → predicate record = false) :
    after.activityOccurrences.filter predicate = before.activityOccurrences.filter predicate := by
  rw [activities, List.filter_filter]
  apply List.filter_congr
  intro record member
  cases withdrawal with
  | unbounded => simp only [Bool.and_true]
  | bounded selected deadline =>
      by_cases body : record.body = .childScope root
      · simp [body, excluded record member body]
      · simp [body]

theorem completionWithdrawal_scope_timer_census_frame (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal) (timer : TimerWait)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (definition : DefinitionScopeId) (boundary : BoundaryTimerArm)
    (unique : waitIdentitiesUnique before = true)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. => !decide (record.body = .childScope root.id)))
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline)
    (retained : timer ∈ after.timerWaits)
    (entryMember : .enterBoundedScope id origin input entry definition boundary ∈ program.operations) :
    (after.activityOccurrences.filter fun record => record.owner = timer.owner && recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } &&
        (after.scopeOccurrences.filter fun child =>
          decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
            activityBodyScope? record == some child.id).length = 1) =
    (before.activityOccurrences.filter fun record => record.owner = timer.owner && recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } &&
        (before.scopeOccurrences.filter fun child =>
          decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
            activityBodyScope? record == some child.id).length = 1) := by
  rw [activities, List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases attached : recordAttaches record
      { processInstanceId := timer.processInstanceId, elementId := ⟨timer.elementId.value⟩, activation := timer.activation } = true
  · rw [completionWithdrawal_timer_host_filter_frame program before after scopeId root withdrawal timer
      id origin input entry definition boundary record member unique children selected scopes timers retained entryMember attached]
    cases withdrawal with
    | unbounded => simp only [Bool.and_true]
    | bounded selectedRecord deadline =>
        have survives : timer ∈ before.timerWaits.erase deadline := by simpa only [timers] using retained
        have different : record.body ≠ .childScope root.id := by
          intro body
          have absent := completionWithdrawal_retained_timer_not_attached program before scopeId selectedRecord deadline
            timer root record unique children selected survives member body
          rw [absent] at attached
          contradiction
        simp [different]
  · simp only [Bool.eq_false_iff.mpr attached, Bool.and_false, Bool.false_and]

theorem completionWithdrawal_boundary_timer_operation_frame (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal) (timer : TimerWait)
    (candidate : SemanticOperation)
    (member : candidate ∈ program.operations)
    (unique : waitIdentitiesUnique before = true)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (tasks : after.waits = before.waits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. => !decide (record.body = .childScope root.id)))
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline)
    (retained : timer ∈ after.timerWaits) :
    boundaryTimerOperationMatches program after timer candidate =
      boundaryTimerOperationMatches program before timer candidate := by
  cases candidate <;> try rfl
  case awaitBoundedUserTask id origin input task boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [tasks]
    rw [regional_child_activity_filter_frame before after root.id withdrawal _ activities]
    · rfl
    · intro record member body
      simp [recordBodyNamesWait, activityBodyTask?, body, ← List.countP_eq_length_filter]
  case awaitMonitoredUserTask id origin input task boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [tasks]
    rw [regional_child_activity_filter_frame before after root.id withdrawal _ activities]
    · rfl
    · intro record member body
      simp [recordBodyNamesWait, activityBodyTask?, body, ← List.countP_eq_length_filter]
  case awaitSequentialMultiInstanceUserTask id origin input task data output boundary limits =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [regional_child_activity_filter_frame before after root.id withdrawal _ activities]
    · rfl
    · intro record member body
      simp [activityBodyTask?, body]
  case awaitParallelMultiInstanceUserTask id origin input taskId taskName data output boundary condition limits =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [regional_child_activity_filter_frame before after root.id withdrawal _ activities]
    · rfl
    · intro record member body
      simp [activityBodyParallelTasks?, body]
  case enterBoundedScope id origin input entry definition boundary =>
    change (if !operationOwnedBy program _ timer.owner then false else _ && _ && decide (_ = 1)) = _
    have hosts := completionWithdrawal_scope_timer_census_frame program before after scopeId root withdrawal timer
      id origin input entry definition boundary unique children selected scopes activities timers retained member
    exact congrArg (fun records : List ActivityOccurrence =>
      if !operationOwnedBy program (.enterBoundedScope id origin input entry definition boundary) timer.owner then false
      else boundary.elementId = timer.elementId && boundary.output = timer.output && records.length = 1) hosts

theorem completionWithdrawal_boundary_timer_frame (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal) (timer : TimerWait)
    (unique : waitIdentitiesUnique before = true)
    (children : before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = scopeId)) = [root])
    (selected : selectInternalCompletionWithdrawal? program before scopeId = some withdrawal)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (tasks : after.waits = before.waits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. => !decide (record.body = .childScope root.id)))
    (timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline)
    (retained : timer ∈ after.timerWaits) :
    flowNodeOccurrenceBoundaryTimerBound program after timer =
      flowNodeOccurrenceBoundaryTimerBound program before timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate member
  exact completionWithdrawal_boundary_timer_operation_frame program before after scopeId root withdrawal timer candidate member unique children selected scopes tasks activities timers retained

theorem regionalSelection_completion_withdrawal (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId) (selected : InternalRegionalSelection)
    (withdrawal : InternalCompletionWithdrawal)
    (found : selectInternalRegional? program state (.completeScope id origin definition output) = some selected)
    (kind : selected.kind = .completing withdrawal) :
    selectInternalCompletionWithdrawal? program state definition = some withdrawal := by
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  dsimp only at found
  repeat' first
    | (solve | simp at found)
    | (solve | cases found; simp_all)
    | split at found
    | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

/-- Child completion's common wait fields come from the actual selected evaluator.
Both wait validity and private-Timer projection consume this same retained-field account. -/
theorem preparedChildComplete_wait_fields (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after withdrawal, applyPreparedInternalRegional? program before prepared = some after ∧
      fire? program (.completeScope id origin definition (some output)) before = some after ∧
      selectInternalCompletionWithdrawal? program before definition = some withdrawal ∧
      before.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = definition)) = [prepared.selection.root] ∧
      scopeQuiescent before prepared.selection.root.id = true ∧
      after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ prepared.selection.root.id)) ∧
      after.waits = before.waits ∧ after.messageWaits = before.messageWaits ∧ after.eventRaces = before.eventRaces ∧
      after.activityOccurrences = before.activityOccurrences.filter (fun record =>
        match (generalizing := false) withdrawal with
        | .unbounded => true | .bounded .. => !decide (record.body = .childScope prepared.selection.root.id)) ∧
      after.timerWaits = (match (generalizing := false) withdrawal with
        | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline) := by
  obtain ⟨snapshots, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨withdrawal, kind, children⟩ := regionalSelection_complete_census program before id origin definition
    (some output) prepared.selection selection
  have withdrawn := regionalSelection_completion_withdrawal program before id origin definition (some output)
    prepared.selection withdrawal selection kind
  obtain ⟨after, applied, quiet, _, _, scopes⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  obtain ⟨actual, fired, appliedAgain⟩ := prepareInternalRegional_executes program before _ prepared found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  subst actual
  have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots identities selection fired
  have tasks : after.waits = before.waits := by
    rw [fields.2.2.1]
    apply List.filter_eq_self.mpr
    intro wait member
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal <;> rfl
  have activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with
      | .unbounded => true | .bounded .. => !decide (record.body = .childScope prepared.selection.root.id)) := by
    rw [fields.2.1]
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal <;> rfl
  have timers : after.timerWaits = match (generalizing := false) withdrawal with
      | .unbounded => before.timerWaits | .bounded _ deadline => before.timerWaits.erase deadline := by
    rw [fields.2.2.2.2.1]
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal with
    | unbounded => exact List.filter_eq_self.mpr (by intros; rfl)
    | bounded record deadline =>
        have unique := identities
        simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at unique
        have nodup := occurrence_uniqueness_implies_nodup timerWaitKeyMatches
          (by intro wait; simp [timerWaitKeyMatches]) before.timerWaits unique.2.2.1
        exact (nodup.erase_eq_filter deadline).symm
  have messages : after.messageWaits = before.messageWaits := by
    rw [fields.2.2.2.1]
    apply List.filter_eq_self.mpr
    intro wait member
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal <;> rfl
  have races : after.eventRaces = before.eventRaces := by
    rw [fields.2.2.2.2.2]
    apply List.filter_eq_self.mpr
    intro race member
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal <;> rfl
  exact ⟨after, withdrawal, applied, fired, withdrawn, children, quiet, scopes, tasks, messages, races, activities, timers⟩

/-- Actual prepared child completion preserves private/public Timer classification;
all successor fields used by the frame come from the selected evaluator. -/
theorem preparedChildComplete_boundary_timer_frame (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      ∀ timer ∈ after.timerWaits, flowNodeOccurrenceBoundaryTimerBound program after timer =
        flowNodeOccurrenceBoundaryTimerBound program before timer := by
  obtain ⟨after, withdrawal, applied, _, withdrawn, children, _, scopes, tasks, _, _, activities, timers⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  refine ⟨after, applied, ?_⟩
  intro timer retained
  exact completionWithdrawal_boundary_timer_frame program before after definition prepared.selection.root withdrawal timer
    identities children withdrawn scopes tasks activities timers retained

end BpmnSemantics.SemanticProcess.InternalCommutation
