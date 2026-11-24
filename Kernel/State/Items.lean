module

public import Kernel.State.Map
public import Kernel.State.Slots

/-! # Open items

The open-item map (KD1): an item's structural key and its order, the item itself, the map keyed by it, and the two
readings of the map, as a set in key order (`itemList`) and in the order the items opened (`itemsInOrder`). Part
of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- The role an open item plays for its occurrence (KD1's item role). -/
inductive ItemRole where
  /-- What a begun occurrence waits on (`State.openItem`). -/
  | wait
  /-- A subscription holding its occurrence's reservation (`State.openSubscription`). -/
  | subscription
  deriving DecidableEq, Repr

/-- The role's place in `ItemKey`'s order. -/
def ItemRole.index : ItemRole → Nat
  | .wait => 0
  | .subscription => 1

/-- An open item's structural key (KD1): the occurrence it waits for or reserves, its role and a per-occurrence
ordinal, issued by `State.itemOrdinals`. -/
structure ItemKey where
  occurrence : OccurrenceId
  role : ItemRole
  ordinal : Issue
  deriving DecidableEq, Repr

/-- The occurrence, then the role, then the issue, oriented (`orientCmp`). -/
instance : Ord ItemKey where
  compare := compareLex (compareOn (·.occurrence)) (orientCmp <| compareLex (compareOn (·.role.index)) (compareOn (·.ordinal))).val

/-- `OpenItems` needs a transitive order; the map's lemmas also need a lawful one. Both stay beside the order they
are about, proved inline, since an executable module holds no theorem (guard 6). -/
instance : Std.TransOrd ItemKey := inferInstanceAs <| Std.TransCmp (compareLex _ (orientCmp (compareLex _ _)).val)

instance : Std.LawfulEqOrd ItemKey where
  eq_of_compare {a b} h := by
    have h : compareLex (compareOn fun key : ItemKey => key.occurrence) (orientCmp <|
        compareLex (compareOn fun key : ItemKey => key.role.index) (compareOn fun key : ItemKey => key.ordinal)).val a b =
        .eq := h
    rw [compareLex_eq_eq] at h
    have rest := ((orientCmp <| compareLex (compareOn fun key : ItemKey => key.role.index)
        (compareOn fun key : ItemKey => key.ordinal)).property a b).mp h.2
    rw [compareLex_eq_eq] at rest
    obtain ⟨occurrence, role, ordinal⟩ := a
    obtain ⟨occurrence', role', ordinal'⟩ := b
    have roles : role.index = role'.index := Std.LawfulEqOrd.eq_of_compare rest.1
    simp only [ItemKey.mk.injEq]
    refine ⟨Std.LawfulEqOrd.eq_of_compare h.1, ?_, Std.LawfulEqOrd.eq_of_compare rest.2⟩
    cases role <;> cases role' <;> simp_all [ItemRole.index]

/-- One open interaction. `id.occurrence` is the occurrence it waits for, or a subscription's reservation; the public
identity is the occurrence's activation of `element`. `attachedTo` is the occurrence the subscription hangs on (the
boundary's host, the Event-Based Gateway of an arm). A `passive` item, such as an Event Sub-Process start
subscription, keeps no scope occurrence alive and is removed when its scope completes. -/
structure OpenItem where
  id : ItemKey
  /-- The order position the item took when it opened (`State.issuePosition`, DC13): pending under the unit that opened it
  until the commit numbers it, which every site that reads the items in order reads (`itemsInOrder`), never the map's key
  order (KD1). -/
  position : Issue
  kind : OpenKind
  element : ElementId
  scope : ScopeOccurrenceId
  attachedTo : Option OccurrenceId := none
  passive : Bool := false
  deriving Repr

/-- The open items, keyed by their structural key; a value's `id` is its key (`State.openItem`,
`State.openSubscription`). -/
abbrev OpenItems := TreeMap ItemKey OpenItem compare

/-- The open items of `items` in key order. -/
def itemList (items : OpenItems) : List OpenItem := items.toList.map (·.2)

/-- The open items of `items` in the order they opened, by `OpenItem.position` under the position order `le`
(`Issue.notAfter`): for every reading that depends on order. -/
def itemsInOrder (le : Issue → Issue → Bool) (items : OpenItems) : List OpenItem :=
  (itemList items).mergeSort fun a b => le a.position b.position

end Kernel
