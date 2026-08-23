import BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite

/-! # Sequential Multi-Instance transitions

The four transitions of one sequential Multi-Instance User Task, each as a declarative relation and an
executable evaluator, with a bridge proving every evaluator-produced transition is permitted by its
relation. The account is
[the sequential Multi-Instance proposal](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md),
rules `SMI-ENTER-01`, `SMI-ITERATE-01`, `SMI-COMPLETE-01`, and `SMI-CANCEL-01`. The arm carrying the
definition facts, the two admitted-value lookups, and the five state rewrites the relations conclude
with belong to [the rewrite owner](SequentialMultiInstanceRewrite.lean), including the reason the arm
is an argument rather than a committed program operation.

What separates a defective evaluator here is each arm's post-state together with the quantified laws
in [the laws owner](SequentialMultiInstanceLaws.lean). Every conclusion carries the collections its
rule must not touch verbatim, so an evaluator that re-arms the lifetime deadline across an iteration,
or publishes a partial collection on interruption, cannot be shown to satisfy the arm it claims.

Scope boundary: four transition families over committed runtime state. It owns no admission, no public
observation, no occurrence projection, no scenario stimulus, and no claim of completeness or
determinism across unspecified schedules. Soundness in one direction is what the bridges prove, and an
evaluator that refused every input would satisfy all three of them.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-! ## The declarative relations

One relation per rule identifier, with `SMI-ENTER-01` carrying the two arms its own account gives it.
Premises are stated over membership, field equations, and arithmetic rather than over the evaluators'
lookups, so each relation constrains what a legal transition *is*: every one of them has to be
recovered from a lookup's success by the bridges below, and `AttachedDeadlinesLive` cannot be
recovered at all because no evaluator computes it.
-/

/-- Every Timer occurrence a record lists is live in this state.

The iteration and completion arms' one premise that no evaluator result supplies. Stated over the
whole state rather than over one record so the bridges can take it as a hypothesis without naming the
record their own lookup finds. It is universally quantified and therefore vacuous for a record with no
handler, which is deliberate: what it forbids is a state whose record names a withdrawn deadline, and
that is the state in which "the lifetime deadline survives the turnover" would otherwise be a claim
about a wait that is not there. `activityRecordsOwnLiveWork` supplies it for every admitted state, and
`attachedDeadlinesLive_of_activityRecordsOwnLiveWork` is that derivation. -/
def AttachedDeadlinesLive (state : RuntimeState) : Prop :=
  ∀ record ∈ state.activityOccurrences, ∀ deadline ∈ record.attachedTimers,
    ∃ live ∈ state.timerWaits, timerIdNamesWait deadline live = true

/-- `AttachedDeadlinesLive` is the runtime-state invariant's own conjunct, not a new assumption. -/
theorem attachedDeadlinesLive_of_activityRecordsOwnLiveWork {state : RuntimeState}
    (invariant : activityRecordsOwnLiveWork state = true) : AttachedDeadlinesLive state := by
  intro record recordLive deadline attached
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true, List.any_eq_true,
    decide_eq_true_eq] at invariant
  obtain ⟨_, attachedAll⟩ := invariant record recordLive
  obtain ⟨live, liveMem, holds⟩ := attachedAll deadline attached
  exact ⟨live, liveMem, holds.1⟩

/-- `SMI-ENTER-01`. Snapshot the collection once, then take exactly one of two arms.

