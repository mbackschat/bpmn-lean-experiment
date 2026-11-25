module

public import Kernel.Hooks
public import Kernel.Feature.Compensation
public import Kernel.Laws.Compensation.Rules
public import Kernel.Laws.Compensation.Runs
public import Kernel.Laws.Compensation.Kept
import all Kernel.Feature.Compensation
import Kernel.Laws.Hooks

/-! # Laws of compensation and Transaction cancellation: the hooks

What `Kernel.Feature.Compensation`'s hooks do (`*_spec`), in the vocabulary of `Kernel.Laws.Compensation.Rules`, and
what they keep: an invariant of the proof wave through the operations records `CompensationOps` and `RunsOps`
(`Kernel.Laws.Compensation.Runs`), with the fuel induction over beginning, advancing and releasing runs. This is the one
module that sees the feature's bodies; what follows from the spec lemmas without them is the proof wave's. Nothing
executable imports this module.
-/

-- size-exception: the spec lemmas and the fuel induction both read the feature's bodies, which guard 5 opens to this
-- one module only (`import all` in a namesake `Laws` module), so neither half can move out.

@[expose] public section

namespace Kernel.Laws.Compensation

variable {le : Issue → Issue → Bool}

open Kernel

/-! ## What the hooks do

Each compensation operation's effect on the compensation slot, the queued signals and the other state fields, in the
vocabulary of `Kernel.Laws.Compensation.Rules`, so that what follows from it is proved without the feature's bodies.
`beginHandler`, `advance` and `release` each take one unit of fuel and hand the rest to the operation they call. -/

/-- Which of two records completed first in the order §13.5.5 reads (I1 (d), DC15 (c)): under
`BranchSchedule.orderInvariant` the one of an earlier closure, and of one closure the one whose subject the other's
structurally follows (`structurallyBefore`), which no schedule changes; under `declarationDepthFirst` the one that
completed first. -/
def CompletedBefore (program : Program) (record other : Compensable) : Prop :=
  match program.options.branchSchedule with
  | .orderInvariant =>
    record.closure < other.closure ∨
      (record.closure = other.closure ∧ structurallyBefore program record.subject other.subject = true)
  | .declarationDepthFirst => record.completion < other.completion

/-- The kernel's order of completion is `CompletedBefore`. -/
theorem completedBefore_iff (program : Program) (record other : Compensable) :
    Feature.Compensation.completedBefore program record other = true ↔ CompletedBefore program record other := by
  unfold Feature.Compensation.completedBefore CompletedBefore
  cases program.options.branchSchedule <;> simp

/-- The kernel's dependency between two records is `Precedes` over the program's Sequence Flow paths (`flowReaches`)
and the boundary Events attached to `record`'s subject, with the data clause read over the footprints' name sets,
which may hold every name (`NameSet.meets`). -/
theorem precedes_spec (ctx : Ctx) (record other : Compensable) :
    Feature.Compensation.precedes ctx record other = true ↔
      (record.subject ≠ other.subject ∧ flowReaches ctx.program
          ((((ctx.program.element? record.subject).bind (·.envelope?)).map fun envelope =>
            envelope.boundaries.map (·.id)).getD []) other.subject = true) ∨
        (CompletedBefore ctx.program record other ∧
          (record.subject = other.subject ∨ flowReaches ctx.program [record.subject] other.subject = true ∨
            (subjectData ctx.program other.subject).reads.meets (subjectData ctx.program record.subject).writes = true)) := by
  unfold Feature.Compensation.precedes
  simp only [Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq, beq_iff_eq, or_assoc, completedBefore_iff]

/-- The kernel's dependency reads only the program, so every context of one program orders records alike. -/
theorem precedes_congr {ctx other : Ctx} (same : ctx.program = other.program) :
    Feature.Compensation.precedes ctx = Feature.Compensation.precedes other := by
  funext record later
  simp only [Feature.Compensation.precedes, same]

/-- `store` replaces the compensation slot and nothing else. -/
theorem store_eq (state : State) (compensation : Compensations) :
    Feature.Compensation.store state compensation = { state with slots := { state.slots with compensation } } := by
  unfold Feature.Compensation.store; rfl

/-- `isRun` picks the run `Keyed` by the scope occurrence and the trigger. -/
theorem isRun_iff (scope : ScopeOccurrenceId) (trigger : OccurrenceName) (run : CompensationRun) :
    Feature.Compensation.isRun scope trigger run = true ↔ Keyed scope trigger run := by
  simp [Feature.Compensation.isRun, Keyed]

/-- A run is `isRun` of a key exactly when it is the key's: the search `advance` runs over the list view. -/
theorem isRun_key (scope : ScopeOccurrenceId) (trigger : OccurrenceName) (run : CompensationRun) :
    Feature.Compensation.isRun scope trigger run = (run.key == { scope, trigger }) := by
  rw [Bool.eq_iff_iff, isRun_iff, beq_iff_eq, Laws.State.key_mk]
  simp [Keyed]

/-- Erasing a key's run leaves the list view's other runs, in order. -/
theorem runList_erase_isRun (m : RunMap) (scope : ScopeOccurrenceId) (trigger : OccurrenceName) :
    runList (m.erase { scope, trigger }) = (runList m).filter (!Feature.Compensation.isRun scope trigger ·) := by
  rw [Laws.State.runList_erase]
  exact List.filter_congr fun run _ => by rw [isRun_key]; rfl

/-- Putting a run of a key leaves the key's other runs and adds it, up to order. -/
theorem runList_put_isRun (m : RunMap) {scope : ScopeOccurrenceId} {trigger : OccurrenceName} {next : CompensationRun}
    (keyed : Keyed scope trigger next) :
    (runList (m.put next)).Perm ((runList m).filter (!Feature.Compensation.isRun scope trigger ·) ++ [next]) := by
  refine (Laws.State.runList_put_perm m next).trans (.of_eq ?_)
  have key : next.key = { scope, trigger } := by rw [Laws.State.key_mk, keyed.1, keyed.2]
  congr 1
  exact List.filter_congr fun run _ => by rw [isRun_key, key]; rfl

