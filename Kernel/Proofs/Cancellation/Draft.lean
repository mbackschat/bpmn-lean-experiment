module

public import Kernel.Laws.Subscriptions
public import Kernel.Laws.State.Fire
public import Kernel.Laws.State.Removal

/-! # Proofs: the draft and transitions Subscriptions' operations leave

What a micro-step journals is its draft and the transitions of the units that ran (`journalOf`); Subscriptions'
operations keep whatever holds of them, which `Kernel.Proofs.Cancellation.Registered` reads for the registered hooks.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel

/-- What a micro-step journals: its draft and the transitions of the units that ran. -/
abbrev journalOf (s : State) : Draft × TreeMap UnitKey Transition compare := (s.draft, s.transitions)

private theorem signal_journal (s : State) (signal : Signal) : journalOf (s.signal signal) = journalOf s := by
  rw [Laws.State.signal_eq]

private theorem closeItem_journal (s : State) (id : ItemKey) : journalOf (s.closeItem id) = journalOf s := by
  rw [Laws.State.closeItem_eq]

private theorem disarm_journal (s : State) (host : OccurrenceId) : journalOf (s.disarm host) = journalOf s := by
  rw [Laws.State.disarm_eq]

private theorem withdrawInside_journal (s : State) (scope : ScopeOccurrenceId) : journalOf (s.withdrawInside scope) = journalOf s := by
  rw [Laws.State.withdrawInside_eq]

private theorem withdrawOccurrence_journal (s : State) (id : OccurrenceId) : journalOf (s.withdrawOccurrence id) = journalOf s := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]

/-- Opening a subscription keeps the draft: its reservation journals nothing (`Laws.State.Reserves`). -/
private theorem openSubscription_journal (s : State) (kind : OpenKind)
    (element : ElementId) (scope : ScopeOccurrenceId) (host : Option OccurrenceId) (passive : Bool) :
    journalOf (s.openSubscription kind element scope host passive).1 = journalOf s := by
  rw [Laws.State.openSubscription_eq]
  exact Prod.ext (Laws.State.reserve_reserves s element scope).draft
    (Laws.State.reserve_reserves s element scope).transitions

/-- Subscriptions' operations keep whatever holds of the draft and the transitions: they queue firings and completions, open, close,
withdraw and rekind items and disarm hosts, and a subscription reserves its occurrence, which journals nothing. -/
theorem subscriptionsOps_journal (program : Program) (keeps : Draft × TreeMap UnitKey Transition compare → Prop) :
    Laws.Subscriptions.SubscriptionsOps program fun s => keeps (journalOf s) where
  fire s _ _ same := by rw [signal_journal]; exact same
  rekind _ _ same _ _ := same
  awaits := Laws.State.triggers_await
  disarm s host same := by rw [disarm_journal]; exact same
  openItem s kind occurrence same _ _ _ _ := by
    rw [Laws.State.openItem_eq]
    exact same
  openSubscription s kind element scope host passive same _ _ _ _ _ := by
    rw [openSubscription_journal]
    exact same
  subscribed s kind element scope host passive _ := by
    have reserves := Laws.State.reserve_reserves s element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun o inside => reserves.mem_of inside,
      by rw [Laws.State.reserve_slots]⟩
  closeComplete s _ _ _ same _ _ := by rw [signal_journal, closeItem_journal]; exact same
  gatewayComplete s _ _ _ _ same _ _ _ := by rw [signal_journal, signal_journal, disarm_journal, closeItem_journal]; exact same
  interruptComplete s _ _ _ _ same _ _ := by
    rw [signal_journal, signal_journal, withdrawOccurrence_journal, closeItem_journal]
    exact same
  reopenComplete s _ _ _ _ same _ _ _ := by rw [signal_journal, openSubscription_journal, closeItem_journal]; exact same
  occur s _ _ _ _ same _ _ _ _ := by rw [signal_journal]; exact same
  insideBegin s _ _ _ same _ _ _ := by rw [signal_journal, withdrawInside_journal, closeItem_journal]; exact same
  closeBegin s _ _ _ same _ _ _ := by rw [signal_journal, closeItem_journal]; exact same
  reopenBegin s _ _ _ _ same _ _ _ _ := by rw [signal_journal, openSubscription_journal, closeItem_journal]; exact same
  bareBegin s _ _ _ same _ _ := by rw [signal_journal]; exact same

/-- Subscriptions' operations keep whatever holds of the draft. -/
theorem subscriptionsOps_draft (program : Program) (keeps : Draft → Prop) :
    Laws.Subscriptions.SubscriptionsOps program fun s => keeps s.draft :=
  subscriptionsOps_journal program fun journal => keeps journal.1

/-- Subscriptions' operations keep the transitions. -/
theorem subscriptionsOps_transitions (program : Program) (transitions : TreeMap UnitKey Transition compare) :
    Laws.Subscriptions.SubscriptionsOps program fun s => s.transitions = transitions :=
  subscriptionsOps_journal program fun journal => journal.2 = transitions

end Kernel.Proofs.Cancellation
