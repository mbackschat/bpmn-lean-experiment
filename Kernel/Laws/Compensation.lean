module

public import Kernel.Hooks
public import Kernel.Feature.Compensation
public import Kernel.Laws.Compensation.Rules
public import Kernel.Laws.Compensation.Runs
import all Kernel.Feature.Compensation

/-! # Laws of compensation and Transaction cancellation: the hooks

What `Kernel.Feature.Compensation`'s hooks do (`*_spec`), in the vocabulary of `Kernel.Laws.Compensation.Rules`, and
what they keep: an invariant of the proof wave through the operations records `CompensationOps` and `RunsOps`
(`Kernel.Laws.Compensation.Runs`), with the fuel induction over beginning, advancing and releasing runs. This is the one
module that sees the feature's bodies; what follows from the spec lemmas without them is the proof wave's. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

/-! ## What the hooks do

Each compensation operation's effect on the compensation slot, the queued signals and the other state fields, in the
vocabulary of `Kernel.Laws.Compensation.Rules`, so that what follows from it is proved without the feature's bodies.
`beginHandler`, `advance` and `release` each take one unit of fuel and hand the rest to the operation they call. -/

/-- The kernel's dependency between two records is `Precedes` over the program's Sequence Flow paths (`flowReaches`)
and the boundary Events attached to `record`'s subject, with the data clause read over the footprints' name sets,
which may hold every name (`NameSet.meets`). -/
theorem precedes_spec (ctx : Ctx) (record other : Compensable) :
    Feature.Compensation.precedes ctx record other = true ↔
      (record.subject ≠ other.subject ∧ flowReaches ctx.program
          ((((ctx.program.element? record.subject).bind (·.envelope?)).map fun envelope =>
            envelope.boundaries.map (·.id)).getD []) other.subject = true) ∨
        (record.completion < other.completion ∧
          (record.subject = other.subject ∨ flowReaches ctx.program [record.subject] other.subject = true ∨
            (Feature.Compensation.data ctx other.subject).reads.meets (Feature.Compensation.data ctx record.subject).writes = true)) := by
  unfold Feature.Compensation.precedes
  simp only [Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq, decide_eq_true_eq, beq_iff_eq, or_assoc]

/-- The kernel's dependency reads only the program, so every context of one program orders records alike. -/
theorem precedes_congr {ctx other : Ctx} (same : ctx.program = other.program) :
    Feature.Compensation.precedes ctx = Feature.Compensation.precedes other := by
  have alike : ∀ fuel ids, Feature.Compensation.interior.go ctx fuel ids = Feature.Compensation.interior.go other fuel ids := by
    intro fuel
    induction fuel with
    | zero => intro ids; rfl
    | succ fuel ih => intro ids; simp only [Feature.Compensation.interior.go, same, ih]
  funext record later
  simp only [Feature.Compensation.precedes, Feature.Compensation.data, Feature.Compensation.interior,
    Feature.Compensation.ownData, same, alike]

/-- A subject the program does not declare reads and writes nothing. -/
theorem data_missing {ctx : Ctx} {subject : ElementId} (missing : ctx.program.element? subject = none) :
    Feature.Compensation.data ctx subject = {} := by simp [Feature.Compensation.data, missing]

/-- `store` replaces the compensation slot and nothing else. -/
theorem store_eq (state : State) (compensation : Compensations) :
    Feature.Compensation.store state compensation = { state with slots := { state.slots with compensation } } := by
  unfold Feature.Compensation.store; rfl

/-- `isRun` picks the run `Keyed` by the scope occurrence and the trigger. -/
theorem isRun_iff (scope : ScopeOccurrenceId) (trigger : OccurrenceRef) (run : CompensationRun) :
    Feature.Compensation.isRun scope trigger run = true ↔ Keyed scope trigger run := by
  simp [Feature.Compensation.isRun, Keyed]

/-- A committed `Hooks.compensate` took the records it selects out of retention into a new run in `scope` with no
handler running (`TakesOut`, over the scope occurrences `visibleScopes` sees), kept every other record, added the run
after the runs in progress and advanced it. -/
theorem compensate_spec {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option Nat} {resume : Option Resume} {state after : State}
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) :
    ∃ taken others,
      TakesOut (· ∈ Feature.Compensation.visibleScopes ctx state scope) activity state.slots.compensation
        { retained := others, runs := state.slots.compensation.runs ++ [{ trigger, scope, pending := taken, leave, resume }] }
        { trigger, scope, pending := taken, leave, resume } ∧
      (taken ++ others).Perm state.slots.compensation.retained ∧
      Feature.Compensation.advance ctx scope trigger (Feature.Compensation.store state
        { retained := others, runs := state.slots.compensation.runs ++ [{ trigger, scope, pending := taken, leave, resume }] })
        (Feature.Compensation.runBound ctx state) = .ok after := by
  unfold Feature.Compensation.compensate at ran
  simp only [List.partition_eq_filter_filter] at ran
  refine ⟨_, _, ⟨fun record => ?_, fun record => ?_⟩, List.filter_append_perm _ _, ran⟩ <;>
    rcases activity with _ | named <;> simp [List.mem_filter]
  · exact fun _ _ => eq_comm
  · intro _
    by_cases inside : record.scope ∈ Feature.Compensation.visibleScopes ctx state scope
    · simp [inside, eq_comm]
    · simp [inside]