/-- So the runs are, up to order, the others and a run of the key they hold. -/
theorem runList_mem_isRun (m : RunMap) {scope : ScopeOccurrenceId} {trigger : OccurrenceName} {run : CompensationRun}
    (member : run ∈ runList m) (keyed : Keyed scope trigger run) :
    (runList m).Perm ((runList m).filter (!Feature.Compensation.isRun scope trigger ·) ++ [run]) := by
  have perm := runList_put_isRun m keyed
  rwa [Laws.State.put_mem member] at perm

/-- A committed `Hooks.compensate` took the records it selects out of retention into a new run in `scope` with no
handler running (`TakesOut`, over the scope occurrences `visibleScopes` sees), kept every other record, put the run
under its key and advanced it. -/
theorem compensate_spec {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceName} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State}
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) :
    ∃ taken others,
      TakesOut (· ∈ Feature.Compensation.visibleScopes ctx state scope) activity state.slots.compensation
        { retained := others, runMap := state.slots.compensation.runMap.put { trigger, scope, pending := taken, leave, resume, joins := Feature.Compensation.joinsOf ctx taken } }
        { trigger, scope, pending := taken, leave, resume, joins := Feature.Compensation.joinsOf ctx taken } ∧
      (taken ++ others).Perm state.slots.compensation.retained ∧
      Feature.Compensation.advance ctx scope trigger (Feature.Compensation.store state
        { retained := others, runMap := state.slots.compensation.runMap.put { trigger, scope, pending := taken, leave, resume, joins := Feature.Compensation.joinsOf ctx taken } })
        (Feature.Compensation.runBound ctx state) = .ok after := by
  unfold Feature.Compensation.compensate at ran
  simp only [List.partition_eq_filter_filter] at ran
  refine ⟨_, _, ⟨fun record => ?_, fun record => ?_⟩,
    ((List.mergeSort_perm _ _).append_right _).trans (List.filter_append_perm _ _), ran⟩ <;>
    rcases activity with _ | named <;> simp [List.mem_filter, (List.mergeSort_perm _ _).mem_iff]
  · exact fun _ _ => eq_comm
  · intro _
    by_cases inside : record.scope ∈ Feature.Compensation.visibleScopes ctx state scope
    · simp [inside, eq_comm]
    · simp [inside]

/-- A committed `advance` of the run `Keyed` by `scope` and `trigger`, the first one, either ended it, having no
handler pending or running: it dropped the run, queued the cancellation of the occurrence it leaves, if any, and then
resumed as the run asks, a group's by releasing its context; or advanced it once (`Advances` under the kernel's
dependency), beginning the handlers it starts one after another (`BeginsEach`), and put it under its key. -/
theorem advance_spec {ctx : Ctx} {scope : ScopeOccurrenceId} {trigger : OccurrenceName} {state : State} {fuel : Nat}
    {after : State} (ran : Feature.Compensation.advance ctx scope trigger state fuel = .ok after) :
    ∃ less run, fuel = less + 1 ∧ FirstOf (Keyed scope trigger) state.slots.compensation.runs run ∧
      ((run.pending = [] ∧ run.running = [] ∧ ∃ dropped ended,
          dropped = Feature.Compensation.store state { state.slots.compensation with
            runMap := state.slots.compensation.runMap.erase { scope, trigger } } ∧
          ended = run.leave.elim dropped (fun occurrence => dropped.signal (.cancel occurrence)) ∧
          (run.resume = none → after = ended) ∧
          (∀ occurrence leave, run.resume = some (.complete occurrence leave) →
            after = ended.signal (.complete occurrence leave [] .outward)) ∧
          (∀ element at_ leave, run.resume = some (.occur element at_ leave) →
            after = ended.signal (.occur element at_ leave [] .outward)) ∧
          ∀ context, run.resume = some (.group context) → Feature.Compensation.release ctx context ended less = .ok after) ∨
        ∃ later started begun,
          Advances (fun record other => Feature.Compensation.precedes ctx record other = true) run
            { run with pending := later, running := run.running ++ started } (started.map (·.2)) ∧
          (later ++ started.map (·.2)).Perm run.pending ∧ (started ≠ [] ∨ run.running ≠ []) ∧
          BeginsEach (fun current record => Feature.Compensation.beginHandler ctx trigger scope current record less)
            state started begun ∧
          after = Feature.Compensation.store begun { begun.slots.compensation with
            runMap := begun.slots.compensation.runMap.put { run with pending := later, running := run.running ++ started } }) := by
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
        refine ⟨fun same => ?_, fun _ _ same => ?_, fun _ _ _ same => ?_, fun _ same => ?_⟩ <;>
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
theorem beginHandler_spec {ctx : Ctx} {trigger : OccurrenceName} {scope : ScopeOccurrenceId} {state : State}
    {record : Compensable} {fuel : Nat} {after : State} {context : ScopeOccurrenceId}
    (ran : Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context)) :
    ∃ less entered, fuel = less + 1 ∧
      ((record.handler = none ∧ state.enterScope record.subject scope record.snapshot.toList none = (entered, context) ∧
        Feature.Compensation.advance ctx context trigger (Feature.Compensation.store entered { entered.slots.compensation with
          runMap := entered.slots.compensation.runMap.put {
            trigger, scope := context, pending := Feature.Compensation.begunChildren record context,
            leave := none, resume := some (.group context),
            joins := Feature.Compensation.joinsOf ctx (Feature.Compensation.begunChildren record context) } }) less = .ok after) ∨
       ∃ handler element, record.handler = some handler ∧ ctx.program.element? handler = some element ∧
        (element.activity?.isSome ∨ element.scope?.isSome) ∧
        state.enterScope handler scope record.snapshot.toList none = (entered, context) ∧
        after = (Feature.Compensation.store entered { entered.slots.compensation with
          retained := entered.slots.compensation.retained ++ Feature.Compensation.begunChildren record context }).signal
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
      Feature.Compensation.advance ctx owner.scope owner.trigger (Feature.Compensation.store (state.leaveScope ctx.positionLe context)
        { (state.leaveScope ctx.positionLe context).slots.compensation with
          runMap := (state.leaveScope ctx.positionLe context).slots.compensation.runMap.map fun key record =>
            if key == owner.key then { record with running := record.running.filter (·.1 != context) } else record })
        less = .ok after := by
  cases fuel with
  | zero => simp [Feature.Compensation.release] at ran
  | succ less =>
  simp only [Feature.Compensation.release, Feature.Compensation.leaveContext, Feature.Compensation.unhold] at ran
  split at ran
  · cases ran
  · rename_i owner found
    exact ⟨less, owner, rfl, FirstOf.of_find (Holds.any_iff context) found, ran⟩

/-- A run whose readiness leaving `context` releases (`Compensation.readied?`) is the first run holding `context`. -/
theorem readied_found {ctx : Ctx} {context : ScopeOccurrenceId} {state : State} {owner : CompensationRun}
    (found : Feature.Compensation.readied? ctx context state = some owner) :
    state.slots.compensation.runs.find? (·.running.any (·.1 == context)) = some owner := by
  unfold Feature.Compensation.readied? at found
  split at found
  · cases found
  · exact (Option.filter_eq_some_iff.mp found).1

/-- `Hooks.handlerCompleted` releases the handler's context, or, when that releases readiness work (DC30), leaves the
context, which the run keeps as running, and queues `Signal.compensationReady` of the run's scope and the context. -/
theorem handlerCompleted_spec {ctx : Ctx} {occurrence : Occurrence} {state after : State}
    (ran : Feature.Compensation.handlerCompleted ctx occurrence state = .ok after) :
    (∃ owner, Feature.Compensation.readied? ctx occurrence.scope state = some owner ∧
        after = (state.leaveScope ctx.positionLe occurrence.scope).signal
          (.compensationReady owner.scope occurrence.scope)) ∨
      Feature.Compensation.release ctx occurrence.scope state (Feature.Compensation.runBound ctx state) = .ok after := by
  unfold Feature.Compensation.handlerCompleted at ran
  split at ran
  · rename_i owner found
    exact .inl ⟨owner, found, (Except.ok.inj ran).symm⟩
  · exact .inr ran

/-- `Signal.compensationReady` releases the left context from the run in `scope` that holds it and advances that run,
and changes nothing once no run holds it. -/
theorem ready_spec {ctx : Ctx} {scope context : ScopeOccurrenceId} {state after : State}
    (ran : Feature.Compensation.ready ctx scope context state = .ok after) :
    after = state ∨ ∃ owner, state.slots.compensation.runs.find? (·.holds scope context) = some owner ∧
      owner.scope = scope ∧
      Feature.Compensation.advance ctx owner.scope owner.trigger (Feature.Compensation.store state
        { state.slots.compensation with
          runMap := state.slots.compensation.runMap.map fun key record =>
            if key == owner.key then { record with running := record.running.filter (·.1 != context) } else record })
        (Feature.Compensation.runBound ctx state) = .ok after := by
  unfold Feature.Compensation.ready at ran
  split at ran
  · exact .inl (Except.ok.inj ran).symm
  · rename_i owner found
    have own := ((Laws.State.holds_iff scope context owner).mp (List.find?_some found)).1
    subst own
    exact .inr ⟨owner, found, rfl, ran⟩

/-- A committed `Hooks.handlerEnded` released the handler's context when the handler failure policy is
`propagatesFromHandler` and a run holds it, and changed nothing otherwise. -/
theorem handlerEnded_spec {ctx : Ctx} {occurrence : Occurrence} {state after : State}
    (ran : Feature.Compensation.handlerEnded ctx occurrence state = .ok after) :
    (ctx.program.options.compensationHandlerFailure = .propagatesFromHandler ∧
        (∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner) ∧
        Feature.Compensation.handlerCompleted ctx occurrence state = .ok after) ∨
      (¬ (ctx.program.options.compensationHandlerFailure = .propagatesFromHandler ∧
          ∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner) ∧ after = state) := by
  have held : state.slots.compensation.runs.any (·.running.any (·.1 == occurrence.scope)) = true ↔
      ∃ owner ∈ state.slots.compensation.runs, Holds occurrence.scope owner := by
    simp [Holds]
  unfold Feature.Compensation.handlerEnded at ran
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
      runMap := state.slots.compensation.runMap.filter fun key _ => !(state.inside scope).contains key.scope } := by
  unfold Feature.Compensation.dropWithin; rfl

