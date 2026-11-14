module

public import Kernel.Hooks
public import Kernel.Laws.State
public import Kernel.Feature.Scopes
import all Kernel.Feature.Scopes

/-! # Laws of Scopes

The rules of the [scopes semantics](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#interpretation), independent
of `Kernel.Feature.Scopes`' and `Kernel.Step`'s code: a token reaching a Scope creates exactly one fresh scope
occurrence, owned by the arriving occurrence, holding exactly the inputs evaluated at that entry, so a re-entered Scope
reads no local of an earlier occurrence; each traversal's occurrence has an activation one greater than the previous;
a scope occurrence completes exactly when nothing remains in it, and its completion removes it and continues the parent
once, one token per outgoing flow; a command addressed to an occurrence that is no longer live is rejected; a Terminate
End clears its scope occurrence keeping only itself; and an interrupting Event Sub-Process start clears its parent
keeping only the handler, while a non-interrupting one leaves the parent's work running.

The laws take the evaluated inputs, the outgoing flows and the occurrences a clearing keeps as parameters, since
computing them is the IL's and `Kernel.Feature.Data`'s; clearing is `Kernel.Laws.State.ClearsInside`. Nothing
executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Scopes

open Kernel
open Kernel.Laws.State (ClearsInside)

/-! ## Entry -/

/-- A token reaching a Scope (`isScope`) as the occurrence `arriving` creates exactly one fresh scope occurrence owned by
it, a child of the arriving occurrence's scope occurrence, whose own variables are exactly `inputs` (`SUBPROC`,
`NSC-ENTER-01`, `SRE-INIT-01`). -/
def Enters (isScope : Bool) (arriving : Occurrence) (inputs : List (String × Value)) (before after : State) : Prop :=
  isScope = true → ∃ fresh ∈ after.scopes, (∀ old ∈ before.scopes, old.id ≠ fresh.id) ∧
    fresh.occurrence = some arriving.id ∧ fresh.parent = some arriving.scope ∧
    (∀ other ∈ after.scopes, other.occurrence = some arriving.id → other.id = fresh.id) ∧
    ∀ locals ∈ after.variables, locals.scope = fresh.id → locals.entries = inputs

/-- An element's next activation in an instance (`SRE-FRESH-01`): one greater than the count of its earlier
occurrences there, the first being 1, so no identity is reused. -/
def NextActivation (processInstance : String) (element : ElementId) (counts : List ActivationCount) (activation : Nat) : Prop :=
  (∀ counter ∈ counts, counter.processInstance = processInstance → counter.element = element → counter.role = .element →
    activation = counter.count + 1) ∧
  ((∀ counter ∈ counts, ¬ (counter.processInstance = processInstance ∧ counter.element = element ∧ counter.role = .element)) →
    activation = 1)

/-! ## Completion -/

/-- Nothing remains in `scope`: no token, no open item that keeps it alive, no begun occurrence, no child scope
occurrence and no parked join or held wait (`SUBPROC-QUIESCE-01`); a passive item, a dormant Event Sub-Process start,
keeps nothing alive. -/
def Idle (s : State) (scope : ScopeOccurrenceId) : Prop :=
  (∀ token ∈ s.tokens, token.busyScope ≠ scope) ∧
  (∀ item ∈ s.openItems, item.passive = false → item.scope ≠ scope) ∧
  (∀ occurrence ∈ s.occurrences, occurrence.begun = true → occurrence.scope ≠ scope) ∧
  (∀ child ∈ s.scopes, child.parent ≠ some scope) ∧
  (∀ join ∈ s.slots.parked, join.scope ≠ scope) ∧ ∀ wait ∈ s.slots.held, wait.scope ≠ scope

/-- A scope occurrence completes exactly when it is idle, whatever the declaration order and the other live occurrences
of its element. -/
def CompletesWhenIdle (s : State) (scope : ScopeOccurrenceId) (completes : Bool) : Prop :=
  completes = true ↔ Idle s scope