/-- A committed `advance` of the run `Keyed` by `scope` and `trigger`, the first one, either ended it, having no
handler pending or running: it dropped the run, queued the cancellation of the occurrence it leaves, if any, and then
resumed as the run asks, a group's by releasing its context; or advanced it once (`Advances` under the kernel's
dependency), beginning the handlers it starts one after another (`BeginsEach`), and stored it in place of every run of
its key. -/
theorem advance_spec {ctx : Ctx} {scope : ScopeOccurrenceId} {trigger : OccurrenceRef} {state : State} {fuel : Nat}
    {after : State} (ran : Feature.Compensation.advance ctx scope trigger state fuel = .ok after) :
    ∃ less run, fuel = less + 1 ∧ FirstOf (Keyed scope trigger) state.slots.compensation.runs run ∧
      ((run.pending = [] ∧ run.running = [] ∧ ∃ dropped ended,
          dropped = Feature.Compensation.store state { state.slots.compensation with
            runs := state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) } ∧
          ended = run.leave.elim dropped (fun occurrence => dropped.signal (.cancel occurrence)) ∧
          (run.resume = none → after = ended) ∧
          (∀ occurrence leave, run.resume = some (.complete occurrence leave) →
            after = ended.signal (.complete occurrence leave [] .outward)) ∧
          (∀ element at_ leave, run.resume = some (.occur element at_ leave) →
            after = ended.signal (.occur element at_ leave [] .outward)) ∧
          ∀ outer context, run.resume = some (.group outer context) → Feature.Compensation.release ctx context ended less = .ok after) ∨
        ∃ later started begun,
          Advances (fun record other => Feature.Compensation.precedes ctx record other = true) run
            { run with pending := later, running := run.running ++ started } (started.map (·.2)) ∧
          (later ++ started.map (·.2)).Perm run.pending ∧ (started ≠ [] ∨ run.running ≠ []) ∧
          BeginsEach (fun current record => Feature.Compensation.beginHandler ctx trigger scope current record less)
            state started begun ∧
          after = Feature.Compensation.store begun { begun.slots.compensation with
            runs := begun.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) ++
              [{ run with pending := later, running := run.running ++ started }] }) := by
  cases fuel with
  | zero => simp [Feature.Compensation.advance] at ran
  | succ less =>
  simp only [Feature.Compensation.advance, bind, Except.bind] at ran
  split at ran
  · rename_i run found
    have own := (isRun_iff scope trigger run).1 (List.find?_some found)
    refine ⟨less, run, rfl, FirstOf.of_find (isRun_iff scope trigger) found, ?_⟩
    split at ran
    · rename_i empty
      simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
      refine .inl ⟨empty.1, empty.2, ?_⟩
      refine ⟨_, _, rfl, rfl, ?_⟩
      rcases left : run.leave with _ | cancelled <;> simp only [left, Option.elim] at ran ⊢ <;>
        refine ⟨fun same => ?_, fun _ _ same => ?_, fun _ _ _ same => ?_, fun _ _ same => ?_⟩ <;>
        simp only [same] at ran
      all_goals first | exact ran | (cases ran; rfl)
    · split at ran
      · cases ran
      · rename_i progress
        split at ran
        · cases ran
        · rename_i result folded
          cases ran
          obtain ⟨started, appended, mapped, begins⟩ := BeginsEach.of_fold
            (begin := fun current record => Feature.Compensation.beginHandler ctx run.trigger scope current record less)
            (fun now record result stepped => by
              split at stepped
              · cases stepped
              · rename_i entered began
                cases stepped
                exact ⟨entered, began, rfl⟩) _ _ _ _ folded
          simp only [List.nil_append] at appended
          simp only [List.partition_eq_filter_filter] at progress mapped ⊢
          rw [appended]
          refine .inr ⟨?later, started, result.1, ⟨fun record => ?_, fun record => ?_, by simp⟩, ?_, ?_,
            own.2 ▸ begins, ?same⟩
          case same => rfl
          · rw [mapped, List.mem_mergeSort, List.mem_filter, Ready.any_iff]
          · rw [List.mem_filter, Ready.any_iff]
            simp only [Function.comp_apply, Bool.not_not]
            cases (run.pending ++ run.running.map (·.2)).any (Feature.Compensation.precedes ctx record ·) <;> simp
          · rw [mapped]
            exact (List.perm_append_comm.trans ((List.mergeSort_perm _ _).append_right _)).trans
              (List.filter_append_perm _ _)
          · by_cases idle : run.running = []
            · refine .inl fun none => progress ?_
              simp only [idle, List.isEmpty_nil, Bool.and_true, List.isEmpty_iff, List.eq_nil_iff_forall_not_mem]
              intro record inside
              have begun : record ∈ started.map (·.2) := by
                rw [mapped, List.mem_mergeSort, idle]
                exact inside
              simp [none] at begun
            · exact .inr idle
  · cases ran

/-- A committed `beginHandler` entered a fresh context scope occurrence below `scope` holding the record's snapshot:
for a group, of its subject, holding a nested run of its children moved into the context, which resumes the run in
`scope` once done, and advanced it; for a handler, an Activity or Scope element, of the handler, retained the children
moved into the context and queued the handler's begin there. -/
theorem beginHandler_spec {ctx : Ctx} {trigger : OccurrenceRef} {scope : ScopeOccurrenceId} {state : State}
    {record : Compensable} {fuel : Nat} {after : State} {context : ScopeOccurrenceId}
    (ran : Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context)) :
    ∃ less entered, fuel = less + 1 ∧
      ((record.handler = none ∧ state.enterScope record.subject scope record.snapshot none = (entered, context) ∧
        Feature.Compensation.advance ctx context trigger (Feature.Compensation.store entered { entered.slots.compensation with
          runs := entered.slots.compensation.runs ++ [{
            trigger, scope := context, pending := record.children.map (fun child => { child with scope := context }),
            leave := none, resume := some (.group scope context) }] }) less = .ok after) ∨
       ∃ handler element, record.handler = some handler ∧ ctx.program.element? handler = some element ∧
        (element.activity?.isSome ∨ element.scope?.isSome) ∧
        state.enterScope handler scope record.snapshot none = (entered, context) ∧
        after = (Feature.Compensation.store entered { entered.slots.compensation with
          retained := entered.slots.compensation.retained ++ record.children.map fun child => { child with scope := context } }).signal
          (.begin { element := handler, scope := context, continuation := .compensation scope })) := by
  cases fuel with
  | zero => simp [Feature.Compensation.beginHandler] at ran
  | succ less =>
  simp only [Feature.Compensation.beginHandler] at ran
  rcases handlerOf : record.handler with _ | handler <;> simp only [handlerOf] at ran
  · simp only [bind, Except.bind] at ran
    split at ran
    · cases ran
    · rename_i nestedAfter nested
      cases ran
      exact ⟨less, _, rfl, .inl ⟨rfl, rfl, nested⟩⟩
  · split at ran
    · cases ran
    · rename_i element found
      split at ran
      · cases ran
      · rename_i kind
        cases ran
        refine ⟨less, _, rfl, .inr ⟨handler, element, rfl, found, ?_, rfl, rfl⟩⟩
        revert kind
        cases element.activity? <;> cases element.scope? <;> simp