/-- A throw in `scope` sees only `scope` itself unless `scope` stands: the walk outward starts from its entry. -/
theorem visibleScopes_mem {ctx : Ctx} {state : State} {scope x : ScopeOccurrenceId}
    (seen : x ∈ Feature.Compensation.visibleScopes ctx state scope) :
    x = scope ∨ ∃ entry ∈ state.scopes, entry.id = scope := by
  rcases found : state.scopes.find? (·.id == scope) with _ | entry
  · simp [Feature.Compensation.visibleScopes, Feature.Compensation.visibleScopes.go, found] at seen
    exact .inl seen
  · exact .inr ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- Every scope occurrence a throw in `scope` sees lies in its process instance: it climbs only out of Event
Sub-Processes, whose scope occurrences call no instance. -/
theorem visibleScopes_linked {ctx : Ctx} {state : State} {scope at_ : ScopeOccurrenceId}
    (seen : at_ ∈ Feature.Compensation.visibleScopes ctx state scope) : InstanceLinked ctx.program state at_ scope := by
  unfold Feature.Compensation.visibleScopes at seen
  suffices climbs : ∀ fuel id, at_ ∈ Feature.Compensation.visibleScopes.go ctx state fuel id →
      InstanceLinked ctx.program state at_ id from climbs _ _ seen
  intro fuel
  induction fuel with
  | zero => intro _ seen; simp [Feature.Compensation.visibleScopes.go] at seen
  | succ fuel climbs =>
    intro id seen
    simp only [Feature.Compensation.visibleScopes.go] at seen
    generalize found : state.scopes.find? (·.id == id) = entry at seen
    rcases entry with _ | entry
    · simp only [Option.bind_none, List.mem_singleton] at seen
      rw [seen]
      exact .refl _
    rcases parentOf : entry.parent with _ | parent
    · simp only [Option.bind_some, parentOf, List.mem_singleton] at seen
      rw [seen]
      exact .refl _
    simp only [Option.bind_some, parentOf] at seen
    split at seen
    · rename_i climbing
      rcases List.mem_cons.mp seen with same | deeper
      · rw [same]
        exact .refl _
      have member := List.mem_of_find?_eq_some found
      have named : entry.id = id := by simpa using List.find?_some found
      simp only [Bool.and_eq_true, Option.any_eq_true] at climbing
      obtain ⟨-, payload, scopeOf, -⟩ := climbing
      rcases elementOf : entry.element with _ | element
      · simp [elementOf] at scopeOf
      have uncalled : Uncalled ctx.program state entry :=
        .inr (.inl ⟨element, elementOf, by simp only [elementOf, Option.bind_some] at scopeOf; simp [scopeOf]⟩)
      exact (climbs parent deeper).trans (named ▸ (InstanceLinked.parent entry parent member parentOf uncalled).symm)
    · simp only [List.mem_singleton] at seen
      rw [seen]
      exact .refl _

