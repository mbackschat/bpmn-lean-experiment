module

public import Kernel.Proofs.Former.PlacedCarry

/-! # Proofs: the former lanes, where the frame's sources place work

What the frame's provenance (`Kernel.Proofs.Frame.Alongside`) gives the placement lane under its model premise
(`Placing`): a flow offered where an occurrence lies ends in its process (`offered_placed`), a queued completion's and a
continuation's named flows end where their occurrence lies (`completesFrom_placed`, `leavesFrom_placed`), an anchored
element is placed where it was anchored, at a scope occurrence that was issued (`anchored_issued`), and so is a begin,
a reservation and a stored record. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.Compensation (recordElements RecordFrom)

/-- The placement lane under its model premise: what the frame records carry beside `WellFormed`. -/
def Placing (program : Program) (s : State) : Prop := ReferencesPlaced program → PlacedLane program s

variable {program : Program} {s : State}

/-- A held state's provenance read under the lane's premise. -/
theorem placing_held (refs : ReferencesPlaced program) :
    ∀ t, WellFormed program t ∧ Placing program t → WellFormed program t ∧ PlacedLane program t :=
  fun _ holds => ⟨holds.1, holds.2 refs⟩

/-- Placement in a well-formed state `held` whose scope occurrences and instance entries include `s`'s is placement in
`s`, where the scope occurrence stands. -/
theorem PlacedIn.ofHeld {held : State} {element : ElementId} {x : ScopeOccurrenceId}
    (placed : PlacedIn program held element x) (formed : WellFormed program s) (present : x ∈ scopeIds s)
    (heldFormed : WellFormed program held) (scopes : ∀ entry ∈ s.scopes, entry ∈ held.scopes)
    (instances : ∀ entry ∈ s.slots.instances, entry ∈ held.slots.instances) : PlacedIn program s element x :=
  placed.transport instances (instanceRoot_wider formed present heldFormed.distinct.scopes scopes).symm

/-- The instance root of a standing scope occurrence of a lane state has an instance entry. -/
theorem instanceRoot_entered (formed : WellFormed program s) (lane : PlacedLane program s) {x : ScopeOccurrenceId}
    (present : x ∈ scopeIds s) : ∃ entry ∈ s.slots.instances, entry.root = s.instanceRoot x := by
  obtain ⟨name, chain, reading, rest⟩ := Laws.State.instanceIn_exists formed present
  rw [instanceRoot_chain reading formed.distinct.scopes reading.mem]
  unfold chainRoot
  split
  · rename_i last found
    split
    · rename_i called
      exact lane.placed.entered last (reading.mem last (List.mem_of_getLast? found)) called
    · exact lane.placed.rooted
  · exact lane.placed.rooted

/-- Two elements placed where one standing scope occurrence of a lane state lies belong to one process. -/
theorem PlacedIn.unique (formed : WellFormed program s) (lane : PlacedLane program s) {first second : ElementId}
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) (one : PlacedIn program s first x)
    (two : PlacedIn program s second x) : definitionAt program first = definitionAt program second := by
  obtain ⟨entry, member, rooted⟩ := instanceRoot_entered formed lane present
  exact (one entry member rooted).trans (two entry member rooted).symm

/-- An occurrence of a lane state is placed where it lies. -/
theorem occurrence_placed (lane : PlacedLane program s) {o : Occurrence} (member : o ∈ s.occurrences) :
    PlacedIn program s o.element o.scope :=
  lane.placed.occurrences o member

/-- The target of a flow an element lists is placed where the element is. -/
theorem listsPlaced (refs : ReferencesPlaced program) {element target : ElementId} {flow : FlowId}
    {x : ScopeOccurrenceId} (here : PlacedIn program s element x) (lists : Laws.Flow.Lists program element flow)
    (ends : program.target? flow = some target) : PlacedIn program s target x :=
  here.alike (linked_same refs (.inr (.inr (.inr (.inr (.inl ⟨flow, lists, ends⟩))))))

