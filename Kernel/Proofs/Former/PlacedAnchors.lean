module

public import Kernel.Proofs.Former.PlacedLane
public import Kernel.Laws.Step.Elements

/-! # Proofs: the former lanes, where anchors place work

What the placement lane (`Kernel.Proofs.Former.PlacedLane`) gives the anchors the features name. Under
`ReferencesPlaced` a reference (`Laws.Flow.Linked`) keeps an element in its anchor's process (`linked_same`); what a lane
state holds places its anchor where it lies (`anchoredBy_placed`), and so does what a held lane state held
(`anchored_placed`). A path of `Laws.Compensation.InstanceLinked` keeps the instance root (`instanceLinked_root`), so a
record stored where `Laws.Compensation.StoredFrom` says is placed where it is stored (`recordFrom_placed`). Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed scopeIds InstanceIn)
open Kernel.Laws.Compensation (recordElements recordsElements InstanceLinked RecordHeld RecordFrom Uncalled)

/-! ## Instance roots -/

/-- A scope occurrence an `InstanceLinked` edge may leave calls no instance in a lane state. -/
theorem calledApart_uncalled {program : Program} {s : State} (apart : CalledApart program s) {entry : ScopeOccurrence}
    (member : entry ∈ s.scopes) (free : Uncalled program s entry) : entry.calledInstance = none := by
  cases called : entry.calledInstance with
  | none => rfl
  | some name =>
    have split := apart entry member (by simp [called])
    rcases free with none | ⟨element, named, isScope⟩ | ⟨owner, owns, link, isScope⟩
    · rw [called] at none; cases none
    · simp [Option.isNone_iff_eq_none.mp (split.1 element named)] at isScope
    · simp [Option.isNone_iff_eq_none.mp (split.2 owner owns link)] at isScope

/-- An `InstanceLinked` path keeps the instance root in a lane state. -/
theorem instanceLinked_root {program : Program} {s : State} (formed : WellFormed program s)
    (apart : CalledApart program s) {x y : ScopeOccurrenceId} (linked : InstanceLinked program s x y) :
    s.instanceRoot x = s.instanceRoot y := by
  induction linked with
  | refl => rfl
  | parent entry parent member link free => exact instanceRoot_child formed member (calledApart_uncalled apart member free) link
  | owner entry owner member owns link free =>
    exact instanceRoot_child formed member (calledApart_uncalled apart member free)
      (formed.ownedBelow entry member owner owns link)
  | symm _ back => exact back.symm
  | trans _ _ left right => exact left.trans right

/-- A scope occurrence's parent stands. -/
theorem parent_present {program : Program} {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence}
    (member : entry ∈ s.scopes) {parent : ScopeOccurrenceId} (link : entry.parent = some parent) :
    parent ∈ scopeIds s := by
  have up := formed.rooted.2.2 entry member
  have other : entry.id ≠ State.root := fun same => by
    rw [(formed.rooted.2.1 entry member).mpr same] at link; cases link
  exact Laws.State.Within.present (Laws.State.Within.through formed.distinct.scopes member link up other) formed.rooted.1

/-- The ends of an `InstanceLinked` path are one scope occurrence, or both stand. -/
theorem instanceLinked_present {program : Program} {s : State} (formed : WellFormed program s)
    {x y : ScopeOccurrenceId} (linked : InstanceLinked program s x y) : x = y ∨ x ∈ scopeIds s ∧ y ∈ scopeIds s := by
  induction linked with
  | refl => exact .inl rfl
  | parent entry parent member link _ => exact .inr ⟨List.mem_map.mpr ⟨entry, member, rfl⟩, parent_present formed member link⟩
  | owner entry owner member owns _ _ =>
    exact .inr ⟨List.mem_map.mpr ⟨entry, member, rfl⟩, formed.owned.occurrenceScopes owner owns⟩
  | symm _ back => exact back.imp Eq.symm And.symm
  | trans _ _ left right =>
    rcases left with rfl | ⟨here, there⟩ <;> rcases right with rfl | ⟨here', there'⟩
    · exact .inl rfl
    · exact .inr ⟨here', there'⟩
    · exact .inr ⟨here, there⟩
    · exact .inr ⟨here, there'⟩