/-- Where `placement` retains a completion's record, and with which handler: in the occurrence's own scope occurrence,
or the parent of that one, the first of its identifier, of a Multi-Instance Sub-Process instance; with a compensation
handler of the occurrence's element, if any. -/
theorem placement_from {ctx : Ctx} {occurrence : Occurrence} {state : State} {handler : Option ElementId}
    {target : ScopeOccurrenceId} (placed : Feature.Compensation.placement ctx occurrence state = some (handler, target)) :
    (target = occurrence.scope ∨ ∃ entry, state.scopes.find? (·.id == occurrence.scope) = some entry ∧
      entry.parent = some target ∧ entry.element = some occurrence.element ∧
        ((ctx.program.element? occurrence.element).bind (·.scope?)).isSome) ∧
    ∀ chosen, handler = some chosen → ∃ element envelope, ctx.program.element? occurrence.element = some element ∧
      element.envelope? = some envelope ∧ chosen ∈ envelope.compensationHandlers := by
  unfold Feature.Compensation.placement at placed
  dsimp only at placed
  have handled : ∀ chosen, ((ctx.program.element? occurrence.element).bind (·.envelope?)).bind
      (·.compensationHandlers.head?) = some chosen → ∃ element envelope, ctx.program.element? occurrence.element =
        some element ∧ element.envelope? = some envelope ∧ chosen ∈ envelope.compensationHandlers := fun chosen found => by
    rcases elementOf : ctx.program.element? occurrence.element with _ | element
    · simp [elementOf] at found
    rcases envelopeOf : element.envelope? with _ | envelope
    · simp [elementOf, envelopeOf] at found
    simp only [elementOf, envelopeOf, Option.bind_some] at found
    exact ⟨element, envelope, rfl, envelopeOf, List.mem_of_head? found⟩
  split at placed
  · rename_i asInstance
    split at placed
    · rename_i isScope
      cases placed
      unfold Feature.Compensation.isInstance at asInstance
      obtain ⟨entry, found, element⟩ := Laws.Hooks.runsAsInstance_entry asInstance
      refine ⟨?_, handled⟩
      rcases parent : entry.parent with _ | above
      · exact .inl (by simp [found, parent])
      exact .inr ⟨entry, found, by simp [found, parent], element, isScope⟩
    · cases placed
  · split at placed <;> cases placed
    · exact ⟨.inl rfl, fun _ none => by cases none⟩
    · exact ⟨.inl rfl, handled⟩

/-- The scope occurrence `placement` retains a completion's record in is the occurrence's own or its parent. -/
theorem placement_target {ctx : Ctx} {occurrence : Occurrence} {state : State} {handler : Option ElementId}
    {target : ScopeOccurrenceId} (placed : Feature.Compensation.placement ctx occurrence state = some (handler, target)) :
    target = occurrence.scope ∨ ∃ entry ∈ state.scopes, entry.id = occurrence.scope ∧ entry.parent = some target :=
  (placement_from placed).1.imp_right fun ⟨entry, found, link, _⟩ =>
    ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found, link⟩

/-- The owned scope occurrence `completed` reads is a present one the occurrence, of a Scope element, owns. -/
theorem ownedScope_spec {ctx : Ctx} {occurrence : Occurrence} {state : State} :
    ∀ owned, Feature.Compensation.ownedScope? ctx occurrence state = some owned →
      owned ∈ state.scopes ∧ owned.occurrence = some occurrence.id ∧
        ((ctx.program.element? occurrence.element).bind (·.scope?)).isSome := fun owned found => by
  unfold Feature.Compensation.ownedScope? at found
  split at found
  · exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found, by assumption⟩
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
            record.scope = target ∧ record.completion = state.takeCompletion.2 ∧
            record.children = inner.flatMap Feature.Compensation.keptRecords ∧
            after = Feature.Compensation.store state.takeCompletion.1 { state.slots.compensation with retained := outer ++ [record] }) := by
  unfold Feature.Compensation.completed at ran
  split at ran
  · rename_i none
    cases ran
    exact .inl ⟨none, rfl⟩
  · rename_i handler target placed
    simp only [List.partition_eq_filter_filter] at ran
    refine .inr ⟨handler, target,
      (state.slots.compensation.retained.filter fun record =>
        (Feature.Compensation.ownedScope? ctx occurrence state).any (·.id == record.scope)).mergeSort
        (Feature.Compensation.retainedBefore ctx),
      state.slots.compensation.retained.filter fun record =>
        !(Feature.Compensation.ownedScope? ctx occurrence state).any (·.id == record.scope),
      placed, ((List.mergeSort_perm _ _).append_right _).trans (List.filter_append_perm _ _),
      fun record inside => ?_, fun record outside owned found same => ?_, ?_⟩
    · have chosen := (List.mem_filter.mp ((List.mergeSort_perm _ _).mem_iff.mp inside)).2
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
        rcases issued : state.takeCompletion with ⟨issuedState, completion⟩
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

/-! ## Runs

The fuel induction over `Compensation.beginHandler`, `advance` and `release`, from the statements and the operations
record of `Kernel.Laws.Compensation.Runs`. A run's handlers begin in contexts entered afresh, so the contexts it holds
running are each a running context of the state it is stored in or no active Multi-Instance instance's scope occurrence,
which were all issued before (`RunsOps.slotsIssued`); a nested group's run never drops a run whose scope occurrence
stood, so the advancing run holds its earlier contexts still when it is stored. -/