/-- A committed `release` of `context` left it and advanced the first run that `Holds` it, with that run's handler in
`context` no longer running; it found that run by the context, never by its scope. -/
theorem release_spec {ctx : Ctx} {context : ScopeOccurrenceId} {state : State} {fuel : Nat} {after : State}
    (ran : Feature.Compensation.release ctx context state fuel = .ok after) :
    ∃ less owner, fuel = less + 1 ∧ FirstOf (Holds context) state.slots.compensation.runs owner ∧
      Feature.Compensation.advance ctx owner.scope owner.trigger (Feature.Compensation.store (state.leaveScope context)
        { (state.leaveScope context).slots.compensation with
          runs := (state.leaveScope context).slots.compensation.runs.map fun candidate =>
            if Feature.Compensation.isRun owner.scope owner.trigger candidate then
              { candidate with running := candidate.running.filter (·.1 != context) }
            else candidate }) less = .ok after := by
  cases fuel with
  | zero => simp [Feature.Compensation.release] at ran
  | succ less =>
  simp only [Feature.Compensation.release] at ran
  split at ran
  · cases ran
  · rename_i owner found
    exact ⟨less, owner, rfl, FirstOf.of_find (Holds.any_iff context) found, ran⟩

/-- `Hooks.handlerCompleted` releases the handler's context. -/
theorem handlerCompleted_spec (ctx : Ctx) (run : ScopeOccurrenceId) (occurrence : Occurrence) (state : State) :
    Feature.Compensation.handlerCompleted ctx run occurrence state =
      Feature.Compensation.release ctx occurrence.scope state (Feature.Compensation.runBound ctx state) := by
  unfold Feature.Compensation.handlerCompleted; rfl

/-- A committed `Hooks.handlerEnded` released the handler's context when the handler failure policy is
`propagatesFromTrigger` and a run holds it, and changed nothing otherwise. -/
theorem handlerEnded_spec {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State}
    (ran : Feature.Compensation.handlerEnded ctx run occurrence state = .ok after) :
    (ctx.program.options.compensationHandlerFailure = .propagatesFromTrigger ∧
        (∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner) ∧
        Feature.Compensation.release ctx occurrence.scope state (Feature.Compensation.runBound ctx state) = .ok after) ∨
      (¬ (ctx.program.options.compensationHandlerFailure = .propagatesFromTrigger ∧
          ∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner) ∧ after = state) := by
  have held : state.slots.compensation.runs.any (·.running.any (·.1 == occurrence.scope)) = true ↔
      ∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner := by
    simp [Holds]
  unfold Feature.Compensation.handlerEnded Feature.Compensation.handlerCompleted at ran
  split at ran
  · rename_i policy
    split at ran
    · exact .inl ⟨policy, held.1 ‹_›, ran⟩
    · cases ran
      exact .inr ⟨fun ⟨_, holds⟩ => ‹¬ _› (held.2 holds), rfl⟩
  all_goals cases ran
  all_goals exact .inr ⟨fun ⟨chosen, _⟩ => (by simp_all), rfl⟩

/-- `Hooks.dropRuns` drops the runs whose scope occurrence lies in `scope`'s subtree and changes nothing else. -/
theorem dropWithin_spec (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) :
    Feature.Compensation.dropWithin ctx scope state = Feature.Compensation.store state { state.slots.compensation with
      runs := state.slots.compensation.runs.filter fun run => !(state.subtree scope).contains run.scope } := by
  unfold Feature.Compensation.dropWithin; rfl

/-- A throw in `scope` sees only `scope` itself unless `scope` stands: the walk outward starts from its entry. -/
theorem visibleScopes_mem {ctx : Ctx} {state : State} {scope x : ScopeOccurrenceId}
    (seen : x ∈ Feature.Compensation.visibleScopes ctx state scope) :
    x = scope ∨ ∃ entry ∈ state.scopes, entry.id = scope := by
  rcases found : state.scopes.find? (·.id == scope) with _ | entry
  · simp [Feature.Compensation.visibleScopes, Feature.Compensation.visibleScopes.go, found] at seen
    exact .inl seen
  · exact .inr ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- The scope occurrence `placement` retains a completion's record in is the occurrence's own or its parent. -/
theorem placement_target {ctx : Ctx} {occurrence : Occurrence} {state : State} {handler : Option ElementId}
    {target : ScopeOccurrenceId} (placed : Feature.Compensation.placement ctx occurrence state = some (handler, target)) :
    target = occurrence.scope ∨ ∃ entry ∈ state.scopes, entry.id = occurrence.scope ∧ entry.parent = some target := by
  unfold Feature.Compensation.placement at placed
  dsimp only at placed
  split at placed
  · split at placed
    · cases placed
      rcases found : state.scopes.find? (·.id == occurrence.scope) with _ | entry
      · exact .inl (by simp [found])
      rcases parent : entry.parent with _ | above
      · exact .inl (by simp [found, parent])
      exact .inr ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found,
        by simp [found, parent]⟩
    · cases placed
  · split at placed <;> cases placed <;> exact .inl rfl

/-- The owned scope occurrence `completed` reads is a present one the occurrence owns. -/
theorem ownedScope_spec {ctx : Ctx} {occurrence : Occurrence} {state : State} :
    ∀ owned, Feature.Compensation.ownedScope? ctx occurrence state = some owned →
      owned ∈ state.scopes ∧ owned.occurrence = some occurrence.id := fun owned found => by
  unfold Feature.Compensation.ownedScope? at found
  split at found
  · exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩
  · cases found

