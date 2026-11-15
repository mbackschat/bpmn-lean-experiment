module

public import Kernel.Hooks
public import Kernel.Laws.State.Invariant
public import Kernel.Laws.Hooks
public import Kernel.Laws.Step.Contract
public import Kernel.Laws.Subscriptions.Timers
public import Kernel.Feature.Subscriptions
import all Kernel.Feature.Subscriptions
public import Kernel.Feature.Subscriptions.Conditions
import all Kernel.Feature.Subscriptions.Conditions
public import Kernel.Feature.Subscriptions.Delivery
import all Kernel.Feature.Subscriptions.Delivery

/-! # Laws of subscriptions

The rules of the [subscriptions semantics](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) over open items,
independent of `Kernel.Feature.Subscriptions`' code: a waiting item belongs to exactly one live occurrence and goes with
its scope occurrence and its host; a Message receiver is keyed by its channel, a Signal receiver by an equal address of
the same kind, a Conditional item by the subtree of the scope that wrote; and an Event-Based Gateway's first firing arm
wins, disarming the others.

An item's channel, address and Conditional detail are read through `OpenKind.view`, a total projection of one open item's
kind whose result the `State` contract documents, since matching `OpenKind` is that projection's alone. Its body is not
exposed, so a witness about a kind states what the kind's view reads as a hypothesis. Nothing executable imports this
module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it. The Timer lexeme laws, which read no state, are
`Kernel.Laws.Subscriptions.Timers`'.
-/

@[expose] public section

namespace Kernel.Laws.Subscriptions

open Kernel
open Kernel.Laws.State (Within scopeIds occurrenceIds AwaitsTrigger)

/-! ## Ownership and withdrawal -/

/-- Every open item waits for exactly one present occurrence. -/
def ItemsOwned (s : State) : Prop :=
  ∀ item ∈ s.openItems, ∃ occurrence ∈ s.occurrences, occurrence.id = item.occurrence ∧
    ∀ other ∈ s.occurrences, other.id = item.occurrence → other = occurrence

/-- A subscription goes with what it belongs to: no item survives the removal of its scope occurrence, and no
subscription the removal of the host it hangs on (`ABTIMER-COMPLETE-01`, `ABMSG-COMPLETE-01`; a passive Event
Sub-Process start goes when its scope completes). -/
structure Withdraws (before after : State) : Prop where
  withScope : ∀ scope ∈ scopeIds before, scope ∉ scopeIds after → ∀ item ∈ after.openItems, item.scope ≠ scope
  withHost : ∀ host ∈ occurrenceIds before, host ∉ occurrenceIds after → ∀ item ∈ after.openItems,
    item.attachedTo ≠ some host

/-! ## Keys -/

/-- A Message delivery or publication on `channel` reaches only open items subscribed on that channel. -/
def MessageReceivers (s : State) (channel : MessageChannel) (receivers : List OpenItem) : Prop :=
  ∀ receiver ∈ receivers, receiver ∈ s.openItems ∧ receiver.kind.view.channel = some channel

/-- A Signal delivery, throw or intent on `address` reaches only items on an equal address of the same kind, so a name
never reaches a QName subscription. -/
def SignalReceivers (s : State) (address : SignalAddress) (receivers : List OpenItem) : Prop :=
  ∀ receiver ∈ receivers, receiver ∈ s.openItems ∧ ∃ detail, receiver.kind.view.signal = some detail ∧
    detail.address = address

/-- A write in `owner` is offered only to the open Conditional items in the subtree of `owner`. -/
def ConditionalReceivers (s : State) (owner : ScopeOccurrenceId) (receivers : List OpenItem) : Prop :=
  ∀ receiver ∈ receivers, receiver ∈ s.openItems ∧ receiver.kind.view.conditional.isSome = true ∧
    Within s receiver.scope owner

/-! ## Event-Based Gateway -/

