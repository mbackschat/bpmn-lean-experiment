module

public import Kernel.Hooks
public import Kernel.Laws.Except
public import Kernel.Laws.Propagation.Rules
public import Kernel.Laws.Propagation.Candidates
public import Kernel.Feature.Propagation
import all Kernel.Feature.Propagation
public import Kernel.Feature.Propagation.Throws
import all Kernel.Feature.Propagation.Throws

/-! # Laws of propagation: the feature's hooks

What `Kernel.Feature.Propagation`'s hooks keep and do, read from their bodies and stated in the vocabulary of
`Kernel.Laws.Propagation.Rules`, which holds the laws of the
[propagation semantics](../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher); their witnesses
are in `Kernel.Laws.Propagation.Witnesses`, and what a level of the search offers is
`Kernel.Laws.Propagation.Candidates`'s. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Propagation

open Kernel
open Kernel.Laws.State (Steady BegunFrom RaisesFrom RollsBack Popped)

/-! ## The state invariant under Propagation's throws and raises

Propagation's share of the proof wave's state-invariant lane (P2) for `Hooks.arriveThrow` and `Hooks.raise`, stated over
`PropagationOps` and, for the hooks a raise's search takes, `SearchHooks`, generic in `inv`; `Kernel.Proofs.Step` fills
both for `Laws.State.WellFormed` and the registered hooks. A throw completes its own begun occurrence, raises from it,
fires the receivers of a Signal, opens a Message throw's effect item or queues the compensation that completes it; a
Terminate End first clears its scope occurrence, keeping itself. A raise reads two facts of the state the closure takes it
off the queue in, which its steps keep (`Laws.State.Steady`): a raising Activity, its host, is settled, so its
Error-path leave may complete it (`HostSettled`); and an Event's occurrences its origin names have begun, so
`throwerLeaves` completes a begun one (`Thrown`). The records that queue a trigger (a throw's compensation and raise, a
caught Cancel's rollback) are handed where it comes from (`Laws.State.BegunFrom`, `RaisesFrom`, `RollsBack`), which an
invariant over the queued triggers reads. -/

/-- What a raise needs of the hooks its search takes (`Feature.Propagation.PropagationHooks`), for an invariant `inv` of
an instance under `ctx`: each keeps `inv` and is `Steady`, the Error-path leave of a settled host. -/
structure SearchHooks (ctx : Ctx) (inv : State → Prop) (hooks : Feature.Propagation.PropagationHooks) : Prop where
  mappedErrorOutputs : ∀ origin installed state after, inv state → HostSettled origin state →
    hooks.mappedErrorOutputs ctx origin installed state = .ok after → inv after ∧ Steady state after ∧
      after.slots.instances = state.slots.instances
  writeCaught : ∀ scope writes state after, inv state → hooks.writeCaught ctx scope writes state = .ok after →
    inv after ∧ Steady state after ∧ after.slots.instances = state.slots.instances
  callOutputs : ∀ root state after, inv state → hooks.callOutputs ctx root state = .ok after →
    inv after ∧ Steady state after ∧ after.slots.instances = state.slots.instances
  dropRuns : ∀ scope state, inv state →
    inv (hooks.dropRuns ctx scope state) ∧ Steady state (hooks.dropRuns ctx scope state) ∧
      (hooks.dropRuns ctx scope state).slots.instances = state.slots.instances

/-- A throw leaves by its element's own outgoing flows or by none. -/
theorem throwLeave_unnamed (payload : EventPayload) :
    ∀ selected, Feature.Propagation.throwLeave payload = .flows selected → selected = [] := by
  unfold Feature.Propagation.throwLeave
  split <;> intro _ same <;> cases same <;> rfl

/-- `Hooks.arriveThrow` keeps `inv`: a raise names the thrower's element (`Laws.Step.HookContract.arriveThrow`). -/
theorem arriveThrow_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {header : Header}
    {payload : EventPayload} {thrown : Throw} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (named : header.id = occurrence.element) (begunFrom : BegunFrom inv state occurrence)
    (ran : Feature.Propagation.arriveThrow ctx header payload thrown occurrence state = .ok after) : inv after := by
  have complete := ops.complete state occurrence (Feature.Propagation.throwLeave payload) [] .outward holds member begun
    (throwLeave_unnamed payload)
  have left : occurrence ∈ (state.signal (.complete occurrence.id (Feature.Propagation.throwLeave payload) [] .outward)).occurrences := by
    rw [ops.signalOccurrences]; exact member
  unfold Feature.Propagation.arriveThrow at ran
  cases thrown with
  | none => cases ran; exact complete
  | terminate =>
    cases ran
    obtain ⟨cleared, stays⟩ := ops.terminate ctx.positionLe state occurrence holds member begun
    exact ops.complete _ _ _ _ _ cleared stays begun fun _ same => by cases same; rfl
  | error record => cases ran; rw [named]; exact ops.raise _ _ _ complete left begun ⟨state, begunFrom, .inr ⟨_, rfl⟩⟩
  | escalation record => cases ran; rw [named]; exact ops.raise _ _ _ holds member begun ⟨state, begunFrom, .inl rfl⟩
  | message record =>
    cases ran
    unfold Feature.Propagation.throwMessage
    split
    · exact complete
    · exact ops.openItem _ _ _ holds member begun unstarted role
  | signal record =>
    dsimp only at ran
    unfold Feature.Propagation.throwSignal at ran
    simp only [bind, Except.bind] at ran
    repeat' split at ran
    all_goals try cases ran
    obtain ⟨fired, same⟩ := fireAll_keeps ops _ (Feature.Propagation.ownReceivers ctx state _) state holds
    exact ops.complete _ _ _ _ _ (ops.batchIntents _ _ fired) (same ▸ member) begun (throwLeave_unnamed payload)
  | compensation record =>
    dsimp only at ran
    unfold Feature.Propagation.throwCompensation at ran
    split at ran
    · cases ran
    · cases ran
      exact ops.compensate _ _ _ _ _ _ holds member begun begunFrom (throwLeave_unnamed payload) (by rw [named]; rfl)
  | cancel => cases ran; rw [named]; exact ops.raise _ _ _ complete left begun ⟨state, begunFrom, .inr ⟨_, rfl⟩⟩

/-! ### The search -/

/-- An Escalation's thrower leaves once the search has decided: the occurrence it finds has begun. -/
theorem throwerLeaves_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {origin : Origin}
    {state : State} (holds : inv state) (thrown : Thrown ctx.program origin state) :
    inv (Feature.Propagation.throwerLeaves ctx origin state) := by
  unfold Feature.Propagation.throwerLeaves
  dsimp only
  cases found : state.occurrences.find? (·.id == origin.thrower) with
  | none => exact holds
  | some occurrence =>
    cases event : (ctx.program.element? origin.element).bind (·.event?) with
    | none => exact holds
    | some pair =>
      have same := List.find?_some found
      simp only [beq_iff_eq] at same
      exact ops.complete _ _ _ _ _ holds (List.mem_of_find?_eq_some found)
        (thrown (by rw [event]; rfl) occurrence (List.mem_of_find?_eq_some found) same) (throwLeave_unnamed _)

theorem hostLeaves_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {state after : State} (holds : inv state)
    (settled : HostSettled origin state) (ran : Feature.Propagation.hostLeaves hooks ctx origin state = .ok after) :
    inv after ∧ Steady state after ∧ after.slots.instances = state.slots.instances := by
  unfold Feature.Propagation.hostLeaves at ran
  split at ran
  · exact search.mappedErrorOutputs _ _ _ _ holds settled ran
  · cases ran
    exact ⟨holds, .refl _, rfl⟩

theorem catchDecided_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {state after : State} (holds : inv state) (settled : HostSettled origin state)
    (ran : Feature.Propagation.catchDecided hooks ctx origin scope writes state = .ok after) :
    inv after ∧ Steady state after ∧ after.slots.instances = state.slots.instances := by
  unfold Feature.Propagation.catchDecided at ran
  dsimp only at ran
  split at ran
  · exact hostLeaves_keeps search holds settled (by simpa [bind, Except.bind] using ran)
  · obtain ⟨written, wrote, ran⟩ := ok_bind ran
    obtain ⟨kept, steady, instances⟩ := search.writeCaught _ _ _ _ holds wrote
    obtain ⟨left, more, moreInstances⟩ := hostLeaves_keeps search kept (settled.steady steady) ran
    exact ⟨left, steady.trans more, moreInstances.trans instances⟩

theorem passCallOutputs_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {catches : Bool} {occurrence : ScopeOccurrence}
    {state after : State} (holds : inv state)
    (ran : Feature.Propagation.passCallOutputs hooks ctx origin catches occurrence state = .ok after) :
    inv after ∧ Steady state after ∧ after.slots.instances = state.slots.instances := by
  unfold Feature.Propagation.passCallOutputs at ran
  repeat' split at ran
  all_goals first | (simp at ran; done) | (cases ran; exact ⟨holds, .refl _, rfl⟩) |
    exact search.callOutputs _ _ _ holds ran

/-- The walk an uncaught Error's path takes to its instance's root changes nothing. -/
theorem enclosingInstances_ok {ctx : Ctx} {state after : State} :
    ∀ fuel current, Feature.Propagation.enclosingInstances ctx state fuel current = .ok after → after = state
  | 0, _, ran => by simpa [Feature.Propagation.enclosingInstances] using ran.symm
  | fuel + 1, current, ran => by
    unfold Feature.Propagation.enclosingInstances at ran
    repeat' split at ran
    all_goals first | (simp at ran; done) | exact (Except.ok.inj ran).symm |
      exact enclosingInstances_ok fuel _ ran

theorem exhausted_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {handler : Option ScopeOccurrenceId} {state after : State} (holds : inv state) (settled : HostSettled origin state)
    (thrown : Thrown ctx.program origin state)
    (ran : Feature.Propagation.exhausted hooks ctx raised origin handler state = .ok after) : inv after := by
  unfold Feature.Propagation.exhausted at ran
  obtain ⟨left, leaves, ran⟩ := ok_bind ran
  obtain ⟨kept, steady, -⟩ := hostLeaves_keeps search holds settled leaves
  split at ran
  · cases ran
    exact ops.failCompensation _ _ _ _ _ kept
  · unfold Feature.Propagation.unhandledError at ran
    split at ran
    · cases ran
      exact ops.fail _ _ kept
    · obtain ⟨walked, walk, ran⟩ := ok_bind ran
      cases enclosingInstances_ok _ _ walk
      split at ran
      · cases ran
        exact kept
      · simp at ran
  · simp at ran
  · cases ran
    exact throwerLeaves_keeps ops kept (thrown.steady steady.occurrences)
  · simp at ran

/-- The scope occurrence a caught Cancel rolls back stands. -/
theorem cancelledScope_stands {origin : Origin} {occurrence : ScopeOccurrence} {state : State}
    (present : occurrence ∈ state.scopes) :
    ∃ entry ∈ state.scopes, entry.id = Feature.Propagation.cancelledScope origin occurrence state := by
  unfold Feature.Propagation.cancelledScope
  suffices walk : ∀ fuel current, ∃ entry ∈ state.scopes,
      entry.id = Feature.Propagation.cancelledScope.nearest occurrence state fuel current from walk _ _
  intro fuel
  induction fuel with
  | zero => intro current; exact ⟨occurrence, present, by simp [Feature.Propagation.cancelledScope.nearest]⟩
  | succ fuel ih =>
    intro current
    unfold Feature.Propagation.cancelledScope.nearest
    split
    · exact ⟨occurrence, present, rfl⟩
    · rename_i entry found
      split
      · exact ⟨entry, List.mem_of_find?_eq_some found, rfl⟩
      · cases parent : entry.parent with
        | none => exact ⟨occurrence, present, rfl⟩
        | some outer => simpa using ih outer

theorem interruptedOutputs_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv)
    {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {state after : State} (holds : inv state)
    (ran : Feature.Propagation.interruptedOutputs ctx occurrence parent state = .ok after) :
    inv after ∧ after.scopes = state.scopes := by
  unfold Feature.Propagation.interruptedOutputs at ran
  dsimp only at ran
  repeat' split at ran
  all_goals first | (cases ran; exact ⟨holds, rfl⟩) | skip
  obtain ⟨outputs, _, made⟩ := ok_map ran
  subst made
  exact ⟨ops.write _ _ _ _ holds, (ops.signalFrame _ _).1⟩

theorem leaveOccurrence_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {boundary : Boundary} {writes : List (String × Value)}
    {base state after : State} (holds : inv state) (settled : HostSettled origin state)
    (thrown : Thrown ctx.program origin state) (popped : Popped inv (.raise raised origin) base) (steady : Steady base state)
    (standing : origin.scope ∈ Laws.State.scopeIds base) (present : occurrence ∈ state.scopes)
    (attached : ∃ element, occurrence.element = some element ∧ occurrence.parent = some parent ∧
      boundary ∈ Feature.Propagation.boundariesOf ctx element)
    (ran : Feature.Propagation.leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state = .ok after) :
    inv after := by
  obtain ⟨element, named, parented, member⟩ := attached
  have bounded := boundariesOf_boundaryOf member
  obtain ⟨linked, listed⟩ := boundariesOf_sourced member
  have entered : ∀ t, occurrence ∈ t.scopes → Laws.Flow.Anchored inv ctx.program t boundary.id parent :=
    fun _ inside => ⟨element, linked, .inl (.inr (.inl ⟨occurrence, inside, named, .inl parented⟩))⟩
  have flows : ∀ selected, Leave.flows boundary.outgoing = .flows selected → ∀ flow ∈ selected,
      Laws.Flow.Lists ctx.program boundary.id flow := fun _ same flow inside => by cases same; exact listed flow inside
  unfold Feature.Propagation.leaveOccurrence at ran
  split at ran
  · rename_i cancels
    cases ran
    obtain ⟨entry, inside, same⟩ := cancelledScope_stands (origin := origin) present
    repeat' split
    all_goals first
      | exact ops.rollBack _ _ _ _ _ _ _ _ holds ⟨entry, inside, same⟩ bounded
          ⟨base, raised, origin, state, popped, standing, cancels, steady, .inl rfl, rfl⟩ (entered _ present) flows
      | exact ops.rollBack _ _ _ _ _ _ _ _ (ops.disarm _ _ holds).1 ⟨entry, (ops.disarm _ _ holds).2 ▸ inside, same⟩
          bounded ⟨base, raised, origin, state, popped, standing, cancels, steady, .inr ⟨_, rfl⟩, rfl⟩
          (entered _ ((ops.disarm _ _ holds).2 ▸ present)) flows
  · split at ran
    · obtain ⟨dropped, steady, -⟩ := search.dropRuns occurrence.id state holds
      obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, decidedSteady, -⟩ := catchDecided_keeps search dropped (settled.steady steady) decision
      obtain ⟨outputs, out, made⟩ := ok_map ran
      subst made
      obtain ⟨written, scopes⟩ := interruptedOutputs_keeps ops kept out
      exact (boundaryFire_keeps ops _ _ _ _ written bounded
        (entered _ (by rw [scopes, decidedSteady.scopes, steady.scopes]; exact present)) listed).1
    · obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, steady, -⟩ := catchDecided_keeps search holds settled decision
      cases ran
      obtain ⟨fired, same⟩ := boundaryFire_keeps ops boundary occurrence.occurrence parent [] kept bounded
        (entered _ (steady.scopes ▸ present)) listed
      exact throwerLeaves_keeps ops fired (thrown.steady (same.trans steady.occurrences))

theorem contextFires_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {origin : Origin}
    {scope : ScopeOccurrenceId} {boundary : Boundary} {subject : ElementId} {state after : State} (holds : inv state)
    (settled : HostSettled origin state) (thrown : Thrown ctx.program origin state)
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx subject) (stands : ∃ entry ∈ state.scopes, entry.id = scope)
    (declared : ∃ child ∈ state.childrenOf ctx.program scope, child.header.id = subject)
    (ran : Feature.Propagation.contextFires hooks ctx origin scope boundary state = .ok after) : inv after := by
  unfold Feature.Propagation.contextFires at ran
  obtain ⟨decided, decision, ran⟩ := ok_bind ran
  cases ran
  obtain ⟨kept, steady, instances⟩ := catchDecided_keeps search holds settled decision
  obtain ⟨linked, listed⟩ := boundariesOf_sourced member
  have anchored : Laws.Flow.Anchored inv ctx.program decided boundary.id scope :=
    Laws.Flow.Anchored.held holds steady.grows (fun _ inside => steady.scopes ▸ inside)
      (fun _ inside => instances ▸ inside) linked (.inl (.inr (.inr (.inl ⟨stands, declared⟩))))
  obtain ⟨fired, same⟩ := boundaryFire_keeps ops boundary none scope [] kept (boundariesOf_boundaryOf member) anchored listed
  exact throwerLeaves_keeps ops fired (thrown.steady (same.trans steady.occurrences))