Both arms require the incoming token to have one owner, the instance to be running, and Process scope
to bind exactly one collection of the declared name within every profile bound. They differ in that
collection, and nothing else selects between them. -/
inductive SequentialMultiInstanceEntryStep :
    SequentialMultiInstanceArm → RuntimeState → RuntimeState → Prop where
  | completesEmpty (arm : SequentialMultiInstanceArm) (before : RuntimeState)
      (owner : ScopeOccurrenceId) (instanceId : SemanticId) (binding : VariableBinding)
      (owned : onlyTokenOwner? before arm.input = some owner)
      (running : before.control = .running instanceId)
      (soleBinding : before.variables.process.bindings.filter
        (fun candidate => candidate.name == arm.data.inputDataObjectId) = [binding])
      (collection : binding.value = .stringList [])
      (limits : withinSequentialMultiInstanceLimits arm [] = true) :
      SequentialMultiInstanceEntryStep arm before
        (emptyCollectionEntryState arm before owner)
  | generatesFirst (arm : SequentialMultiInstanceArm) (before : RuntimeState)
      (owner : ScopeOccurrenceId) (instanceId : SemanticId) (binding : VariableBinding)
      (first : String) (rest : List String)
      (owned : onlyTokenOwner? before arm.input = some owner)
      (running : before.control = .running instanceId)
      (soleBinding : before.variables.process.bindings.filter
        (fun candidate => candidate.name == arm.data.inputDataObjectId) = [binding])
      (collection : binding.value = .stringList (first :: rest))
      (limits : withinSequentialMultiInstanceLimits arm (first :: rest) = true) :
      SequentialMultiInstanceEntryStep arm before
        (firstIterationEntryState arm before instanceId owner (first :: rest))

/-- `SMI-ITERATE-01`. A non-final accepted completion stores its result and generates the next inner
instance, atomically.

`nonFinal` counts the slot this step fills, so the arm cannot be satisfied by the completion that
fills the last one. `deadlines` is the premise no evaluator supplies, and it is what makes the
untouched `timerWaits` in the conclusion a preservation claim rather than a statement about an absent
wait. -/
inductive SequentialMultiInstanceIterationStep :
    SequentialMultiInstanceArm → OccurrenceId → List VariableBinding →
      RuntimeState → RuntimeState → Prop where
  | iterates (arm : SequentialMultiInstanceArm) (body : OccurrenceId)
      (submitted : List VariableBinding) (before : RuntimeState) (instanceId : SemanticId)
      (record : ActivityOccurrence) (controller : SequentialMultiInstanceController)
      (wait : UserTaskWait) (binding : VariableBinding) (result : String)
      (running : before.control = .running instanceId)
      (recordLive : record ∈ before.activityOccurrences)
      (bodyIsTask : activityBodyTask? record = some body)
      (armOwnsTask : body.elementId.value = arm.taskId.value)
      (soleBodyWait : before.waits.filter (taskIdNamesWait body) = [wait])
      (controllerLive : controller ∈ before.sequentialMultiInstanceControllers)
      (controllerBinds : controllerNamesActivityOccurrence controller record = true)
      (deadlines : AttachedDeadlinesLive before)
      (submission : submitted = [binding])
      (submittedName : binding.name = arm.data.taskDataOutputId)
      (submittedValue : binding.value = .string result)
      (nonFinal : completedInstanceCount controller + 1 < controller.snapshot.length) :
      SequentialMultiInstanceIterationStep arm body submitted before
        (iteratedState before record wait body controller result)

/-- `SMI-COMPLETE-01`. The completion that fills the last slot publishes and closes.

`final` is the exact complement of the iteration arm's `nonFinal`, so no state satisfies both, and it
constrains the controller rather than restating a fact the evaluator hands over. The published
collection is `controller.outputSlots ++ [result]`: the slots in index order with this result in its
own position. -/
inductive SequentialMultiInstanceCompletionStep :
    SequentialMultiInstanceArm → OccurrenceId → List VariableBinding →
      RuntimeState → RuntimeState → Prop where
  | publishes (arm : SequentialMultiInstanceArm) (body : OccurrenceId)
      (submitted : List VariableBinding) (before : RuntimeState) (instanceId : SemanticId)
      (record : ActivityOccurrence) (controller : SequentialMultiInstanceController)
      (wait : UserTaskWait) (binding : VariableBinding) (result : String)
      (running : before.control = .running instanceId)
      (recordLive : record ∈ before.activityOccurrences)
      (bodyIsTask : activityBodyTask? record = some body)
      (armOwnsTask : body.elementId.value = arm.taskId.value)
      (soleBodyWait : before.waits.filter (taskIdNamesWait body) = [wait])
      (controllerLive : controller ∈ before.sequentialMultiInstanceControllers)
      (controllerBinds : controllerNamesActivityOccurrence controller record = true)
      (deadlines : AttachedDeadlinesLive before)
      (submission : submitted = [binding])
      (submittedName : binding.name = arm.data.taskDataOutputId)
      (submittedValue : binding.value = .string result)
      (final : controller.snapshot.length ≤ completedInstanceCount controller + 1) :
      SequentialMultiInstanceCompletionStep arm body submitted before
        (finalCompletionState arm before record body controller
          (controller.outputSlots ++ [result]))