/-- A called root is its own instance root. -/
theorem instanceRoot_called {program : Program} {s : State} (formed : WellFormed program s) {root : ScopeOccurrence}
    (member : root ∈ s.scopes) {name : String} (called : root.calledInstance = some name) :
    s.instanceRoot root.id = root.id := by
  have reading := InstanceIn.called root name member called
  rw [instanceRoot_chain reading (by simp) formed.distinct.scopes reading.mem]
  simp [chainRoot, called]

/-- The process root is its own instance root. -/
theorem instanceRoot_root {program : Program} {s : State} (formed : WellFormed program s) :
    s.instanceRoot State.root = State.root := by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp formed.rooted.1
  have parentless := (formed.rooted.2.1 entry member).mpr named
  rw [← named]
  cases called : entry.calledInstance with
  | some name => exact instanceRoot_called formed member called
  | none =>
    have reading := InstanceIn.root entry member called parentless
    rw [instanceRoot_chain reading (by simp) formed.distinct.scopes reading.mem]
    simp [chainRoot, called, named]

/-- Two members of a list whose images are pairwise distinct are one when their images are. -/
theorem nodup_map_unique {α β : Type} {f : α → β} :
    ∀ {list : List α}, (list.map f).Nodup → ∀ {a b : α}, a ∈ list → b ∈ list → f a = f b → a = b
  | [], _, _, _, inside, _, _ => absurd inside List.not_mem_nil
  | _ :: rest, nodup, _, _, first, second, same => by
    rw [List.map_cons, List.nodup_cons] at nodup
    rcases List.mem_cons.mp first with rfl | inFirst <;> rcases List.mem_cons.mp second with rfl | inSecond
    · rfl
    · exact absurd (List.mem_map.mpr ⟨_, inSecond, same.symm⟩) nodup.1
    · exact absurd (List.mem_map.mpr ⟨_, inFirst, same⟩) nodup.1
    · exact nodup_map_unique nodup.2 inFirst inSecond same

/-- An element of the process an instance entry of a called root records is placed in that called root. -/
theorem placed_called {program : Program} {s : State} (formed : WellFormed program s) (lane : PlacedLane program s)
    {root : ScopeOccurrence} (member : root ∈ s.scopes) {name : String} (called : root.calledInstance = some name)
    {entry : InstanceData} (inside : entry ∈ s.slots.instances) (rooted : entry.root = root.id) {element : ElementId}
    (same : definitionAt program element = entry.definition) : PlacedIn program s element root.id :=
  fun other otherIn otherRoot => by
    rw [instanceRoot_called formed member called, ← rooted] at otherRoot
    rw [nodup_map_unique lane.rootsApart otherIn inside otherRoot]
    exact same

/-! ## Anchors -/

/-- Every flow an element or boundary lists leaves it under `ReferencesPlaced`. -/
theorem lists_source {program : Program} (refs : ReferencesPlaced program) {anchor : ElementId} {flow : FlowId}
    (lists : Laws.Flow.Lists program anchor flow) : program.source? flow = some anchor := by
  rcases lists with ⟨element, found, listed⟩ | ⟨host, member, envelope, rest⟩
  · refine refs.outgoing anchor element found flow ?_
    rcases listed with out | defaulted | ⟨header, payload, typed, offered⟩
    · exact out
    · obtain ⟨envelope, has, named⟩ := Option.bind_eq_some_iff.mp defaulted
      exact refs.defaults anchor element envelope flow found has named
    · rw [Laws.Step.gateway?_outgoing typed]
      rcases offered with out | ⟨candidates, default, kind, chosen⟩
      · exact out
      · exact refs.candidates anchor element header payload candidates default found typed kind flow chosen
  · obtain ⟨has, boundary, declared, rest⟩ := rest
    obtain ⟨named, out⟩ := rest
    exact named ▸ refs.declared_leaves member has declared flow out