/-- What `Compensation.advance` keeps at `fuel` (`Advanced`). -/
def AdvanceKeeps (inv : State → Prop) (settled : State → OccurrenceId → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger state after, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.advance ctx scope trigger state fuel = .ok after → Advanced inv settled scope state after

/-- What `Compensation.release` keeps at `fuel` of a context that stands. -/
def ReleaseKeeps (inv : State → Prop) (settled : State → OccurrenceId → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context state after, inv state → context ∈ state.scopes.map (·.id) →
    Feature.Compensation.release ctx context state fuel = .ok after → inv after ∧ Follows settled state after

/-- What `Compensation.beginHandler` keeps at `fuel` in a scope occurrence that stands (`Begun`), of a record a run
there holds pending. -/
def BeginKeeps (inv : State → Prop) (settled : State → OccurrenceId → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope state record after context, inv state → scope ∈ state.scopes.map (·.id) →
    (∃ run ∈ state.slots.compensation.runs, run.scope = scope ∧ record ∈ run.pending) →
    Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context) →
      Begun inv settled scope state after context

/-- A group's nested run that ends releases its own context, which no run holds while the outer run's handlers begin. -/
theorem Ended.group {inv : State → Prop} {settled : State → OccurrenceId → Prop} {ctx : Ctx} {fuel : Nat}
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

/-- Leaving the handler context `context`, which the run `owner` the closure finds first holds, keeps `inv`, keeps the
run's scope occurrence standing, and follows: what `release` does first, and all a deferred readiness does before it
queues `Signal.compensationReady` (DC30). -/
theorem leftContext_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : RunsOps program inv settled) (ctx : Ctx) {context : ScopeOccurrenceId} {state : State} {owner : CompensationRun}
    (holds : inv state) (stands : context ∈ state.scopes.map (·.id))
    (found : state.slots.compensation.runs.find? (·.running.any (·.1 == context)) = some owner) :
    inv (state.leaveScope ctx.positionLe context) ∧
      owner.scope ∈ (state.leaveScope ctx.positionLe context).scopes.map (·.id) ∧
      Follows settled state (state.leaveScope ctx.positionLe context) := by
  have member := List.mem_of_find?_eq_some found
  have holding := List.find?_some found
  obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
  obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp stands
  have link := ((ops.fits state owner holds member).2.2 entry.id
    (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)).2 entry inside rfl
  obtain ⟨left, parentStands, issued, rest⟩ := ops.leave ctx.positionLe state entry owner.scope holds inside link
    ⟨owner, member, List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩⟩
  obtain ⟨leftGrows, kept, leftBodies, leftSettled⟩ := rest
  exact ⟨left, parentStands, issued, fun entry member => .inl (kept entry member), leftSettled, leftBodies, leftGrows⟩

/-- Taking the handler context `context` off what the run `owner` runs keeps `inv` and follows
(`Compensation.unhold`): what `release` does once the context is left, and what `Signal.compensationReady` does first. -/
theorem unhold_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : RunsOps program inv settled) (context : ScopeOccurrenceId) (owner : CompensationRun) {state : State}
    (holds : inv state) :
    inv (Feature.Compensation.unhold context owner state) ∧
      Follows settled state (Feature.Compensation.unhold context owner state) := by
  have unfolded : ∀ run ∈ runList (state.slots.compensation.runMap.map fun key record =>
      if key == owner.key then { record with running := record.running.filter (·.1 != context) } else record),
      ∃ candidate ∈ state.slots.compensation.runs, run =
        if candidate.key == owner.key then { candidate with running := candidate.running.filter (·.1 != context) }
        else candidate := fun run held => by
    rw [Laws.State.runList_unhold] at held
    obtain ⟨candidate, inState, rfl⟩ := List.mem_map.mp held
    exact ⟨candidate, inState, rfl⟩
  have mapped : ∀ run ∈ runList (state.slots.compensation.runMap.map fun key record =>
      if key == owner.key then { record with running := record.running.filter (·.1 != context) } else record),
      ∃ candidate ∈ state.slots.compensation.runs,
        (∀ context ∈ run.running.map (·.1), context ∈ candidate.running.map (·.1)) ∧
          (run ∈ state.slots.compensation.runs ∨ Fits settled state run) :=
    fun run held => by
      obtain ⟨candidate, inState, rfl⟩ := unfolded run held
      refine ⟨candidate, inState, ?_⟩
      split
      · have fits := ops.fits _ candidate holds inState
        exact ⟨fun context running => (List.filter_sublist.map _).subset running, .inr ⟨fits.1, fits.2.1,
          fun context running => fits.2.2 context ((List.filter_sublist.map _).subset running)⟩⟩
      · exact ⟨fun _ running => running, .inl inState⟩
  have stored := ops.store state { state.slots.compensation with
      runMap := state.slots.compensation.runMap.map fun key record =>
        if key == owner.key then { record with running := record.running.filter (·.1 != context) } else record }
    holds (fun run held => by obtain ⟨_, _, _, fits⟩ := mapped run held; exact fits)
    (fun run held context running => by
      obtain ⟨candidate, inState, inside, _⟩ := mapped run held
      exact .inl ⟨candidate, inState, inside context running⟩)
    (fun run held element at_ leave resumed => by
      obtain ⟨candidate, inState, same⟩ := unfolded run held
      refine held_pending (at_ := at_) (leave := leave) holds inState ?_
      rw [same] at resumed
      split at resumed <;> exact resumed)
    (.held (fun _ member => member) fun run held => by
      obtain ⟨candidate, inState, rfl⟩ := unfolded run held
      refine ⟨candidate, inState, ?_⟩
      split <;> exact ⟨rfl, rfl, fun _ => id⟩)
  simp only [Feature.Compensation.unhold]
  exact ⟨stored.1, .same stored.2 rfl (.refl _) rfl (.refl _)⟩

/-- Leaving the handler context `context`, which the run `owner` the closure finds first holds, and taking it off what
`owner` runs keeps `inv`, keeps the run's scope occurrence standing, and follows (`Compensation.leaveContext`): what
`release` does before it advances the run. -/
theorem leaveContext_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : RunsOps program inv settled) (ctx : Ctx) {context : ScopeOccurrenceId} {state : State} {owner : CompensationRun}
    (holds : inv state) (stands : context ∈ state.scopes.map (·.id))
    (found : state.slots.compensation.runs.find? (·.running.any (·.1 == context)) = some owner) :
    inv (Feature.Compensation.leaveContext ctx context owner state) ∧
      owner.scope ∈ (Feature.Compensation.leaveContext ctx context owner state).scopes.map (·.id) ∧
      Follows settled state (Feature.Compensation.leaveContext ctx context owner state) := by
  obtain ⟨left, parentStands, follows⟩ := leftContext_keeps ops ctx holds stands found
  have trimmed := unhold_keeps ops context owner left
  exact ⟨trimmed.1, parentStands, follows.trans trimmed.2⟩