/-- `SMI-CANCEL-01`. The exact outer deadline cancels every generated inner instance.

`atDeadline` is the off-instant refusal as a premise: the firing instant is the deadline the committed
state carries, so a stimulus naming another time describes a different transition. `attaches` requires
the fired deadline to be one this record listed, which is the record-carried join rather than an
agreement between two independently keyed counters. -/
inductive SequentialMultiInstanceInterruptionStep :
    SequentialMultiInstanceArm → TimerOccurrenceId → Nat →
      RuntimeState → RuntimeState → Prop where
  | interrupts (arm : SequentialMultiInstanceArm) (timer : TimerOccurrenceId)
      (logicalTimeMs : Nat) (before : RuntimeState) (instanceId : SemanticId)
      (record : ActivityOccurrence) (controller : SequentialMultiInstanceController)
      (deadline : TimerWait) (body : OccurrenceId)
      (running : before.control = .running instanceId)
      (deadlineLive : deadline ∈ before.timerWaits)
      (deadlineNamed : timerIdNamesWait timer deadline = true)
      (recordLive : record ∈ before.activityOccurrences)
      (attaches : recordAttaches record timer = true)
      (armOwnsTimer : timer.elementId.value = arm.boundaryTimer.elementId.value)
      (bodyIsTask : activityBodyTask? record = some body)
      (controllerLive : controller ∈ before.sequentialMultiInstanceControllers)
      (controllerBinds : controllerNamesActivityOccurrence controller record = true)
      (atDeadline : logicalTimeMs = deadline.deadlineMs) :
      SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before
        (interruptionState arm before record body deadline controller)

/-! ## The executable evaluators

Each resolves its pair from committed state alone and answers `none` outside the shape its transition
is defined on. Nothing here repairs a state: a refusal is the whole outcome, and the caller's
committed state is unchanged because no partial rewrite exists to expose.
-/

/-- `SMI-ENTER-01`. Answers `none` unless one token owner, a running instance, and exactly one
admitted collection are all present. -/
def enterSequentialMultiInstance? (arm : SequentialMultiInstanceArm) (state : RuntimeState) :
    Option RuntimeState :=
  match state.control with
  | .running instanceId => do
      let owner ← onlyTokenOwner? state arm.input
      let items ← admittedSnapshot? arm state
      match items with
      | [] => some (emptyCollectionEntryState arm state owner)
      | first :: rest =>
          some (firstIterationEntryState arm state instanceId owner (first :: rest))
  | _ => none

/-- `SMI-ITERATE-01` and `SMI-COMPLETE-01`, which are one evaluator with two arms.

One function because the deciding fact is one read: whether this completion filled the last slot.
Splitting them would ask that question twice, and the intermediate state between "result stored" and
"next instance generated" is exactly the state `SMI-ITERATE-01` forbids from becoming stable.

The live body wait is required in both arms. The independently written core requires it only in the
non-final arm, where its own body-turnover call does; in a well-formed state the two agree, because
every record has exactly one live body, and where they differ this side refuses a state the invariant
already rejects. -/
def completeSequentialMultiInstanceInnerTask? (arm : SequentialMultiInstanceArm)
    (state : RuntimeState) (body : OccurrenceId) (submitted : List VariableBinding) :
    Option RuntimeState :=
  match state.control with
  | .running _ => do
      let record ← activityOccurrenceForTask? state.activityOccurrences body
      let controller ← sequentialMultiInstanceControllerFor?
        state.sequentialMultiInstanceControllers record
      let result ← acceptedIterationResult arm submitted
      if body.elementId.value = arm.taskId.value then
        match state.waits.filter (taskIdNamesWait body) with
        | [wait] =>
            if completedInstanceCount controller + 1 < controller.snapshot.length then
              some (iteratedState state record wait body controller result)
            else
              some (finalCompletionState arm state record body controller
                (controller.outputSlots ++ [result]))
        | _ => none
      else none
  | _ => none

