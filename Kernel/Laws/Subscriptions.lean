module

public import Kernel.Hooks
public import Kernel.Laws.State
public import Kernel.IL.Timer
import all Kernel.Feature.Subscriptions

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
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Subscriptions

open Kernel
open Kernel.Laws.State (Within scopeIds occurrenceIds)

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

Items of which only one may fire (the arms of one Event-Based Gateway, the interrupting boundaries of one host, the
interrupting Event Sub-Process starts of one scope) that become true at one evaluation have no winner: BPMN orders no
simultaneous triggers (§13.4.4) and arming order is no choice the kernel may take (FLOW-SPEC), so the input is
`unsupported`, never committed with one of them. -/

/-- At most one of `fired`, the items one evaluation fired, wins: two distinct ones that `compete` make the evaluation's
verdict an `unsupported` refusal. -/
def OneWinner (competes : OpenItem → OpenItem → Prop) (fired : List OpenItem) (verdict : Except Failure Unit) : Prop :=
  (∃ a ∈ fired, ∃ b ∈ fired, a.id ≠ b.id ∧ competes a b) → ∃ code, verdict = .error (.unsupported code)

/-- Two arms of the gateway occurrence 2, the items of `armItem`. -/
def armItem (id : Nat) (kind : OpenKind) : OpenItem :=
  { id, kind, element := ⟨s!"C{id}"⟩, scope := ⟨0⟩, occurrence := id + 10, attachedTo := some 2 }

def sameGateway (a b : OpenItem) : Prop := a.attachedTo = b.attachedTo

theorem two_arms_refused (kind : OpenKind) :
    OneWinner sameGateway [armItem 1 kind, armItem 2 kind] (.error (.unsupported "gateway-arms-simultaneous")) :=
  fun _ => ⟨_, rfl⟩

theorem one_arm_commits (kind : OpenKind) : OneWinner sameGateway [armItem 1 kind] (.ok ()) := by
  rintro ⟨a, ha, rest⟩
  obtain ⟨b, hb, distinct, _⟩ := rest
  simp only [List.mem_singleton] at ha hb
  subst ha hb
  exact absurd rfl distinct

/-- Two competing arms committed with one of them is rejected. -/
theorem two_arms_committed_rejected (kind : OpenKind) : ¬ OneWinner sameGateway [armItem 1 kind, armItem 2 kind] (.ok ()) :=
  fun law => by
    have second : ∃ b ∈ [armItem 1 kind, armItem 2 kind], (armItem 1 kind).id ≠ b.id ∧ sameGateway (armItem 1 kind) b :=
      ⟨armItem 2 kind, by simp, by simp [armItem], rfl⟩
    obtain ⟨_, refused⟩ := law ⟨armItem 1 kind, by simp, second⟩
    cases refused

/-! ## Timer lexemes

A lexeme is malformed only where CIB's parser certainly fails, and outside wherever that is uncertain (I-T1;
[subscriptions semantics](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#timers)). -/

/-- A `/` duration whose first two parts start with `P` is malformed: CIB reads the second as the interval's end, a
date, which Joda's ISO parser cannot read. -/
def PeriodEndedInterval (parts : List (List Char)) (verdict : Timer.Classified) : Prop :=
  ∀ first second rest, parts = ('P' :: first) :: ('P' :: second) :: rest → verdict = .malformed .duration

/-- `PT<digits>.<fraction>S` with digits on one side of the point only is outside, never malformed: the JDK's
`BigDecimal` reads it, so CIB commits it. -/
def LooseSeconds (chars : List Char) (verdict : Timer.Classified) : Prop :=
  ∀ digits fraction, chars = ['P', 'T'] ++ digits ++ '.' :: fraction ++ ['S'] → (∀ c ∈ digits ++ fraction, c.isDigit) →
    (digits = [] ∨ fraction = []) → digits ++ fraction ≠ [] → verdict = .outside .duration

/-- A Cron seconds field that breaks a rule retained evidence certifies there: `?`, a letter, more than one `/`, a step
of 0, or a range without its end. -/
def CertifiedSecondsRule (field : List Char) : Prop :=
  field = ['?'] ∨ (∃ c ∈ field, c.isAlpha) ∨ (∃ a b c, field = a ++ '/' :: b ++ '/' :: c ∧ ∃ x ∈ c, x ≠ '/') ∨
    (∃ start zeros, field = start ++ '/' :: zeros ∧ '/' ∉ start ∧ zeros ≠ [] ∧ ∀ x ∈ zeros, x = '0') ∨
    (∃ before digits after, field = before ++ digits ++ '-' :: after ∧ digits ≠ [] ∧ (∀ x ∈ digits, x.isDigit) ∧
      (before = [] ∨ before.getLast? = some ',') ∧ (after = [] ∨ after.head? = some ','))

/-- A six-field Cron whose seconds field breaks a certified rule is malformed. The same text in another field is not
claimed malformed by this rule. -/
def CronSecondsVerdict (fields : List (List Char)) (verdict : Timer.Classified) : Prop :=
  ∀ seconds rest, fields = seconds :: rest → rest.length = 5 → CertifiedSecondsRule seconds → verdict = .malformed .cron

theorem interval_malformed : PeriodEndedInterval [['P', 'T', '1', 'H'], ['P', 'T', '2', 'H']] (.malformed .duration) :=
  fun _ _ _ _ => rfl

theorem interval_outside_rejected : ¬ PeriodEndedInterval [['P', 'T', '1', 'H'], ['P', 'T', '2', 'H']] (.outside .duration) :=
  fun law => nomatch law ['T', '1', 'H'] ['T', '2', 'H'] [] rfl

theorem loose_seconds_outside : LooseSeconds ['P', 'T', '1', '.', 'S'] (.outside .duration) :=
  fun _ _ _ _ _ _ => rfl

theorem loose_seconds_malformed_rejected : ¬ LooseSeconds ['P', 'T', '1', '.', 'S'] (.malformed .duration) :=
  fun law => nomatch law ['1'] [] rfl (by decide +kernel) (.inr rfl) (by simp)

theorem cron_letter_malformed :
    CronSecondsVerdict [['5', 'x'], ['*'], ['*'], ['*'], ['*'], ['?']] (.malformed .cron) :=
  fun _ _ _ _ _ => rfl

theorem cron_letter_outside_rejected :
    ¬ CronSecondsVerdict [['5', 'x'], ['*'], ['*'], ['*'], ['*'], ['?']] (.outside .cron) :=
  fun law => nomatch law ['5', 'x'] _ rfl rfl (.inr (.inl ⟨'x', by simp, by decide +kernel⟩))

theorem cron_zero_step_malformed : CertifiedSecondsRule ['*', '/', '0'] :=
  .inr (.inr (.inr (.inl ⟨['*'], ['0'], rfl, by simp, by simp, by simp⟩)))

theorem cron_open_range_malformed : CertifiedSecondsRule ['5', '-'] :=
  .inr (.inr (.inr (.inr ⟨[], ['5'], [], rfl, by simp, by decide +kernel, .inl rfl, .inl rfl⟩)))

end Kernel.Laws.Subscriptions