/-- The first firing arm of the Event-Based Gateway occurrence `gateway` wins: it was armed on the gateway; afterwards
no arm of the gateway is open, every losing arm's reservation is gone, so a late stimulus for it finds nothing, and the
gateway's occurrence has completed (§13.4.4, Table 13.4 Deferred Choice). -/
structure ArmWins (before after : State) (gateway : Nat) (winner : OpenItem) : Prop where
  armed : winner ∈ before.openItems ∧ winner.attachedTo = some gateway
  disarmed : ∀ item ∈ after.openItems, item.attachedTo ≠ some gateway
  losersGone : ∀ loser ∈ before.openItems, loser.attachedTo = some gateway → loser.id ≠ winner.id →
    loser.occurrence ∉ occurrenceIds after
  completed : gateway ∉ occurrenceIds after

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

/-! ## Non-vacuity

A root scope 0 with a Sub-Process scope occurrence 1; an Event-Based Gateway occurrence 2 in the root with arms 3 and 4
(items 5 and 6); a task occurrence 7 in scope 1 with its item 8. The open-item kinds are parameters. -/

def root : ScopeOccurrenceId := ⟨0⟩
def sub : ScopeOccurrenceId := ⟨1⟩

def gatewayOccurrence : Occurrence := { id := 2, element := ⟨"Choice"⟩, scope := root, activation := 1 }
def armMessage : Occurrence := { id := 3, element := ⟨"Paid"⟩, scope := root, activation := 1, begun := false }
def armTimer : Occurrence := { id := 4, element := ⟨"Late"⟩, scope := root, activation := 1, begun := false }
def task : Occurrence := { id := 7, element := ⟨"Work"⟩, scope := sub, activation := 1 }

def paidItem (kind : OpenKind) : OpenItem :=
  { id := 5, kind, element := ⟨"Paid"⟩, scope := root, occurrence := 3, attachedTo := some 2 }
def lateItem (kind : OpenKind) : OpenItem :=
  { id := 6, kind, element := ⟨"Late"⟩, scope := root, occurrence := 4, attachedTo := some 2 }
def workItem (kind : OpenKind) : OpenItem := { id := 8, kind, element := ⟨"Work"⟩, scope := sub, occurrence := 7 }

def rootScope : ScopeOccurrence := { id := root, element := none, parent := none }
def subScope : ScopeOccurrence := { id := sub, element := some ⟨"Sub"⟩, parent := some root }

def choosing (kind : OpenKind) : State :=
  { instanceId := "p", scopes := [rootScope, subScope], occurrences := [gatewayOccurrence, armMessage, armTimer, task]
    openItems := [paidItem kind, lateItem kind, workItem kind] }

/-- `Paid` fired: the gateway, both arms and their items are gone; the begun winner has left too. -/
def chosen (kind : OpenKind) : State := { choosing kind with occurrences := [task], openItems := [workItem kind] }

