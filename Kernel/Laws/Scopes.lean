module

public import Kernel.Hooks
public import Kernel.Laws.State.Derived
public import Kernel.Laws.Flow.Sources
import Kernel.Laws.Step.Elements
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
  (∀ item ∈ itemList s.openItems, item.passive = false → item.scope ≠ scope) ∧
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
    (∀ occurrence ∈ before.occurrences, occurrence ∈ after.occurrences) ∧ ∀ item ∈ itemList before.openItems, item ∈ itemList after.openItems

/-! ## The state invariant under Scopes' hooks

Scopes' share of the proof wave's state-invariant lane (P2), stated over `ScopesOps`, generic in `inv`;
`Kernel.Proofs.Step` fills `ScopesOps` for `Laws.State.WellFormed`. An idle Scope completes its owning occurrence,
which is begun. -/

/-- What Scopes' hooks need of the state operations they apply, for an invariant `inv`. -/
structure ScopesOps (program : Program) (inv : State → Prop) : Prop where
  /-- The occurrence that owns a standing scope occurrence is begun. -/
  owner : ∀ state scope occurrence, inv state → scope ∈ state.scopes → occurrence ∈ state.occurrences →
    scope.occurrence = some occurrence.id → occurrence.begun = true
  /-- The completion of a begun occurrence that stands. -/
  complete : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → (∀ selected, leave = .flows selected → selected = []) →
    inv (state.signal (.complete occurrence.id leave writes rule))
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
  /-- A Scope's occurrence entered below the scope occurrence its begun occurrence runs in, which owns it and runs its
  element: the occurrences stay, the entered scope occurrence stands, and a reservation claimable in the parent is
  claimable in it. -/
  enter : ∀ state element locals occurrence (inner : Option Nat), inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → element = occurrence.element →
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
    element = occurrence.element → inv (state.signal (.arm occurrence.id element occurrence.scope))
  /-- The arming of the Event Sub-Process starts of a scope occurrence that stands. -/
  armScope : ∀ state scope, inv state → scope ∈ Laws.State.scopeIds state → inv (state.signal (.armScope scope))
  /-- A begin that continues by its flows, in a scope occurrence that stands and some occurrence owns if it names a
  reservation, naming distinct reservations beginnable there that nothing claims, and no Event Sub-Process start's,
  from where `Laws.Flow.BeginAnchored` says. -/
  begin : ∀ state request, inv state → request.scope ∈ Laws.State.scopeIds state → request.inner = none →
    request.continuation = .flow →
    (∀ id, request.reserved = some id → ∃ entry ∈ state.scopes, entry.id = request.scope ∧ entry.occurrence.isSome) →
    (Laws.State.names request).Nodup →
    (∀ id ∈ Laws.State.names request, Laws.State.Beginnable state request.scope id ∧ Laws.State.Unclaimed state id) →
    Laws.Flow.BeginAnchored inv program state request → inv (state.signal (.begin request))
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
theorem completeScope_keeps {inv : State → Prop} {ctx : Ctx} (ops : ScopesOps ctx.program inv) {header : Header}
    {payload : ScopePayload} {scope : ScopeOccurrence} {owner : Occurrence} {state after : State} (holds : inv state)
    (member : scope ∈ state.scopes) (owned : owner ∈ state.occurrences) (link : scope.occurrence = some owner.id)
    (ran : Feature.Scopes.completeScope ctx header payload scope owner state = .ok after) : inv after := by
  unfold Feature.Scopes.completeScope at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  · cases ran
    exact ops.complete _ _ _ _ _ holds owned (ops.owner _ _ _ holds member owned link) fun _ same => by cases same

