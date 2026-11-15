module

public import Kernel.Hooks
public import Kernel.Laws.State.Invariant
public import Kernel.Laws.Hooks
public import Kernel.Laws.Step.Contract
public import Kernel.Laws.Subscriptions.Rules
public import Kernel.Laws.Subscriptions.Timers
public import Kernel.Feature.Subscriptions
import all Kernel.Feature.Subscriptions
public import Kernel.Feature.Subscriptions.Conditions
import all Kernel.Feature.Subscriptions.Conditions
public import Kernel.Feature.Subscriptions.Delivery
import all Kernel.Feature.Subscriptions.Delivery

/-! # Laws of subscriptions: the hooks

What `Kernel.Feature.Subscriptions`' hooks do and keep of an invariant, under the operations record
`SubscriptionsOps`. The rules of the subscriptions semantics over open items and their non-vacuity witnesses are
`Kernel.Laws.Subscriptions.Rules`', and the Timer lexeme laws, which read no state,
`Kernel.Laws.Subscriptions.Timers`'. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Subscriptions

open Kernel
open Kernel.Laws.State (Within scopeIds occurrenceIds AwaitsTrigger)

/-! ## The state invariant under Subscriptions' hooks

Subscriptions' share of the proof wave's state-invariant lane (P2): `Hooks.delivered`, a query, picks the open item a
delivery names. -/

/-- `Hooks.delivered` finds the item through `item?`, by the Message channel or the Signal its delivery carries. -/
theorem delivered_found {ctx : Ctx} {data : DeliveryInput} {state : State} {item : OpenItem} {fired : Fired}
    (ran : Feature.Subscriptions.delivered ctx data state = .ok (item, fired)) :
    item? ctx state data.occurrence (·.channel) = some item ∨ item? ctx state data.occurrence (·.signal) = some item := by
  unfold Feature.Subscriptions.delivered at ran
  dsimp only at ran
  repeat' split at ran
  all_goals cases ran
  · exact .inl ‹_›
  · exact .inr ‹_›

/-! ## Preservation

What the subscription hooks keep of an invariant: a completing occurrence's leaving disarms it, and an offered write
records a Conditional item's last value and queues the firings its contests resolve to. -/