theorem items_owned (kind : OpenKind) : ItemsOwned (choosing kind) := by
  intro item member
  simp only [choosing, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl
  · exact ⟨armMessage, by simp [choosing], rfl, by simp [choosing, gatewayOccurrence, armMessage, armTimer, task, paidItem]⟩
  · exact ⟨armTimer, by simp [choosing], rfl, by simp [choosing, gatewayOccurrence, armMessage, armTimer, task, lateItem]⟩
  · exact ⟨task, by simp [choosing], rfl, by simp [choosing, gatewayOccurrence, armMessage, armTimer, task, workItem]⟩

/-- An item whose occurrence was removed belongs to none. -/
theorem orphan_rejected (kind : OpenKind) : ¬ ItemsOwned { choosing kind with occurrences := [gatewayOccurrence] } :=
  fun owned => by
    obtain ⟨occurrence, member, same, _⟩ := owned (workItem kind) (by simp [choosing])
    simp only [List.mem_singleton] at member
    subst member
    simp [gatewayOccurrence, workItem] at same

theorem choice_withdraws (kind : OpenKind) : Withdraws (choosing kind) (chosen kind) where
  withScope := by simp [scopeIds, choosing, chosen]
  withHost := by
    intro host _ gone item member
    simp only [chosen, List.mem_singleton] at member
    subst member
    simp [workItem]

/-- Clearing scope 1 but keeping its task's item leaves an item without its scope. -/
theorem kept_item_rejected (kind : OpenKind) :
    ¬ Withdraws (choosing kind) { choosing kind with scopes := [rootScope] } := fun withdraws => by
  have := withdraws.withScope sub (by simp [scopeIds, choosing, rootScope, subScope]) (by simp [scopeIds, rootScope, root, sub])
    (workItem kind) (by simp [choosing])
  simp [workItem] at this

theorem message_keyed (kind : OpenKind) (channel : MessageChannel) (view : kind.view.channel = some channel) :
    MessageReceivers (choosing kind) channel [workItem kind] := by
  simpa [MessageReceivers, choosing, workItem] using view

/-- A receiver subscribed on another channel is not reached. -/
theorem other_channel_rejected (kind : OpenKind) (channel other : MessageChannel) (view : kind.view.channel = some other)
    (distinct : other ≠ channel) : ¬ MessageReceivers (choosing kind) channel [workItem kind] := fun receivers => by
  have := (receivers (workItem kind) (by simp)).2
  simp [workItem, view] at this
  exact distinct this

theorem signal_keyed (kind : OpenKind) (detail : SignalWaitDetail) (view : kind.view.signal = some detail) :
    SignalReceivers (choosing kind) detail.address [workItem kind] := by
  simp only [SignalReceivers, List.mem_singleton, forall_eq]
  exact ⟨by simp [choosing], detail, by simpa [workItem] using view, rfl⟩

/-- A name never reaches a QName subscription. -/
theorem name_for_qname_rejected (kind : OpenKind) (ref : QName) (view : kind.view.signal = some { address := .qualified ref }) :
    ¬ SignalReceivers (choosing kind) (.named "Paid") [workItem kind] := fun receivers => by
  obtain ⟨_, detail, read, same⟩ := receivers (workItem kind) (by simp)
  simp [workItem, view] at read
  subst read
  simp at same

theorem conditional_in_subtree (kind : OpenKind) (view : kind.view.conditional.isSome = true) :
    ConditionalReceivers (choosing kind) root [workItem kind] := by
  simp only [ConditionalReceivers, List.mem_singleton, forall_eq]
  exact ⟨by simp [choosing], by simpa [workItem] using view, .parent subScope root root (by simp [choosing]) rfl (.refl _)⟩

/-- A write in scope 1 is never offered to an item of its parent. -/
theorem conditional_outside_rejected (kind : OpenKind) :
    ¬ ConditionalReceivers (choosing kind) sub [paidItem kind] := fun receivers => by
  have within : Within (choosing kind) root sub := (receivers (paidItem kind) (by simp)).2.2
  have := Within.parentless (by simp [choosing, rootScope, subScope, root, sub]) within
  simp [root, sub] at this

theorem first_arm_wins (kind : OpenKind) : ArmWins (choosing kind) (chosen kind) 2 (paidItem kind) where
  armed := ⟨by simp [choosing], rfl⟩
  disarmed := by simp [chosen, workItem]
  losersGone := by simp [occurrenceIds, chosen, task, choosing, paidItem, lateItem, workItem]
  completed := by simp [occurrenceIds, chosen, task]

/-- A losing arm still armed after the winner fired is no Deferred Choice. -/
theorem loser_armed_rejected (kind : OpenKind) :
    ¬ ArmWins (choosing kind) { chosen kind with occurrences := [task, armTimer], openItems := [lateItem kind, workItem kind] }
      2 (paidItem kind) := fun wins => by
  have := wins.disarmed (lateItem kind) (by simp)
  simp [lateItem] at this

/-! ## Simultaneous truth

Conditional items true at one evaluation (one arming, or one offered write) compete when firing one withdraws the
other: an interrupting boundary everything inside its host, the host's other boundaries included, an Event-Based arm its
gateway's other arms, an interrupting Event Sub-Process start everything inside its scope. A contest is a connected set
of competing items. BPMN orders no simultaneous triggers (§13.4.4) and arming order is no choice the kernel may take
(FLOW-SPEC, Deferred choice), so a contest fires as the input's ranking says (SUBSCRIPTIONS-SPEC "Conditions",
CIB-LIM-0053), and is `unsupported` where the ranking leaves it undecided, never committed by a kernel default. -/