/-- A committed `Hooks.completed` retained what `Retains` says, with `grouped` for its implicit group: for a
Multi-Instance Task or Call instance, nothing (`placement` none); otherwise, with the records retained in the
occurrence's owned scope occurrence (`ownedScope_spec`) as `inner`, either moved them to the target scope occurrence
`placement` gives (`placement_target`), or retained there one record of the subject, numbered by a fresh issue, holding
them as its children. -/
theorem completed_spec {ctx : Ctx} {occurrence : Occurrence} {state after : State}
    (ran : Feature.Compensation.completed ctx occurrence state = .ok after) :
    (Feature.Compensation.placement ctx occurrence state = none ∧ after = state) ∨
      ∃ handler target inner outer, Feature.Compensation.placement ctx occurrence state = some (handler, target) ∧
        (inner ++ outer).Perm state.slots.compensation.retained ∧
        (∀ record ∈ inner, ∃ owned, Feature.Compensation.ownedScope? ctx occurrence state = some owned ∧ owned.id = record.scope) ∧
        (∀ record ∈ outer, ∀ owned, Feature.Compensation.ownedScope? ctx occurrence state = some owned → owned.id ≠ record.scope) ∧
        let grouped := (ctx.program.options.implicitCompensation == .everySubProcess ||
          ((ctx.program.element? occurrence.element).bind (·.envelope?)).any (·.multiInstance.isSome)) && !inner.isEmpty
        ((Retains true handler grouped none ∧ after = Feature.Compensation.store state { state.slots.compensation with
            retained := outer ++ inner.map fun record => { record with scope := target } }) ∨
          ∃ record, Retains true handler grouped (some record) ∧ record.subject = occurrence.element ∧
            record.scope = target ∧ record.completion = state.issue.2 ∧ record.children = inner ∧
            after = Feature.Compensation.store state.issue.1 { state.slots.compensation with retained := outer ++ [record] }) := by
  unfold Feature.Compensation.completed at ran
  split at ran
  · rename_i none
    cases ran
    exact .inl ⟨none, rfl⟩
  · rename_i handler target placed
    simp only [List.partition_eq_filter_filter] at ran
    refine .inr ⟨handler, target,
      state.slots.compensation.retained.filter fun record =>
        (Feature.Compensation.ownedScope? ctx occurrence state).any (·.id == record.scope),
      state.slots.compensation.retained.filter fun record =>
        !(Feature.Compensation.ownedScope? ctx occurrence state).any (·.id == record.scope),
      placed, List.filter_append_perm _ _,
      fun record inside => ?_, fun record outside owned found same => ?_, ?_⟩
    · have chosen := (List.mem_filter.mp inside).2
      cases found : Feature.Compensation.ownedScope? ctx occurrence state with
      | none => simp [found] at chosen
      | some owned => exact ⟨owned, rfl, by simpa [found] using chosen⟩
    · have unchosen := (List.mem_filter.mp outside).2
      simp [found, same] at unchosen
    · dsimp only at ran ⊢
      split at ran
      · rename_i plain
        cases ran
        exact .inl ⟨Retains.moved plain, rfl⟩
      · rename_i kept
        rcases issued : state.issue with ⟨issuedState, completion⟩
        simp only [issued] at ran
        cases ran
        refine .inr ⟨?record, ?retains, ?subject, ?scope, ?completion, ?children, ?stored⟩
        case stored => rfl
        case retains => exact Retains.record kept rfl
        all_goals rfl

/-- A committed `Hooks.failCompensation` queued the instance's failure with the Error raised at `origin`, naming the
trigger of the first run that `Holds` the handler context and the handler's occurrence in that context, and changed
nothing else. -/
theorem failCompensation_spec {ctx : Ctx} {handler : ScopeOccurrenceId} {code : String} {message : Option String}
    {origin : Origin} {state after : State}
    (ran : Feature.Compensation.failCompensation ctx handler code message origin state = .ok after) :
    ∃ owner context element activation, FirstOf (Holds handler) state.slots.compensation.runs owner ∧
      context ∈ state.scopes ∧ context.id = handler ∧ context.element = some element ∧
      after = state.signal (.endInstance .failed (some {
        code, message,
        occurrence := {
          processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation },
        related := [("trigger", owner.trigger),
          ("handler", { processInstanceId := state.instanceOf handler, element, activation })] })) := by
  unfold Feature.Compensation.failCompensation at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · rename_i context foundContext
    split at ran
    · rename_i owner foundRun
      split at ran
      · rename_i element elementOf
        repeat' split at ran
        all_goals cases ran
        all_goals exact ⟨owner, context, element, _, FirstOf.of_find (Holds.any_iff handler) foundRun,
          List.mem_of_find?_eq_some foundContext, by simpa using List.find?_some foundContext, elementOf, rfl⟩
      · cases ran
    · cases ran
  · cases ran

/-! ## Preservation

What the compensation hooks keep of an invariant: a completion retains its record, issuing a completion number, and a
handler's uncaught failure ends the instance failed, under the operations record `CompensationOps`
(`Kernel.Laws.Compensation.Rules`). -/

/-- `Hooks.completed` keeps `inv`, the scope occurrences, the occurrences and the open items. -/
theorem completed_keeps {inv : State → Prop} (ops : CompensationOps inv) {ctx : Ctx} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (ran : Feature.Compensation.completed ctx occurrence state = .ok after) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences ∧ after.openItems = state.openItems := by
  rcases completed_spec ran with ⟨-, rfl⟩ | ⟨_, _, _, retained⟩
  · exact ⟨holds, rfl, rfl, rfl⟩
  obtain ⟨_, -, -, retained⟩ := retained
  rcases retained.2.2 with ⟨-, rfl⟩ | ⟨_, -, -, numbered⟩
  · exact ⟨ops.store _ _ holds fun _ member => member, rfl, rfl, rfl⟩
  obtain ⟨-, -, -, rfl⟩ := numbered
  obtain ⟨scopes, occurrences, items, slots⟩ := ops.issued state
  exact ⟨ops.store _ _ (ops.issue state holds) fun _ member => slots ▸ member, scopes, occurrences, items⟩