/-- `SMI-CANCEL-01`. Answers `none` for a stale deadline, a foreign element, a deadline no record
lists, a child-scope body, a missing controller, or an instant other than the committed one. -/
def interruptSequentialMultiInstance? (arm : SequentialMultiInstanceArm) (state : RuntimeState)
    (timer : TimerOccurrenceId) (logicalTimeMs : Nat) : Option RuntimeState :=
  match state.control with
  | .running _ => do
      let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
      let record ← activityOccurrenceForTimer? state.activityOccurrences timer
      let body ← activityBodyTask? record
      let controller ← sequentialMultiInstanceControllerFor?
        state.sequentialMultiInstanceControllers record
      if timer.elementId.value = arm.boundaryTimer.elementId.value then
        if logicalTimeMs = deadline.deadlineMs then
          some (interruptionState arm state record body deadline controller)
        else none
      else none
  | _ => none

/-! ## Lookup soundness

What each bridge needs from a lookup: that the value it answered is in the state, and that it really
satisfies the predicate the caller started from. Each mirrors the Activity occurrence account's own
soundness lemmas; `mem_of_filter_eq_singleton` is private to that module, so the one-line membership
step is restated here rather than shared.
-/

private theorem mem_of_singleton_filter {α : Type} {p : α → Bool} {values : List α} {value : α}
    (singleton : values.filter p = [value]) : value ∈ values ∧ p value = true :=
  List.mem_filter.mp (by simp [singleton])

/-- A record answered for a task occurrence is in the state and its body is that occurrence. -/
private theorem activityOccurrenceForTask_sound {records : List ActivityOccurrence}
    {task : OccurrenceId} {record : ActivityOccurrence}
    (found : activityOccurrenceForTask? records task = some record) :
    record ∈ records ∧ activityBodyTask? record = some task := by
  unfold activityOccurrenceForTask? at found
  split at found
  · next singleton =>
      cases found
      obtain ⟨mem, holds⟩ := mem_of_singleton_filter singleton
      exact ⟨mem, by simpa using holds⟩
  · exact absurd found (by simp)

/-- A record answered for a Timer occurrence is in the state and lists it. -/
private theorem activityOccurrenceForTimer_sound {records : List ActivityOccurrence}
    {timer : OccurrenceId} {record : ActivityOccurrence}
    (found : activityOccurrenceForTimer? records timer = some record) :
    record ∈ records ∧ recordAttaches record timer = true := by
  unfold activityOccurrenceForTimer? at found
  split at found
  · next singleton =>
      cases found
      exact mem_of_singleton_filter singleton
  · exact absurd found (by simp)

/-- A controller answered for a record is in the state and names that record. -/
private theorem sequentialMultiInstanceControllerFor_sound
    {controllers : List SequentialMultiInstanceController} {record : ActivityOccurrence}
    {controller : SequentialMultiInstanceController}
    (found : sequentialMultiInstanceControllerFor? controllers record = some controller) :
    controller ∈ controllers ∧ controllerNamesActivityOccurrence controller record = true := by
  unfold sequentialMultiInstanceControllerFor? at found
  split at found
  · next singleton =>
      cases found
      exact mem_of_singleton_filter singleton
  · exact absurd found (by simp)

/-- An admitted snapshot comes from exactly one named Process binding and fits every bound. -/
private theorem admittedSnapshot_sound {arm : SequentialMultiInstanceArm} {state : RuntimeState}
    {items : List String} (found : admittedSnapshot? arm state = some items) :
    ∃ binding, state.variables.process.bindings.filter
        (fun candidate => candidate.name == arm.data.inputDataObjectId) = [binding] ∧
      binding.value = .stringList items ∧
      withinSequentialMultiInstanceLimits arm items = true := by
  unfold admittedSnapshot? at found
  cases filtered : state.variables.process.bindings.filter
      (fun candidate => candidate.name == arm.data.inputDataObjectId) with
  | nil => simp [filtered] at found
  | cons binding rest =>
      cases rest with
      | cons _ _ => simp [filtered] at found
      | nil =>
          cases value : binding.value with
          | stringList values =>
              by_cases limits : withinSequentialMultiInstanceLimits arm values = true
              · simp [filtered, value, limits] at found
                cases found
                exact ⟨binding, rfl, value, limits⟩
              · simp [filtered, value, limits] at found
          | string _ => simp [filtered, value] at found
          | boolean _ => simp [filtered, value] at found
          | integer _ => simp [filtered, value] at found
          | null => simp [filtered, value] at found