theorem searchScopes_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {base : State} (popped : Popped inv (.raise raised origin) base) :
    ∀ fuel jumped current (state after : State), inv state → HostSettled origin state → Thrown ctx.program origin state →
      Steady base state → (current = some origin.scope ∨ origin.scope ∈ Laws.State.scopeIds base) →
      Feature.Propagation.searchScopes hooks ctx raised origin state fuel jumped current = .ok after → inv after
  | 0, _, _, _, _, holds, settled, thrown, _, _, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | _ + 1, _, none, _, _, holds, settled, thrown, _, _, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | fuel + 1, jumped, some current, state, after, holds, settled, thrown, walked, reached, ran => by
    unfold Feature.Propagation.searchScopes at ran
    split at ran
    · simp at ran
    · rename_i occurrence found
      have present := List.mem_of_find?_eq_some found
      have standing : origin.scope ∈ Laws.State.scopeIds base := by
        rcases reached with same | standing
        · have named : occurrence.id = current := by simpa using List.find?_some found
          rw [← Option.some.inj same, ← named]
          exact List.mem_map.mpr ⟨occurrence, walked.scopes ▸ present, rfl⟩
        · exact standing
      dsimp only at ran
      split at ran
      · split at ran
        · exact exhausted_keeps ops search holds settled thrown ran
        · split at ran
          · simp at ran
          · obtain ⟨caught, catcher, ran⟩ := ok_bind ran
            cases caught with
            | some boundary =>
              obtain ⟨member, -, -, placed⟩ := contextCatcher_some catcher
              exact contextFires_keeps ops search holds settled thrown member placed.1 placed.2 ran
            | none => exact searchScopes_keeps ops search popped fuel _ _ _ _ holds settled thrown walked (.inr standing) ran
      · obtain ⟨handlers, candidates, ran⟩ := ok_bind ran
        obtain ⟨passed, pass, ran⟩ := ok_bind ran
        obtain ⟨kept, steady, passedInstances⟩ := passCallOutputs_keeps search holds pass
        split at ran
        · rename_i element start interrupting writes handled
          have dropped : inv (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) ∧
              Steady passed (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) ∧
              (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed).slots.instances =
                passed.slots.instances := by
            split
            · exact search.dropRuns _ _ kept
            · exact ⟨kept, .refl _, rfl⟩
          obtain ⟨decided, decision, ran⟩ := ok_bind ran
          obtain ⟨decidedKept, decidedSteady, decidedInstances⟩ :=
            catchDecided_keeps search dropped.1 (settled.steady (steady.trans dropped.2.1)) decision
          cases ran
          have chain := (steady.trans dropped.2.1).trans decidedSteady
          have instances := (decidedInstances.trans dropped.2.2).trans passedInstances
          have begun := ops.begin _ element occurrence.id decidedKept ⟨occurrence, chain.scopes ▸ present, rfl⟩
            (Laws.Flow.Anchored.held holds chain.grows (fun _ inside => chain.scopes ▸ inside)
              (fun _ inside => instances ▸ inside) (.inl rfl) (.inl (.inr (.inr (.inl
                ⟨⟨occurrence, present, rfl⟩, levelCandidates_children candidates _ (best?_mem handled)⟩)))))
          split
          · exact begun
          · exact throwerLeaves_keeps ops begun (thrown.steady ((ops.signalOccurrences _ _).trans chain.occurrences))
        · have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
          refine leaveOccurrence_keeps ops search kept (settled.steady steady) (thrown.steady steady.occurrences) popped
            (walked.trans steady) standing (steady.scopes ▸ present) ?_ ran
          split at inside
          · split at inside
            · simp at inside
            · exact ⟨_, by assumption, by assumption, inside⟩
          · simp at inside
        · exact searchScopes_keeps ops search popped fuel _ _ _ _ kept (settled.steady steady)
            (thrown.steady steady.occurrences) (walked.trans steady) (.inr standing) ran

