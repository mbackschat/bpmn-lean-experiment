module

public import Kernel.Hooks
public import Kernel.Laws.Hooks
public import Kernel.Laws.Propagation.Rules
public import Kernel.Feature.Propagation
import all Kernel.Feature.Propagation

/-! # Laws of propagation: the feature's hooks

What `Kernel.Feature.Propagation`'s hooks keep and do, read from their bodies and stated in the vocabulary of
`Kernel.Laws.Propagation.Rules`, which holds the laws of the
[propagation semantics](../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher); their witnesses
are in `Kernel.Laws.Propagation.Witnesses`. Nothing executable imports this module.
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
    hooks.mappedErrorOutputs ctx origin installed state = .ok after → inv after ∧ Steady state after
  writeCaught : ∀ scope writes state after, inv state → hooks.writeCaught ctx scope writes state = .ok after →
    inv after ∧ Steady state after
  callOutputs : ∀ root state after, inv state → hooks.callOutputs ctx root state = .ok after →
    inv after ∧ Steady state after
  dropRuns : ∀ scope state, inv state →
    inv (hooks.dropRuns ctx scope state) ∧ Steady state (hooks.dropRuns ctx scope state)

/-- `Hooks.arriveThrow` keeps `inv`: a raise names the thrower's element (`Laws.Step.HookContract.arriveThrow`). -/
theorem arriveThrow_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {header : Header}
    {payload : EventPayload} {thrown : Throw} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (named : header.id = occurrence.element) (begunFrom : BegunFrom inv state occurrence)
    (ran : Feature.Propagation.arriveThrow ctx header payload thrown occurrence state = .ok after) : inv after := by
  have complete := ops.complete state occurrence (Feature.Propagation.throwLeave payload) [] .outward holds member begun
  have left : occurrence ∈ (state.signal (.complete occurrence.id (Feature.Propagation.throwLeave payload) [] .outward)).occurrences := by
    rw [ops.signalOccurrences]; exact member
  unfold Feature.Propagation.arriveThrow at ran
  cases thrown with
  | none => cases ran; exact complete
  | terminate =>
    cases ran
    obtain ⟨cleared, stays⟩ := ops.terminate state occurrence holds member begun
    exact ops.complete _ _ _ _ _ cleared stays begun
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
    obtain ⟨fired, same⟩ := fireAll_keeps ops _ (Feature.Propagation.ownReceivers state _) state holds
    exact ops.complete _ _ _ _ _ (ops.outbox _ _ fired) (same ▸ member) begun
  | compensation record =>
    dsimp only at ran
    unfold Feature.Propagation.throwCompensation at ran
    split at ran
    · cases ran
    · cases ran
      exact ops.compensate _ _ _ _ _ _ holds member begun begunFrom (by rw [named]; rfl)
  | cancel => cases ran; rw [named]; exact ops.raise _ _ _ complete left begun ⟨state, begunFrom, .inr ⟨_, rfl⟩⟩

/-! ### The search -/

private theorem ok_bind {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

private theorem ok_map {α β ε : Type} {x : Except ε α} {f : α → β} {b : β} (ran : x.map f = .ok b) :
    ∃ a, x = .ok a ∧ b = f a := by
  cases x with
  | error failure => simp [Except.map] at ran
  | ok a => exact ⟨a, rfl, (Except.ok.inj ran).symm⟩

/-- The candidate `Propagation.best?` picks is one of the candidates. -/
theorem best?_mem {α : Type} {ctx : Ctx} {raised : Raised} {trigger : α → Trigger} {candidates : List α}
    {chosen : α} {writes : List (String × Value)}
    (found : Feature.Propagation.best? ctx raised trigger candidates = some (chosen, writes)) : chosen ∈ candidates := by
  unfold Feature.Propagation.best? at found
  obtain ⟨⟨caught, candidate⟩, folded, same⟩ := Option.map_eq_some_iff.mp found
  have named : candidate = chosen := congrArg Prod.fst same
  subst named
  refine Laws.State.foldl_keeps (fun chosen => ∀ pair ∈ chosen, pair.2 ∈ candidates) _ candidates none
    (fun chosen candidate inside held pair member => ?_) (by simp) _ folded
  split at member
  · exact held pair member
  · cases member
    exact inside
  · split at member
    · cases member
      exact inside
    · exact held pair member

/-- A boundary `Propagation.boundariesOf` lists is one of the program's. -/
theorem boundariesOf_boundaryOf {ctx : Ctx} {element : ElementId} {boundary : Boundary}
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx element) : Laws.IL.BoundaryOf ctx.program boundary.id := by
  unfold Feature.Propagation.boundariesOf at member
  cases found : (ctx.program.element? element).bind (·.envelope?) with
  | none => simp [found] at member
  | some envelope =>
    rw [found] at member
    exact Laws.IL.boundaryOf_envelope found member