/-- The accepted result is one binding of the declared name carrying that exact String. -/
private theorem acceptedIterationResult_sound {arm : SequentialMultiInstanceArm}
    {submitted : List VariableBinding} {result : String}
    (found : acceptedIterationResult arm submitted = some result) :
    ∃ binding, submitted = [binding] ∧ binding.name = arm.data.taskDataOutputId ∧
      binding.value = .string result := by
  unfold acceptedIterationResult at found
  cases submitted with
  | nil => simp at found
  | cons binding rest =>
      cases rest with
      | cons _ _ => simp at found
      | nil =>
          cases value : binding.value with
          | string submittedResult =>
              by_cases named : binding.name = arm.data.taskDataOutputId
              · simp [value, named] at found
                cases found
                exact ⟨binding, rfl, named, value⟩
              · simp [value, named] at found
          | stringList _ => simp [value] at found
          | boolean _ => simp [value] at found
          | integer _ => simp [value] at found
          | null => simp [value] at found

/-! ## The bridges

Every state these evaluators commit is permitted by the relation of the rule it implements. They are
dispatcher and constructor-selection checks over the arms, plus independent content exactly where a
relation states a premise the evaluator never computes: `AttachedDeadlinesLive`, which arrives as a
hypothesis and is discharged by the runtime-state invariant.

They prove soundness in one direction only. Neither completeness nor determinism follows, and neither
is claimed: an evaluator refusing every input satisfies all three.
-/

/-- `SMI-ENTER-01` soundness, over both arms. -/
theorem enterSequentialMultiInstance_sound (arm : SequentialMultiInstanceArm)
    (before after : RuntimeState)
    (success : enterSequentialMultiInstance? arm before = some after) :
    SequentialMultiInstanceEntryStep arm before after := by
  unfold enterSequentialMultiInstance? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed _ => simp [running] at success
  | cancelled _ => simp [running] at success
  | running instanceId =>
      cases owned : onlyTokenOwner? before arm.input with
      | none => simp [running, owned] at success
      | some owner =>
          cases snapshot : admittedSnapshot? arm before with
          | none => simp [running, owned, snapshot] at success
          | some items =>
              obtain ⟨binding, soleBinding, collection, limits⟩ := admittedSnapshot_sound snapshot
              cases items with
              | nil =>
                  simp [running, owned, snapshot] at success
                  cases success
                  exact .completesEmpty arm before owner instanceId binding owned running
                    soleBinding collection limits
              | cons first rest =>
                  simp [running, owned, snapshot] at success
                  cases success
                  exact .generatesFirst arm before owner instanceId binding first rest owned
                    running soleBinding collection limits

/-- `SMI-ITERATE-01` and `SMI-COMPLETE-01` soundness: the one evaluator lands in one of the two
relations, and which one is decided by the slot arithmetic rather than by evaluation order.