/-- `Hooks.raise`: a raise from a host one of whose boundaries catches it fires that boundary after the host's
Error-path leave; any other raise searches outward from its scope occurrence. -/
theorem raise_spec {hooks : Feature.Propagation.PropagationHooks} {ctx : Ctx} {raised : Raised} {origin : Origin}
    {state after : State} (ran : Feature.Propagation.raise hooks ctx raised origin state = .ok after) :
    (∃ boundary writes left, (origin.host.isSome ∧ boundary ∈ Feature.Propagation.boundariesOf ctx origin.element) ∧
      hooks.mappedErrorOutputs ctx origin (lastWrites writes) state = .ok left ∧
      after = boundary.fire none none origin.scope [] left) ∨
    Feature.Propagation.searchScopes hooks ctx raised origin state (state.scopes.length + 1) none (some origin.scope) =
      .ok after := by
  unfold Feature.Propagation.raise at ran
  dsimp only at ran
  split at ran
  · obtain ⟨left, leaves, made⟩ := ok_map ran
    have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
    split at inside
    · simp at inside
    · exact .inl ⟨_, _, left, ⟨by simp [‹origin.host = some _›], inside⟩, leaves, made⟩
  · exact .inr ran

/-! ## Cancellation

The cancellation lane's (P3) share: what a Terminate End's arrival does, from which
`Kernel.Proofs.Cancellation.Registered` proves `Laws.Scopes.TerminateClears` of the registered hooks. -/