/-- Where a contest member stands in the walk: a member whose withdrawing firing an earlier write of the micro-step
enqueued (`pending`) first, then by the first ranking entry naming its element. -/
def walkRank {κ : Type} [BEq κ] (element : OpenItem → κ) (pending : List OpenItem) (ranking : List κ) (item : OpenItem) :
    Nat :=
  if pending.any (·.id == item.id) then 0 else ranking.idxOf (element item) + 1

/-- A firing sequence one contest may commit: `members` are its items, `withdraws a b` says firing `a` withdraws `b`,
`pending` are the firings with withdrawal earlier writes of the micro-step enqueued, `ranking` is the input's elements
and `element` an item's public identity, of any type `κ` with an equality (`ElementId` in the kernel). Only pending or
listed members fire, in walk order, none after a firing that withdrew it, each member fired or withdrawn, and every
pending or listed member that no firing ranked strictly before it withdraws fires. -/
structure Commits {κ : Type} [BEq κ] (element : OpenItem → κ) (withdraws : OpenItem → OpenItem → Bool)
    (pending : List OpenItem) (ranking : List κ) (members firings : List OpenItem) : Prop where
  chosen : firings.all (fun item => pending.any (·.id == item.id) || ranking.contains (element item)) = true
  ordered : firings.Pairwise fun a b => walkRank element pending ranking a ≤ walkRank element pending ranking b
  live : firings.Pairwise fun a b => withdraws a b = false
  decided : members.all (fun member => firings.any (·.id == member.id) || firings.any (withdraws · member)) = true
  onlyMembers : firings.all (fun item => members.any (·.id == item.id)) = true
  complete : members.all (fun member =>
    !(pending.any (·.id == member.id) || ranking.contains (element member)) || firings.any (·.id == member.id) ||
      firings.any fun earlier =>
        decide (walkRank element pending ranking earlier < walkRank element pending ranking member) &&
          withdraws earlier member) = true

/-- One contest's verdict. No member is one a pending firing withdraws: that firing leaves it nothing to fire, so it
takes part in no contest of the later write. A committed verdict is a sequence the contest `Commits`, which then
determines it; a refusal is `unsupported`, and only where no sequence commits: some member no ranked or pending
firing withdraws is unlisted, or two members one entry names withdraw each other. -/
structure ContestWalk {κ : Type} [BEq κ] (element : OpenItem → κ) (withdraws : OpenItem → OpenItem → Bool)
    (pending : List OpenItem) (ranking : List κ) (members : List OpenItem) (verdict : Except Failure (List OpenItem)) :
    Prop where
  apart : members.all (fun member => !pending.any (withdraws · member)) = true
  commits : ∀ firings, verdict = .ok firings → Commits element withdraws pending ranking members firings
  refused : ∀ failure, verdict = .error failure →
    (∃ code, failure = .unsupported code) ∧ ∀ firings, ¬ Commits element withdraws pending ranking members firings

/-- The ranking, not the order in which the evaluation met the contest's members, decides: `resolve` answers every
order of `members` with the same firing sequence, read as elements. -/
def OrderFree {κ : Type} (element : OpenItem → κ) (resolve : List OpenItem → Except Failure (List OpenItem))
    (members : List OpenItem) : Prop :=
  ∀ evaluated, evaluated.Perm members → (resolve evaluated).map (·.map element) = (resolve members).map (·.map element)

/-- A contest member: a Conditional item of the identity `id` on the element `name`. The witnesses below read an
item's identity as its public element (`key`), which keeps them decidable by evaluation; distinct members carry distinct
elements. -/
def member (id : Nat) (name : String) : OpenItem :=
  { id, kind := .conditional {}, element := ⟨name⟩, scope := ⟨0⟩, occurrence := id + 10 }

def key (item : OpenItem) : Nat := item.id

/-- `level-both-eligible`'s pair: the non-interrupting `Warn_Level` and the interrupting `Stop_Level`, which withdraws it. -/
def warn : OpenItem := member 1 "Warn_Level"
def stop : OpenItem := member 2 "Stop_Level"
def mixed (a b : OpenItem) : Bool := a.id == 2 && b.id == 1

/-- Nested regions: the outer interrupting boundary `BO` withdraws the inner `BI` inside its host, not the reverse. -/
def outer : OpenItem := member 3 "BO"
def inner : OpenItem := member 4 "BI"
def nested (a b : OpenItem) : Bool := a.id == 3 && b.id == 4