/-- A begin of a child of the element a scope occurrence calling no instance was entered for, in it, naming only a
reservation that lies where that scope occurrence was entered, and no incoming flow, comes from that entry. -/
theorem entered_anchored {inv : State → Prop} {program : Program} {state : State} {request : BeginRequest}
    {entry : ScopeOccurrence} {anchor : ElementId} (member : entry ∈ state.scopes) (named : entry.id = request.scope)
    (element : entry.element = some anchor) (uncalled : entry.calledInstance = none)
    (child : ∃ child ∈ program.children (some anchor), child.header.id = request.element)
    (reserved : ∀ occurrence ∈ state.occurrences, request.reserved = some occurrence.id →
      entry.parent = some occurrence.scope)
    (incoming : request.incoming = none) : Laws.Flow.BeginAnchored inv program state request :=
  ⟨⟨anchor, .inr (.inl child), .inl (.inr (.inl ⟨entry, member, element, .inr ⟨named, uncalled⟩⟩))⟩,
    fun occurrence inside same => .inr ⟨entry, member, named, reserved occurrence inside same, uncalled⟩,
    fun _ some_ => by rw [incoming] at some_; cases some_⟩

/-- Bare begins of a Scope's implicit start, children of the element a scope occurrence that stands and calls no
instance was entered for, queued in it, keep `inv`. -/
theorem implicitBegins_keeps {inv : State → Prop} {program : Program} (ops : ScopesOps program inv)
    {scope : ScopeOccurrenceId} {anchor : ElementId} :
    ∀ (elements : List ElementId) (state : State), inv state →
      (∃ entry ∈ state.scopes, entry.id = scope ∧ entry.element = some anchor ∧ entry.calledInstance = none) →
      (∀ element ∈ elements, ∃ child ∈ program.children (some anchor), child.header.id = element) →
      inv (elements.foldl (fun state element => state.signal (.begin { element, scope })) state)
  | [], _, holds, _, _ => holds
  | element :: rest, state, holds, ⟨entry, member, named, rest_⟩, children => by
    have stands : scope ∈ Laws.State.scopeIds state := List.mem_map.mpr ⟨entry, member, named⟩
    refine implicitBegins_keeps ops rest _ (ops.begin _ _ holds stands rfl rfl (fun _ none => by cases none)
      (by simp [Laws.State.names]) (by simp [Laws.State.names])
      (entered_anchored member named rest_.1 rest_.2 (children element (List.mem_cons_self ..))
        (fun _ _ none => by cases none) rfl)) ?_ fun other later => children other (List.mem_cons_of_mem _ later)
    rw [ops.signalScopes]
    exact ⟨entry, member, named, rest_⟩