/-- Dropping the runs inside a scope occurrence an interrupting catcher decided on (`Feature.Compensation.dropWithin`)
keeps `inv` and changes only the compensation slot. -/
theorem dropWithin_keeps {inv : State → Prop} (ops : CompensationOps inv) (ctx : Ctx) (scope : ScopeOccurrenceId)
    {state : State} (holds : inv state) : inv (Feature.Compensation.dropWithin ctx scope state) ∧
      ∃ compensation, Feature.Compensation.dropWithin ctx scope state = { state with slots := { state.slots with compensation } } :=
  ⟨ops.store _ _ holds fun _ member => (List.mem_filter.mp member).1, _, rfl⟩

/-! ## Runs

The fuel induction over `Compensation.beginHandler`, `advance` and `release`, from the statements and the operations
record of `Kernel.Laws.Compensation.Runs`. A run's handlers begin in contexts entered afresh, so the contexts it holds
running are each a running context of the state it is stored in or no active Multi-Instance instance's scope occurrence,
which were all issued before (`RunsOps.slotsIssued`); a nested group's run never drops a run whose scope occurrence
stood, so the advancing run holds its earlier contexts still when it is stored. -/

/-- What `Compensation.advance` keeps at `fuel` (`Advanced`). -/
def AdvanceKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger state after, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.advance ctx scope trigger state fuel = .ok after → Advanced inv settled scope state after

/-- What `Compensation.release` keeps at `fuel` of a context that stands. -/
def ReleaseKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context state after, inv state → context ∈ state.scopes.map (·.id) →
    Feature.Compensation.release ctx context state fuel = .ok after → inv after ∧ Follows settled state after

/-- What `Compensation.beginHandler` keeps at `fuel` in a scope occurrence that stands (`Begun`). -/
def BeginKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope state record after context, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context) →
      Begun inv settled scope state after context

/-- Ending the run `trigger` started in `scope` keeps every run of another scope occurrence. -/
theorem filter_kept {scope : ScopeOccurrenceId} {trigger : OccurrenceRef} {runs : List CompensationRun}
    {run : CompensationRun} (member : run ∈ runs) (other : run.scope ≠ scope) :
    run ∈ runs.filter (!Feature.Compensation.isRun scope trigger ·) :=
  List.mem_filter.mpr ⟨member, by simp [Feature.Compensation.isRun, other]⟩

theorem ended_store {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs) :
    Ended inv settled scope state (Feature.Compensation.store state compensation) :=
  have stored := ops.store state compensation holds (fun run member => .inl (held run member)) (held_running held)
    (held_resumes holds held)
  ⟨stored.1, .same stored.2 rfl rfl rfl, rfl, held, kept⟩

theorem ended_cancel {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs) (occurrence : Nat) :
    Ended inv settled scope state ((Feature.Compensation.store state compensation).signal (.cancel occurrence)) :=
  have stored := ended_store ops holds scope compensation held kept
  have cancelled := ops.cancel _ occurrence stored.1
  have shape := ops.signalled (Feature.Compensation.store state compensation) (.cancel occurrence)
  ⟨cancelled.1, stored.2.1.trans (.same cancelled.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)),
    shape.1.trans stored.2.2.1, fun run member => by
      rw [shape.2.2] at member
      exact held run member, fun run member other => by
      rw [shape.2.2]
      exact kept run member other⟩

/-- A group's nested run that ends releases its own context, which no run holds while the outer run's handlers begin. -/
theorem Ended.group {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx} {fuel : Nat}
    (releases : ReleaseKeeps inv settled ctx fuel) {state ended after : State} {scope : ScopeOccurrenceId}
    (done : Ended inv settled scope state ended) (stands : scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.release ctx scope ended fuel = .ok after) : Advanced inv settled scope state after := by
  have released := releases scope ended after done.1 (done.2.2.1 ▸ stands) ran
  refine ⟨released.1, done.2.1.trans released.2, fun unheld => ?_⟩
  cases fuel with
  | zero => simp [Feature.Compensation.release] at ran
  | succ fuel =>
    simp only [Feature.Compensation.release] at ran
    split at ran
    · cases ran
    · rename_i owner found
      have holding := List.find?_some found
      obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
      exact absurd (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)
        (unheld owner (done.2.2.2.1 owner (List.mem_of_find?_eq_some found)))