/-- A flow offered where a scope occurrence of a lane state lies ends in its process (`Laws.Flow.Offered`). -/
theorem offered_placed (refs : ReferencesPlaced program) (lane : PlacedLane program s) {x : ScopeOccurrenceId}
    {flow : FlowId} {target : ElementId} (offered : Laws.Flow.Offered program s x flow)
    (ends : program.target? flow = some target) : PlacedIn program s target x := by
  obtain ⟨o, member, rfl, how⟩ := offered
  have here := occurrence_placed lane member
  rcases how with lists | ⟨element, found, link, linked⟩ | ⟨waiting, waits, named, rest⟩
  · exact listsPlaced refs here lists ends
  · obtain ⟨sibling, header, payload, typed⟩ := linked
    have lists : Laws.Flow.Lists program link.header.id flow :=
      .inl ⟨link, element?_member refs.ids (Laws.IL.mem_siblings sibling),
        .inl ((Laws.Step.event?_outgoing typed.1).symm ▸ typed.2)⟩
    refine (listsPlaced refs (here.alike ?_) lists ends)
    rw [refs.siblings element.header link sibling, Laws.IL.element?_header found]
  · obtain ⟨element, found, listed⟩ := rest
    obtain ⟨gateway, ends', typed⟩ := Option.bind_eq_some_iff.mp found
    exact listsPlaced refs (lane.parked waiting waits o member named.symm gateway ends') (.inl ⟨element, typed, listed⟩)
      ends

/-- A queued completion's named flows end where every occurrence of its number lies (`Proofs.Frame.CompletesFrom`). -/
theorem completesFrom_placed (refs : ReferencesPlaced program) (lane : PlacedLane program s) {id : Nat} {leave : Leave}
    (source : Proofs.Frame.CompletesFrom (Placing program) program s id leave) :
    ∀ selected, leave = .flows selected → ∀ o ∈ s.occurrences, o.id = id → ∀ flow ∈ selected, ∀ target,
      program.target? flow = some target → PlacedIn program s target o.scope := by
  intro selected same o member named flow inside target ends
  rcases source with offered | ⟨held, -, holds, found⟩
  · obtain ⟨held, holds, occurrences, rest⟩ := offered selected same flow inside
    obtain ⟨-, -, there⟩ := rest
    have heldLane := holds.2 refs
    have stays := occurrences o member named
    have present := holds.1.owned.occurrenceScopes o stays
    have placed : PlacedIn program held target o.scope := by
      rcases there with ⟨other, inside', named', at_⟩ | ⟨waiting, waits, named', at_⟩
      · rw [← Laws.State.nodup_map_eq holds.1.distinct.occurrences inside' stays (named'.trans named.symm)] at present ⊢
        exact offered_placed refs heldLane at_ ends
      · rw [heldLane.waits waiting waits o stays (named.trans named'.symm)]
        exact offered_placed refs heldLane at_ ends
    exact (occurrence_placed lane member).alike
      (PlacedIn.unique holds.1 heldLane present placed (heldLane.placed.occurrences o stays))
  · obtain ⟨run, kept, resumes⟩ := found
    cases (holds refs).resumes run kept id leave resumes selected same
    cases inside

/-- A continuation's named flows end where its occurrence lies (`Laws.Flow.LeavesFrom`). -/
theorem leavesFrom_placed (refs : ReferencesPlaced program) (formed : WellFormed program s) {occurrence : Occurrence}
    {flows : List FlowId} (stands : ∃ entry ∈ s.scopes, entry.id = occurrence.scope)
    (leaves : Laws.Flow.LeavesFrom (fun held => WellFormed program held ∧ Placing program held) program s occurrence
      (.flows flows)) :
    ∀ flow ∈ flows, ∀ target, program.target? flow = some target → PlacedIn program s target occurrence.scope := by
  intro flow inside target ends
  obtain ⟨held, holds, instances, rest⟩ := leaves
  obtain ⟨scopes, source⟩ := rest
  have heldLane := holds.2 refs
  have present : occurrence.scope ∈ scopeIds s := by
    obtain ⟨entry, member, named⟩ := stands
    exact List.mem_map.mpr ⟨entry, member, named⟩
  have presentHeld : occurrence.scope ∈ scopeIds held := by
    obtain ⟨entry, member, named⟩ := stands
    exact List.mem_map.mpr ⟨entry, scopes entry member, named⟩
  refine PlacedIn.ofHeld ?_ formed present holds.1 scopes instances
  rcases source with ⟨⟨kept, member, rest⟩, named⟩ | ⟨leave, writes, rule, queued⟩
  · obtain ⟨id, element, scope⟩ := rest
    have here : PlacedIn program held occurrence.element occurrence.scope :=
      element ▸ scope ▸ heldLane.placed.occurrences kept member
    rcases named flows rfl flow inside with lists | ⟨selected, writes, rule, completes⟩
    · exact listsPlaced refs here lists ends
    · exact scope ▸ heldLane.completes occurrence.id selected writes rule completes.2 kept member id flow completes.1
        target ends
  · obtain ⟨queued, listed⟩ := queued
    obtain ⟨placed, listing⟩ := heldLane.occurs occurrence.element occurrence.scope leave (.inl ⟨writes, rule, queued⟩)
    rcases listed flows rfl flow inside with lists | ⟨named, same, member⟩
    · exact listsPlaced refs (placed presentHeld) lists ends
    · exact listsPlaced refs (placed presentHeld) (listing named same flow member) ends

/-- The gateway an arrival runs is placed where the arriving occurrence lies (`Laws.Flow.GatewayOf`). -/
theorem gatewayOf_placed (lane : PlacedLane program s) {occurrence : Occurrence} {header : Header}
    {payload : GatewayPayload} (member : occurrence ∈ s.occurrences)
    (gateway : Laws.Flow.GatewayOf program s occurrence header payload) :
    PlacedIn program s header.id occurrence.scope := by
  obtain ⟨element, typed, how⟩ := gateway
  rw [← Laws.Step.gateway?_header typed]
  rcases how with found | ⟨waiting, waits, named, found⟩
  · rw [Laws.IL.element?_header found]
    exact lane.placed.occurrences occurrence member
  · obtain ⟨target, ends, typed'⟩ := Option.bind_eq_some_iff.mp found
    rw [Laws.IL.element?_header typed']
    exact lane.parked waiting waits occurrence member named.symm target ends

/-- What a lane state holds anchors work only at an issued scope occurrence. -/
theorem anchoredBy_issued (formed : WellFormed program s) (lane : PlacedLane program s) {anchor : ElementId}
    {x : ScopeOccurrenceId} (anchored : Laws.Flow.AnchoredBy program s anchor x) : Laws.State.ScopeIssued s x := by
  rcases anchored with ⟨o, member, rfl, -⟩ | ⟨entry, member, -, link⟩ | ⟨⟨entry, member, rfl⟩, -⟩ |
      ⟨⟨root, member, rfl, -⟩, -⟩ | ⟨run, member, -, rfl⟩ | ⟨run, member, rfl, rest⟩
  · exact present_issued formed (formed.owned.occurrenceScopes o member)
  · rcases link with link | ⟨rfl, -⟩
    · exact present_issued formed (parent_present formed member link)
    · exact formed.issued.scopes entry member
  · exact formed.issued.scopes entry member
  · exact formed.issued.scopes root member
  · exact lane.issued _ (.inr (.inr (.inr (.inr ⟨run, member, rfl⟩))))
  · obtain ⟨record, pending, -⟩ := rest
    exact lane.issued _ (.inr (.inr (.inr (.inl ⟨run, member, rfl, List.ne_nil_of_mem pending⟩))))

/-- Work is anchored only at an issued scope occurrence (`Laws.Flow.Anchored`). -/
theorem anchored_issued (refs : ReferencesPlaced program) (formed : WellFormed program s)
    (lane : PlacedLane program s) {element : ElementId} {x : ScopeOccurrenceId}
    (anchored : Laws.Flow.Anchored (fun t => WellFormed program t ∧ Placing program t) program s element x) :
    Laws.State.ScopeIssued s x := by
  obtain ⟨anchor, -, source⟩ := anchored
  rcases source with here | ⟨held, holds, issued, rest⟩
  · exact anchoredBy_issued formed lane here
  obtain ⟨-, -, there⟩ := rest
  refine issued.issued ?_
  rcases there with by_ | ⟨host, armed⟩ | ⟨occurrence, armed⟩ | ⟨raised, origin, queued, rest⟩
  · exact anchoredBy_issued holds.1 (holds.2 refs) by_
  · exact (holds.1.queue.arm host anchor x armed).2.1
  · exact (holds.1.queue.armGateway occurrence anchor x armed).2.1
  · obtain ⟨-, rfl⟩ := rest
    exact (holds.2 refs).issued _ (.inr (.inl ⟨raised, origin, queued, rfl⟩))

/-- A reservation queued from where `Laws.Flow.OccurAnchored` says is placed as the lane reads one. -/
theorem occurAnchored_placed (refs : ReferencesPlaced program) (formed : WellFormed program s)
    (lane : PlacedLane program s) {element : ElementId} {x : ScopeOccurrenceId} {leave : Leave}
    (anchored : Laws.Flow.OccurAnchored (fun t => WellFormed program t ∧ Placing program t) program s element x leave) :
    OccurPlaced program s element x leave := by
  rcases anchored with ⟨there, listed⟩ | ⟨held, holds, issued, rest⟩
  · exact ⟨⟨fun stands => anchored_placed refs formed lane (there.mono (placing_held refs)) stands, listed⟩,
      anchored_issued refs formed lane there⟩
  obtain ⟨scopes, instances, found⟩ := rest
  obtain ⟨run, member, resumes⟩ := found
  have heldLane := holds.2 refs
  obtain ⟨placed, listed⟩ := heldLane.occurs element x leave (.inr (.inr ⟨run, member, resumes⟩))
  refine ⟨⟨fun stands => ?_, listed⟩,
    issued.issued (heldLane.issued x (.inl ⟨element, leave, .inr (.inr ⟨run, member, resumes⟩)⟩))⟩
  obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
  exact (placed (List.mem_map.mpr ⟨entry, scopes entry inside, named⟩)).ofHeld formed stands holds.1 scopes instances

/-- A begin queued from where `Laws.Flow.BeginAnchored` says is placed where it begins. -/
theorem beginAnchored_placed (refs : ReferencesPlaced program) (formed : WellFormed program s)
    (lane : PlacedLane program s) {request : BeginRequest}
    (anchored : Laws.Flow.BeginAnchored (fun t => WellFormed program t ∧ Placing program t) program s request)
    (stands : request.scope ∈ scopeIds s) : BeginPlaced program s request := by
  refine ⟨anchored_placed refs formed lane (anchored.element.mono (placing_held refs)) stands,
    fun o member same => ?_, fun flow target named ends => ?_⟩
  · rcases anchored.reserved o member same with here | ⟨entry, inside, rest⟩
    · exact here ▸ occurrence_placed lane member
    · obtain ⟨named, link, free⟩ := rest
      exact (occurrence_placed lane member).rooted (named ▸ instanceRoot_child formed inside free link)
  · rw [anchored.incoming flow named] at ends
    cases ends
    rfl

/-- A stored record's scope occurrence was issued (`Laws.Compensation.RecordFrom`). -/
theorem recordFrom_issued (formed : WellFormed program s) (lane : PlacedLane program s) {record : Compensable}
    {x : ScopeOccurrenceId} (from_ : RecordFrom program s record x) : Laws.State.ScopeIssued s x := by
  rcases from_ with ⟨source, at_, holding, rest⟩ | ⟨occurrence, member, -, rest⟩
  · obtain ⟨linked, -⟩ := rest
    have below : Laws.State.ScopeIssued s at_ := by
      rcases holding with ⟨retained, rfl⟩ | ⟨run, member, pending, rfl⟩
      · exact lane.issued _ (.inr (.inr (.inl ⟨source, retained, rfl⟩)))
      · exact lane.issued _ (.inr (.inr (.inr (.inl ⟨run, member, rfl, List.ne_nil_of_mem pending⟩))))
    rcases instanceLinked_present formed linked with rfl | ⟨-, there⟩
    · exact below
    · exact present_issued formed there
  · obtain ⟨linked, -⟩ := rest
    rcases instanceLinked_present formed linked with rfl | ⟨-, there⟩
    · exact present_issued formed (formed.owned.occurrenceScopes occurrence member)
    · exact present_issued formed there

end Kernel.Proofs.Former
