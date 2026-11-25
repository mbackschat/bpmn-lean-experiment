module

public import Kernel.Proofs.Former.Placed
public import Kernel.Laws.State.Chain

/-! # Proofs: the former lanes, where an element is placed

What the placement lane (`Kernel.Proofs.Former.PlacedLane`) reads of the scope tree: an element is placed where a scope
occurrence lies when it belongs to the process each instance entry of that scope occurrence's instance root records
(`PlacedIn`), and a scope occurrence keeps its instance root while the chain above it stays (`instanceRoot_transport`),
so placement moves with it. A scope occurrence that calls no instance has its parent's root (`instanceRoot_child`).
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds InstanceIn)

/-- `element` belongs to the process the instance `scope` lies in runs: the definition every instance entry of its
instance root records. -/
def PlacedIn (program : Program) (s : State) (element : ElementId) (scope : ScopeOccurrenceId) : Prop :=
  ∀ entry ∈ s.slots.instances, entry.root = s.instanceRoot scope → definitionAt program element = entry.definition

/-- Placement moves to a state whose instance entries are among the state's, where the scope occurrence keeps its root. -/
theorem PlacedIn.transport {program : Program} {s t : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (placed : PlacedIn program s element scope) (instances : ∀ entry ∈ t.slots.instances, entry ∈ s.slots.instances)
    (root : t.instanceRoot scope = s.instanceRoot scope) : PlacedIn program t element scope :=
  fun entry member same => placed entry (instances entry member) (same.trans root)

/-- An element of the same process as a placed one is placed where it is. -/
theorem PlacedIn.alike {program : Program} {s : State} {element other : ElementId} {scope : ScopeOccurrenceId}
    (placed : PlacedIn program s element scope) (same : definitionAt program other = definitionAt program element) :
    PlacedIn program s other scope :=
  fun entry member root => same.trans (placed entry member root)

/-- Placement where one scope occurrence lies is placement where another of the same instance root lies. -/
theorem PlacedIn.rooted {program : Program} {s : State} {element : ElementId} {scope other : ScopeOccurrenceId}
    (placed : PlacedIn program s element scope) (root : s.instanceRoot other = s.instanceRoot scope) :
    PlacedIn program s element other :=
  fun entry member same => placed entry member (same.trans root)

/-! ## Instance roots through a chain -/

/-- The root an instance chain ends at: its last record when that one calls an instance, else the process root. -/
def chainRoot (chain : List ScopeOccurrence) : ScopeOccurrenceId :=
  match chain.getLast? with
  | some last => if last.calledInstance.isSome then last.id else State.root
  | none => State.root

/-- A chain is never empty. -/
theorem chain_ne_nil {s : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) : chain ≠ [] := by
  cases reading <;> simp

/-- A record below a chain ends where the chain does. -/
theorem chainRoot_cons {s : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) (entry : ScopeOccurrence) : chainRoot (entry :: chain) = chainRoot chain := by
  obtain ⟨last, rest, rfl⟩ : ∃ last rest, chain = last :: rest := by
    cases chain with
    | nil => exact absurd rfl (chain_ne_nil reading)
    | cons last rest => exact ⟨last, rest, rfl⟩
  simp only [chainRoot, List.getLast?_cons_cons]

/-- An instance chain is at most one record longer than the key it starts at has segments: each record but the last
lies directly in the next. -/
theorem chain_length_le {s : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) : chain.length ≤ x.segments.length + 1 := by
  induction reading with
  | called => simp
  | root => simp
  | up entry parent _ chain _ _ link _ ih =>
    obtain ⟨_, keyed⟩ := Laws.State.ScopeOccurrenceId.parent?_eq_some.mp
      (by simpa only [Laws.State.ScopeOccurrence.parent_eq] using link)
    simp only [List.length_cons, keyed]
    omega

/-- `State.instanceRoot` of any state holding a chain, with distinct scope identifiers, is where the chain ends: the
search follows the chain's records, since a search by an identifier finds its own record. -/
theorem instanceRoot_chain {s : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) {u : State} (nodup : (scopeIds u).Nodup)
    (held : ∀ entry ∈ chain, entry ∈ u.scopes) : u.instanceRoot x = chainRoot chain := by
  obtain ⟨go, start, _, step⟩ := Laws.State.instanceRoot_go u
  have bound := chain_length_le reading
  have uncalled : ∀ entry ∈ u.scopes, entry.calledInstance = none → u.calledRoot entry.id = false := by
    intro entry member called
    cases found : u.calledRoot entry.id with
    | false => rfl
    | true =>
      obtain ⟨other, inside, named, isCalled⟩ := (Laws.State.calledRoot_iff nodup _).mp found
      obtain rfl := Laws.State.nodup_map_eq nodup inside member named
      simp [called] at isCalled
  rw [start]
  clear start
  suffices walk : ∀ fuel, chain.length ≤ fuel → (∀ entry ∈ chain, entry ∈ u.scopes) → go fuel x = chainRoot chain from
    walk _ bound held
  clear bound held
  induction reading with
  | called entry name member called =>
    intro fuel enough held
    obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
    have isCalled : u.calledRoot entry.id = true :=
      (Laws.State.calledRoot_iff nodup _).mpr ⟨entry, held entry (by simp), rfl, by simp [called]⟩
    rw [step]
    simp only [isCalled, ↓reduceIte]
    simp [chainRoot, called]
  | up entry parent name chain member called link reading ih =>
    intro fuel enough held
    obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
    have present := held entry (by simp)
    rw [step, uncalled entry present called, Laws.State.parent_found nodup present, link, chainRoot_cons reading]
    simp only [Bool.false_eq_true, ↓reduceIte, Option.elim]
    exact ih fuel (by simp at enough; omega) fun other inside => held other (by simp [inside])
  | root entry member called orphan =>
    intro fuel enough held
    obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
    have present := held entry (by simp)
    rw [step, uncalled entry present called, Laws.State.parent_found nodup present, orphan]
    simp [chainRoot, called]

/-- A present scope occurrence of a well-formed state has its root in every state with distinct scope identifiers that
holds the scope occurrences it lies within. -/
theorem instanceRoot_transport {program : Program} {s u : State} (formed : WellFormed program s)
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) (nodup : (scopeIds u).Nodup)
    (above : ∀ entry ∈ s.scopes, Within s x entry.id → entry ∈ u.scopes) : u.instanceRoot x = s.instanceRoot x := by
  obtain ⟨name, chain, reading, rest⟩ := Laws.State.instanceIn_exists formed present
  obtain ⟨-, within⟩ := rest
  rw [instanceRoot_chain reading nodup fun entry inside => above entry (reading.mem entry inside)
      (within entry inside), instanceRoot_chain reading formed.distinct.scopes reading.mem]