/-- A handler begun in a context entered below a scope occurrence that stands keeps what `Compensation.beginHandler`
keeps. -/
theorem handler_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) {scope : ScopeOccurrenceId} (stands : scope ∈ state.scopes.map (·.id)) (handler : ElementId)
    {locals : List (String × Value)} (compensation : Compensations)
    (runs : compensation.runs = (state.enterScope handler scope locals none).1.slots.compensation.runs) :
    Begun inv settled scope state ((Feature.Compensation.store (state.enterScope handler scope locals none).1
      compensation).signal (.begin
        { element := handler, scope := (state.enterScope handler scope locals none).2, continuation := .compensation scope }))
      (state.enterScope handler scope locals none).2 := by
  obtain ⟨named, issuedNext, scopesEq, slotsEq⟩ := ops.entered state handler scope locals
  have enter := ops.enter state handler scope locals holds stands
  generalize entering : state.enterScope handler scope locals none = entered at named issuedNext scopesEq slotsEq enter runs
  have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
    have below := ops.issued state holds entry member
    rw [same] at below
    exact Nat.lt_irrefl _ below
  have stored := ops.store entered.1 compensation enter.1 (fun run member => .inl (runs ▸ member))
    (held_running fun run member => runs ▸ member) (held_resumes enter.1 fun run member => runs ▸ member)
  have standsEntered : entered.2 ∈ (Feature.Compensation.store entered.1 compensation).scopes.map (·.id) := by
    change _ ∈ entered.1.scopes.map _
    rw [scopesEq, named]
    simp
  have begun := ops.begin _ handler _ scope stored.1 standsEntered
  have shape := ops.signalled (Feature.Compensation.store entered.1 compensation)
    (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
  have scopesAfter : ((Feature.Compensation.store entered.1 compensation).signal
      (.begin { element := handler, scope := entered.2, continuation := .compensation scope })).scopes = state.scopes ++
      [{ id := ⟨state.nextIssue⟩, element := some handler, parent := some scope, occurrence := none }] :=
    shape.1.trans scopesEq
  refine ⟨begun.1, ⟨?_, fun entry member => ?_, fun id settled => begun.2 id (stored.2 id (enter.2 id settled)),
    fun body member => ?_⟩, fun entry member => by rw [scopesAfter]; exact List.mem_append_left _ member,
    ⟨by rw [named]; exact Nat.le_refl _, ?_⟩, fun entry member same => ?_, fun run member _ => ?_⟩
  · rw [shape.2.1]
    change state.nextIssue ≤ entered.1.nextIssue
    omega
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (Nat.le_refl _)
  · rw [shape.2.2] at member
    change body ∈ entered.1.slots.multiInstances at member
    rwa [slotsEq] at member
  · rw [shape.2.1]
    change entered.2.value < entered.1.nextIssue
    rw [named, issuedNext]
    exact Nat.lt_succ_self _
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact absurd (same.trans named) (fresh entry old)
    · rw [List.mem_singleton.mp new]
  · rw [shape.2.2]
    change run ∈ compensation.runs
    rw [runs, slotsEq]
    exact member

theorem runs_keep {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) (ctx : Ctx) :
    ∀ fuel, AdvanceKeeps inv settled ctx fuel ∧ ReleaseKeeps inv settled ctx fuel ∧ BeginKeeps inv settled ctx fuel
  | 0 => ⟨fun _ _ _ _ _ _ ran => by simp [Feature.Compensation.advance] at ran,
    fun _ _ _ _ _ ran => by simp [Feature.Compensation.release] at ran,
    fun _ _ _ _ _ _ _ _ ran => by simp [Feature.Compensation.beginHandler] at ran⟩
  | fuel + 1 => by
    obtain ⟨advances, releases, begins⟩ := runs_keep ops ctx fuel
    refine ⟨?_, ?_, ?_⟩
    · intro scope trigger state after holds stands ran
      simp only [Feature.Compensation.advance, bind, Except.bind] at ran
      split at ran
      · rename_i run found
        have member := List.mem_of_find?_eq_some found
        have own : run.scope = scope := by
          have := List.find?_some found
          simp only [Feature.Compensation.isRun, Bool.and_eq_true, beq_iff_eq] at this
          exact this.1
        have fits := ops.fits state run holds member
        have held : ∀ other ∈ state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·),
            other ∈ state.slots.compensation.runs := fun _ kept => (List.mem_filter.mp kept).1
        have kept : ∀ other ∈ state.slots.compensation.runs, other.scope ≠ scope →
            other ∈ state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) :=
          fun _ member other => filter_kept member other
        split at ran
        · rcases resumed : run.resume with _ | (⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | ⟨outer, context⟩) <;>
            simp only [resumed] at ran <;> rcases left : run.leave with _ | cancelled <;> simp only [left] at ran
          · cases ran
            exact (ended_store ops holds scope _ held kept).done
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).done
          · cases ran
            exact (ended_store ops holds scope _ held kept).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_store ops holds scope _ held kept).queue ops
              (ops.occur _ _ _ _ _ _ (ended_store ops holds scope _ held kept).1 (held_pending holds member resumed))
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).queue ops
              (ops.occur _ _ _ _ _ _ (ended_cancel ops holds scope _ held kept _).1 (held_pending holds member resumed))
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_store ops holds _ _ held kept).group releases stands ran
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_cancel ops holds _ _ held kept _).group releases stands ran
        · split at ran
          · cases ran
          · split at ran
            · cases ran
            · rename_i started folded
              cases ran
              have kept := foldlM_keeps (fun (now : State × List (ScopeOccurrenceId × Compensable)) =>
                  inv now.1 ∧ Follows settled state now.1 ∧ (∀ entry ∈ state.scopes, entry ∈ now.1.scopes) ∧
                    (∀ context ∈ now.2.map (·.1), (state.nextIssue ≤ context.value ∧ context.value < now.1.nextIssue) ∧
                      ∀ entry ∈ now.1.scopes, entry.id = context → entry.parent = some scope) ∧
                    ∀ other ∈ state.slots.compensation.runs, other.scope ∈ state.scopes.map (·.id) →
                      other ∈ now.1.slots.compensation.runs) _ _ _ _
                (fun now record next _ holdsNow began => by
                  split at began
                  · cases began
                  · rename_i begun beganNow
                    cases began
                    obtain ⟨nowHolds, nowFollows, nowKept, rest⟩ := holdsNow
                    obtain ⟨nowPlaced, nowRuns⟩ := rest
                    obtain ⟨keptBegun, followsBegun, keptAll, rest⟩ := begins _ _ _ _ begun.1 begun.2 nowHolds
                      (List.mem_map.mpr ((List.mem_map.mp (stands)).imp fun _ found =>
                        ⟨nowKept _ found.1, found.2⟩)) beganNow
                    obtain ⟨bounds, placed, runsBegun⟩ := rest
                    refine ⟨keptBegun, nowFollows.trans followsBegun, fun entry member => keptAll entry (nowKept entry member),
                      fun context running => ?_, fun other member stood => runsBegun other (nowRuns other member stood)
                        (List.mem_map.mpr ((List.mem_map.mp stood).imp fun _ found => ⟨nowKept _ found.1, found.2⟩))⟩
                    simp only [List.map_append, List.mem_append, List.map_cons, List.map_nil, List.mem_singleton] at running
                    rcases running with old | rfl
                    · obtain ⟨oldBounds, oldPlaced⟩ := nowPlaced context old
                      refine ⟨⟨oldBounds.1, Nat.lt_of_lt_of_le oldBounds.2 followsBegun.1⟩, fun entry member named => ?_⟩
                      rcases followsBegun.2.1 entry member with inside | fresh
                      · exact oldPlaced entry inside named
                      · rw [named] at fresh
                        omega
                    · exact ⟨⟨Nat.le_trans nowFollows.1 bounds.1, bounds.2⟩, placed⟩)
                ⟨holds, .refl _, fun _ member => member, fun _ running => by simp at running,
                  fun _ member _ => member⟩ folded
              obtain ⟨keptHolds, keptFollows, keptScopes, rest⟩ := kept
              obtain ⟨keptPlaced, keptRuns⟩ := rest
              refine ⟨(ops.store started.1 _ keptHolds ?fit ?contexts ?resumes).1, keptFollows.trans
                (.same (ops.store started.1 _ keptHolds ?fit ?contexts ?resumes).2 rfl rfl rfl), fun _ => ⟨fun entry member =>
                keptScopes entry member, fun other member stood differs =>
                  List.mem_append_left _ (filter_kept (keptRuns other member stood) differs)⟩⟩
              case fit =>
                intro other member
                rcases List.mem_append.mp member with old | new
                · exact .inl (List.mem_filter.mp old).1
                · rw [List.mem_singleton.mp new]
                  refine .inr ⟨fun occurrence leave resumes => keptFollows.2.2.1 _ (fits.1 occurrence leave resumes),
                    fits.2.1, fun context running => ?_⟩
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · obtain ⟨oldBelow, oldPlaced⟩ := fits.2.2 context old
                    refine ⟨Nat.lt_of_lt_of_le oldBelow keptFollows.1, fun entry member named => ?_⟩
                    rcases keptFollows.2.1 entry member with inside | fresh
                    · exact oldPlaced entry inside named
                    · rw [named] at fresh
                      omega
                  · exact ⟨(keptPlaced context started).1.2, own ▸ (keptPlaced context started).2⟩
              case contexts =>
                intro other inside context running
                rcases List.mem_append.mp inside with old | new
                · exact .inl ⟨other, (List.mem_filter.mp old).1, running⟩
                · rw [List.mem_singleton.mp new] at running
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · exact .inl ⟨run, keptRuns run member (own ▸ stands), old⟩
                  · refine .inr fun body inside active => ?_
                    have below := ops.slotsIssued state holds body (keptFollows.2.2.2 body inside) context active
                    have above := (keptPlaced context started).1.1
                    omega
              case resumes =>
                exact appended_resumes keptHolds (fun _ old => (List.mem_filter.mp old).1)
                  fun _ _ _ resumed => held_pending holds member resumed
      · cases ran
    · intro context state after holds stands ran
      simp only [Feature.Compensation.release] at ran
      split at ran
      · cases ran
      · rename_i owner found
        have member := List.mem_of_find?_eq_some found
        have holding := List.find?_some found
        obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
        obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp stands
        have link := ((ops.fits state owner holds member).2.2 entry.id
          (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)).2 entry inside rfl
        obtain ⟨left, parentStands, rest⟩ := ops.leave state entry owner.scope holds inside link
          ⟨owner, member, List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩⟩
        obtain ⟨issued, kept, leftBodies, leftSettled⟩ := rest
        have mapped : ∀ run ∈ (state.leaveScope entry.id).slots.compensation.runs.map fun candidate =>
            if Feature.Compensation.isRun owner.scope owner.trigger candidate then
              { candidate with running := candidate.running.filter (·.1 != entry.id) }
            else candidate, ∃ candidate ∈ (state.leaveScope entry.id).slots.compensation.runs,
              (∀ context ∈ run.running.map (·.1), context ∈ candidate.running.map (·.1)) ∧
                (run ∈ (state.leaveScope entry.id).slots.compensation.runs ∨ Fits settled (state.leaveScope entry.id) run) :=
          fun run held => by
            obtain ⟨candidate, inLeft, rfl⟩ := List.mem_map.mp held
            refine ⟨candidate, inLeft, ?_⟩
            split
            · have fits := ops.fits _ candidate left inLeft
              exact ⟨fun context running => (List.filter_sublist.map _).subset running, .inr ⟨fits.1, fits.2.1,
                fun context running => fits.2.2 context ((List.filter_sublist.map _).subset running)⟩⟩
            · exact ⟨fun _ running => running, .inl inLeft⟩
        have stored := ops.store (state.leaveScope entry.id) { (state.leaveScope entry.id).slots.compensation with
            runs := (state.leaveScope entry.id).slots.compensation.runs.map fun candidate =>
              if Feature.Compensation.isRun owner.scope owner.trigger candidate then
                { candidate with running := candidate.running.filter (·.1 != entry.id) }
              else candidate } left (fun run held => by obtain ⟨_, _, _, fits⟩ := mapped run held; exact fits)
          (fun run held context running => by
            obtain ⟨candidate, inLeft, inside, _⟩ := mapped run held
            exact .inl ⟨candidate, inLeft, inside context running⟩)
          fun run held element at_ leave resumed => by
            obtain ⟨candidate, inLeft, same⟩ := List.mem_map.mp held
            refine held_pending (at_ := at_) (leave := leave) left inLeft ?_
            rw [← same] at resumed
            split at resumed <;> exact resumed
        obtain ⟨kept', follows, -⟩ := advances owner.scope owner.trigger _ after stored.1 parentStands ran
        refine ⟨kept', Follows.trans ?_ follows⟩
        exact ⟨Nat.le_of_eq issued.symm, fun entry member => .inl (kept entry member),
          fun id settled => stored.2 id (leftSettled id settled), leftBodies⟩
    · intro trigger scope state record after context holds stands ran
      simp only [Feature.Compensation.beginHandler] at ran
      have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
        have below := ops.issued state holds entry member
        rw [same] at below
        exact Nat.lt_irrefl _ below
      have follows : ∀ element, Follows settled state (state.enterScope element scope record.snapshot none).1 :=
        fun element => by
          obtain ⟨_, issuedNext, scopesEq, slotsEq⟩ := ops.entered state element scope record.snapshot
          refine ⟨by omega, fun entry member => ?_, (ops.enter state element scope record.snapshot holds stands).2,
            fun body member => by rw [slotsEq] at member; exact member⟩
          rw [scopesEq] at member
          rcases List.mem_append.mp member with old | new
          · exact .inl old
          · rw [List.mem_singleton.mp new]
            exact .inr (Nat.le_refl _)
      rcases handlerOf : record.handler with _ | handler <;> simp only [handlerOf] at ran
      · simp only [bind, Except.bind] at ran
        split at ran
        · cases ran
        · rename_i nestedAfter nested
          cases ran
          obtain ⟨named, issuedNext, scopesEq, slotsEq⟩ := ops.entered state record.subject scope record.snapshot
          have entering := follows record.subject
          have enter := ops.enter state record.subject scope record.snapshot holds stands
          rw [named] at nested ⊢
          generalize (state.enterScope record.subject scope record.snapshot none).1 = entered
            at nested issuedNext scopesEq slotsEq enter entering
          have stored : ∀ pending, inv (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) ∧
              ∀ id, settled entered id → settled (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
                (entered.slots.compensation.runs ++
                  [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) id :=
            fun pending => by
              refine ops.store entered _ enter.1 (fun run member => ?_) (fun run member context running => ?_)
                (appended_resumes enter.1 (fun _ old => old) fun _ _ _ same => by cases same)
              · rcases List.mem_append.mp member with old | new
                · exact .inl old
                · rw [List.mem_singleton.mp new]
                  refine .inr ⟨fun _ _ same => ?_, fun _ _ same => ?_, fun _ running => ?_⟩
                  · cases same
                  · cases same
                    rfl
                  · simp at running
              · rcases List.mem_append.mp member with old | new
                · exact .inl ⟨run, old, running⟩
                · rw [List.mem_singleton.mp new] at running
                  simp at running
          have standsNested : ⟨state.nextIssue⟩ ∈ entered.scopes.map (·.id) := by
            rw [scopesEq]
            simp
          obtain ⟨nestedHolds, nestedFollows, keeps⟩ := advances _ _ _ _ (stored _).1 standsNested nested
          have unheld : ∀ pending, Unheld (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))])))
              ⟨state.nextIssue⟩ := fun _ run member running => by
            rcases List.mem_append.mp member with old | new
            · have below := ((ops.fits state run holds (slotsEq ▸ old)).2.2 _ running).1
              exact Nat.lt_irrefl _ below
            · rw [List.mem_singleton.mp new] at running
              simp at running
          obtain ⟨keepsScopes, keepsRuns⟩ := keeps (unheld _)
          refine ⟨nestedHolds, entering.trans ((Follows.same (stored _).2 rfl rfl rfl).trans nestedFollows),
            fun entry member => keepsScopes entry
              (by rw [Feature.Compensation.store, scopesEq]; exact List.mem_append_left _ member),
            ⟨Nat.le_refl _, Nat.lt_of_lt_of_le (by change state.nextIssue < entered.nextIssue; omega) nestedFollows.1⟩,
            fun entry member named => ?_, fun run member stood => keepsRuns run ?_ ?_ ?_⟩
          · rcases nestedFollows.2.1 entry member with inside | later
            · change entry ∈ entered.scopes at inside
              rw [scopesEq] at inside
              rcases List.mem_append.mp inside with old | new
              · exact absurd named (fresh entry old)
              · rw [List.mem_singleton.mp new]
            · change entered.nextIssue ≤ entry.id.value at later
              rw [named] at later
              simp at later
              omega
          · exact List.mem_append_left _ (slotsEq ▸ member)
          · rw [Feature.Compensation.store, scopesEq]
            obtain ⟨found, inside, same⟩ := List.mem_map.mp stood
            exact List.mem_map.mpr ⟨found, List.mem_append_left _ inside, same⟩
          · intro same
            obtain ⟨found, inside, named⟩ := List.mem_map.mp stood
            have below := ops.issued state holds found inside
            rw [named, same] at below
            exact Nat.lt_irrefl _ below
      · split at ran
        · cases ran
        · split at ran
          · cases ran
          · cases ran
            exact handler_keeps ops holds stands handler _ rfl