/-- A committed verdict whose sequence the contest commits, proved by evaluation. -/
macro "commits_by_decide" : tactic =>
  `(tactic| (intro _ h; cases h; exact ⟨by decide +kernel, by decide +kernel, by decide +kernel, by decide +kernel,
    by decide +kernel, by decide +kernel⟩))

theorem mixed_both_fire : ContestWalk key mixed [] [1, 2] [warn, stop] (.ok [warn, stop]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

theorem mixed_interrupting_first : ContestWalk key mixed [] [2, 1] [warn, stop] (.ok [stop]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

/-- Under `[Warn, Stop]` both fire: the interrupting member alone leaves the listed non-interrupting one, which no
earlier firing withdraws, unfired, and is rejected. -/
theorem mixed_listed_member_skipped_rejected : ¬ ContestWalk key mixed [] [1, 2] [warn, stop] (.ok [stop]) :=
  fun law => by have := (law.commits _ rfl).complete; revert this; decide +kernel

/-- Under `[Warn, Stop]` the contest is decided, so a refusal is rejected. -/
theorem mixed_decided_refusal_rejected :
    ¬ ContestWalk key mixed [] [1, 2] [warn, stop] (.error (.unsupported "conditions-simultaneous")) :=
  fun law => (law.refused _ rfl).2 [warn, stop]
    ⟨by decide +kernel, by decide +kernel, by decide +kernel, by decide +kernel, by decide +kernel, by decide +kernel⟩

theorem mixed_unlisted_refused :
    ContestWalk key mixed [] [1] [warn, stop] (.error (.unsupported "conditions-simultaneous")) where
  apart := by decide +kernel
  commits _ h := by cases h
  refused _ h := by
    cases h
    refine ⟨⟨_, rfl⟩, fun firings commits => ?_⟩
    have fired : (firings.any (·.id == stop.id) || firings.any (mixed · stop)) = true :=
      List.all_eq_true.mp commits.decided stop (by simp)
    have unwithdrawn : firings.any (mixed · stop) = false := by simp [mixed, stop, member]
    rw [unwithdrawn, Bool.or_false, List.any_eq_true] at fired
    obtain ⟨item, mem, isStop⟩ := fired
    have listed := List.all_eq_true.mp commits.chosen item mem
    simp [key, stop, member] at isStop listed
    omega

/-- Firing the listed non-interrupting member and leaving the unlisted interrupting one is rejected. -/
theorem mixed_unlisted_committed_rejected :
    ¬ ContestWalk key mixed [] [1] [warn, stop] (.ok [warn]) :=
  fun law => by have := (law.commits _ rfl).decided; revert this; decide +kernel

/-- An empty ranking that fires the interrupting member by default is rejected. -/
theorem default_winner_rejected : ¬ ContestWalk key mixed [] [] [warn, stop] (.ok [stop]) :=
  fun law => by have := (law.commits _ rfl).chosen; revert this; decide +kernel

/-- A firing after one that withdrew it is rejected. -/
theorem withdrawn_fires_rejected :
    ¬ ContestWalk key mixed [] [2, 1] [warn, stop] (.ok [stop, warn]) :=
  fun law => by have := (law.commits _ rfl).live; revert this; decide +kernel

/-- A pending inner member fires first, and the ranking decides the outer one that withdraws it. -/
theorem pending_fires_first : ContestWalk key nested [inner] [3] [outer, inner] (.ok [inner, outer]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

/-- `pending-pair-*`: the pending `Pair_A`, which the later write does not offer, withdraws `Pair_B` and `Pair_C`,
which withdraw each other. They are no contest of the later write, so a contest of them is rejected whatever its
verdict, the refusal the kernel gave before (CIB-LIM-0053). -/
def pairA : OpenItem := member 7 "Pair_A"
def pairB : OpenItem := member 8 "Pair_B"
def pairC : OpenItem := member 9 "Pair_C"
def pair (a b : OpenItem) : Bool := (a.id == 7 && (b.id == 8 || b.id == 9)) || (a.id == 8 && b.id == 9) || (a.id == 9 && b.id == 8)

theorem pending_non_member_withdraws : ContestWalk key pair [pairA] [] [] (.ok []) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

theorem pending_withdrawn_member_rejected :
    ¬ ContestWalk key pair [pairA] [] [pairB, pairC] (.error (.unsupported "conditions-simultaneous")) :=
  fun law => by have := law.apart; revert this; decide +kernel

theorem nested_outer_chosen : ContestWalk key nested [] [3] [outer, inner] (.ok [outer]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

theorem nested_inner_then_outer : ContestWalk key nested [] [4, 3] [outer, inner] (.ok [inner, outer]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

/-- The outermost-first order the kernel once took, unranked, is rejected. -/
theorem nested_outermost_default_rejected : ¬ ContestWalk key nested [] [] [outer, inner] (.ok [outer]) :=
  fun law => by have := (law.commits _ rfl).chosen; revert this; decide +kernel

/-- Enabled by one activation: a Sub-Process host's interrupting boundary `BO` withdraws the start `SN` of an Event
Sub-Process in the scope the host opened, and the scope's arming evaluates both (`Feature.Subscriptions.enabledWith`). -/
def hostBoundary : OpenItem := member 5 "BO"
def innerStart : OpenItem := member 6 "SN"
def enabledTogether (a b : OpenItem) : Bool := a.id == 5 && b.id == 6

theorem enabled_start_then_boundary :
    ContestWalk key enabledTogether [] [6, 5] [hostBoundary, innerStart] (.ok [innerStart, hostBoundary]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

theorem enabled_boundary_chosen :
    ContestWalk key enabledTogether [] [5] [hostBoundary, innerStart] (.ok [hostBoundary]) where
  apart := by decide +kernel
  commits := by commits_by_decide
  refused _ h := by cases h

/-- The arming order the kernel once took unranked, the host's boundaries before the starts of the scope it opened, is
rejected. -/
theorem enabled_arming_order_rejected :
    ¬ ContestWalk key enabledTogether [] [] [hostBoundary, innerStart] (.ok [hostBoundary]) :=
  fun law => by have := (law.commits _ rfl).chosen; revert this; decide +kernel

/-- A resolver that answers in the order it met the members is not order-free. -/
theorem evaluation_order_rejected : ¬ OrderFree key .ok [warn, stop] :=
  fun law => by have := law [stop, warn] (.swap _ _ []); simp [Except.map, key, warn, stop, member] at this

/-- A resolver that reads only the ranking is order-free. -/
theorem ranking_order_free : OrderFree key (fun _ => .ok [stop]) [warn, stop] :=
  fun _ _ => rfl

/-! ## Message delivery order

A Message catch and a Receive Task check a delivery in one order (`Kernel.Feature.Subscriptions.admitFiring`,
`Kernel.Feature.Work.triggerActivity`; [work semantics](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#receive-tasks)):
the payload's value domain, the channel, the correlation, then the payload against the wait's Data Output, which
requires one when declared (§13.3.3) and accepts none otherwise (account P1). -/

/-- `verdict` is the rejection of the first check a delivery fails, `none` when it passes all four; `declares` says the
wait declares a Data Output, `carries` that the delivery carries a payload. -/
def DeliveryVerdict (inDomain sameChannel correlated declares carries : Bool) (verdict : Option String) : Prop :=
  verdict = if !inDomain then some "value-outside-domain"
    else if !sameChannel then some "message-channel-mismatch"
    else if !correlated then some "message-correlation-mismatch"
    else if declares && !carries then some "message-payload-required"
    else if !declares && carries then some "message-payload-not-accepted"
    else none

/-- A payload-free delivery on another channel to a wait with a Data Output answers its channel first. -/
theorem channel_before_payload : DeliveryVerdict true false true true false (some "message-channel-mismatch") := by
  unfold DeliveryVerdict; decide +kernel

/-- Answering the payload before the channel is rejected. -/
theorem payload_before_channel_rejected :
    ¬ DeliveryVerdict true false true true false (some "message-payload-required") := by
  unfold DeliveryVerdict; decide +kernel

theorem payload_into_data_output : DeliveryVerdict true true true true true none := by
  unfold DeliveryVerdict; decide +kernel

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