/-- An idle scope occurrence's completion removes it and continues its parent once: one token on each outgoing flow
in `parent`, every other token kept (`SCPH-EXIT-01`, `NSC-QUIESCE-01`). -/
def ContinuesOnce (scope parent : ScopeOccurrenceId) (outgoing : List FlowId) (before after : State) : Prop :=
  Idle before scope →
    (∀ left ∈ after.scopes, left.id ≠ scope) ∧
    ∃ kept, after.tokens = kept ++ outgoing.map (Token.flow · parent) ∧ ∀ token ∈ kept, token ∈ before.tokens

/-- A command addressed to an occurrence that is no longer live (`live = false`), a completed Scope's or an earlier
iteration's, is rejected (`SUBPROC-REFUSE-01`, `SRE-STALE-01`). -/
def StaleRejected (live : Bool) (result : Except Failure State) : Prop :=
  live = false → ∃ code, result = .error (.rejected code)

/-! ## Terminate and Event Sub-Processes -/

/-- A Terminate End (`terminates`) arriving in `scope` as occurrence `own` clears the scope occurrence, keeping it and
only its own occurrence (`TEND-REGION-01`, §13.5.6). -/
def TerminateClears (terminates : Bool) (scope : ScopeOccurrenceId) (own : Nat) (before after : State) : Prop :=
  terminates = true → ClearsInside before after scope [own]

/-- An interrupting Event Sub-Process start (`interrupting`) clears its parent scope occurrence, keeping only the
handler's occurrence and its start's reservation (`kept`) (§13.5.4, IMESP). -/
def InterruptingStart (interrupting : Bool) (parent : ScopeOccurrenceId) (kept : List Nat) (before after : State) :
    Prop :=
  interrupting = true → ClearsInside before after parent kept

/-- A non-interrupting one leaves every occurrence and open item of its parent running. -/
def NonInterruptingStart (interrupting : Bool) (before after : State) : Prop :=
  interrupting = false →
    (∀ occurrence ∈ before.occurrences, occurrence ∈ after.occurrences) ∧ ∀ item ∈ before.openItems, item ∈ after.openItems

/-! ## The state invariant under Scopes' hooks

Scopes' share of the proof wave's state-invariant lane (P2), stated over `ScopesOps`, generic in `inv`;
`Kernel.Proofs.Step` fills `ScopesOps` for `Laws.State.WellFormed`. An idle Scope completes its owning occurrence,
which is begun. -/