/-- What the subscription hooks need of the state operations they apply, for an invariant `inv` of an instance that
runs `program`. A firing (`Hooks.trigger`) closes the item it fires, may withdraw, disarm or reopen, and then completes
what the item waited on or begins an Event Sub-Process with a start Event's reservation: one obligation per shape the
firing takes, each from the state the item is open in, of an element the program declares a start Event or none, as the
firing tells by the program. -/
structure SubscriptionsOps (program : Program) (inv : State → Prop) : Prop where
  fire : ∀ state item fired, inv state → inv (state.signal (.fire item fired))
  /-- What open items wait for replaced, each keeping everything else and waiting for a trigger if it did. -/
  rekind : ∀ state (change : OpenItem → OpenItem), inv state →
    (∀ item, change item = { item with kind := (change item).kind }) →
    (∀ item, AwaitsTrigger item.kind → AwaitsTrigger (change item).kind) →
    inv { state with openItems := state.openItems.map change }
  /-- A subscription's item waits for a trigger. -/
  awaits : (∀ detail, AwaitsTrigger (.timer detail)) ∧ (∀ detail, AwaitsTrigger (.message detail)) ∧
    (∀ detail, AwaitsTrigger (.signal detail)) ∧ ∀ detail, AwaitsTrigger (.conditional detail)
  disarm : ∀ state host, inv state → inv (state.disarm host)
  /-- An item opened for a begun occurrence that stands, of an element the program declares no start Event, numbered
  under its element's counter. -/
  openItem : ∀ state kind occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    (program.element? occurrence.element).bind (·.start?) = none → occurrence.role = .element →
    inv (state.openItem kind occurrence)
  /-- A subscription opened in a scope occurrence that stands, hanging, if at all, on a begun occurrence there, waiting
  for a trigger, on a boundary or a catching element without an envelope (`Laws.IL.Reservable`). -/
  openSubscription : ∀ state kind element scope host passive, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    (∀ id, host = some id → ∃ occurrence ∈ state.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope) → AwaitsTrigger kind → Laws.IL.Reservable program element →
    inv (state.openSubscription kind element scope host passive).1
  /-- Opening a subscription keeps the scope occurrences and every occurrence. -/
  subscribed : ∀ state kind element scope host passive, inv state →
    (state.openSubscription kind element scope host passive).1.scopes = state.scopes ∧
      ∀ occurrence ∈ state.occurrences, occurrence ∈ (state.openSubscription kind element scope host passive).1.occurrences
  /-- A fired item closed, then what it waited on completed, by flows its element lists; an Event-Based Gateway's arm
  disarms and completes its Gateway first, an interrupting boundary withdraws and cancels its host first, a cycle Timer
  reopens first. -/
  closeComplete : ∀ state item leave writes, inv state → item ∈ state.openItems →
    (∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program item.element flow) → inv ((state.closeItem item.id).signal (.complete item.occurrence leave writes .outward))
  gatewayComplete : ∀ state item gateway leave writes, inv state → item ∈ state.openItems →
    item.attachedTo = some gateway → (∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program item.element flow) → inv ((((state.closeItem item.id).disarm gateway).signal
      (.complete gateway (.flows []) [] .outward)).signal (.complete item.occurrence leave writes .outward))
  interruptComplete : ∀ state item host leave writes, inv state → item ∈ state.openItems →
    (∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program item.element flow) → inv ((((state.closeItem item.id).withdrawOccurrence host).signal (.cancel host)).signal
      (.complete item.occurrence leave writes .outward))
  reopenComplete : ∀ state item detail leave writes, inv state → item ∈ state.openItems →
    Laws.IL.Reservable program item.element → (∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program item.element flow) →
    inv (((state.closeItem item.id).openSubscription (.timer detail) item.element item.scope item.attachedTo
      item.passive).1.signal (.complete item.occurrence leave writes .outward))
  /-- A fresh occurrence of a boundary in the item's scope occurrence, of a subscription that stays open. -/
  occur : ∀ state item element leave writes, inv state → item ∈ state.openItems → Laws.IL.BoundaryOf program element →
    inv (state.signal (.occur element item.scope leave writes .outward))
  /-- A start Event's item closed, then its Event Sub-Process begun with the item's reservation; an interrupting start
  withdraws the items of its scope occurrence first, a cycle Timer reopens first. -/
  insideBegin : ∀ state item element locals, inv state → item ∈ state.openItems →
    ((program.element? item.element).bind (·.start?)).isSome = true →
    inv (((state.closeItem item.id).withdrawInside item.scope).signal
      (.begin { element, scope := item.scope, locals, inner := some item.occurrence }))
  closeBegin : ∀ state item element locals, inv state → item ∈ state.openItems →
    ((program.element? item.element).bind (·.start?)).isSome = true →
    inv ((state.closeItem item.id).signal (.begin { element, scope := item.scope, locals, inner := some item.occurrence }))
  reopenBegin : ∀ state item detail element locals, inv state → item ∈ state.openItems →
    ((program.element? item.element).bind (·.start?)).isSome = true → Laws.IL.Reservable program item.element →
    inv (((state.closeItem item.id).openSubscription (.timer detail) item.element item.scope item.attachedTo
      item.passive).1.signal (.begin { element, scope := item.scope, locals, inner := some item.occurrence }))
  /-- An Event Sub-Process begun without a reservation in the item's scope occurrence. -/
  bareBegin : ∀ state item element locals, inv state → item ∈ state.openItems →
    inv (state.signal (.begin { element, scope := item.scope, locals }))