theorem runs_keep {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program} (ops : RunsOps program inv settled) (ctx : Ctx) :
    ∀ fuel, AdvanceKeeps inv settled ctx fuel ∧ ReleaseKeeps inv settled ctx fuel ∧ BeginKeeps inv settled ctx fuel
  | 0 => ⟨fun _ _ _ _ _ _ ran => by simp [Feature.Compensation.advance] at ran,
    fun _ _ _ _ _ ran => by simp [Feature.Compensation.release] at ran,
    fun _ _ _ _ _ _ _ _ _ ran => by simp [Feature.Compensation.beginHandler] at ran⟩
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
        have held : ∀ other ∈ runList (state.slots.compensation.runMap.erase { scope, trigger }),
            other ∈ state.slots.compensation.runs := fun _ kept => (Laws.State.mem_runList_erase.mp kept).1
        have kept : ∀ other ∈ state.slots.compensation.runs, other.scope ≠ scope →
            other ∈ runList (state.slots.compensation.runMap.erase { scope, trigger }) :=
          fun _ member other => Laws.State.mem_runList_erase.mpr ⟨member, fun same => other ((Laws.State.key_scope _).symm.trans (congrArg RunKey.scope same))⟩
        have endedStore := ended_store ops holds scope { state.slots.compensation with
          runMap := state.slots.compensation.runMap.erase { scope, trigger } } held kept rfl
        have endedCancel := ended_cancel ops holds scope { state.slots.compensation with
          runMap := state.slots.compensation.runMap.erase { scope, trigger } } held kept rfl
        split at ran
        · rcases resumed : run.resume with _ | (⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | context) <;>
            simp only [resumed] at ran <;> rcases left : run.leave with _ | cancelled <;> simp only [left] at ran
          · cases ran
            exact endedStore.done
          · cases ran
            exact (endedCancel _).done
          · cases ran
            exact endedStore.complete ops (fits.1 _ _ resumed) _ _ _ ⟨state, holds, run, member, resumed⟩
          · cases ran
            exact (endedCancel _).complete ops (fits.1 _ _ resumed) _ _ _ ⟨state, holds, run, member, resumed⟩
          · cases ran
            exact endedStore.queue ops
              (ops.occur _ _ _ _ _ _ endedStore.1 (held_pending holds member resumed)
                ⟨state, holds, .of_same rfl rfl (.of_eq rfl), fun _ inside => inside, fun _ inside => inside, run, member,
                  resumed⟩)
          · cases ran
            exact (endedCancel _).queue ops
              (ops.occur _ _ _ _ _ _ (endedCancel _).1 (held_pending holds member resumed)
                ⟨state, holds, by refine .trans ?_ (ops.signalGrows _ (.cancel cancelled)); exact .of_same rfl rfl (.of_eq rfl),
                  fun _ inside => by rw [(ops.signalled _ _).1] at inside; exact inside,
                  fun _ inside => by rw [(ops.signalled _ _).2.2] at inside; exact inside, run, member,
                  resumed⟩)
          · obtain rfl := (fits.2.1 _ resumed).trans own
            exact endedStore.group releases stands ran
          · obtain rfl := (fits.2.1 _ resumed).trans own
            exact (endedCancel _).group releases stands ran
        · split at ran
          · cases ran
          · split at ran
            · cases ran
            · rename_i started folded
              cases ran
              have kept := foldlM_keeps (fun (now : State × List (ScopeOccurrenceId × Compensable)) =>
                  inv now.1 ∧ Follows settled state now.1 ∧ (∀ entry ∈ state.scopes, entry ∈ now.1.scopes) ∧
                    (∀ context ∈ now.2.map (·.1), (¬ Laws.State.ScopeIssued state context ∧ Laws.State.ScopeIssued now.1 context) ∧
                      ∀ entry ∈ now.1.scopes, entry.id = context → entry.parent = some scope) ∧
                    ∀ other ∈ state.slots.compensation.runs, other.scope ∈ state.scopes.map (·.id) →
                      other ∈ now.1.slots.compensation.runs) _ _ _ _
                (fun now record next inOrdered holdsNow began => by
                  split at began
                  · cases began
                  · rename_i begun beganNow
                    cases began
                    obtain ⟨nowHolds, nowFollows, nowKept, rest⟩ := holdsNow
                    obtain ⟨nowPlaced, nowRuns⟩ := rest
                    have pendingOf : record ∈ run.pending := by
                      simp only [List.mem_mergeSort, List.partition_eq_filter_filter, List.mem_filter] at inOrdered
                      exact inOrdered.1
                    obtain ⟨keptBegun, followsBegun, keptAll, rest⟩ := begins _ _ _ _ begun.1 begun.2 nowHolds
                      (List.mem_map.mpr ((List.mem_map.mp (stands)).imp fun _ found =>
                        ⟨nowKept _ found.1, found.2⟩)) ⟨run, nowRuns run member (own ▸ stands), own, pendingOf⟩ beganNow
                    obtain ⟨bounds, placed, runsBegun⟩ := rest
                    refine ⟨keptBegun, nowFollows.trans followsBegun, fun entry member => keptAll entry (nowKept entry member),
                      fun context running => ?_, fun other member stood => runsBegun other (nowRuns other member stood)
                        (List.mem_map.mpr ((List.mem_map.mp stood).imp fun _ found => ⟨nowKept _ found.1, found.2⟩))⟩
                    simp only [List.map_append, List.mem_append, List.map_cons, List.map_nil, List.mem_singleton] at running
                    rcases running with old | rfl
                    · obtain ⟨oldBounds, oldPlaced⟩ := nowPlaced context old
                      refine ⟨⟨oldBounds.1, followsBegun.grows.issued oldBounds.2⟩, fun entry member named => ?_⟩
                      rcases followsBegun.2.1 entry member with inside | fresh
                      · exact oldPlaced entry inside named
                      · exact absurd oldBounds.2 (named ▸ fresh)
                    · exact ⟨⟨fun issued => bounds.1 (nowFollows.grows.issued issued), bounds.2⟩, placed⟩)
                ⟨holds, .refl _, fun _ member => member, fun _ running => by simp at running,
                  fun _ member _ => member⟩ folded
              obtain ⟨keptHolds, keptFollows, keptScopes, rest⟩ := kept
              obtain ⟨keptPlaced, keptRuns⟩ := rest
              refine ⟨(ops.store started.1 _ keptHolds ?fit ?contexts ?resumes ?stored).1, keptFollows.trans
                (.same (ops.store started.1 _ keptHolds ?fit ?contexts ?resumes ?stored).2 rfl (.refl _) rfl (.refl _)), fun _ =>
                ⟨fun entry member =>
                keptScopes entry member, fun other member stood differs =>
                  Laws.State.mem_put_old (keptRuns other member stood) (Laws.State.key_ne_of_scope (own ▸ differs))⟩⟩
              case fit =>
                intro other member
                rcases Laws.State.mem_put_or member with old | new
                · exact .inl old
                · rw [new]
                  refine .inr ⟨fun occurrence leave resumes => keptFollows.2.2.1 _ (fits.1 occurrence leave resumes),
                    fits.2.1, fun context running => ?_⟩
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · obtain ⟨oldBelow, oldPlaced⟩ := fits.2.2 context old
                    refine ⟨keptFollows.grows.issued oldBelow, fun entry member named => ?_⟩
                    rcases keptFollows.2.1 entry member with inside | fresh
                    · exact oldPlaced entry inside named
                    · exact absurd oldBelow (named ▸ fresh)
                  · exact ⟨(keptPlaced context started).1.2, own ▸ (keptPlaced context started).2⟩
              case contexts =>
                intro other inside context running
                rcases Laws.State.mem_put_or inside with old | new
                · exact .inl ⟨other, old, running⟩
                · rw [new] at running
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · exact .inl ⟨run, keptRuns run member (own ▸ stands), old⟩
                  · refine .inr fun body inside active => ?_
                    have below := ops.slotsIssued state holds body (keptFollows.2.2.2.1 body inside) context active
                    exact (keptPlaced context started).1.1 below
              case resumes =>
                exact put_resumes keptHolds (fun _ old => old)
                  fun _ _ _ resumed => held_pending holds member resumed
              case stored =>
                refine .held (fun _ member => member) fun other inside => ?_
                rcases Laws.State.mem_put_or inside with old | new
                · exact ⟨other, old, rfl, rfl, fun _ => id⟩
                · rw [new]
                  refine ⟨run, keptRuns run member (own ▸ stands), rfl, rfl, fun record waiting => ?_⟩
                  simp only [List.partition_eq_filter_filter, List.mem_filter] at waiting
                  exact waiting.1
      · cases ran
    · intro context state after holds stands ran
      simp only [Feature.Compensation.release] at ran
      split at ran
      · cases ran
      · rename_i owner found
        obtain ⟨stored, parentStands, leftFollows⟩ := leaveContext_keeps ops ctx holds stands found
        obtain ⟨kept', follows, -⟩ := advances owner.scope owner.trigger _ after stored parentStands ran
        exact ⟨kept', Follows.trans leftFollows follows⟩
    · intro trigger scope state record after context holds stands provenance ran
      obtain ⟨owner, owned, own, pending⟩ := provenance
      simp only [Feature.Compensation.beginHandler] at ran
      have follows : ∀ element, Laws.Flow.RecordAnchor state element scope →
          Follows settled state (state.enterScope element scope record.snapshot.toList none).1 :=
        fun element anchor => by
          obtain ⟨_, issuedNext, scopesEq, slotsEq⟩ := ops.entered state element scope record.snapshot.toList
          obtain ⟨⟨unissued, -, grows⟩, -⟩ := ops.fresh state element scope record.snapshot.toList holds stands
          refine ⟨ops.enteredGrows holds stands record.snapshot.toList, fun entry member => ?_,
            (ops.enter state element scope record.snapshot.toList holds stands anchor).2,
            fun body member => by rw [slotsEq] at member; exact member, grows⟩
          rw [Laws.State.scopes_eq, scopesEq] at member
          rcases Laws.State.mem_scopeList_insert_cases member with old | rfl
          · exact .inl old
          · exact .inr unissued
      rcases handlerOf : record.handler with _ | handler <;> simp only [handlerOf] at ran
      · simp only [bind, Except.bind] at ran
        split at ran
        · cases ran
        · rename_i nestedAfter nested
          cases ran
          obtain ⟨link, issuedNext, scopesEq, slotsEq⟩ := ops.entered state record.subject scope record.snapshot.toList
          obtain ⟨⟨unissued, issuedAfter, -⟩, -⟩ := ops.fresh state record.subject scope record.snapshot.toList holds stands
          have subject : Laws.Flow.RecordAnchor state record.subject scope := ⟨owner, owned, own, record, pending, .inl rfl⟩
          have entering := follows record.subject subject
          have enter := ops.enter state record.subject scope record.snapshot.toList holds stands subject
          have children := entered_children ops owned own pending record.subject record.snapshot.toList
            (begunChildren_elements record (state.enterScope record.subject scope record.snapshot.toList none).2)
          generalize (state.enterScope record.subject scope record.snapshot.toList none).2 = key
            at nested children link scopesEq unissued issuedAfter ⊢
          generalize (state.enterScope record.subject scope record.snapshot.toList none).1 = entered
            at nested issuedNext scopesEq slotsEq enter entering children issuedAfter
          have fresh : ∀ entry ∈ state.scopes, entry.id ≠ key := fun entry member same =>
            unissued (same ▸ ops.issued state holds entry member)
          have scopes : ∀ found, found ∈ entered.scopes ↔ found ∈ state.scopes ∨
              found = { id := key, element := some record.subject, position := .fresh state.issuing (state.issueNext + 1),
                        occurrence := none } := fun found => by
            rw [Laws.State.scopes_eq, scopesEq]
            exact Laws.State.mem_scopeList_insert_fresh (ops.keyed state holds)
              (new := { id := key, element := some record.subject,
                        position := .fresh state.issuing (state.issueNext + 1), occurrence := none }) fresh
          have stored : ∀ pending, (∀ record ∈ pending, RecordFrom program entered record key) →
              inv (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runMap.put
                (.mk trigger key pending [] none (some (.group key)) (Feature.Compensation.joinsOf ctx pending))))) ∧
              ∀ id, settled entered id → settled (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
                (entered.slots.compensation.runMap.put
                  (.mk trigger key pending [] none (some (.group key)) (Feature.Compensation.joinsOf ctx pending))))) id :=
            fun pending from_ => by
              refine ops.store entered _ enter.1 (fun run member => ?_) (fun run member context running => ?_)
                (put_resumes enter.1 (fun _ old => old) fun _ _ _ same => by cases same)
                (StoredFrom.put (.held (fun _ member => member) fun run member => ⟨run, member, rfl, rfl, fun _ => id⟩)
                  from_ fun _ same => .inl ⟨_, (Option.some.inj same).symm⟩)
              · rcases Laws.State.mem_put_or member with old | new
                · exact .inl old
                · rw [new]
                  refine .inr ⟨fun _ _ same => ?_, fun _ same => ?_, fun _ running => ?_⟩
                  · cases same
                  · cases same
                    rfl
                  · simp at running
              · rcases Laws.State.mem_put_or member with old | new
                · exact .inl ⟨run, old, running⟩
                · rw [new] at running
                  simp at running
          have standsNested : key ∈ entered.scopes.map (·.id) := List.mem_map.mpr ⟨_, (scopes _).mpr (.inr rfl), rfl⟩
          obtain ⟨nestedHolds, nestedFollows, keeps⟩ := advances _ _ _ _ (stored _ children).1 standsNested nested
          have unheld : ∀ pending, Unheld (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runMap.put
                (.mk trigger key pending [] none (some (.group key)) (Feature.Compensation.joinsOf ctx pending)))))
              key := fun _ run member running => by
            rcases Laws.State.mem_put_or member with old | new
            · exact unissued ((ops.fits state run holds (slotsEq ▸ old)).2.2 _ running).1
            · rw [new] at running
              simp at running
          obtain ⟨keepsScopes, keepsRuns⟩ := keeps (unheld _)
          refine ⟨nestedHolds, entering.trans ((Follows.same (stored _ children).2 rfl (.refl _) rfl (.refl _)).trans nestedFollows),
            fun entry member => keepsScopes entry
              (by rw [Feature.Compensation.store]; exact (scopes entry).mpr (.inl member)),
            ⟨unissued, nestedFollows.grows.issued issuedAfter⟩,
            fun entry member named => ?_, fun run member stood => keepsRuns run ?_ ?_ ?_⟩
          · rcases nestedFollows.2.1 entry member with inside | later
            · change entry ∈ entered.scopes at inside
              rcases (scopes entry).mp inside with old | rfl
              · exact absurd named (fresh entry old)
              · exact link
            · change ¬ Laws.State.ScopeIssued entered entry.id at later
              rw [named] at later
              exact absurd issuedAfter later
          · refine Laws.State.mem_put_old (slotsEq ▸ member) (Laws.State.key_ne_of_scope fun same => ?_)
            obtain ⟨found, inside, named⟩ := List.mem_map.mp stood
            exact fresh found inside (named.trans same)
          · rw [Feature.Compensation.store]
            obtain ⟨found, inside, same⟩ := List.mem_map.mp stood
            exact List.mem_map.mpr ⟨found, (scopes found).mpr (.inl inside), same⟩
          · intro same
            obtain ⟨found, inside, named⟩ := List.mem_map.mp stood
            have below := ops.issued state holds found inside
            rw [named, same] at below
            exact unissued below
      · split at ran
        · cases ran
        · split at ran
          · cases ran
          · cases ran
            refine handler_keeps ops holds stands handler ⟨owner, owned, own, record, pending, .inr handlerOf⟩ _ rfl
              ⟨fun child member => ?_, fun run member =>
                ⟨fun record pending => .inl (.pending member pending), fun _ same => .inl ⟨run, member, same⟩⟩⟩
            rcases List.mem_append.mp member with old | new
            · exact .inl (.retained old)
            · rw [begunChildren_scope record _ child new]
              exact entered_children ops owned own pending handler record.snapshot.toList
                (begunChildren_elements record _) _ new