`deadlines` is a hypothesis rather than a derived fact because the evaluator never inspects the
lifetime deadline. Every admitted pre-state satisfies it through
`attachedDeadlinesLive_of_activityRecordsOwnLiveWork`, so this is the relation demanding more than the
evaluator checks rather than the evaluator relying on something unproved. -/
theorem completeSequentialMultiInstanceInnerTask_sound (arm : SequentialMultiInstanceArm)
    (before after : RuntimeState) (body : OccurrenceId) (submitted : List VariableBinding)
    (deadlines : AttachedDeadlinesLive before)
    (success : completeSequentialMultiInstanceInnerTask? arm before body submitted = some after) :
    SequentialMultiInstanceIterationStep arm body submitted before after ∨
      SequentialMultiInstanceCompletionStep arm body submitted before after := by
  unfold completeSequentialMultiInstanceInnerTask? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed _ => simp [running] at success
  | cancelled _ => simp [running] at success
  | running instanceId =>
      cases found : activityOccurrenceForTask? before.activityOccurrences body with
      | none => simp [running, found] at success
      | some record =>
          obtain ⟨recordLive, bodyIsTask⟩ := activityOccurrenceForTask_sound found
          cases bound : sequentialMultiInstanceControllerFor?
              before.sequentialMultiInstanceControllers record with
          | none => simp [running, found, bound] at success
          | some controller =>
              obtain ⟨controllerLive, controllerBinds⟩ :=
                sequentialMultiInstanceControllerFor_sound bound
              cases accepted : acceptedIterationResult arm submitted with
              | none => simp [running, found, accepted] at success
              | some result =>
                  obtain ⟨binding, submission, submittedName, submittedValue⟩ :=
                    acceptedIterationResult_sound accepted
                  by_cases owns : body.elementId.value = arm.taskId.value
                  · cases waits : before.waits.filter (taskIdNamesWait body) with
                    | nil => simp [running, found, accepted, owns, waits] at success
                    | cons wait others =>
                        cases others with
                        | cons _ _ =>
                            simp [running, found, accepted, owns, waits] at success
                        | nil =>
                            by_cases nonFinal :
                                completedInstanceCount controller + 1 < controller.snapshot.length
                            · simp [running, found, bound, accepted, owns, waits, nonFinal]
                                at success
                              cases success
                              exact Or.inl (.iterates arm body submitted before instanceId record
                                controller wait binding result running recordLive bodyIsTask owns
                                waits controllerLive controllerBinds deadlines submission
                                submittedName submittedValue nonFinal)
                            · simp [running, found, bound, accepted, owns, waits, nonFinal]
                                at success
                              cases success
                              exact Or.inr (.publishes arm body submitted before instanceId record
                                controller wait binding result running recordLive bodyIsTask owns
                                waits controllerLive controllerBinds deadlines submission
                                submittedName submittedValue (by omega))
                  · simp [running, found, accepted, owns] at success

/-- `SMI-CANCEL-01` soundness. -/
theorem interruptSequentialMultiInstance_sound (arm : SequentialMultiInstanceArm)
    (before after : RuntimeState) (timer : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : interruptSequentialMultiInstance? arm before timer logicalTimeMs = some after) :
    SequentialMultiInstanceInterruptionStep arm timer logicalTimeMs before after := by
  unfold interruptSequentialMultiInstance? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed _ => simp [running] at success
  | cancelled _ => simp [running] at success
  | running instanceId =>
      cases live : before.timerWaits.find? (timerIdNamesWait timer) with
      | none => simp [running, live] at success
      | some deadline =>
          have deadlineNamed : timerIdNamesWait timer deadline = true := by
            simpa using List.find?_some live
          have deadlineLive : deadline ∈ before.timerWaits := List.mem_of_find?_eq_some live
          cases found : activityOccurrenceForTimer? before.activityOccurrences timer with
          | none => simp [running, live, found] at success
          | some record =>
              obtain ⟨recordLive, attaches⟩ := activityOccurrenceForTimer_sound found
              cases bodyIsTask : activityBodyTask? record with
              | none => simp [running, live, found, bodyIsTask] at success
              | some body =>
                  cases bound : sequentialMultiInstanceControllerFor?
                      before.sequentialMultiInstanceControllers record with
                  | none => simp [running, live, found, bodyIsTask, bound] at success
                  | some controller =>
                      obtain ⟨controllerLive, controllerBinds⟩ :=
                        sequentialMultiInstanceControllerFor_sound bound
                      by_cases owns :
                          timer.elementId.value = arm.boundaryTimer.elementId.value
                      · by_cases instant : logicalTimeMs = deadline.deadlineMs
                        · simp [running, live, found, bodyIsTask, bound, owns, instant] at success
                          cases success
                          exact .interrupts arm timer logicalTimeMs before instanceId record
                            controller deadline body running deadlineLive deadlineNamed recordLive
                            attaches owns bodyIsTask controllerLive controllerBinds instant
                        · simp [running, live, found, bodyIsTask, bound, owns, instant] at success
                      · simp [running, live, found, owns] at success


end BpmnSemantics.SemanticProcess