/-- A caught boundary fires: it cancels its host if it interrupts one, and a fresh occurrence occurs. -/
theorem boundaryFire_keeps {inv : State → Prop} (ops : PropagationOps program inv) (boundary : Boundary)
    (host : Option Nat) (scope : ScopeOccurrenceId) (writes : List (String × Value)) {state : State} (holds : inv state)
    (bounded : Laws.IL.BoundaryOf program boundary.id) :
    inv (boundary.fire host none scope writes state) ∧ (boundary.fire host none scope writes state).occurrences =
      state.occurrences := by
  rw [Laws.Hooks.fire_eq]
  have interrupted : inv (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state) ∧
      (if boundary.interrupting then host.elim state (state.signal <| .cancel ·) else state).occurrences =
        state.occurrences := by
    split
    · cases host with
      | none => exact ⟨holds, rfl⟩
      | some owner => exact ⟨ops.cancel _ _ holds, ops.signalOccurrences _ _⟩
    · exact ⟨holds, rfl⟩
  exact ⟨ops.occur _ _ _ _ _ _ interrupted.1 bounded, (ops.signalOccurrences _ _).trans interrupted.2⟩

/-- An Escalation's thrower leaves once the search has decided: the occurrence it finds has begun. -/
theorem throwerLeaves_keeps {inv : State → Prop} {ctx : Ctx} (ops : PropagationOps ctx.program inv) {origin : Origin}
    {state : State} (holds : inv state) (thrown : Thrown ctx.program origin state) :
    inv (Feature.Propagation.throwerLeaves ctx origin state) := by
  unfold Feature.Propagation.throwerLeaves
  dsimp only
  cases found : state.occurrences.find? fun occurrence => occurrence.element == origin.element &&
      occurrence.scope == origin.scope && occurrence.activation == origin.activation with
  | none => exact holds
  | some occurrence =>
    cases event : (ctx.program.element? origin.element).bind (·.event?) with
    | none => exact holds
    | some pair =>
      have same := List.find?_some found
      simp only [Bool.and_eq_true, beq_iff_eq] at same
      exact ops.complete _ _ _ _ _ holds (List.mem_of_find?_eq_some found)
        (thrown (by rw [event]; rfl) occurrence (List.mem_of_find?_eq_some found) same.1.1 same.1.2 same.2)