/-- A reference keeps an element in its anchor's process under `ReferencesPlaced`. -/
theorem linked_same {program : Program} (refs : ReferencesPlaced program) {anchor element : ElementId}
    (linked : Laws.Flow.Linked program anchor element) : definitionAt program element = definitionAt program anchor := by
  rcases linked with rfl | ⟨child, inside, named⟩ | ⟨child, inside, named⟩ | ⟨host, envelope, found, rest⟩ |
      ⟨flow, lists, ends⟩ | ⟨found, envelope, located, rest⟩
  · rfl
  · rw [← named]
    exact refs.children anchor child inside
  · rw [← named]
    exact (refs.children element child inside).symm
  · obtain ⟨has, boundary, declared, named⟩ := rest
    rw [← named, refs.declared_placed (Laws.IL.element?_mem found) has declared, Laws.IL.element?_header found]
  · obtain ⟨declared, member, leaves, enters⟩ := Laws.IL.source?_target? (lists_source refs lists) ends
    rw [← enters, ← leaves]
    exact refs.flows declared member
  · obtain ⟨has, handler⟩ := rest
    rw [refs.handlers found (Laws.IL.element?_mem located) envelope has element handler, Laws.IL.element?_header located]

/-- An element a scope occurrence that stands declares (`State.childrenOf`) is placed there. -/
theorem childrenOf_placed {program : Program} {s : State} (refs : ReferencesPlaced program)
    (formed : WellFormed program s) (lane : PlacedLane program s) {scope : ScopeOccurrenceId} {child : Element}
    (inside : child ∈ s.childrenOf program scope) (stands : scope ∈ scopeIds s) :
    PlacedIn program s child.header.id scope := by
  obtain ⟨entry, found⟩ : ∃ entry, s.scopes.find? (·.id == scope) = some entry := by
    obtain ⟨present, member, named⟩ := List.mem_map.mp stands
    exact Option.isSome_iff_exists.mp (List.find?_isSome.mpr ⟨present, member, by simp [named]⟩)
  have member := List.mem_of_find?_eq_some found
  have named : entry.id = scope := by simpa using List.find?_some found
  subst named
  rcases Laws.State.childrenOf_cases inside with ⟨entry', found', called, rest⟩ | ⟨unbound, children⟩
  · rw [found] at found'
    cases found'
    obtain ⟨bound, boundFound, definition, rest⟩ := rest
    obtain ⟨binds, rest⟩ := rest
    obtain ⟨process, processFound, top⟩ := rest
    obtain ⟨name, calledName⟩ := Option.isSome_iff_exists.mp called
    have defined : process.definition = definition := by simpa using List.find?_some processFound
    exact placed_called formed lane member calledName (List.mem_of_find?_eq_some boundFound)
      (by simpa using List.find?_some boundFound)
      (by rw [refs.processChildren process (List.mem_of_find?_eq_some processFound) child top, binds, defined])
  rw [found, Option.bind_some] at children
  rcases elementOf : entry.element with _ | element
  · rw [elementOf] at children
    have rootId := (formed.rooted.2.1 entry member).mp ((lane.rootBare entry member).mp elementOf)
    intro other otherIn rooted
    rw [rootId, instanceRoot_root formed] at rooted
    rw [refs.rootChildren child children]
    exact ((lane.rootDefinition other otherIn).mp rooted).symm
  rw [elementOf] at children
  refine PlacedIn.alike ?_ (refs.children element child children)
  rcases parentOf : entry.parent with _ | parent
  · rw [(lane.rootBare entry member).mpr parentOf] at elementOf
    cases elementOf
  rcases calledOf : entry.calledInstance with _ | name
  · exact (lane.scopes entry member element parent elementOf parentOf).rooted
      (instanceRoot_child formed member calledOf parentOf)
  obtain ⟨recorded, recordedIn, rooted⟩ := lane.placed.entered entry member (by simp [calledOf])
  obtain ⟨bound, boundFound⟩ : ∃ bound, s.slots.instances.find? (·.root == entry.id) = some bound :=
    Option.isSome_iff_exists.mp (List.find?_isSome.mpr ⟨recorded, recordedIn, by simp [rooted]⟩)
  have notRoot : bound.root ≠ State.root := fun same => by
    have : entry.id = State.root := by
      have := List.find?_some boundFound
      simp at this
      rw [← this, same]
    rw [(formed.rooted.2.1 entry member).mpr this] at parentOf
    cases parentOf
  have none := unbound entry found (by simp [calledOf]) bound boundFound
  exact absurd ((lane.rootDefinition bound (List.mem_of_find?_eq_some boundFound)).mpr none) notRoot