/-- A scope occurrence entered for an occurrence belongs to it, runs the element it was entered for, lies in the scope
occurrence it was entered in, and calls no instance. -/
theorem enterScope_owned (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (id : Nat) :
    ∃ entry ∈ (state.enterScope element parent locals (some id)).1.scopes,
      entry.id = (state.enterScope element parent locals (some id)).2 ∧ entry.occurrence.isSome ∧
        entry.element = some element ∧ entry.parent = some parent ∧ entry.calledInstance = none := by
  rw [Laws.State.enterScope_eq]
  exact ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl, rfl, rfl, rfl, rfl⟩

/-- The start Event `Feature.Scopes.innerStart?` chooses is a child of the Scope. -/
theorem innerStart?_child {ctx : Ctx} {scope start : ElementId} {payload : ScopePayload}
    (chosen : Feature.Scopes.innerStart? ctx scope payload = some start) :
    ∃ child ∈ ctx.program.children (some scope), child.header.id = start := by
  unfold Feature.Scopes.innerStart? at chosen
  obtain ⟨⟨header, typed⟩, found, rfl⟩ := Option.map_eq_some_iff.mp chosen
  have member : (header, typed) ∈ (ctx.program.children (some scope)).filterMap Element.start? := by
    split at found <;> exact List.mem_of_find?_eq_some found
  obtain ⟨child, inside, started⟩ := List.mem_filterMap.mp member
  exact ⟨child, inside, congrArg Header.id (Laws.Step.start?_header started)⟩

/-- A monadic fold that keeps its accumulator or appends the element's identifier collects only identifiers of the
elements it folds over, beyond its start. -/
theorem foldlM_ids (step : List ElementId → Element → Except Failure (List ElementId))
    (appends : ∀ begun child after, step begun child = .ok after →
      ∀ name ∈ after, name ∈ begun ∨ name = child.header.id) :
    ∀ (children : List Element) begun result, children.foldlM step begun = .ok result →
      ∀ name ∈ result, name ∈ begun ∨ ∃ child ∈ children, child.header.id = name
  | [], begun, result, ran, name, member => by
    simp only [List.foldlM, pure, Except.pure, Except.ok.injEq] at ran
    exact .inl (ran ▸ member)
  | child :: rest, begun, result, ran, name, member => by
    simp only [List.foldlM, bind, Except.bind] at ran
    split at ran
    · cases ran
    · rename_i after stepped
      rcases foldlM_ids step appends rest after result ran name member with old | ⟨found, inside, same⟩
      · exact (appends begun child after stepped name old).imp id fun same => ⟨child, List.mem_cons_self .., same.symm⟩
      · exact .inr ⟨found, List.mem_cons_of_mem _ inside, same⟩

/-- The children `Feature.Scopes.implicitStart` begins are children of the Scope. -/
theorem implicitStart_children {ctx : Ctx} {scope : ElementId} {begun : List ElementId}
    (ran : Feature.Scopes.implicitStart ctx scope = .ok begun) :
    ∀ element ∈ begun, ∃ child ∈ ctx.program.children (some scope), child.header.id = element := by
  intro element member
  unfold Feature.Scopes.implicitStart at ran
  refine (foldlM_ids _ (fun begun child after stepped id inside => ?_) _ [] begun ran element member).resolve_left
    (by simp)
  split at stepped
  · cases stepped
    exact .inl inside
  · split at stepped
    · cases stepped
      simpa using inside
    · cases stepped

/-- Entering a Scope keeps `inv`: the entry, the arming of its boundaries and Event Sub-Process starts, and the begin of
its start Event, an Event Sub-Process's triggered start with the reservation its firing held, which lies where the Scope
is entered, or its implicit start. -/
theorem enter_keeps {inv : State → Prop} {ctx : Ctx} (ops : ScopesOps ctx.program inv) {header : Header}
    {payload : ScopePayload} {occurrence : Occurrence} {entry : ScopeEntry} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (named : header.id = occurrence.element)
    (claimable : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id)
    (lies : ∀ found ∈ state.occurrences, found.id ∈ entry.inner.toList → found.scope = occurrence.scope)
    (ran : Feature.Scopes.enter ctx header payload occurrence entry state = .ok after) : inv after := by
  unfold Feature.Scopes.enter at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  rename_i locals _
  obtain ⟨entered, occurrences, stands, ready⟩ :=
    ops.enter state header.id locals occurrence entry.inner holds member begun named claimable
  have owned := enterScope_owned state header.id occurrence.scope locals occurrence.id
  generalize state.enterScope header.id occurrence.scope locals (some occurrence.id) = pair
    at entered occurrences stands ready owned ran
  obtain ⟨entered_, scope⟩ := pair
  dsimp only at entered occurrences stands ready owned ran
  have armed : ∃ armed : State, inv armed ∧ armed.scopes = entered_.scopes ∧ armed.occurrences = entered_.occurrences ∧
      (∀ id ∈ entry.inner.toList, Laws.State.Beginnable armed scope id ∧ Laws.State.Unclaimed armed id) ∧
      (if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then entered_
        else entered_.signal (.arm occurrence.id header.id occurrence.scope)) = armed := by
    split
    · exact ⟨entered_, entered, rfl, rfl, ready, rfl⟩
    · obtain ⟨sameScopes, stillReady⟩ := ops.armed _ _ _ _ _ _ ready
      exact ⟨_, ops.arm _ _ _ entered (occurrences ▸ member) begun named, sameScopes,
        by rw [Laws.State.signal_eq], stillReady, rfl⟩
  obtain ⟨armed, armedHolds, armedScopes, rest⟩ := armed
  obtain ⟨armedOccurrences, armedReady, armedIs⟩ := rest
  rw [armedIs] at ran
  have armedStands : scope ∈ Laws.State.scopeIds armed := by
    simpa [Laws.State.scopeIds, armedScopes] using stands
  obtain ⟨scopedScopes, scopedReady⟩ := ops.scopeArmed armed scope scope entry.inner armedReady
  have starts_ := ops.armScope armed scope armedHolds armedStands
  have scopedStands : scope ∈ Laws.State.scopeIds (armed.signal (.armScope scope)) := by
    simpa [Laws.State.scopeIds, scopedScopes] using armedStands
  obtain ⟨opened, inside, same, rest⟩ := owned
  obtain ⟨isOwned, element_, parent, uncalled⟩ := rest
  have scopedMember : opened ∈ (armed.signal (.armScope scope)).scopes := by
    rw [scopedScopes, armedScopes]
    exact inside
  split at ran
  · rename_i start chosen
    cases ran
    have names : ∀ element, Laws.State.names { element, scope, reserved := entry.inner } = entry.inner.toList := by
      simp [Laws.State.names]
    refine ops.begin _ _ starts_ scopedStands rfl rfl (fun _ _ => ⟨opened, scopedMember, same, isOwned⟩) ?_ ?_
      (entered_anchored scopedMember same element_ uncalled (innerStart?_child chosen) (fun found found_ held => ?_) rfl)
    · rw [names]
      cases entry.inner <;> simp
    · rw [names]
      exact scopedReady
    · rw [Laws.State.signal_eq, armedOccurrences, occurrences] at found_
      rw [lies found found_ (by simp [show entry.inner = some found.id from held])]
      exact parent
  · split at ran
    · cases ran
    · rename_i begun_ started
      split at ran
      · cases ran
      · cases ran
        exact implicitBegins_keeps ops _ _ starts_ ⟨opened, scopedMember, same, element_, uncalled⟩
          (implicitStart_children started)

/-- `Hooks.arriveScope` keeps `inv`: an interrupting Event Sub-Process first clears its parent occurrence, keeping its
own occurrence and its start Event's reservation, which lies there; then the Scope is entered. -/
theorem arriveScope_keeps {inv : State → Prop} {ctx : Ctx} (ops : ScopesOps ctx.program inv) {header : Header}
    {payload : ScopePayload} {occurrence : Occurrence} {entry : ScopeEntry} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (named : header.id = occurrence.element)
    (ready : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id ∧ ∀ found ∈ state.occurrences, found.id = id → found.scope = occurrence.scope)
    (ran : Feature.Scopes.arriveScope ctx header payload occurrence entry state = .ok after) : inv after := by
  have claimable : ∀ id ∈ entry.inner.toList, Laws.State.Beginnable state occurrence.scope id ∧
      Laws.State.Unclaimed state id := fun id inner => ⟨(ready id inner).1, (ready id inner).2.1⟩
  have lies : ∀ found ∈ state.occurrences, found.id ∈ entry.inner.toList → found.scope = occurrence.scope :=
    fun found inside reserved => (ready found.id reserved).2.2 found inside rfl
  unfold Feature.Scopes.arriveScope at ran
  split at ran
  · exact enter_keeps ops holds member begun named claimable lies ran
  · exact enter_keeps ops holds member begun named claimable lies ran
  · split at ran
    · cases ran
    · split at ran
      · cases ran
      · rename_i interrupting _
        dsimp only at ran
        cases interrupting
        · exact enter_keeps ops holds member begun named claimable lies ran
        · obtain ⟨cleared, stays, clearedReady⟩ := ops.clear state occurrence entry.inner holds member begun ready
          refine enter_keeps ops cleared stays begun named clearedReady (fun found inside reserved => ?_) ran
          obtain ⟨_, shape⟩ := Laws.State.clearInside_eq state occurrence.scope (occurrence.id :: entry.inner.toList)
          rw [shape] at inside
          exact lies found (List.mem_filter.mp inside).1 reserved

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
  itemsOutside item member outside := (cleared.items item).mpr ⟨member, .inl outside⟩
  variablesOutside variables member outside :=
    (cleared.variables variables).mpr ⟨member, fun strictly => outside strictly.1⟩
  variablesOwn variables member same := (cleared.variables variables).mpr ⟨member, fun strictly => strictly.2 same⟩
  tokensOutside token member outside := (cleared.tokens token).mpr ⟨member, outside⟩
  scopesInside entry member strictly := absurd strictly ((cleared.scopes entry).mp member).2
  occurrencesInside occurrence member within :=
    ((cleared.occurrences occurrence).mp member).2.resolve_left (· within)
  itemsInside item member within := ((cleared.items item).mp member).2.resolve_left (· within)
  variablesInside variables member strictly := absurd strictly ((cleared.variables variables).mp member).2
  tokensInside token member := ((cleared.tokens token).mp member).2
  noNewScopes _ member := cleared.scopesSublist.subset member
  noNewOccurrences _ member := cleared.occurrencesSublist.subset member
  noNewItems _ member := cleared.openItemsSub.items member
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
  have same : (itemList ({ after with signals := after.signals ++ [signal] } : State).openItems) = itemList after.openItems :=
    Laws.State.items_congr rfl
  cases clears
  constructor <;> (try rw [same]) <;> assumption

/-- An Event Sub-Process's arrival at its occurrence, which stands in a well-formed state, enters its Scope on a state
that its start's interruption, as `Ctx.eventStart` reads it (`interrupting`), made from the arrival's: interrupting, the
clearing of the parent scope occurrence keeping the handler's occurrence and its start Event's reservation
(`InterruptingStart`); otherwise the arrival's state. -/
theorem arriveScope_interrupts {ctx : Ctx} {header : Header} {payload : ScopePayload} {occurrence : Occurrence}
    {entry : ScopeEntry} {state after : State} {start read : Subscription} {declared interrupting : Bool}
    (formed : Laws.State.WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (kind : payload.kind = .eventSubProcess start declared)
    (started : ctx.eventStart payload = some (read, interrupting))
    (ran : Feature.Scopes.arriveScope ctx header payload occurrence entry state = .ok after) :
    ∃ cleared, InterruptingStart interrupting occurrence.scope (occurrence.id :: entry.inner.toList) state cleared ∧
      (interrupting = false → cleared = state) ∧
      Feature.Scopes.enter ctx header payload occurrence entry cleared = .ok after := by
  unfold Feature.Scopes.arriveScope at ran
  rw [kind] at ran
  dsimp only at ran
  split at ran
  · cases ran
  · rw [started] at ran
    dsimp only at ran
    cases interrupting
    · exact ⟨state, (nomatch ·), fun _ => rfl, ran⟩
    · exact ⟨_, fun _ => clearInside_clears formed (formed.owned.occurrenceScopes occurrence member) _,
        (nomatch ·), ran⟩

/-- An Event Sub-Process whose start interrupts nothing as `Ctx.eventStart` reads it, a Compensation start whatever
its declared `isInterrupting` (`Feature.Subscriptions.startInterrupts`), enters its Scope on the arrival's state: its
arrival leaves everything in its parent scope occurrence as it was. -/
theorem arriveScope_uninterrupted {ctx : Ctx} {header : Header} {payload : ScopePayload} {occurrence : Occurrence}
    {entry : ScopeEntry} {state after : State} {start read : Subscription} {declared : Bool}
    (kind : payload.kind = .eventSubProcess start declared) (started : ctx.eventStart payload = some (read, false))
    (ran : Feature.Scopes.arriveScope ctx header payload occurrence entry state = .ok after) :
    Feature.Scopes.enter ctx header payload occurrence entry state = .ok after := by
  unfold Feature.Scopes.arriveScope at ran
  rw [kind] at ran
  dsimp only at ran
  split at ran
  · cases ran
  · rw [started] at ran
    exact ran

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
  ((law.1 rfl).2.1 (innerItem kind) (Laws.State.mem_sample_items.mpr (.inl rfl)) rfl) rfl

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

/-- A Scope `Hooks.eventStart` of Scopes reads a start off is an Event Sub-Process with that start. -/
theorem eventStart_kind {payload : ScopePayload} {start : Subscription} {interrupting : Bool}
    (started : Feature.Scopes.eventStart payload = some (start, interrupting)) :
    payload.kind = .eventSubProcess start interrupting := by
  unfold Feature.Scopes.eventStart at started
  split at started
  · rename_i chosen
    cases started
    exact chosen
  all_goals cases started

/-- Scopes reads an Event Sub-Process's start and declared flag off its kind. -/
theorem eventStart_of_kind {payload : ScopePayload} {start : Subscription} {declared : Bool}
    (kind : payload.kind = .eventSubProcess start declared) :
    Feature.Scopes.eventStart payload = some (start, declared) := by
  unfold Feature.Scopes.eventStart
  rw [kind]

end Kernel.Laws.Scopes