theorem hostLeaves_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {state after : State} (holds : inv state)
    (settled : HostSettled origin state) (ran : Feature.Propagation.hostLeaves hooks ctx origin state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.hostLeaves at ran
  split at ran
  · exact search.mappedErrorOutputs _ _ _ _ holds settled ran
  · cases ran
    exact ⟨holds, .refl _⟩

theorem catchDecided_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {state after : State} (holds : inv state) (settled : HostSettled origin state)
    (ran : Feature.Propagation.catchDecided hooks ctx origin scope writes state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.catchDecided at ran
  dsimp only at ran
  split at ran
  · exact hostLeaves_keeps search holds settled (by simpa [bind, Except.bind] using ran)
  · obtain ⟨written, wrote, ran⟩ := ok_bind ran
    obtain ⟨kept, steady⟩ := search.writeCaught _ _ _ _ holds wrote
    obtain ⟨left, more⟩ := hostLeaves_keeps search kept (settled.steady steady) ran
    exact ⟨left, steady.trans more⟩

theorem passCallOutputs_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (search : SearchHooks ctx inv hooks) {origin : Origin} {catches : Bool} {occurrence : ScopeOccurrence}
    {state after : State} (holds : inv state)
    (ran : Feature.Propagation.passCallOutputs hooks ctx origin catches occurrence state = .ok after) :
    inv after ∧ Steady state after := by
  unfold Feature.Propagation.passCallOutputs at ran
  repeat' split at ran
  all_goals first | (simp at ran; done) | (cases ran; exact ⟨holds, .refl _⟩) |
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
  obtain ⟨kept, steady⟩ := hostLeaves_keeps search holds settled leaves
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
    (ran : Feature.Propagation.interruptedOutputs ctx occurrence parent state = .ok after) : inv after := by
  unfold Feature.Propagation.interruptedOutputs at ran
  dsimp only at ran
  repeat' split at ran
  all_goals first | (cases ran; exact holds) | skip
  obtain ⟨outputs, _, made⟩ := ok_map ran
  subst made
  exact ops.write _ _ _ _ holds

theorem leaveOccurrence_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {occurrence : ScopeOccurrence} {parent : ScopeOccurrenceId} {boundary : Boundary} {writes : List (String × Value)}
    {base state after : State} (holds : inv state) (settled : HostSettled origin state)
    (thrown : Thrown ctx.program origin state) (popped : Popped inv (.raise raised origin) base) (steady : Steady base state)
    (present : occurrence ∈ state.scopes) (bounded : Laws.IL.BoundaryOf ctx.program boundary.id)
    (ran : Feature.Propagation.leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state = .ok after) :
    inv after := by
  unfold Feature.Propagation.leaveOccurrence at ran
  split at ran
  · rename_i cancels
    cases ran
    obtain ⟨entry, inside, named⟩ := cancelledScope_stands (origin := origin) present
    repeat' split
    all_goals first
      | exact ops.rollBack _ _ _ _ _ _ _ holds ⟨entry, inside, named⟩ bounded
          ⟨base, raised, origin, state, popped, cancels, steady, .inl rfl, rfl⟩
      | exact ops.rollBack _ _ _ _ _ _ _ (ops.disarm _ _ holds).1 ⟨entry, (ops.disarm _ _ holds).2 ▸ inside, named⟩
          bounded ⟨base, raised, origin, state, popped, cancels, steady, .inr ⟨_, rfl⟩, rfl⟩
  · split at ran
    · obtain ⟨dropped, steady⟩ := search.dropRuns occurrence.id state holds
      obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, _⟩ := catchDecided_keeps search dropped (settled.steady steady) decision
      obtain ⟨outputs, out, made⟩ := ok_map ran
      subst made
      exact (boundaryFire_keeps ops _ _ _ _ (interruptedOutputs_keeps ops kept out) bounded).1
    · obtain ⟨decided, decision, ran⟩ := ok_bind ran
      obtain ⟨kept, steady⟩ := catchDecided_keeps search holds settled decision
      cases ran
      obtain ⟨fired, same⟩ := boundaryFire_keeps ops boundary occurrence.occurrence parent [] kept bounded
      exact throwerLeaves_keeps ops fired (thrown.steady (same.trans steady.occurrences))

theorem searchScopes_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {base : State} (popped : Popped inv (.raise raised origin) base) :
    ∀ fuel current (state after : State), inv state → HostSettled origin state → Thrown ctx.program origin state →
      Steady base state →
      Feature.Propagation.searchScopes hooks ctx raised origin state fuel current = .ok after → inv after
  | 0, _, _, _, holds, settled, thrown, _, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | _ + 1, none, _, _, holds, settled, thrown, _, ran => exhausted_keeps ops search holds settled thrown (by
      simpa [Feature.Propagation.searchScopes] using ran)
  | fuel + 1, some current, state, after, holds, settled, thrown, walked, ran => by
    unfold Feature.Propagation.searchScopes at ran
    split at ran
    · simp at ran
    · rename_i occurrence found
      have present := List.mem_of_find?_eq_some found
      dsimp only at ran
      split at ran
      · exact exhausted_keeps ops search holds settled thrown ran
      · obtain ⟨handlers, _, ran⟩ := ok_bind ran
        obtain ⟨passed, pass, ran⟩ := ok_bind ran
        obtain ⟨kept, steady⟩ := passCallOutputs_keeps search holds pass
        split at ran
        · rename_i element start interrupting writes _
          have dropped : inv (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) ∧
              Steady passed (if interrupting then hooks.dropRuns ctx occurrence.id passed else passed) := by
            split
            · exact search.dropRuns _ _ kept
            · exact ⟨kept, .refl _⟩
          obtain ⟨decided, decision, ran⟩ := ok_bind ran
          obtain ⟨decidedKept, decidedSteady⟩ :=
            catchDecided_keeps search dropped.1 (settled.steady (steady.trans dropped.2)) decision
          cases ran
          have chain := (steady.trans dropped.2).trans decidedSteady
          have begun := ops.begin _ element occurrence.id decidedKept ⟨occurrence, chain.scopes ▸ present, rfl⟩
          split
          · exact begun
          · exact throwerLeaves_keeps ops begun (thrown.steady ((ops.signalOccurrences _ _).trans chain.occurrences))
        · have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
          refine leaveOccurrence_keeps ops search kept (settled.steady steady) (thrown.steady steady.occurrences) popped
            (walked.trans steady) (steady.scopes ▸ present) ?_ ran
          split at inside
          · split at inside
            · simp at inside
            · exact boundariesOf_boundaryOf inside
          · simp at inside
        · exact searchScopes_keeps ops search popped fuel _ _ _ kept (settled.steady steady)
            (thrown.steady steady.occurrences) (walked.trans steady) ran

/-- `Hooks.raise` keeps `inv` for a raise whose host is settled and whose origin, an Event's, names begun occurrences,
taken off a queue that kept `inv`. -/
theorem raise_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : PropagationOps ctx.program inv) (search : SearchHooks ctx inv hooks) {raised : Raised} {origin : Origin}
    {state after : State} (holds : inv state) (settled : HostSettled origin state) (thrown : Thrown ctx.program origin state)
    (popped : Popped inv (.raise raised origin) state)
    (ran : Feature.Propagation.raise hooks ctx raised origin state = .ok after) : inv after := by
  unfold Feature.Propagation.raise at ran
  dsimp only at ran
  split at ran
  · obtain ⟨left, leaves, made⟩ := ok_map ran
    subst made
    have inside := best?_mem ‹Feature.Propagation.best? _ _ _ _ = some _›
    refine (boundaryFire_keeps ops _ _ _ _ (search.mappedErrorOutputs _ _ _ _ holds settled leaves).1 ?_).1
    split at inside
    · simp at inside
    · exact boundariesOf_boundaryOf inside
  · exact searchScopes_keeps ops search popped _ _ _ _ holds settled thrown (.refl _) ran

/-! ## Cancellation

The cancellation lane's (P3) share: what a Terminate End's arrival does, from which
`Kernel.Proofs.Cancellation.Registered` proves `Laws.Scopes.TerminateClears` of the registered hooks. -/

/-- A Terminate End's arrival clears its scope occurrence, keeping its own occurrence, and then completes it on no
flow. -/
theorem arriveThrow_terminate (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence)
    (state : State) : Feature.Propagation.arriveThrow ctx header payload .terminate occurrence state =
      .ok ((state.clearInside occurrence.scope [occurrence.id]).signal
        (.complete occurrence.id (.flows []) [] .outward)) := by
  unfold Feature.Propagation.arriveThrow
  rfl

end Kernel.Laws.Propagation