/-- A Terminate End's arrival clears its scope occurrence, keeping its own occurrence, and then completes it on no
flow. -/
theorem arriveThrow_terminate (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence)
    (state : State) : Feature.Propagation.arriveThrow ctx header payload .terminate occurrence state =
      .ok ((state.clearInside ctx.positionLe occurrence.scope [occurrence.id]).signal
        (.complete occurrence.id (.flows []) [] .outward)) := by
  unfold Feature.Propagation.arriveThrow
  rfl

/-! ## Cancel and the failure of a compensation handler

The compensation lane's (P5) share: what a Cancel End's arrival and the raise it queues do, and where a raise's search
stops at a compensation handler's context, from which the lane proves the Cancel and failure statements of
`Kernel.Proofs.Compensation` for the registered hooks. Before a search decides at a scope occurrence it has passed the
Call outputs of every called root on its way (`passCallOutputs`); these lemmas name what those passes keep by a `motive`
the caller chooses (`PassesKeep`), and read the state operations whose bodies only `Kernel.Laws.State` opens through
`RaiseFacts`. -/

/-- Every Call output pass moves nothing a raise reads (`Laws.State.Steady`) and keeps `motive` of a state it holds
of. -/
def PassesKeep (ctx : Ctx) (hooks : Feature.Propagation.PropagationHooks) (motive : State → Prop) : Prop :=
  ∀ root state after, hooks.callOutputs ctx root state = .ok after → Steady state after ∧ (motive state → motive after)