private theorem ok_bind {α β ε : Type} {x : Except ε α} {f : α → Except ε β} {b : β} (ran : (x >>= f) = .ok b) :
    ∃ a, x = .ok a ∧ f a = .ok b := by
  cases x with
  | error failure => exact absurd ran (by simp [bind, Except.bind])
  | ok a => exact ⟨a, by simp, by simpa [bind, Except.bind] using ran⟩

/-- A monadic left fold in `Except` keeps what each step keeps of the items folded. -/
private theorem foldlM_holds {α β : Type} {holds : β → Prop} {f : β → α → Except Failure β} :
    ∀ (items : List α), (∀ b a after, a ∈ items → holds b → f b a = .ok after → holds after) →
      ∀ (b after : β), holds b → items.foldlM f b = .ok after → holds after
  | [], _, b, after, start, ran => by
    simp only [List.foldlM_nil] at ran
    exact (Except.ok.inj ran) ▸ start
  | a :: rest, each, b, after, start, ran => by
    simp only [List.foldlM_cons] at ran
    obtain ⟨mid, stepped, ran⟩ := ok_bind ran
    exact foldlM_holds rest (fun b a after inside => each b a after (List.mem_cons_of_mem _ inside)) mid after
      (each _ _ _ List.mem_cons_self start stepped) ran

/-- `Hooks.leave` keeps `inv` and is the completing occurrence's disarming. -/
theorem leave_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (ran : Feature.Subscriptions.leave ctx occurrence state = .ok after) :
    inv after ∧ after = state.disarm occurrence.id := by
  unfold Feature.Subscriptions.leave at ran
  cases ran
  exact ⟨ops.disarm _ _ holds, rfl⟩

theorem fireAll_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) (write : Option WriteEvent) :
    ∀ (items : List OpenItem) (state : State), inv state → inv (Feature.Subscriptions.fireAll write items state)
  | [], _, holds => holds
  | item :: rest, state, holds => by
    unfold Feature.Subscriptions.fireAll
    exact fireAll_keeps ops write rest _ (ops.fire _ _ _ holds)

/-- An evaluated Conditional item records at most its last value. -/
theorem evaluateItem_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {item : OpenItem}
    {trigger : ConditionTrigger} {state after : State} {fires : Bool} (holds : inv state)
    (ran : Feature.Subscriptions.evaluateItem ctx item trigger state = .ok (after, fires)) : inv after := by
  unfold Feature.Subscriptions.evaluateItem at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact holds
    | exact ops.rekind _ _ holds (fun open_ => by split <;> rfl) fun open_ waits => by
        split
        · exact ops.awaits.2.2.2 _
        · exact waits

/-- An item's evaluation at arming keeps `inv`. -/
theorem armed_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {subscription : Subscription}
    {item : OpenItem} {state after : State} {fires : Bool} (holds : inv state)
    (ran : Feature.Subscriptions.armed ctx subscription item state = .ok (after, fires)) : inv after := by
  unfold Feature.Subscriptions.armed at ran
  split at ran
  · exact evaluateItem_keeps ops holds ran
  · cases ran
    exact holds