/-- An element at the top level of the process a called root runs (`Laws.Flow.CalledAnchor`) is placed there. -/
theorem calledAnchor_placed {program : Program} {s : State} (refs : ReferencesPlaced program)
    (formed : WellFormed program s) (lane : PlacedLane program s) {anchor : ElementId} {scope : ScopeOccurrenceId}
    (called : Laws.Flow.CalledAnchor program s anchor scope) : PlacedIn program s anchor scope := by
  obtain ⟨rootFacts, entry, inside, rest⟩ := called
  obtain ⟨root, member, named, isCalled⟩ := rootFacts
  obtain ⟨rooted, process, processMem, rest⟩ := rest
  obtain ⟨binds, child, top, childNamed⟩ := rest
  obtain ⟨name, calledName⟩ := Option.isSome_iff_exists.mp isCalled
  rw [← named]
  exact placed_called formed lane member calledName inside (rooted.trans named.symm)
    (by rw [← childNamed, refs.processChildren process processMem child top, binds])

/-- A record's subject and handler are among the elements it names. -/
theorem subject_mem (record : Compensable) : record.subject ∈ recordElements record := by
  rw [Laws.Compensation.recordElements_eq]
  exact List.mem_cons_self ..

theorem handler_mem {record : Compensable} {handler : ElementId} (named : record.handler = some handler) :
    handler ∈ recordElements record := by
  rw [Laws.Compensation.recordElements_eq, named]
  simp

/-- What a lane state holds places its anchor where it lies (`Laws.Flow.AnchoredBy`). -/
theorem anchoredBy_placed {program : Program} {s : State} (refs : ReferencesPlaced program)
    (formed : WellFormed program s) (lane : PlacedLane program s) {anchor : ElementId} {scope : ScopeOccurrenceId}
    (anchored : Laws.Flow.AnchoredBy program s anchor scope) (stands : scope ∈ scopeIds s) :
    PlacedIn program s anchor scope := by
  rcases anchored with ⟨occurrence, member, rfl, rfl⟩ | ⟨entry, member, named, link⟩ | ⟨child, inside, rfl⟩ | called |
      ⟨run, member, rfl, rfl⟩ | ⟨run, member, rfl, rest⟩
  · exact lane.placed.occurrences occurrence member
  · rcases link with link | ⟨rfl, free⟩
    · exact lane.scopes entry member anchor scope named link
    rcases parentOf : entry.parent with _ | parent
    · rw [(lane.rootBare entry member).mpr parentOf] at named
      cases named
    exact (lane.scopes entry member anchor parent named parentOf).rooted (instanceRoot_child formed member free parentOf)
  · exact childrenOf_placed refs formed lane inside stands
  · exact calledAnchor_placed refs formed lane called
  · exact lane.runs run member stands
  · obtain ⟨record, pending, names⟩ := rest
    refine lane.pending run member stands record pending anchor ?_
    rcases names with rfl | named
    · exact subject_mem record
    · exact handler_mem named