/-- A scope occurrence of a well-formed state keeps its root in a state that holds all of its scope occurrences. -/
theorem instanceRoot_wider {program : Program} {s u : State} (formed : WellFormed program s) {x : ScopeOccurrenceId}
    (present : x ∈ scopeIds s) (nodup : (scopeIds u).Nodup) (scopes : ∀ entry ∈ s.scopes, entry ∈ u.scopes) :
    u.instanceRoot x = s.instanceRoot x :=
  instanceRoot_transport formed present nodup fun entry member _ => scopes entry member

/-- A scope occurrence that calls no instance has its parent's root. -/
theorem instanceRoot_child {program : Program} {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence}
    (member : entry ∈ s.scopes) (called : entry.calledInstance = none) {parent : ScopeOccurrenceId}
    (link : entry.parent = some parent) : s.instanceRoot entry.id = s.instanceRoot parent := by
  have up := formed.rooted.2.2 entry member
  have other : entry.id ≠ State.root := fun same => by
    rw [(formed.rooted.2.1 entry member).mpr same] at link; cases link
  have present : parent ∈ scopeIds s :=
    Laws.State.Within.present (Laws.State.Within.through formed.distinct.scopes member link up other) formed.rooted.1
  obtain ⟨name, chain, reading, rest⟩ := Laws.State.instanceIn_exists formed present
  obtain ⟨distinct, within⟩ := rest
  have fresh : entry.id ∉ chain.map (·.id) := fun inside => by
    obtain ⟨found, inChain, named⟩ := List.mem_map.mp inside
    exact Laws.State.parent_not_within formed member link (named ▸ within found inChain)
  have reading' := InstanceIn.up entry parent name chain member called link reading
  rw [instanceRoot_chain reading' formed.distinct.scopes reading'.mem,
    instanceRoot_chain reading formed.distinct.scopes reading.mem, chainRoot_cons reading]

/-- The instance root reads only the scope occurrences. -/
theorem instanceRoot_congr {s t : State} (scopes : t.scopes = s.scopes) (x : ScopeOccurrenceId) :
    t.instanceRoot x = s.instanceRoot x := by
  obtain ⟨goT, startT, zeroT, stepT⟩ := Laws.State.instanceRoot_go t
  obtain ⟨goS, startS, zeroS, stepS⟩ := Laws.State.instanceRoot_go s
  have called : ∀ y, t.calledRoot y = s.calledRoot y := fun y => by
    rw [Laws.State.calledRoot_eq, Laws.State.calledRoot_eq, scopes]
  have same : ∀ fuel, goT fuel = goS fuel := by
    intro fuel
    induction fuel with
    | zero => funext y; rw [zeroT, zeroS]
    | succ fuel ih => funext y; rw [stepT, stepS, called, scopes, ih]
  rw [startT, startS, same]

/-- Placement moves to a state with the same scope occurrences whose instance entries are among the state's. -/
theorem PlacedIn.same {program : Program} {s t : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (placed : PlacedIn program s element scope) (scopes : t.scopes = s.scopes)
    (instances : ∀ entry ∈ t.slots.instances, entry ∈ s.slots.instances) : PlacedIn program t element scope :=
  placed.transport instances (instanceRoot_congr scopes scope)

end Kernel.Proofs.Former