/-- `Hooks.compensate` keeps `inv` in a scope occurrence that stands, for a run that may end as it asks. -/
theorem compensate_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {ctx : Ctx}
    {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option Nat}
    {resume : Option Resume} {state after : State} (holds : inv state) (stands : scope ∈ state.scopes.map (·.id))
    (resumable : ∀ next, resume = some next → (∀ occurrence leave, next = .complete occurrence leave →
      settled state occurrence) ∧ ∀ outer context, next = .group outer context → context = scope)
    (pending : ∀ element at_ resumed, resume = some (.occur element at_ resumed) →
      Laws.Step.PendingIn inv element)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) : inv after := by
  unfold Feature.Compensation.compensate at ran
  simp only at ran
  refine ((runs_keep ops ctx _).1 _ _ _ _ ?_ ?_ ran).1
  rotate_left
  · exact stands
  refine (ops.store state _ holds (fun run member => ?_) (fun run member context running => ?_)
    (appended_resumes holds (fun _ old => old) pending)).1
  · rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      refine .inr ⟨fun occurrence leave same => (resumable _ same).1 occurrence leave rfl,
        fun outer context same => (resumable _ same).2 outer context rfl, fun _ running => ?_⟩
      simp at running
  · rcases List.mem_append.mp member with old | new
    · exact .inl ⟨run, old, running⟩
    · rw [List.mem_singleton.mp new] at running
      simp at running

/-- `Hooks.handlerCompleted` keeps `inv` for a handler whose context stands. -/
theorem handlerCompleted_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerCompleted ctx run occurrence state = .ok after) : inv after :=
  ((runs_keep ops ctx _).2.1 _ _ _ holds stands ran).1

end Kernel.Laws.Compensation