/-- What Scopes' hooks need of the state operations they apply, for an invariant `inv`. -/
structure ScopesOps (inv : State → Prop) : Prop where
  /-- The occurrence that owns a standing scope occurrence is begun. -/
  owner : ∀ state scope occurrence, inv state → scope ∈ state.scopes → occurrence ∈ state.occurrences →
    scope.occurrence = some occurrence.id → occurrence.begun = true
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))
  /-- An interrupting Event Sub-Process's clearing of the scope occurrence its begun occurrence runs in, keeping that
  occurrence and its start Event's reservation, which lies there; the occurrence stands and the reservation stays
  claimable there. -/
  clear : ∀ state occurrence (inner : Option Nat), inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true →
    (∀ id ∈ inner.toList, Laws.State.Beginnable state occurrence.scope id ∧ Laws.State.Unclaimed state id ∧
      ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope) →
    inv (state.clearInside occurrence.scope (occurrence.id :: inner.toList)) ∧
      occurrence ∈ (state.clearInside occurrence.scope (occurrence.id :: inner.toList)).occurrences ∧
      ∀ id ∈ inner.toList,
        Laws.State.Beginnable (state.clearInside occurrence.scope (occurrence.id :: inner.toList)) occurrence.scope id ∧
        Laws.State.Unclaimed (state.clearInside occurrence.scope (occurrence.id :: inner.toList)) id
  /-- A Scope's occurrence entered below the scope occurrence its begun occurrence runs in, which owns it: the
  occurrences stay, the entered scope occurrence stands, and a reservation claimable in the parent is claimable in it. -/
  enter : ∀ state element locals occurrence (inner : Option Nat), inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true →
    (∀ id ∈ inner.toList, Laws.State.Beginnable state occurrence.scope id ∧ Laws.State.Unclaimed state id) →
    inv (state.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      (state.enterScope element occurrence.scope locals (some occurrence.id)).1.occurrences = state.occurrences ∧
      (state.enterScope element occurrence.scope locals (some occurrence.id)).2 ∈
        Laws.State.scopeIds (state.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      ∀ id ∈ inner.toList,
        Laws.State.Beginnable (state.enterScope element occurrence.scope locals (some occurrence.id)).1
          (state.enterScope element occurrence.scope locals (some occurrence.id)).2 id ∧
        Laws.State.Unclaimed (state.enterScope element occurrence.scope locals (some occurrence.id)).1 id
  /-- The arming of a begun occurrence's boundaries. -/
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.signal (.arm occurrence.id element occurrence.scope))
  /-- The arming of the Event Sub-Process starts of a scope occurrence that stands. -/
  armScope : ∀ state scope, inv state → scope ∈ Laws.State.scopeIds state → inv (state.signal (.armScope scope))
  /-- A begin in a scope occurrence that stands, naming distinct reservations beginnable there that nothing claims,
  and no Event Sub-Process start's. -/
  begin : ∀ state request, inv state → request.scope ∈ Laws.State.scopeIds state → request.inner = none →
    (Laws.State.names request).Nodup →
    (∀ id ∈ Laws.State.names request, Laws.State.Beginnable state request.scope id ∧ Laws.State.Unclaimed state id) →
    inv (state.signal (.begin request))
  /-- An arming keeps the scope occurrences and leaves reservations claimable. -/
  armed : ∀ state host element hostScope scope (inner : Option Nat),
    (∀ id ∈ inner.toList, Laws.State.Beginnable state scope id ∧ Laws.State.Unclaimed state id) →
    (state.signal (.arm host element hostScope)).scopes = state.scopes ∧ ∀ id ∈ inner.toList,
      Laws.State.Beginnable (state.signal (.arm host element hostScope)) scope id ∧
      Laws.State.Unclaimed (state.signal (.arm host element hostScope)) id
  /-- An arming of Event Sub-Process starts keeps the scope occurrences and leaves reservations claimable. -/
  scopeArmed : ∀ state armed scope (inner : Option Nat),
    (∀ id ∈ inner.toList, Laws.State.Beginnable state scope id ∧ Laws.State.Unclaimed state id) →
    (state.signal (.armScope armed)).scopes = state.scopes ∧ ∀ id ∈ inner.toList,
      Laws.State.Beginnable (state.signal (.armScope armed)) scope id ∧
      Laws.State.Unclaimed (state.signal (.armScope armed)) id
  /-- A queued signal keeps the scope occurrences. -/
  signalScopes : ∀ (state : State) signal, (state.signal signal).scopes = state.scopes

/-- `Hooks.completeScope` keeps `inv`: an idle Scope completes its owner. -/
theorem completeScope_keeps {inv : State → Prop} (ops : ScopesOps inv) {ctx : Ctx} {header : Header}
    {payload : ScopePayload} {scope : ScopeOccurrence} {owner : Occurrence} {state after : State} (holds : inv state)
    (member : scope ∈ state.scopes) (owned : owner ∈ state.occurrences) (link : scope.occurrence = some owner.id)
    (ran : Feature.Scopes.completeScope ctx header payload scope owner state = .ok after) : inv after := by
  unfold Feature.Scopes.completeScope at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  · cases ran
    exact ops.complete _ _ _ _ _ holds owned (ops.owner _ _ _ holds member owned link)

/-- Bare begins of a Scope's implicit start, queued in a scope occurrence that stands, keep `inv`. -/
theorem implicitBegins_keeps {inv : State → Prop} (ops : ScopesOps inv) {scope : ScopeOccurrenceId} :
    ∀ (elements : List ElementId) (state : State), inv state → scope ∈ Laws.State.scopeIds state →
      inv (elements.foldl (fun state element => state.signal (.begin { element, scope })) state)
  | [], _, holds, _ => holds
  | element :: rest, state, holds, stands => by
    refine implicitBegins_keeps ops rest _ (ops.begin _ _ holds stands rfl (by simp [Laws.State.names])
      (by simp [Laws.State.names])) ?_
    simpa [Laws.State.scopeIds, ops.signalScopes] using stands

/-- Entering a Scope keeps `inv`: the entry, the arming of its boundaries and Event Sub-Process starts, and the begin of
its start Event, an Event Sub-Process's triggered start with the reservation its firing held, or its implicit
start. -/
theorem enter_keeps {inv : State → Prop} (ops : ScopesOps inv) {ctx : Ctx} {header : Header} {payload : ScopePayload}
    {occurrence : Occurrence} {entry : ScopeEntry} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (claimable : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id)
    (ran : Feature.Scopes.enter ctx header payload occurrence entry state = .ok after) : inv after := by
  unfold Feature.Scopes.enter at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  rename_i locals _
  obtain ⟨entered, occurrences, stands, ready⟩ :=
    ops.enter state header.id (locals ++ entry.locals) occurrence entry.inner holds member begun claimable
  generalize state.enterScope header.id occurrence.scope (locals ++ entry.locals) (some occurrence.id) = pair
    at entered occurrences stands ready ran
  obtain ⟨entered_, scope⟩ := pair
  dsimp only at entered occurrences stands ready ran
  have armed : ∃ armed : State, inv armed ∧ armed.scopes = entered_.scopes ∧
      (∀ id ∈ entry.inner.toList, Laws.State.Beginnable armed scope id ∧ Laws.State.Unclaimed armed id) ∧
      (if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then entered_
        else entered_.signal (.arm occurrence.id header.id occurrence.scope)) = armed := by
    split
    · exact ⟨entered_, entered, rfl, ready, rfl⟩
    · obtain ⟨sameScopes, stillReady⟩ := ops.armed _ _ _ _ _ _ ready
      exact ⟨_, ops.arm _ _ _ entered (occurrences ▸ member) begun, sameScopes, stillReady, rfl⟩
  obtain ⟨armed, armedHolds, armedScopes, rest⟩ := armed
  obtain ⟨armedReady, armedIs⟩ := rest
  rw [armedIs] at ran
  have armedStands : scope ∈ Laws.State.scopeIds armed := by
    simpa [Laws.State.scopeIds, armedScopes] using stands
  obtain ⟨scopedScopes, scopedReady⟩ := ops.scopeArmed armed scope scope entry.inner armedReady
  have starts_ := ops.armScope armed scope armedHolds armedStands
  have scopedStands : scope ∈ Laws.State.scopeIds (armed.signal (.armScope scope)) := by
    simpa [Laws.State.scopeIds, scopedScopes] using armedStands
  split at ran
  · cases ran
    have names : ∀ element, Laws.State.names { element, scope, reserved := entry.inner } = entry.inner.toList := by
      simp [Laws.State.names]
    refine ops.begin _ _ starts_ scopedStands rfl ?_ ?_
    · rw [names]
      cases entry.inner <;> simp
    · rw [names]
      exact scopedReady
  · split at ran
    · cases ran
    · rename_i begun_ _
      split at ran
      · cases ran
      · cases ran
        exact implicitBegins_keeps ops _ _ starts_ scopedStands

/-- `Hooks.arriveScope` keeps `inv`: an interrupting Event Sub-Process first clears its parent occurrence, keeping its
own occurrence and its start Event's reservation, which lies there; then the Scope is entered. -/
theorem arriveScope_keeps {inv : State → Prop} (ops : ScopesOps inv) {ctx : Ctx} {header : Header}
    {payload : ScopePayload} {occurrence : Occurrence} {entry : ScopeEntry} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (ready : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id ∧ ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope)
    (ran : Feature.Scopes.arriveScope ctx header payload occurrence entry state = .ok after) : inv after := by
  have claimable : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id := fun id inner => ⟨(ready id inner).1, (ready id inner).2.1⟩
  unfold Feature.Scopes.arriveScope at ran
  split at ran
  · exact enter_keeps ops holds member begun claimable ran
  · exact enter_keeps ops holds member begun claimable ran
  · rename_i interrupting _
    split at ran
    · cases ran
    · dsimp only at ran
      cases interrupting
      · exact enter_keeps ops holds member begun claimable ran
      · obtain ⟨cleared, stays, clearedReady⟩ := ops.clear state occurrence entry.inner holds member begun ready
        exact enter_keeps ops cleared stays begun clearedReady ran

/-! ## Cancellation

The cancellation lane's (P3) share: `State.clearInside` of a scope occurrence that stands in a well-formed state is a
`ClearsInside` transition, and an interrupting Event Sub-Process's arrival enters its Scope on the clearing of its
parent (`InterruptingStart`). A Terminate End's clearing is `Kernel.Feature.Propagation`'s, so `TerminateClears` is proved of
the registered hooks in `Kernel.Proofs.Cancellation.Registered`, from `Laws.Propagation.arriveThrow_terminate`. -/

/-- A clearing that keeps the instance identity is a `ClearsInside` transition: what `Laws.State.Cleared` keeps is what
lies outside `scope` or is kept, and it adds nothing. -/
theorem cleared_clears {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat}
    (cleared : Laws.State.Cleared before after scope keep) (named : after.instanceId = before.instanceId) :
    ClearsInside before after scope keep where
  scopeStays entry member same := (cleared.scopes entry).mpr ⟨member, fun strictly => strictly.2 same⟩
  scopesOutside entry member outside := (cleared.scopes entry).mpr ⟨member, outside⟩
  occurrencesOutside occurrence member outside := (cleared.occurrences occurrence).mpr ⟨member, .inl outside⟩
  itemsOutside item member outside := (cleared.openItems item).mpr ⟨member, .inl outside⟩
  variablesOutside variables member outside :=
    (cleared.variables variables).mpr ⟨member, fun strictly => outside strictly.1⟩
  variablesOwn variables member same := (cleared.variables variables).mpr ⟨member, fun strictly => strictly.2 same⟩
  tokensOutside token member outside := (cleared.tokens token).mpr ⟨member, outside⟩
  scopesInside entry member strictly := absurd strictly ((cleared.scopes entry).mp member).2
  occurrencesInside occurrence member within :=
    ((cleared.occurrences occurrence).mp member).2.resolve_left (· within)
  itemsInside item member within := ((cleared.openItems item).mp member).2.resolve_left (· within)
  variablesInside variables member strictly := absurd strictly ((cleared.variables variables).mp member).2
  tokensInside token member := ((cleared.tokens token).mp member).2
  noNewScopes _ member := cleared.scopesSublist.subset member
  noNewOccurrences _ member := cleared.occurrencesSublist.subset member
  noNewItems _ member := cleared.openItemsSublist.subset member
  noNewVariables _ member := cleared.variablesSublist.subset member
  noIssue := cleared.nextIssue
  instanceKept := named

/-- `State.clearInside` of a scope occurrence that stands in a well-formed state is a `ClearsInside` transition. -/
theorem clearInside_clears {program : Program} {s : State} {scope : ScopeOccurrenceId}
    (formed : Laws.State.WellFormed program s) (present : scope ∈ Laws.State.scopeIds s) (keep : List Nat) :
    ClearsInside s (s.clearInside scope keep) scope keep :=
  cleared_clears (Laws.State.clearInside_cleared formed present keep) (Laws.State.clearInside_instanceId s scope keep)

/-- A queued signal leaves a `ClearsInside` transition one, since the transition reads no queued signal. -/
theorem clearsInside_signal {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat}
    (clears : ClearsInside before after scope keep) (signal : Signal) :
    ClearsInside before (after.signal signal) scope keep := by
  rw [Laws.State.signal_eq]
  cases clears
  constructor <;> assumption

/-- An Event Sub-Process's arrival at its occurrence, which stands in a well-formed state, enters its Scope on a state
that its start's interruption made from the arrival's: interrupting, the clearing of the parent scope occurrence keeping
the handler's occurrence and its start Event's reservation (`InterruptingStart`); otherwise the arrival's state. -/
theorem arriveScope_interrupts {ctx : Ctx} {header : Header} {payload : ScopePayload} {occurrence : Occurrence}
    {entry : ScopeEntry} {state after : State} {start : Subscription} {interrupting : Bool}
    (formed : Laws.State.WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (kind : payload.kind = .eventSubProcess start interrupting)
    (ran : Feature.Scopes.arriveScope ctx header payload occurrence entry state = .ok after) :
    ∃ cleared, InterruptingStart interrupting occurrence.scope (occurrence.id :: entry.inner.toList) state cleared ∧
      (interrupting = false → cleared = state) ∧
      Feature.Scopes.enter ctx header payload occurrence entry cleared = .ok after := by
  unfold Feature.Scopes.arriveScope at ran
  rw [kind] at ran
  dsimp only at ran
  split at ran
  · cases ran
  · cases interrupting
    · exact ⟨state, (nomatch ·), fun _ => rfl, ran⟩
    · exact ⟨_, fun _ => clearInside_clears formed (formed.owned.occurrenceScopes occurrence member) _,
        (nomatch ·), ran⟩

/-! ## Non-vacuity

The states of `Kernel.Laws.State`: the root scope 0 holds the Sub-Process occurrence 1, whose scope occurrence 2 holds
the waiting occurrence 3. -/

open Kernel.Laws.State (processRoot subScope subProcess innerTask outerTask innerItem outerItem rootScope childScope
  sample cleared sample_clears survivor_rejected terminating terminated terminate_clears)

def entering : State := { instanceId := "p", scopes := [rootScope], occurrences := [subProcess] }

def entered : State :=
  { entering with
    scopes := [rootScope, childScope]
    variables := [{ scope := subScope, entries := [("x", .int 1)] }] }

theorem enters_fresh : Enters true subProcess [("x", .int 1)] entering entered := fun _ =>
  ⟨childScope, by simp [entered], by simp [entering, rootScope, childScope, processRoot, subScope],
    rfl, rfl, by simp [entered, rootScope, childScope, subProcess], by simp [entered, childScope]⟩

def staleLocals : ScopeVariables := { scope := subScope, entries := [("x", .int 1), ("old", .int 2)] }

/-- A re-entered Scope that still holds a local of an earlier occurrence is rejected. -/
theorem stale_local_rejected :
    ¬ Enters true subProcess [("x", .int 1)] entering { entered with variables := [staleLocals] } := fun law => by
  obtain ⟨fresh, mem, rest⟩ := law rfl
  obtain ⟨_, owned, more⟩ := rest
  obtain ⟨_, _, inputs⟩ := more
  simp [entered, entering] at mem
  rcases mem with rfl | rfl
  · simp [rootScope, subProcess] at owned
  · have := inputs staleLocals (by simp) (by simp [staleLocals, childScope])
    simp [staleLocals] at this

def firstCount : ActivationCount := { processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 }

def counts : List ActivationCount := [firstCount]

theorem second_traversal : NextActivation "p" ⟨"Sub"⟩ counts 2 :=
  ⟨by simp [counts, firstCount], fun none => absurd ⟨rfl, rfl, rfl⟩ (none firstCount (by simp [counts]))⟩

/-- Reusing the first traversal's activation is rejected. -/
theorem reused_activation_rejected : ¬ NextActivation "p" ⟨"Sub"⟩ counts 1 := fun law => by
  have := law.1 firstCount (by simp [counts]) rfl rfl rfl
  simp [firstCount] at this

theorem first_traversal : NextActivation "p" ⟨"Sub"⟩ [] 1 := ⟨by simp, fun _ => rfl⟩

theorem cleared_idle (kind : OpenKind) : Idle (cleared kind) subScope := by
  simp [Idle, cleared, sample, outerTask, subProcess, outerItem, rootScope, childScope, processRoot, subScope]

/-- Completing a scope occurrence whose task still waits is rejected. -/
theorem busy_completes_rejected (kind : OpenKind) : ¬ CompletesWhenIdle (sample kind) subScope true := fun law =>
  ((law.1 rfl).2.1 (innerItem kind) (by simp [sample]) rfl) rfl

theorem idle_completes (kind : OpenKind) : CompletesWhenIdle (cleared kind) subScope true :=
  ⟨fun _ => cleared_idle kind, fun _ => rfl⟩

def outFlow : FlowId := ⟨"AfterSub"⟩

def continued (kind : OpenKind) : State :=
  { cleared kind with scopes := [rootScope], tokens := [Token.flow outFlow processRoot] }

theorem continues_once (kind : OpenKind) : ContinuesOnce subScope processRoot [outFlow] (cleared kind) (continued kind) :=
  fun _ => ⟨by simp [continued, rootScope, processRoot, subScope], [], rfl, by simp⟩

/-- Keeping the completed scope occurrence is rejected. -/
theorem keeps_completed_rejected (kind : OpenKind) :
    ¬ ContinuesOnce subScope processRoot [outFlow] (cleared kind) { continued kind with scopes := [rootScope, childScope] } :=
  fun law => (law (cleared_idle kind)).1 childScope (by simp) rfl

/-- Continuing the parent twice is rejected. -/
theorem continues_twice_rejected (kind : OpenKind) :
    ¬ ContinuesOnce subScope processRoot [outFlow] (cleared kind)
      { continued kind with tokens := [Token.flow outFlow processRoot, Token.flow outFlow processRoot] } := fun law => by
  obtain ⟨kept, split, keptOld⟩ := (law (cleared_idle kind)).2
  cases kept
  · simp at split
  · rename_i token _
    exact absurd (keptOld token (by simp)) (by simp [cleared, sample])

theorem stale_rejected : StaleRejected false (.error (.rejected "unknown-user-task")) := fun _ => ⟨_, rfl⟩

/-- Applying a command to a completed occurrence is rejected. -/
theorem stale_applied_rejected (kind : OpenKind) : ¬ StaleRejected false (.ok (continued kind)) := fun law => by
  obtain ⟨_, same⟩ := law rfl
  simp at same

theorem terminate_witness (kind : OpenKind) : TerminateClears true subScope 8 (terminating kind) (terminated kind) :=
  fun _ => terminate_clears kind

theorem interrupting_witness (kind : OpenKind) : InterruptingStart true subScope [] (sample kind) (cleared kind) :=
  fun _ => sample_clears kind

/-- An interrupting start that leaves the parent's waiting task is rejected. -/
theorem interrupting_survivor_rejected (kind : OpenKind) :
    ¬ InterruptingStart true subScope [] (sample kind) (sample kind) :=
  fun law => survivor_rejected kind (law rfl)

theorem non_interrupting_keeps (kind : OpenKind) : NonInterruptingStart false (sample kind) (sample kind) := fun _ =>
  ⟨fun _ mem => mem, fun _ mem => mem⟩

/-- A non-interrupting start that cancels the parent's waiting task is rejected. -/
theorem non_interrupting_cancels_rejected (kind : OpenKind) :
    ¬ NonInterruptingStart false (sample kind) (cleared kind) := fun law => by
  have := (law rfl).1 innerTask (by simp [sample])
  simp [cleared, innerTask, subProcess, outerTask] at this

end Kernel.Laws.Scopes