theorem passCallOutputs_motive {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {motive : State → Prop}
    (passes : PassesKeep ctx hooks motive) {origin : Origin} {catches : Bool} {occurrence : ScopeOccurrence}
    {state after : State} (ran : Feature.Propagation.passCallOutputs hooks ctx origin catches occurrence state = .ok after) :
    Steady state after ∧ (motive state → motive after) := by
  unfold Feature.Propagation.passCallOutputs at ran
  repeat' split at ran
  all_goals first | (simp at ran; done) | (cases ran; exact ⟨.refl _, id⟩) | exact passes _ _ _ ran

/-! ### A Cancel -/

/-- A Cancel End's arrival queues its own leave and then a Cancel raise from its occurrence, which names no host; it
changes nothing else. -/
theorem arriveThrow_cancel (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence)
    (state : State) : Feature.Propagation.arriveThrow ctx header payload .cancel occurrence state =
      .ok ((state.signal (.complete occurrence.id (Feature.Propagation.throwLeave payload) [] .outward)).signal
        (.raise .cancel {
          element := header.id, scope := occurrence.scope, activation := occurrence.activation,
          thrower := occurrence.id })) := by
  unfold Feature.Propagation.arriveThrow
  rfl

/-- A Cancel caught by `boundary` on `occurrence`, held in `parent`, rolls back the scope occurrence
`Propagation.cancelledScope` names: it disarms the items attached to `occurrence`'s Activity when that is `occurrence`
itself, clears its interior and queues its compensation, whose resume takes the boundary. -/
theorem leaveOccurrence_cancel {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {raised : Raised}
    {origin : Origin} {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {boundary : Boundary}
    {writes : List (String × Value)} {state after : State} (cancelled : raised.isCancel = true)
    (ran : Feature.Propagation.leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state = .ok after) :
    ∃ terminating, (terminating = state ∨ ∃ activity, occurrence.occurrence = some activity ∧
        terminating = state.disarm activity) ∧
      after = (terminating.clearInside ctx.positionLe (Feature.Propagation.cancelledScope origin occurrence state)).signal
        (.compensate (Feature.Propagation.cancelledScope origin occurrence state) none
          { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }
          occurrence.occurrence (some (.occur boundary.id parent (.flows boundary.outgoing)))) := by
  unfold Feature.Propagation.leaveOccurrence at ran
  simp only [cancelled, ↓reduceIte] at ran
  cases ran
  refine ⟨_, ?_, rfl⟩
  split
  · split
    · exact .inr ⟨_, ‹_›, rfl⟩
    · exact .inl rfl
  · exact .inl rfl

/-- A Cancel's search that finds no catcher fails: admission keeps every Cancel caught. -/
theorem exhausted_cancel {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {origin : Origin}
    {handler : Option ScopeOccurrenceId} {state after : State} :
    Feature.Propagation.exhausted hooks ctx .cancel origin handler state ≠ .ok after := fun ran => by
  unfold Feature.Propagation.exhausted at ran
  obtain ⟨_, _, ran⟩ := ok_bind ran
  cases handler <;> simp at ran

/-- A Cancel's search, where no Event Sub-Process start catches a Cancel, commits only at a boundary that catches it
(`CancelTaken`), in the state the Call output passes on its way left, `Steady` from where it started. -/
theorem searchScopes_cancel {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {origin : Origin}
    {motive : State → Prop} (passes : PassesKeep ctx hooks motive) (unstarted : NoCancelStart ctx)
    (cancelled : Raised.cancel.isCancel = true) :
    ∀ fuel jumped current (state after : State), motive state →
      Feature.Propagation.searchScopes hooks ctx .cancel origin state fuel jumped current = .ok after →
      ∃ passed, Steady state passed ∧ motive passed ∧ CancelTaken ctx origin passed after
  | 0, _, _, _, _, _, ran => (exhausted_cancel (by simpa [Feature.Propagation.searchScopes] using ran)).elim
  | _ + 1, _, none, _, _, _, ran => (exhausted_cancel (by simpa [Feature.Propagation.searchScopes] using ran)).elim
  | fuel + 1, jumped, some current, state, after, holds, ran => by
    unfold Feature.Propagation.searchScopes at ran
    split at ran
    · simp at ran
    · rename_i occurrence found
      have present := List.mem_of_find?_eq_some found
      dsimp only at ran
      split at ran
      · split at ran
        · exact (exhausted_cancel ran).elim
        · split at ran
          · simp at ran
          · obtain ⟨caught, catcher, ran⟩ := ok_bind ran
            cases caught with
            | some boundary =>
              have uncancelled := (contextCatcher_some catcher).2.2.1
              simp [uncancelled] at cancelled
            | none => exact searchScopes_cancel passes unstarted cancelled fuel _ _ _ _ holds ran
      · obtain ⟨handlers, offered, ran⟩ := ok_bind ran
        obtain ⟨passed, pass, ran⟩ := ok_bind ran
        obtain ⟨steady, keeps⟩ := passCallOutputs_motive passes pass
        split at ran
        · rename_i element start interrupting writes _ chosen
          have caught := best?_catches chosen
          obtain ⟨child, inside, rest⟩ := eventSubProcesses_mem (levelCandidates_mem offered _ (best?_mem chosen))
          obtain ⟨header, payload, isScope, started⟩ := rest
          simp [unstarted state occurrence.id child inside header payload _ _ isScope started.1] at caught
        · rename_i boundary writes parent _ bounded parentIs
          have inside := best?_mem bounded
          have caught := best?_catches bounded
          obtain ⟨terminating, disarmed, made⟩ := leaveOccurrence_cancel cancelled ran
          have stands : occurrence ∈ passed.scopes := steady.scopes ▸ present
          obtain ⟨entry, entryIn, named⟩ := cancelledScope_stands (origin := origin) stands
          refine ⟨passed, steady, keeps holds, occurrence, stands, parent, boundary, parentIs, ?_, _, terminating,
            ⟨entry, entryIn, named⟩, disarmed, made⟩
          split at inside
          · rename_i element _ elementIs _
            split at inside
            · simp at inside
            · obtain ⟨envelope, located, member⟩ := boundariesOf_envelope inside
              exact ⟨element, elementIs, envelope, located, member, caught⟩
          · simp at inside
        · obtain ⟨searched, further, kept, taken⟩ :=
            searchScopes_cancel passes unstarted cancelled fuel _ _ _ _ (keeps holds) ran
          exact ⟨searched, steady.trans further, kept, taken⟩

/-! ### Where a search stops -/

/-- At a compensation handler's context the search stops unless the profile selects `propagatesFromHandler`: it is
exhausted there, naming the context (COMPH-FAIL-01). -/
theorem searchScopes_stops {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {raised : Raised}
    {origin : Origin} {state : State} {fuel : Nat} {jumped : Option (Option ElementId)} {current : ScopeOccurrenceId}
    {occurrence : ScopeOccurrence} (found : state.scopes.find? (·.id == current) = some occurrence)
    (handler : ctx.scopeRole state occurrence.id = .compensationHandler)
    (stopping : ctx.program.options.compensationHandlerFailure ≠ .propagatesFromHandler) :
    Feature.Propagation.searchScopes hooks ctx raised origin state (fuel + 1) jumped (some current) =
      Feature.Propagation.exhausted hooks ctx raised origin (some occurrence.id) state := by
  cases option : ctx.program.options.compensationHandlerFailure <;>
    simp_all [Feature.Propagation.searchScopes, Feature.Propagation.propagatesFromHandler]

/-- At a scope occurrence that is no compensation handler's context the search offers its candidates, its Event
Sub-Processes (`levelCandidates`: every one right after a handler's context, else `handlerCandidates`) and the
boundaries on its element unless it is a Multi-Instance instance's; when none of them catches, it passes the
occurrence's Call outputs and goes on from its parent. -/
theorem searchScopes_onward {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {raised : Raised}
    {origin : Origin} {state passed : State} {fuel : Nat} {jumped : Option (Option ElementId)}
    {current : ScopeOccurrenceId} {occurrence : ScopeOccurrence} {handlers : List (ElementId × Subscription × Bool)}
    (found : state.scopes.find? (·.id == current) = some occurrence)
    (ordinary : ctx.scopeRole state occurrence.id ≠ .compensationHandler)
    (offered : Feature.Propagation.levelCandidates ctx raised origin state occurrence jumped = .ok handlers)
    (unhandled : Feature.Propagation.best? ctx raised (·.2.1.trigger) handlers = none)
    (unbounded : ∀ element parent, occurrence.element = some element → occurrence.parent = some parent →
      ctx.scopeRole state occurrence.id ≠ .multiInstanceInstance →
      Feature.Propagation.best? ctx raised (·.subscription.trigger) (Feature.Propagation.boundariesOf ctx element) = none)
    (pass : Feature.Propagation.passCallOutputs hooks ctx origin false occurrence state = .ok passed) :
    Feature.Propagation.searchScopes hooks ctx raised origin state (fuel + 1) jumped (some current) =
      Feature.Propagation.searchScopes hooks ctx raised origin passed fuel none occurrence.parent := by
  have goesOn : (ctx.scopeRole state occurrence.id == .compensationHandler) = false := by
    cases role : ctx.scopeRole state occurrence.id <;> simp_all
  simp only [Feature.Propagation.searchScopes, found, goesOn, offered, unhandled, Option.isSome_none, pass, bind,
    Except.bind, Bool.false_eq_true, ↓reduceIte]
  cases elementIs : occurrence.element with
  | none => simp [best?_nil]
  | some element =>
    cases parentIs : occurrence.parent with
    | none => simp [best?_nil]
    | some parent =>
      by_cases instance_ : ctx.scopeRole state occurrence.id = .multiInstanceInstance
      · simp [instance_, best?_nil]
      · simp [instance_, unbounded element parent elementIs parentIs instance_]

/-- At a compensation handler's context under `propagatesFromHandler` the search reads the record whose handler or
group runs there (`PropagationHooks.handlerRecord`) and offers what `contextCatcher` offers of its completed subject;
when nothing there catches it goes on from the scope occurrence holding that record, never from the context's parent,
the trigger's scope occurrence, passing on the handler the raise runs in: the record's own, or for a group the one the
search reached it from (#159, CIB-INT-0038). -/
theorem searchScopes_context {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {raised : Raised}
    {origin : Origin} {state : State} {fuel : Nat} {jumped : Option (Option ElementId)} {current : ScopeOccurrenceId}
    {occurrence : ScopeOccurrence} {record : Compensable}
    (found : state.scopes.find? (·.id == current) = some occurrence)
    (context : ctx.scopeRole state occurrence.id = .compensationHandler)
    (selected : Feature.Propagation.propagatesFromHandler ctx = true)
    (read : hooks.handlerRecord ctx occurrence.id state = some record)
    (unhandled : Feature.Propagation.contextCatcher ctx raised state record
      (record.handler.orElse fun _ => jumped.join) = .ok none) :
    Feature.Propagation.searchScopes hooks ctx raised origin state (fuel + 1) jumped (some current) =
      Feature.Propagation.searchScopes hooks ctx raised origin state fuel
        (some (record.handler.orElse fun _ => jumped.join)) (some record.scope) := by
  simp only [Feature.Propagation.searchScopes, found, context, selected, read, unhandled, beq_self_eq_true,
    Bool.not_true, Bool.false_eq_true, ↓reduceIte, bind, Except.bind]

/-- Under `CompensationHandlerFailure.propagatesFromHandler` the search passes a compensation handler's context. -/
theorem propagatesFromHandler_selected {ctx : Ctx}
    (selected : ctx.program.options.compensationHandlerFailure = .propagatesFromHandler) :
    Feature.Propagation.propagatesFromHandler ctx = true := by
  simp [Feature.Propagation.propagatesFromHandler, selected]

/-- Under `CompensationHandlerFailure.failsInstance` the search stops at a compensation handler's context. -/
theorem propagatesFromHandler_failsInstance {ctx : Ctx}
    (selected : ctx.program.options.compensationHandlerFailure = .failsInstance) :
    Feature.Propagation.propagatesFromHandler ctx = false := by
  simp [Feature.Propagation.propagatesFromHandler, selected]

/-! ### What a raise queues -/

/-- The hooks a raise's search takes queue only signals `quiet` admits, and dropping runs queues nothing. -/
structure QuietHooks (ctx : Ctx) (quiet : Signal → Prop) (hooks : Feature.Propagation.PropagationHooks) : Prop where
  mappedErrorOutputs : ∀ origin installed state after,
    hooks.mappedErrorOutputs ctx origin installed state = .ok after → Appends quiet state after
  writeCaught : ∀ scope writes state after,
    hooks.writeCaught ctx scope writes state = .ok after → Appends quiet state after
  callOutputs : ∀ root state after, hooks.callOutputs ctx root state = .ok after → Appends quiet state after
  dropRuns : ∀ scope state, Laws.State.allSignals (hooks.dropRuns ctx scope state) = Laws.State.allSignals state

/-- `signal` is the failure of a compensation handler's context that a search stopping there queues: only when the
profile does not select `propagatesFromHandler`, and only at a scope occurrence `ctx.scopeRole` calls a compensation
handler's context in a state `motive` holds of. -/
def HandlerFailed (ctx : Ctx) (motive : State → Prop) (origin : Origin) (signal : Signal) : Prop :=
  Feature.Propagation.propagatesFromHandler ctx = false ∧ ∃ handler, (∃ code message,
    signal = .compensationFailed handler code message origin) ∧
    ∃ stopped, motive stopped ∧ ctx.scopeRole stopped handler = .compensationHandler

section Queues

variable {quiet : Signal → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
  (facts : RaiseFacts) (steps : QuietSteps quiet) (calm : QuietHooks ctx quiet hooks)

include facts steps in
theorem throwerLeaves_quiet (origin : Origin) (state : State) :
    Appends quiet state (Feature.Propagation.throwerLeaves ctx origin state) := by
  unfold Feature.Propagation.throwerLeaves
  dsimp only
  split
  · exact (Appends.refl _).signal facts (steps.complete _ _ _ _)
  · exact .refl _

include facts steps in
theorem fire_quiet (boundary : Boundary) (host : Option OccurrenceId) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : Appends quiet state (boundary.fire host none scope writes state) := by
  rw [Laws.Hooks.fire_eq]
  have interrupted : Appends quiet state
      (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state) := by
    split
    · cases host with
      | none => exact .refl _
      | some owner => exact (Appends.refl _).signal facts (steps.cancel _)
    · exact .refl _
  exact interrupted.signal facts (steps.occur _ _ _ _ _)

include calm in
theorem hostLeaves_quiet {origin : Origin} {state after : State}
    (ran : Feature.Propagation.hostLeaves hooks ctx origin state = .ok after) : Appends quiet state after := by
  unfold Feature.Propagation.hostLeaves at ran
  split at ran
  · exact calm.mappedErrorOutputs _ _ _ _ ran
  · cases ran
    exact .refl _

include calm in
theorem catchDecided_quiet {origin : Origin} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {state after : State} (ran : Feature.Propagation.catchDecided hooks ctx origin scope writes state = .ok after) :
    Appends quiet state after := by
  unfold Feature.Propagation.catchDecided at ran
  dsimp only at ran
  split at ran
  · exact hostLeaves_quiet calm (by simpa [bind, Except.bind] using ran)
  · obtain ⟨written, wrote, ran⟩ := ok_bind ran
    exact (calm.writeCaught _ _ _ _ wrote).trans (hostLeaves_quiet calm ran)

include calm in
theorem passCallOutputs_quiet {origin : Origin} {catches : Bool} {occurrence : ScopeOccurrence} {state after : State}
    (ran : Feature.Propagation.passCallOutputs hooks ctx origin catches occurrence state = .ok after) :
    Appends quiet state after := by
  unfold Feature.Propagation.passCallOutputs at ran
  repeat' split at ran
  all_goals first | (simp at ran; done) | (cases ran; exact .refl _) | exact calm.callOutputs _ _ _ ran

include facts steps in
theorem interruptedOutputs_quiet {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {state after : State}
    (ran : Feature.Propagation.interruptedOutputs ctx occurrence parent state = .ok after) : Appends quiet state after := by
  unfold Feature.Propagation.interruptedOutputs at ran
  dsimp only at ran
  repeat' split at ran
  all_goals first | (cases ran; exact .refl _) | skip
  obtain ⟨outputs, _, made⟩ := ok_map ran
  subst made
  exact (Appends.refl _).signal facts (steps.write _ _ _)

include facts steps calm in
theorem leaveOccurrence_quiet {raised : Raised} {origin : Origin} {occurrence : ScopeOccurrence}
    {parent : ScopeOccurrenceId} {boundary : Boundary} {writes : List (String × Value)} {state after : State}
    (ran : Feature.Propagation.leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state = .ok after) :
    Appends quiet state after := by
  unfold Feature.Propagation.leaveOccurrence at ran
  split at ran
  · cases ran
    refine (Appends.same ?_).signal facts (steps.compensate _ _ _ _ _)
    rw [facts.cleared]
    split
    · split
      · exact facts.disarmed _ _
      · rfl
    · rfl
  · split at ran
    · obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨outputs, out, made⟩ := ok_map ran
      subst made
      exact (((Appends.same (calm.dropRuns occurrence.id state)).trans (catchDecided_quiet calm decision)).trans
        (interruptedOutputs_quiet facts steps out)).trans (fire_quiet facts steps _ _ _ _ _)
    · obtain ⟨decided, decision, ran⟩ := ok_bind ran
      cases ran
      exact ((catchDecided_quiet calm decision).trans (fire_quiet facts steps _ _ _ _ _)).trans
        (throwerLeaves_quiet facts steps _ _)

include facts steps calm in
theorem contextFires_quiet {origin : Origin} {scope : ScopeOccurrenceId} {boundary : Boundary} {state after : State}
    (ran : Feature.Propagation.contextFires hooks ctx origin scope boundary state = .ok after) :
    Appends quiet state after := by
  unfold Feature.Propagation.contextFires at ran
  obtain ⟨decided, decision, ran⟩ := ok_bind ran
  cases ran
  exact ((catchDecided_quiet calm decision).trans (fire_quiet facts steps _ _ _ _ _)).trans
    (throwerLeaves_quiet facts steps _ _)

include facts steps calm in
/-- A search exhausted at `handler` queues a compensation handler's failure only at a context it stopped at. -/
theorem exhausted_queues {motive : State → Prop} {raised : Raised} {origin : Origin}
    {handler : Option ScopeOccurrenceId} {state after : State}
    (stopped : ∀ scope, handler = some scope → Feature.Propagation.propagatesFromHandler ctx = false ∧
      ∃ level, motive level ∧ ctx.scopeRole level scope = .compensationHandler)
    (ran : Feature.Propagation.exhausted hooks ctx raised origin handler state = .ok after) :
    Appends (fun signal => quiet signal ∨ HandlerFailed ctx motive origin signal) state after := by
  unfold Feature.Propagation.exhausted at ran
  obtain ⟨left, leaves, ran⟩ := ok_bind ran
  have leftQuiet : Appends (fun signal => quiet signal ∨ HandlerFailed ctx motive origin signal) state left :=
    (hostLeaves_quiet calm leaves).mono fun _ => Or.inl
  split at ran
  · rename_i code message context _
    cases ran
    obtain ⟨stops, level, kept, role⟩ := stopped context rfl
    exact leftQuiet.signal facts (.inr ⟨stops, context, ⟨code, message, rfl⟩, level, kept, role⟩)
  · unfold Feature.Propagation.unhandledError at ran
    split at ran
    · cases ran
      exact leftQuiet.signal facts (.inl (steps.fail _))
    · obtain ⟨walked, walk, ran⟩ := ok_bind ran
      cases enclosingInstances_ok _ _ walk
      split at ran
      · cases ran
        exact leftQuiet
      · simp at ran
  · simp at ran
  · cases ran
    exact leftQuiet.trans ((throwerLeaves_quiet facts steps _ _).mono fun _ => Or.inl)
  · simp at ran

include facts steps calm in
/-- What a search queues: signals `quiet` admits, and a compensation handler's failure only where it stopped
(`HandlerFailed`), in a state the Call output passes on its way left. -/
theorem searchScopes_queues {motive : State → Prop} {raised : Raised} {origin : Origin}
    (passes : PassesKeep ctx hooks motive) :
    ∀ fuel jumped current (state after : State), motive state →
      Feature.Propagation.searchScopes hooks ctx raised origin state fuel jumped current = .ok after →
      Appends (fun signal => quiet signal ∨ HandlerFailed ctx motive origin signal) state after
  | 0, _, _, _, _, _, ran => exhausted_queues facts steps calm (handler := none) (fun _ named => nomatch named)
      (by simpa [Feature.Propagation.searchScopes] using ran)
  | _ + 1, _, none, _, _, _, ran => exhausted_queues facts steps calm (handler := none) (fun _ named => nomatch named)
      (by simpa [Feature.Propagation.searchScopes] using ran)
  | fuel + 1, jumped, some current, state, after, holds, ran => by
    unfold Feature.Propagation.searchScopes at ran
    split at ran
    · simp at ran
    · rename_i occurrence found
      dsimp only at ran
      split at ran
      · rename_i role
        simp only [beq_iff_eq] at role
        split at ran
        · rename_i stopping
          simp only [Bool.not_eq_true'] at stopping
          exact exhausted_queues facts steps calm (fun _ named => by
            cases named
            exact ⟨stopping, state, holds, role⟩) ran
        · split at ran
          · simp at ran
          · obtain ⟨caught, _, ran⟩ := ok_bind ran
            cases caught with
            | some boundary => exact (contextFires_quiet facts steps calm ran).mono fun _ => Or.inl
            | none => exact searchScopes_queues passes fuel _ _ _ _ holds ran
      · obtain ⟨handlers, _, ran⟩ := ok_bind ran
        obtain ⟨passed, pass, ran⟩ := ok_bind ran
        have lift : Appends (fun signal => quiet signal ∨ HandlerFailed ctx motive origin signal) state passed :=
          (passCallOutputs_quiet calm pass).mono fun _ => Or.inl
        have keeps := (passCallOutputs_motive passes pass).2
        split at ran
        · rename_i element start interrupting writes _
          obtain ⟨decided, decision, ran⟩ := ok_bind ran
          cases ran
          have dropped : Appends quiet passed
              (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) := by
            split
            · exact .same (calm.dropRuns _ _)
            · exact .refl _
          have begun := (dropped.trans (catchDecided_quiet calm decision)).signal facts (steps.begin { element, scope := occurrence.id })
          refine lift.trans (Appends.mono (fun _ => Or.inl) ?_)
          split
          · exact begun
          · exact begun.trans (throwerLeaves_quiet facts steps _ _)
        · exact lift.trans ((leaveOccurrence_quiet facts steps calm ran).mono fun _ => Or.inl)
        · exact lift.trans (searchScopes_queues passes fuel _ _ _ _ (keeps holds) ran)

end Queues

end Kernel.Laws.Propagation