/-- `Hooks.handlerCompleted` keeps what a release keeps (`ReleaseKeeps`) of a context that stands, also when it leaves
the context and queues the run's readiness work instead (DC30). -/
theorem handlerCompleted_keep {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : RunsOps program inv settled) (ctx : Ctx) {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerCompleted ctx occurrence state = .ok after) : inv after ∧ Follows settled state after := by
  rcases handlerCompleted_spec ran with ⟨owner, found, rfl⟩ | released
  · obtain ⟨kept, -, follows⟩ := leftContext_keeps ops ctx holds stands (readied_found found)
    have queued := ops.ready _ owner.scope occurrence.scope kept
    have shape := ops.signalled (state.leaveScope ctx.positionLe occurrence.scope)
      (.compensationReady owner.scope occurrence.scope)
    exact ⟨queued.1, follows.trans (.same queued.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)
      (ops.signalGrows _ _))⟩
  · exact (runs_keep ops ctx _).2.1 _ _ _ holds stands released

/-- `Signal.compensationReady` keeps what an advance keeps (`AdvanceKeeps`) of a run whose scope occurrence stands. -/
theorem ready_keep {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : RunsOps program inv settled) (ctx : Ctx) {scope context : ScopeOccurrenceId} {state after : State}
    (holds : inv state) (stands : scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.ready ctx scope context state = .ok after) : inv after ∧ Follows settled state after := by
  rcases ready_spec ran with rfl | ⟨owner, _, rfl, advanced⟩
  · exact ⟨holds, .refl _⟩
  · have trimmed := unhold_keeps ops context owner holds
    simp only [Feature.Compensation.unhold] at trimmed
    obtain ⟨kept, follows, -⟩ := (runs_keep ops ctx _).1 _ _ _ _ trimmed.1 stands advanced
    exact ⟨kept, trimmed.2.trans follows⟩

end Kernel.Laws.Compensation