/-- `Hooks.arriveCatch` keeps `inv` for a begun occurrence that stands. -/
theorem arriveCatch_keeps {inv : State → Prop} {ctx : Ctx} (ops : SubscriptionsOps ctx.program inv) {header : Header}
    {payload : EventPayload} {subscription : Subscription} {occurrence : Occurrence} {state after : State}
    (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (ran : Feature.Subscriptions.arriveCatch ctx header payload subscription occurrence state = .ok after) :
    inv after := by
  unfold Feature.Subscriptions.arriveCatch at ran
  obtain ⟨kind?, _, ran⟩ := ok_bind ran
  split at ran
  · have opened := ops.openItem state ‹_› occurrence holds member begun unstarted role
    dsimp only at ran
    split at ran
    · obtain ⟨⟨evaluated, fires⟩, evaluation, ran⟩ := ok_bind ran
      have kept := armed_keeps ops opened evaluation
      cases ran
      split
      · exact fireAll_keeps ops _ _ _ kept
      · exact kept
    · cases ran
      exact opened
  · cases ran

/-- An evaluated Conditional item keeps the scope occurrences and the occurrences. -/
theorem evaluateItem_frame {ctx : Ctx} {item : OpenItem} {trigger : ConditionTrigger} {state after : State}
    {fires : Bool} (ran : Feature.Subscriptions.evaluateItem ctx item trigger state = .ok (after, fires)) :
    after.scopes = state.scopes ∧ after.occurrences = state.occurrences := by
  unfold Feature.Subscriptions.evaluateItem at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals exact ⟨rfl, rfl⟩

/-- An item's evaluation at arming keeps the scope occurrences and the occurrences. -/
theorem armed_frame {ctx : Ctx} {subscription : Subscription} {item : OpenItem} {state after : State} {fires : Bool}
    (ran : Feature.Subscriptions.armed ctx subscription item state = .ok (after, fires)) :
    after.scopes = state.scopes ∧ after.occurrences = state.occurrences := by
  unfold Feature.Subscriptions.armed at ran
  split at ran
  · exact evaluateItem_frame ran
  · cases ran
    exact ⟨rfl, rfl⟩

/-- What an arming keeps beside `inv` while it opens subscriptions: its scope occurrence stands, and its host, if any,
is begun there. -/
def Hosted (scope : ScopeOccurrenceId) (host : Option Nat) (state : State) : Prop :=
  (∃ entry ∈ state.scopes, entry.id = scope) ∧
    ∀ id, host = some id → ∃ occurrence ∈ state.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope

theorem Hosted.congr {scope : ScopeOccurrenceId} {host : Option Nat} {state after : State}
    (hosted : Hosted scope host state) (scopes : after.scopes = state.scopes)
    (occurrences : ∀ occurrence ∈ state.occurrences, occurrence ∈ after.occurrences) : Hosted scope host after :=
  ⟨scopes ▸ hosted.1, fun id named =>
    have ⟨occurrence, present, rest⟩ := hosted.2 id named
    ⟨occurrence, occurrences occurrence present, rest⟩⟩

/-- A subscription's item waits for a trigger. -/
theorem waitKind_awaits {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {arming : Feature.Subscriptions.Arming} {subscription : Subscription}
    {kind : OpenKind} (ran : Feature.Subscriptions.waitKind ctx arming subscription = .ok (some kind)) :
    AwaitsTrigger kind := by
  unfold Feature.Subscriptions.waitKind at ran
  split at ran
  · cases detail : Feature.Subscriptions.timerDetail ctx arming ‹_› <;>
      simp only [detail, Functor.map, Except.map, Function.comp, Except.ok.injEq, Option.some.injEq, reduceCtorEq] at ran
    exact ran ▸ ops.awaits.1 _
  · obtain ⟨_, _, ran⟩ := ok_bind ran
    dsimp only at ran
    split at ran
    · obtain ⟨_, _, ran⟩ := ok_bind ran
      cases ‹throw _ = _›
    · cases ran
      exact ops.awaits.2.1 _
  · obtain ⟨_, _, ran⟩ := ok_bind ran
    cases ran
    exact ops.awaits.2.2.1 _
  · cases ran
    exact ops.awaits.2.2.2 _
  all_goals cases ran

/-- An Event-Based Gateway's arm subscribes a catch Event, a catching element without an envelope. -/
theorem gatewayArm_reservable {program : Program} {flow : FlowId} {element : ElementId} {subscription : Subscription}
    (found : ((program.target? flow).bind program.element?).bind (fun target =>
      target.event?.bind fun (header, event) => event.catch?.map (header.id, ·)) = some (element, subscription)) :
    Laws.IL.Reservable program element := by
  obtain ⟨target, located, typed⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨id, -, finds⟩ := Option.bind_eq_some_iff.mp located
  obtain ⟨⟨header, event⟩, isEvent, caught⟩ := Option.bind_eq_some_iff.mp typed
  obtain ⟨_, held, same⟩ := Option.map_eq_some_iff.mp caught
  obtain ⟨headed, bare⟩ := Laws.Step.event?_bare isEvent
  have named : header.id = element := congrArg Prod.fst same
  have catches : Laws.IL.Catches target := .inl (by rw [isEvent]; simp [held])
  exact .inr ⟨target, Laws.IL.element?_mem finds, headed ▸ named, bare, catches⟩

/-- An Event Sub-Process's start Event is a catching element without an envelope. -/
theorem startEvent_reservable {ctx : Ctx} {eventSubProcess start : ElementId}
    (found : Feature.Subscriptions.startEvent? ctx eventSubProcess = some start) : Laws.IL.Reservable ctx.program start := by
  unfold Feature.Subscriptions.startEvent? at found
  obtain ⟨child, member, made⟩ := List.exists_of_findSome?_eq_some found
  obtain ⟨⟨header, payload⟩, typed, named⟩ := Option.map_eq_some_iff.mp made
  obtain ⟨headed, bare⟩ := Laws.Step.start?_bare typed
  exact .inr ⟨child, Laws.IL.mem_children member, headed ▸ named, bare, .inr (by rw [typed]; rfl)⟩

/-- `subscribe` keeps `inv` and the arming's scope occurrence and host. -/
theorem subscribe_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {arming : Feature.Subscriptions.Arming}
    {state after : State} {subscription : Subscription} {element : ElementId} {scope : ScopeOccurrenceId}
    {host : Option Nat} {passive evaluate : Bool} {fired : Option OpenItem} (holds : inv state)
    (hosted : Hosted scope host state) (reservable : Laws.IL.Reservable program element)
    (ran : Feature.Subscriptions.subscribe ctx arming state subscription element scope host passive evaluate =
      .ok (after, fired)) : inv after ∧ Hosted scope host after := by
  unfold Feature.Subscriptions.subscribe at ran
  obtain ⟨kind?, _, ran⟩ := ok_bind ran
  split at ran
  · cases ran
    exact ⟨holds, hosted⟩
  · have opened := ops.openSubscription state ‹_› element scope host passive holds hosted.1 hosted.2
      (waitKind_awaits ops ‹_›) reservable
    obtain ⟨scopes, occurrences⟩ := ops.subscribed state ‹_› element scope host passive holds
    have kept := hosted.congr scopes occurrences
    dsimp only at ran
    split at ran
    · obtain ⟨⟨evaluated, fires⟩, evaluation, ran⟩ := ok_bind ran
      cases ran
      obtain ⟨scopes, occurrences⟩ := armed_frame evaluation
      exact ⟨armed_keeps ops opened evaluation, kept.congr scopes fun _ member => occurrences ▸ member⟩
    · cases ran
      exact ⟨opened, kept⟩

/-- `subscribeAll` keeps `inv` when each subscription keeps it and what the arming keeps beside it. -/
theorem subscribeAll_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {α : Type} {ctx : Ctx}
    {state after : State} {prior : List OpenItem} {entries : List α}
    {each : State → α → Except Failure (State × Option OpenItem)} (stable : State → Prop)
    (holds : inv state ∧ stable state)
    (step : ∀ current entry next fired, entry ∈ entries → inv current ∧ stable current →
      each current entry = .ok (next, fired) → inv next ∧ stable next)
    (ran : Feature.Subscriptions.subscribeAll ctx state prior entries each = .ok after) : inv after := by
  unfold Feature.Subscriptions.subscribeAll at ran
  obtain ⟨⟨subscribed, fired⟩, folded, ran⟩ := ok_bind ran
  obtain ⟨firings, _, ran⟩ := ok_bind ran
  cases ran
  refine fireAll_keeps ops _ _ _
    (foldlM_holds (holds := fun pair => inv pair.1 ∧ stable pair.1) _ ?_ _ _ holds folded).1
  intro ⟨current, earlier⟩ entry next inside kept stepped
  obtain ⟨⟨opened, item⟩, subscribing, stepped⟩ := ok_bind stepped
  cases stepped
  exact step _ _ _ _ inside kept subscribing

/-- `Hooks.arm` keeps `inv` for a host begun in a scope occurrence that stands. -/
theorem arm_keeps {inv : State → Prop} {ctx : Ctx} (ops : SubscriptionsOps ctx.program inv) {host : Nat}
    {element : ElementId} {scope : ScopeOccurrenceId} {state after : State} (holds : inv state)
    (hosted : Hosted scope (some host) state)
    (ran : Feature.Subscriptions.arm ctx host element scope state = .ok after) : inv after := by
  unfold Feature.Subscriptions.arm at ran
  split at ran
  · cases ran
  · rename_i envelope found
    exact subscribeAll_keeps ops (Hosted scope (some host)) ⟨holds, hosted⟩
      (fun _ _ _ _ inside kept subscribing => subscribe_keeps ops kept.1 kept.2
        (.inl (Laws.IL.boundaryOf_envelope found inside)) subscribing) ran

/-- `Hooks.armGateway` keeps `inv` for a gateway occurrence begun in a scope occurrence that stands. -/
theorem armGateway_keeps {inv : State → Prop} {ctx : Ctx} (ops : SubscriptionsOps ctx.program inv) {occurrence : Nat}
    {gateway : ElementId} {scope : ScopeOccurrenceId} {state after : State} (holds : inv state)
    (hosted : Hosted scope (some occurrence) state)
    (ran : Feature.Subscriptions.armGateway ctx occurrence gateway scope state = .ok after) : inv after := by
  unfold Feature.Subscriptions.armGateway at ran
  split at ran
  · cases ran
  · refine subscribeAll_keeps ops (Hosted scope (some occurrence)) ⟨holds, hosted⟩
      (fun _ _ _ _ _ kept subscribing => ?_) ran
    dsimp only at subscribing
    split at subscribing
    · rename_i element subscription arm
      exact subscribe_keeps ops kept.1 kept.2 (gatewayArm_reservable arm) subscribing
    · cases subscribing

/-- The Conditional boundaries evaluated at a scope's arming keep `inv` and the scope occurrences and occurrences. -/
theorem enabledBoundaries_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx}
    {scope : ScopeOccurrenceId} {state after : State} {fired : List OpenItem} (holds : inv state)
    (ran : Feature.Subscriptions.enabledBoundaries ctx scope state = .ok (after, fired)) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences := by
  unfold Feature.Subscriptions.enabledBoundaries at ran
  split at ran
  · split at ran
    · cases ran
      exact ⟨holds, rfl, rfl⟩
    · refine (foldlM_holds (holds := fun pair => inv pair.1 ∧ pair.1.scopes = state.scopes ∧
        pair.1.occurrences = state.occurrences) _ ?_ _ _ ⟨holds, rfl, rfl⟩ ran)
      intro ⟨current, earlier⟩ item next _ ⟨kept, scopes, occurrences⟩ stepped
      dsimp only at stepped
      split at stepped
      · cases stepped
        exact ⟨kept, scopes, occurrences⟩
      · obtain ⟨⟨evaluated, fires⟩, evaluation, stepped⟩ := ok_bind stepped
        cases stepped
        obtain ⟨scopesKept, occurrencesKept⟩ := evaluateItem_frame evaluation
        exact ⟨evaluateItem_keeps ops kept evaluation, scopesKept.trans scopes, occurrencesKept.trans occurrences⟩
  · cases ran
    exact ⟨holds, rfl, rfl⟩

/-- `Hooks.armScope` keeps `inv` for a scope occurrence that stands. -/
theorem armScope_keeps {inv : State → Prop} {ctx : Ctx} (ops : SubscriptionsOps ctx.program inv) {scope : ScopeOccurrenceId}
    {state after : State} (holds : inv state) (stands : ∃ entry ∈ state.scopes, entry.id = scope)
    (ran : Feature.Subscriptions.armScope ctx scope state = .ok after) : inv after := by
  unfold Feature.Subscriptions.armScope at ran
  obtain ⟨⟨evaluated, boundaries⟩, evaluation, ran⟩ := ok_bind ran
  obtain ⟨kept, scopes, _⟩ := enabledBoundaries_keeps ops holds evaluation
  refine subscribeAll_keeps ops (Hosted scope none) ⟨kept, scopes ▸ stands, nofun⟩
    (fun _ _ _ _ _ held subscribing => ?_) ran
  dsimp only at subscribing
  split at subscribing
  · cases subscribing
    exact held
  · obtain ⟨kind?, _, subscribing⟩ := ok_bind subscribing
    split at subscribing
    · rename_i start _ found _
      exact subscribe_keeps ops held.1 held.2 (startEvent_reservable found) subscribing
    · cases subscribing
      exact held
    · cases subscribing

/-- `Hooks.written` keeps `inv`. -/
theorem offerWrites_keeps {inv : State → Prop} (ops : SubscriptionsOps program inv) {ctx : Ctx} {writes : List WriteEvent}
    {state after : State} (holds : inv state) (ran : Feature.Subscriptions.offerWrites ctx writes state = .ok after) :
    inv after := by
  unfold Feature.Subscriptions.offerWrites at ran
  obtain ⟨⟨offered, _⟩, folded, ran⟩ := ok_bind ran
  cases ran
  refine foldlM_holds (holds := fun pair => inv pair.1) _ ?_ _ _ holds folded
  intro ⟨current, earlier⟩ write next _ kept stepped
  obtain ⟨⟨evaluated, fired⟩, inner, stepped⟩ := ok_bind stepped
  obtain ⟨firings, _, stepped⟩ := ok_bind stepped
  cases stepped
  refine fireAll_keeps ops _ _ _ (foldlM_holds (holds := fun pair => inv pair.1) _ ?_ _ _ kept inner)
  intro ⟨current, fired⟩ ⟨item, trigger⟩ next _ kept stepped
  obtain ⟨⟨evaluated, fires⟩, evaluation, stepped⟩ := ok_bind stepped
  cases stepped
  exact evaluateItem_keeps ops kept evaluation

/-! ## Firing an item -/

/-- A firing's admission leaves the state as it was. -/
theorem admitFiring_state {hooks : Feature.Subscriptions.SubscriptionsHooks} {ctx : Ctx} {subscription : Subscription}
    {item : OpenItem} {fired : Fired} {state after : State} {values : List (String × Value)}
    (ran : Feature.Subscriptions.admitFiring hooks ctx subscription item fired state = .ok (after, values)) :
    after = state := by
  unfold Feature.Subscriptions.admitFiring at ran
  simp only [bind, Except.bind, Functor.map, Except.map] at ran
  repeat' split at ran
  all_goals simp_all

/-- What remains of a fired item that does not interrupt: it stays open, closes, or reopens as a cycle Timer. -/
theorem afterFiring_cases (state : State) (item : OpenItem) : Feature.Subscriptions.afterFiring state item = (state, none) ∨
    Feature.Subscriptions.afterFiring state item = (state.closeItem item.id, some item.occurrence) ∨
    ∃ detail, Feature.Subscriptions.afterFiring state item = (((state.closeItem item.id).openSubscription (.timer detail)
      item.element item.scope item.attachedTo item.passive).1, some item.occurrence) := by
  unfold Feature.Subscriptions.afterFiring
  dsimp only
  repeat' split
  all_goals first | exact .inl rfl | exact .inr (.inl rfl) | exact .inr (.inr ⟨_, rfl⟩)

/-- `Hooks.trigger` keeps `inv` for an item that is open. -/
theorem trigger_keeps {inv : State → Prop} {ctx : Ctx} (ops : SubscriptionsOps ctx.program inv)
    {hooks : Feature.Subscriptions.SubscriptionsHooks} {item : OpenItem} {fired : Fired} {state after : State}
    (holds : inv state) (member : item ∈ state.openItems)
    (ran : Feature.Subscriptions.trigger hooks ctx item fired state = .ok after) : inv after := by
  unfold Feature.Subscriptions.trigger at ran
  split at ran
  · obtain ⟨bounded, named⟩ := Laws.IL.boundary?_boundaryOf ‹ctx.program.boundary? item.element = some _›
    unfold Feature.Subscriptions.fireBoundary at ran
    obtain ⟨⟨admitted, values⟩, admission, ran⟩ := ok_bind ran
    cases admitFiring_state admission
    dsimp only at ran
    split at ran
    · split at ran
      · cases ran
      · split at ran
        · cases ran
        · cases ran
          rw [Laws.Hooks.fire_eq]
          split
          · exact ops.interruptComplete _ _ _ _ _ holds member fun _ same => by cases same; exact fun _ inside => .inr ⟨_, _, ‹_›, inside⟩
          · contradiction
    · rcases afterFiring_cases state item with same | same | ⟨detail, same⟩ <;> rw [same] at ran <;> cases ran <;>
        rw [Laws.Hooks.fire_eq] <;> split <;> first | contradiction | skip
      · exact ops.occur _ _ _ _ _ holds member (named ▸ bounded)
      · exact ops.closeComplete _ _ _ _ holds member fun _ same => by cases same; exact fun _ inside => .inr ⟨_, _, ‹_›, inside⟩
      · exact ops.reopenComplete _ _ _ _ _ holds member (.inl bounded) fun _ same => by cases same; exact fun _ inside => .inr ⟨_, _, ‹_›, inside⟩
  · dsimp only at ran
    split at ran
    · unfold Feature.Subscriptions.fireCatch at ran
      obtain ⟨⟨admitted, values⟩, admission, ran⟩ := ok_bind ran
      cases admitFiring_state admission
      cases ran
      split
      · exact ops.gatewayComplete _ _ _ _ _ holds member ‹_› fun _ same => by cases same
      · exact ops.closeComplete _ _ _ _ holds member fun _ same => by cases same
    · obtain ⟨⟨header, payload⟩, typed, -⟩ := Option.bind_eq_some_iff.mp ‹_›
      have start : ((ctx.program.element? item.element).bind (·.start?)).isSome = true := by rw [typed]; rfl
      have reservable : Laws.IL.Reservable ctx.program item.element := by
        obtain ⟨found, located, started⟩ := Option.bind_eq_some_iff.mp typed
        exact .inr ⟨found, Laws.IL.element?_mem located, Laws.IL.element?_header located,
          (Laws.Step.start?_bare started).2, .inr (by rw [started]; rfl)⟩
      unfold Feature.Subscriptions.fireEventStart at ran
      dsimp only at ran
      split at ran
      · cases ran
      · obtain ⟨⟨admitted, values⟩, admission, ran⟩ := ok_bind ran
        cases admitFiring_state admission
        dsimp only at ran
        split at ran
        · cases ran
          exact ops.insideBegin _ _ _ _ holds member start
        · rcases afterFiring_cases state item with same | same | ⟨detail, same⟩ <;> rw [same] at ran <;> cases ran
          · exact ops.bareBegin _ _ _ _ holds member
          · exact ops.closeBegin _ _ _ _ holds member start
          · exact ops.reopenBegin _ _ _ _ _ holds member start reservable
    · cases ran

/-- Only a Cancel trigger catches a raised Cancel (`Feature.Subscriptions.catches`). -/
theorem catches_cancel {trigger : Trigger} (caught : (Feature.Subscriptions.catches .cancel trigger).isSome = true) :
    trigger = .cancel := by
  unfold Feature.Subscriptions.catches at caught
  split at caught <;> simp_all [Feature.Subscriptions.errorFacts?, Feature.Subscriptions.escalationCode?]

end Kernel.Laws.Subscriptions