/-- Work anchored where a scope occurrence that stands lies, read under the lane (`Laws.Flow.Anchored`), is placed
there. -/
theorem anchored_placed {program : Program} {s : State} (refs : ReferencesPlaced program)
    (formed : WellFormed program s) (lane : PlacedLane program s) {element : ElementId} {scope : ScopeOccurrenceId}
    (anchored : Laws.Flow.Anchored (fun t => WellFormed program t ∧ PlacedLane program t) program s element scope)
    (stands : scope ∈ scopeIds s) : PlacedIn program s element scope := by
  obtain ⟨anchor, linked, source⟩ := anchored
  refine PlacedIn.alike ?_ (linked_same refs linked)
  rcases source with here | ⟨held, holds, rest⟩
  · exact anchoredBy_placed refs formed lane here stands
  obtain ⟨scopes, instances, there⟩ := rest
  have present : scope ∈ scopeIds held := by
    obtain ⟨entry, member, named⟩ := List.mem_map.mp stands
    exact List.mem_map.mpr ⟨entry, scopes entry member, named⟩
  have placed : PlacedIn program held anchor scope := by
    rcases there with by_ | ⟨host, armed⟩ | ⟨occurrence, armed⟩ | ⟨raised, origin, queued, rest⟩
    · exact anchoredBy_placed refs holds.1 holds.2 by_ present
    · exact holds.2.arms host anchor scope armed present
    · exact holds.2.gateways occurrence anchor scope armed present
    · obtain ⟨rfl, rfl⟩ := rest
      exact holds.2.raises raised origin queued present
  exact placed.transport instances (instanceRoot_wider formed stands holds.1.distinct.scopes scopes).symm

/-! ## Stored records -/

/-- A record a lane state holds where `Laws.Compensation.RecordHeld` says is placed where it is linked to. -/
theorem recordHeld_placed {program : Program} {s : State} (formed : WellFormed program s) (lane : PlacedLane program s)
    {record : Compensable} {scope : ScopeOccurrenceId} (held : RecordHeld program s record scope)
    (stands : scope ∈ scopeIds s) : ∀ element ∈ recordElements record, PlacedIn program s element scope := by
  obtain ⟨source, at_, holding, rest⟩ := held
  obtain ⟨linked, names⟩ := rest
  intro element named
  have present : at_ ∈ scopeIds s := by
    rcases instanceLinked_present formed linked with same | ⟨here, _⟩
    · exact same ▸ stands
    · exact here
  have placed : PlacedIn program s element at_ := by
    rcases holding with ⟨retained, rfl⟩ | ⟨run, member, pending, rfl⟩
    · exact lane.records source retained present element (names element named)
    · exact lane.pending run member present source pending element (names element named)
  exact placed.rooted (instanceLinked_root formed lane.calledApart linked).symm

/-- A record stored where `Laws.Compensation.RecordFrom` says is placed where it is stored. -/
theorem recordFrom_placed {program : Program} {s : State} (refs : ReferencesPlaced program)
    (formed : WellFormed program s) (lane : PlacedLane program s) {record : Compensable} {scope : ScopeOccurrenceId}
    (from_ : RecordFrom program s record scope) (stands : scope ∈ scopeIds s) :
    ∀ element ∈ recordElements record, PlacedIn program s element scope := by
  rcases from_ with held | ⟨occurrence, member, subject, rest⟩
  · exact recordHeld_placed formed lane held stands
  obtain ⟨linked, handled, children⟩ := rest
  have here : PlacedIn program s occurrence.element scope :=
    PlacedIn.rooted (show PlacedIn program s occurrence.element occurrence.scope from lane.placed.occurrences occurrence member)
      (instanceLinked_root formed lane.calledApart linked).symm
  intro element named
  rw [Laws.Compensation.recordElements_eq] at named
  rcases List.mem_cons.mp named with rfl | named
  · exact subject ▸ here
  rcases List.mem_append.mp named with handler | child
  · obtain ⟨host, inside, header, rest⟩ := handled element (by simpa using handler)
    obtain ⟨envelope, has, listed⟩ := rest
    exact here.alike (by rw [refs.handlers host inside envelope has element listed, header, subject])
  · obtain ⟨child, inside, named⟩ := Laws.Compensation.recordsElements_cases child
    exact recordHeld_placed formed lane (children child inside) stands element named

end Kernel.Proofs.Former
