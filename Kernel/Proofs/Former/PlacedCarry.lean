module

public import Kernel.Proofs.Former.PlacedAnchors

/-! # Proofs: the former lanes, how the placement lane carries

What a state operation must show of the work it adds for the placement lane (`Kernel.Proofs.Former.PlacedLane`) to
hold after it: each queued signal, work-stack entry, compensation record and run, Multi-Instance run and join wait it
adds is placed as the lane reads one (`SignalPlaced`, `TokenPlaced`, `RecordPlaced`, `RunHeldPlaced`, `BodyPlaced`,
`WaitPlaced`), and each occurrence record it adds is placed and keeps an older record's identity, element and instance
root or takes an identity nothing refers to yet (`OccurrenceFits`). Work the state held keeps its placement where its
scope occurrence keeps its instance root (`PlacedLane.carry`), and a scope occurrence entered later is none it names,
since that work names issued scope occurrences only. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Queued)
open Kernel.Laws.Compensation (recordElements)

/-- A reservation of `element` in `scope`, leaving by `leave`, as the lane reads one (`PlacedLane.occurs`,
`PlacedLane.issued`). -/
def OccurPlaced (program : Program) (s : State) (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave) :
    Prop :=
  ((scope ∈ scopeIds s → PlacedIn program s element scope) ∧
    ∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program element flow) ∧
    Laws.State.ScopeIssued s scope

/-- A resume as the lane reads one: a reservation it makes, and a completion by no named flow. -/
def ResumePlaced (program : Program) (s : State) (resume : Option Resume) : Prop :=
  (∀ element scope leave, resume = some (.occur element scope leave) → OccurPlaced program s element scope leave) ∧
    ∀ id leave, resume = some (.complete id leave) → Unnamed leave

/-- A queued signal as the lane reads one. -/
structure SignalPlaced (program : Program) (s : State) (signal : Signal) : Prop where
  begin : ∀ request, signal = .begin request → request.scope ∈ scopeIds s → BeginPlaced program s request
  occur : ∀ element scope leave writes rule, signal = .occur element scope leave writes rule →
    OccurPlaced program s element scope leave
  compensate : ∀ scope activity trigger leave resume, signal = .compensate scope activity trigger leave resume →
    ResumePlaced program s resume
  arm : ∀ host element scope, signal = .arm host element scope → scope ∈ scopeIds s → PlacedIn program s element scope
  armGateway : ∀ occurrence gateway scope, signal = .armGateway occurrence gateway scope → scope ∈ scopeIds s →
    PlacedIn program s gateway scope
  complete : ∀ id selected writes rule, signal = .complete id (.flows selected) writes rule →
    ∀ occurrence ∈ s.occurrences, occurrence.id = id → ∀ flow ∈ selected, ∀ target,
      program.target? flow = some target → PlacedIn program s target occurrence.scope
  raise : ∀ raised origin, signal = .raise raised origin →
    (origin.scope ∈ scopeIds s → PlacedIn program s origin.element origin.scope) ∧ Laws.State.ScopeIssued s origin.scope

/-- A work-stack entry as the lane reads one. -/
structure TokenPlaced (program : Program) (s : State) (token : Token) : Prop where
  flow : ∀ flow scope, token = .flow flow scope → ∀ target, program.target? flow = some target →
    PlacedIn program s target scope
  begin : ∀ request, token = .begin request → request.scope ∈ scopeIds s → BeginPlaced program s request

/-- A retained compensation record as the lane reads one. -/
def RecordPlaced (program : Program) (s : State) (record : Compensable) : Prop :=
  (record.scope ∈ scopeIds s → ∀ element ∈ recordElements record, PlacedIn program s element record.scope) ∧
    Laws.State.ScopeIssued s record.scope

/-- A compensation run as the lane reads one. -/
def RunHeldPlaced (program : Program) (s : State) (run : CompensationRun) : Prop :=
  (run.scope ∈ scopeIds s → ∀ record ∈ run.pending, ∀ element ∈ recordElements record,
    PlacedIn program s element run.scope) ∧ ResumePlaced program s run.resume ∧
    (run.pending ≠ [] → Laws.State.ScopeIssued s run.scope)

/-- A Multi-Instance run as the lane reads one. -/
def BodyPlaced (program : Program) (s : State) (run : MultiInstanceRun) : Prop :=
  (run.scope ∈ scopeIds s → PlacedIn program s run.element run.scope) ∧ Laws.State.ScopeIssued s run.scope

/-- A join wait as the lane reads one. -/
def WaitPlaced (program : Program) (s : State) (waiting : Parked) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.id = waiting.occurrence → occurrence.scope = waiting.scope ∧ ∀ target,
    program.target? waiting.flow = some target → PlacedIn program s target occurrence.scope

/-- An occurrence record `t` holds that `s` lacks, as the lane reads one: placed, in a scope occurrence of `s`, with an
incoming flow of its element's process, and the record of an identity, element and scope occurrence `s` held, or of an
identity nothing `s` queues or slots claims (`Laws.State.Unclaimed`) whose records in `s` are unbegun, or of one `s`
has not issued. -/
structure OccurrenceFits (program : Program) (s t : State) (occurrence : Occurrence) : Prop where
  placed : PlacedIn program t occurrence.element occurrence.scope
  stands : occurrence.scope ∈ scopeIds s
  incoming : ∀ flow target, occurrence.incoming = some flow → program.target? flow = some target →
    definitionAt program target = definitionAt program occurrence.element
  source : (∃ old ∈ s.occurrences, old.id = occurrence.id ∧ old.element = occurrence.element ∧
    old.scope = occurrence.scope) ∨ (Laws.State.Unclaimed s occurrence.id ∧
      ∀ old ∈ s.occurrences, old.id = occurrence.id → old.begun = false) ∨ ¬ Laws.State.OccurrenceIssued s occurrence.id

/-- What the lane says of the scope occurrences and instance entries alone. -/
structure Standing (program : Program) (s : State) : Prop where
  rooted : ∃ entry ∈ s.slots.instances, entry.root = State.root
  entered : ∀ root ∈ s.scopes, root.calledInstance.isSome → ∃ entry ∈ s.slots.instances, entry.root = root.id
  rootsApart : (s.slots.instances.map (·.root)).Nodup
  rootsIssued : ∀ entry ∈ s.slots.instances, Laws.State.ScopeIssued s entry.root
  rootDefinition : ∀ entry ∈ s.slots.instances, entry.root = State.root ↔ entry.definition = none
  scopes : ∀ entry ∈ s.scopes, ∀ element parent, entry.element = some element → entry.parent = some parent →
    parent ∈ scopeIds s → PlacedIn program s element parent
  calledApart : CalledApart program s
  rootBare : ∀ entry ∈ s.scopes, entry.element = none ↔ entry.parent = none

/-- A lane state's standing part. -/
theorem PlacedLane.standing {program : Program} {s : State} (lane : PlacedLane program s) : Standing program s :=
  ⟨lane.placed.rooted, lane.placed.entered, lane.rootsApart, lane.rootsIssued, lane.rootDefinition, lane.scopes,
    lane.calledApart, lane.rootBare⟩

/-- The instance root of a scope occurrence of a well-formed state was issued. -/
theorem instanceRoot_issued {program : Program} {s : State} (formed : WellFormed program s) {x : ScopeOccurrenceId}
    (present : x ∈ scopeIds s) : Laws.State.ScopeIssued s (s.instanceRoot x) := by
  obtain ⟨name, chain, reading, rest⟩ := Laws.State.instanceIn_exists formed present
  rw [instanceRoot_chain reading formed.distinct.scopes reading.mem]
  have root : Laws.State.ScopeIssued s State.root := by
    obtain ⟨entry, member, named⟩ := List.mem_map.mp formed.rooted.1
    exact named ▸ formed.issued.scopes entry member
  unfold chainRoot
  split
  · rename_i last found
    split
    · exact formed.issued.scopes last (reading.mem last (List.mem_of_getLast? found))
    · exact root
  · exact root

/-- The scope occurrence a flow token of a well-formed state lies in stands. -/
theorem flow_present {program : Program} {s : State} (formed : WellFormed program s) {flow : FlowId}
    {scope : ScopeOccurrenceId} (member : Token.flow flow scope ∈ (Laws.State.allQueuedTokens s)) : scope ∈ scopeIds s :=
  Laws.State.busyScope_flow flow scope ▸ formed.owned.tokenScopes _ member

/-- A scope occurrence of a well-formed state was issued. -/
theorem present_issued {program : Program} {s : State} (formed : WellFormed program s) {x : ScopeOccurrenceId}
    (present : x ∈ scopeIds s) : Laws.State.ScopeIssued s x := by
  obtain ⟨entry, member, rfl⟩ := List.mem_map.mp present
  exact formed.issued.scopes entry member

section Carry

variable {program : Program} {s t : State}

/-- A reservation still to be made in `t` is one `s` held or one `t` places. -/
theorem occurAt_carry (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s) ∨ SignalPlaced program t signal)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ RunHeldPlaced program t run)
    {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave} (pending : OccurAt t element scope leave) :
    OccurAt s element scope leave ∨ OccurPlaced program t element scope leave := by
  rcases pending with ⟨writes, rule, queued⟩ | resumed | ⟨run, member, resumes⟩
  · exact (signals _ queued).imp (fun old => .inl ⟨writes, rule, old⟩) fun placed => placed.occur _ _ _ _ _ rfl
  · obtain ⟨scope', rest⟩ := Laws.Step.mem_resumesOf.mp resumed
    obtain ⟨activity, trigger, leave', queued⟩ := rest
    exact (signals _ queued).imp (fun old => .inr (.inl (Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, old⟩)))
      fun placed => (placed.compensate _ _ _ _ _ rfl).1 _ _ _ rfl
  · exact (runs run member).imp (fun old => .inr (.inr ⟨run, old, resumes⟩)) fun placed => placed.2.1.1 _ _ _ resumes

/-- A completion resume queued in `t` names no flow, when `s`'s and the ones `t` adds do not. -/
theorem compensates_carry (lane : PlacedLane program s)
    (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s) ∨ SignalPlaced program t signal) {id : OccurrenceId} {leave : Leave}
    (resumed : some (Resume.complete id leave) ∈ Laws.Step.resumesOf (Laws.State.allSignals t)) : Unnamed leave := by
  obtain ⟨scope, rest⟩ := Laws.Step.mem_resumesOf.mp resumed
  obtain ⟨activity, trigger, leave', queued⟩ := rest
  rcases signals _ queued with old | placed
  · exact lane.compensates id leave (Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, old⟩)
  · exact (placed.compensate _ _ _ _ _ rfl).2 id leave rfl

/-- The placement lane carries to a state whose standing part holds (`Standing`), that issued no less, whose scope
occurrences of `s` keep their instance roots and whose others `s` has not issued, whose instance entries `s` holds or
are rooted at identities `s` has not issued, and whose occurrence records and work `s` holds or `t` places. -/
theorem PlacedLane.carry (formed : WellFormed program s) (lane : PlacedLane program s) (standing : Standing program t)
    (grows : Laws.State.ScopeGrows s t) (present : ∀ x ∈ scopeIds t, x ∈ scopeIds s ∨ ¬ Laws.State.ScopeIssued s x)
    (roots : ∀ x ∈ scopeIds t, x ∈ scopeIds s → t.instanceRoot x = s.instanceRoot x)
    (instances : ∀ entry ∈ t.slots.instances, entry ∈ s.slots.instances ∨ ¬ Laws.State.ScopeIssued s entry.root)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences ∨ OccurrenceFits program s t o)
    (lying : ∀ o ∈ t.occurrences, o.scope ∈ scopeIds t)
    (flowScopes : ∀ flow scope, Token.flow flow scope ∈ (Laws.State.allQueuedTokens t) → Token.flow flow scope ∈ (Laws.State.allQueuedTokens s) →
      scope ∈ scopeIds t)
    (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s) ∨ SignalPlaced program t signal)
    (tokens : ∀ token ∈ (Laws.State.allQueuedTokens t), token ∈ (Laws.State.allQueuedTokens s) ∨ TokenPlaced program t token)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ RunHeldPlaced program t run)
    (retained : ∀ record ∈ t.slots.compensation.retained,
      record ∈ s.slots.compensation.retained ∨ RecordPlaced program t record)
    (bodies : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances ∨ BodyPlaced program t run)
    (parked : ∀ waiting ∈ t.slots.parked, waiting ∈ s.slots.parked ∨ WaitPlaced program t waiting) :
    PlacedLane program t := by
  have move : ∀ {element x}, x ∈ scopeIds t → x ∈ scopeIds s → PlacedIn program s element x →
      PlacedIn program t element x := fun stands old placed entry member root => by
    rcases instances entry member with kept | fresh
    · exact placed entry kept (root.trans (roots _ stands old))
    · rw [root, roots _ stands old] at fresh
      exact absurd (instanceRoot_issued formed old) fresh
  have guarded : ∀ {element x}, Laws.State.ScopeIssued s x → x ∈ scopeIds t → (x ∈ scopeIds s → PlacedIn program s element x) →
      PlacedIn program t element x := fun below stands placed => by
    rcases present _ stands with old | fresh
    · exact move stands old (placed old)
    · exact absurd below fresh
  have keyed : ∀ {id}, Laws.State.OccurrenceIssued s id → (Laws.State.Unclaimed s id → False) → ∀ o ∈ t.occurrences, o.id = id →
      ∃ old ∈ s.occurrences, old.id = id ∧ old.scope = o.scope := fun below claimed o member named => by
    rcases occurrences o member with old | fits
    · exact ⟨o, old, named, rfl⟩
    rcases fits.source with ⟨twin, inside, same, kept⟩ | ⟨unclaimed, -⟩ | fresh
    · exact ⟨twin, inside, same.trans named, kept.2⟩
    · exact absurd (named ▸ unclaimed) claimed
    · exact absurd (named ▸ below) fresh
  have waitKeyed : ∀ waiting ∈ s.slots.parked, ∀ o ∈ t.occurrences, o.id = waiting.occurrence →
      ∃ old ∈ s.occurrences, old.id = waiting.occurrence ∧ old.scope = o.scope := fun waiting old =>
    keyed (formed.settled.parked waiting old).1 fun unclaimed => unclaimed.2.2 (.inl ⟨waiting, old, rfl⟩)
  have begins : ∀ request, Queued s request → request.scope ∈ scopeIds t → BeginPlaced program t request :=
    fun request queued stands => by
      have below := formed.claimed.scopesIssued request queued
      rcases present _ stands with old | fresh
      · have placed := lane.begins request queued old
        refine ⟨move stands old placed.element, fun o member same => ?_, placed.incoming⟩
        rcases occurrences o member with kept | fits
        · exact move stands old (placed.reserved o kept same)
        have named : o.id ∈ Laws.State.names request := by simp [Laws.State.names, same]
        rcases fits.source with ⟨twin, inside, same', kept⟩ | ⟨unclaimed, -⟩ | fresh
        · exact move stands old (kept.1 ▸ placed.reserved twin inside (same' ▸ same))
        · exact absurd named (unclaimed.1 request queued)
        · exact absurd ((formed.claimed.named request queued).2 o.id named).1 fresh
      · exact absurd below fresh
  refine ⟨⟨⟨standing.rooted, standing.entered, fun o member => ?_⟩, standing.rootsApart, standing.rootsIssued,
    standing.rootDefinition, standing.scopes, fun o member => ?_, fun waiting member => ?_, fun run member => ?_⟩,
    fun flow scope target member ends => ?_, fun request queued stands => ?_, fun element scope leave pending => ?_,
    fun host element scope queued stands => ?_, fun occurrence gateway scope queued stands => ?_,
    fun id selected writes rule queued => ?_, fun _ _ resumed => compensates_carry lane signals resumed,
    fun record member stands => ?_, fun run member stands record inside => ?_, standing.calledApart, standing.rootBare,
    fun run member stands => ?_, fun raised origin queued stands => ?_, fun x work => ?_,
    fun waiting member o inside named => ?_⟩
  · rcases occurrences o member with old | fits
    · exact move (lying o member) (formed.owned.occurrenceScopes o old) (lane.placed.occurrences o old)
    · exact fits.placed
  · rcases occurrences o member with old | fits
    · exact lane.incoming o old
    · exact fits.incoming
  · rcases parked waiting member with old | placed
    · intro o inside named target ends
      obtain ⟨twin, kept, same, scope⟩ := waitKeyed waiting old o inside named
      exact move (lying o inside) (scope ▸ formed.owned.occurrenceScopes twin kept)
        (scope ▸ lane.parked waiting old twin kept same target ends)
    · exact fun o inside named => (placed o inside named).2
  · rcases runs run member with old | placed
    · exact lane.resumes run old
    · exact placed.2.1.2
  · rcases tokens _ member with old | placed
    · exact move (flowScopes flow scope member old) (flow_present formed old) (lane.tokens flow scope target old ends)
    · exact placed.flow flow scope rfl target ends
  · rcases queued with signalled | deferred
    · rcases signals _ signalled with old | placed
      · exact begins request (.inl old) stands
      · exact placed.begin request rfl stands
    · rcases tokens _ deferred with old | placed
      · exact begins request (.inr old) stands
      · exact placed.begin request rfl stands
  · rcases occurAt_carry signals runs pending with old | placed
    · obtain ⟨placed, listed⟩ := lane.occurs element scope leave old
      exact ⟨fun stands => guarded (lane.issued scope (.inl ⟨element, leave, old⟩)) stands placed, listed⟩
    · exact placed.1
  · rcases signals _ queued with old | placed
    · exact guarded (formed.queue.arm host element scope old).2.1 stands (lane.arms host element scope old)
    · exact placed.arm host element scope rfl stands
  · rcases signals _ queued with old | placed
    · exact guarded (formed.queue.armGateway occurrence gateway scope old).2.1 stands
        (lane.gateways occurrence gateway scope old)
    · exact placed.armGateway occurrence gateway scope rfl stands
  · rcases signals _ queued with old | placed
    · intro o member named flow inside target ends
      obtain ⟨twin, kept, same, scope⟩ := keyed (formed.queue.completes id _ writes rule old)
        (fun unclaimed => unclaimed.2.1 _ _ _ old) o member named
      exact move (lying o member) (scope ▸ formed.owned.occurrenceScopes twin kept)
        (scope ▸ lane.completes id selected writes rule old twin kept same flow inside target ends)
    · exact placed.complete id selected writes rule rfl
  · rcases retained record member with old | placed
    · exact fun element named => guarded (lane.issued _ (.inr (.inr (.inl ⟨record, old, rfl⟩)))) stands
        fun present => lane.records record old present element named
    · exact placed.1 stands
  · rcases runs run member with old | placed
    · have pending : run.pending ≠ [] := fun empty => by rw [empty] at inside; cases inside
      exact fun element named => guarded (lane.issued _ (.inr (.inr (.inr (.inl ⟨run, old, rfl, pending⟩))))) stands
        fun present => lane.pending run old present record inside element named
    · exact placed.1 stands record inside
  · rcases bodies run member with old | placed
    · exact guarded (lane.issued _ (.inr (.inr (.inr (.inr ⟨run, old, rfl⟩))))) stands (lane.runs run old)
    · exact placed.1 stands
  · rcases signals _ queued with old | placed
    · exact guarded (lane.issued _ (.inr (.inl ⟨raised, origin, old, rfl⟩))) stands (lane.raises raised origin old)
    · exact (placed.raise raised origin rfl).1 stands
  · have issued : ∀ {y : ScopeOccurrenceId}, Laws.State.ScopeIssued s y → Laws.State.ScopeIssued t y := grows.issued
    rcases work with ⟨element, leave, pending⟩ | ⟨raised, origin, queued, rfl⟩ | ⟨record, member, rfl⟩ |
        ⟨run, member, rfl, pending⟩ | ⟨run, member, rfl⟩
    · rcases occurAt_carry signals runs pending with old | placed
      · exact issued (lane.issued _ (.inl ⟨element, leave, old⟩))
      · exact placed.2
    · rcases signals _ queued with old | placed
      · exact issued (lane.issued _ (.inr (.inl ⟨raised, origin, old, rfl⟩)))
      · exact (placed.raise raised origin rfl).2
    · rcases retained record member with old | placed
      · exact issued (lane.issued _ (.inr (.inr (.inl ⟨record, old, rfl⟩))))
      · exact placed.2
    · rcases runs run member with old | placed
      · exact issued (lane.issued _ (.inr (.inr (.inr (.inl ⟨run, old, rfl, pending⟩)))))
      · exact placed.2.2 pending
    · rcases bodies run member with old | placed
      · exact issued (lane.issued _ (.inr (.inr (.inr (.inr ⟨run, old, rfl⟩)))))
      · exact placed.2
  · rcases parked waiting member with old | placed
    · obtain ⟨twin, kept, same, scope⟩ := waitKeyed waiting old o inside named
      exact scope ▸ lane.waits waiting old twin kept same
    · exact (placed o inside named).1

/-- What a list extended by `extra` holds is the list's or satisfies what `extra`'s members do. -/
theorem listExtended {α : Type} {P : α → Prop} {list extra : List α} (placed : ∀ x ∈ extra, P x) :
    ∀ x ∈ list ++ extra, x ∈ list ∨ P x :=
  fun x member => (List.mem_append.mp member).imp id (placed x)

/-- What a list holds is its own. -/
theorem listKept {α : Type} {P : α → Prop} {list : List α} : ∀ x ∈ list, x ∈ list ∨ P x :=
  fun _ member => .inl member

/-- The lane carries to a state with `s`'s scope occurrences and instance entries that issued no less, whose occurrence
records and work `s` holds or `t` places. -/
theorem PlacedLane.within (formed : WellFormed program s) (lane : PlacedLane program s) (scopes : t.scopes = s.scopes)
    (instances : t.slots.instances = s.slots.instances) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences ∨ OccurrenceFits program s t o)
    (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s) ∨ SignalPlaced program t signal)
    (tokens : ∀ token ∈ (Laws.State.allQueuedTokens t), token ∈ (Laws.State.allQueuedTokens s) ∨ TokenPlaced program t token)
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ RunHeldPlaced program t run)
    (retained : ∀ record ∈ t.slots.compensation.retained,
      record ∈ s.slots.compensation.retained ∨ RecordPlaced program t record)
    (bodies : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances ∨ BodyPlaced program t run)
    (parked : ∀ waiting ∈ t.slots.parked, waiting ∈ s.slots.parked ∨ WaitPlaced program t waiting) :
    PlacedLane program t := by
  have ids : scopeIds t = scopeIds s := by unfold scopeIds; rw [scopes]
  have grows : Laws.State.ScopeGrows s t := .of_same ids ordinals
  have owners : ∀ o ∈ t.occurrences, ∀ entry ∈ s.scopes, entry.occurrence = some o.id →
      ∃ old ∈ s.occurrences, old.id = o.id ∧ old.element = o.element := fun o member entry inside owns => by
    rcases occurrences o member with old | fits
    · exact ⟨o, old, rfl, rfl⟩
    obtain ⟨owner, present, named, begun⟩ := formed.owned.scopeOwners entry inside o.id owns
    rcases fits.source with ⟨twin, kept, same, alike⟩ | ⟨-, unbegun⟩ | fresh
    · exact ⟨twin, kept, same, alike.1⟩
    · rw [unbegun owner present named] at begun; cases begun
    · exact absurd (named ▸ formed.issued.occurrences owner present) fresh
  refine lane.carry formed ⟨?_, ?_, ?_, fun entry member => grows.issued (lane.rootsIssued entry
    (instances ▸ member)), ?_, fun entry member element parent named link stands =>
    (lane.scopes entry (scopes ▸ member) element parent named link (ids ▸ stands)).same scopes
      (fun _ inside => instances ▸ inside), fun entry member called => ?_, ?_⟩ grows
    (fun _ member => .inl (ids ▸ member)) (fun x _ _ => instanceRoot_congr scopes x)
    (fun _ member => .inl (instances ▸ member)) occurrences (fun o member => ?_)
    (fun _ _ _ old => ids ▸ flow_present formed old) signals tokens runs retained bodies parked
  · rw [instances]; exact lane.placed.rooted
  · rw [scopes, instances]; exact lane.placed.entered
  · rw [instances]; exact lane.rootsApart
  · rw [instances]; exact lane.rootDefinition
  · have apart := lane.calledApart entry (scopes ▸ member) called
    refine ⟨apart.1, fun owner inside owns => ?_⟩
    obtain ⟨old, kept, same, element⟩ := owners owner inside entry (scopes ▸ member) owns
    exact element ▸ apart.2 old kept (same ▸ owns)
  · rw [scopes]; exact lane.rootBare
  · rcases occurrences o member with old | fits
    · exact ids ▸ formed.owned.occurrenceScopes o old
    · exact ids ▸ fits.stands

/-- The lane carries to a state that keeps the scope occurrences of `s` outside a region `out` closed downwards, which
leaves `State.root` out, the instance entries rooted outside it, and only occurrences and flow tokens outside `out` and
work `s` holds: what leaving or clearing a scope occurrence keeps. -/
theorem PlacedLane.shrink (formed : WellFormed program s) (lane : PlacedLane program s)
    (out : ScopeOccurrenceId → Prop) (upward : ∀ x y, y ∈ scopeIds s → Laws.State.Within s x y → out y → out x)
    (rootStays : ¬ out State.root) (fewer : t.scopes.Sublist s.scopes)
    (scopes : ∀ entry, entry ∈ t.scopes ↔ entry ∈ s.scopes ∧ ¬ out entry.id)
    (instances : t.slots.instances.Sublist s.slots.instances)
    (entries : ∀ entry ∈ s.slots.instances, ¬ out entry.root → entry ∈ t.slots.instances)
    (grows : Laws.State.ScopeGrows s t) (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences ∧ ¬ out o.scope)
    (tokens : ∀ token ∈ (Laws.State.allQueuedTokens t), token ∈ (Laws.State.allQueuedTokens s) ∧ ¬ out token.busyScope)
    (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s))
    (runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs)
    (retained : ∀ record ∈ t.slots.compensation.retained, record ∈ s.slots.compensation.retained)
    (bodies : ∀ run ∈ t.slots.multiInstances, run ∈ s.slots.multiInstances)
    (parked : ∀ waiting ∈ t.slots.parked, waiting ∈ s.slots.parked) : PlacedLane program t := by
  have present : ∀ {x}, x ∈ scopeIds t → x ∈ scopeIds s ∧ ¬ out x := fun member => by
    obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp member
    obtain ⟨old, free⟩ := (scopes entry).mp inside
    exact ⟨List.mem_map.mpr ⟨entry, old, rfl⟩, free⟩
  have stays : ∀ {x}, x ∈ scopeIds s → ¬ out x → x ∈ scopeIds t := fun member free => by
    obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (scopes entry).mpr ⟨inside, free⟩, rfl⟩
  have nodup : (scopeIds t).Nodup := (fewer.map ScopeOccurrence.id).nodup formed.distinct.scopes
  have roots : ∀ x ∈ scopeIds t, x ∈ scopeIds s → t.instanceRoot x = s.instanceRoot x := fun x member old =>
    instanceRoot_transport formed old nodup fun entry inside within => (scopes entry).mpr
      ⟨inside, fun outside => (present member).2 (upward x entry.id (List.mem_map.mpr ⟨entry, inside, rfl⟩) within
        outside)⟩
  have move : ∀ {element x}, x ∈ scopeIds t → PlacedIn program s element x → PlacedIn program t element x :=
    fun member placed => placed.transport (fun _ inside => instances.subset inside)
      (roots _ member (present member).1)
  refine lane.carry formed ⟨?_, fun root member called => ?_, (instances.map (·.root)).nodup lane.rootsApart,
    fun entry member => grows.issued (lane.rootsIssued entry (instances.subset member)),
    fun entry member => lane.rootDefinition entry (instances.subset member),
    fun entry member element parent named link stands => move stands (lane.scopes entry ((scopes entry).mp member).1
      element parent named link (present stands).1), fun entry member called => ?_,
    fun entry member => lane.rootBare entry ((scopes entry).mp member).1⟩ grows
    (fun _ member => .inl (present member).1) roots (fun _ member => .inl (instances.subset member))
    (fun o member => .inl (occurrences o member).1)
    (fun o member => stays (formed.owned.occurrenceScopes o (occurrences o member).1) (occurrences o member).2)
    (fun flow x member _ => stays (flow_present formed (tokens _ member).1)
      (Laws.State.busyScope_flow flow x ▸ (tokens _ member).2))
    (fun _ member => .inl (signals _ member)) (fun _ member => .inl (tokens _ member).1)
    (fun _ member => .inl (runs _ member)) (fun _ member => .inl (retained _ member))
    (fun _ member => .inl (bodies _ member)) (fun _ member => .inl (parked _ member))
  · obtain ⟨entry, member, rooted⟩ := lane.placed.rooted
    exact ⟨entry, entries entry member (rooted ▸ rootStays), rooted⟩
  · obtain ⟨old, free⟩ := (scopes root).mp member
    obtain ⟨entry, inside, rooted⟩ := lane.placed.entered root old called
    exact ⟨entry, entries entry inside (rooted ▸ free), rooted⟩
  · have apart := lane.calledApart entry ((scopes entry).mp member).1 called
    exact ⟨apart.1, fun owner inside owns => apart.2 owner (occurrences owner inside).1 owns⟩

/-- The lane carries to a state that enters one scope occurrence `entry` at the identifier `s` issues next, below an
issued parent, with the instance entry it may root, placing its element where its parent stands, and keeps the rest:
what entering a scope occurrence or a called root does. -/
theorem PlacedLane.grown (formed : WellFormed program s) (lane : PlacedLane program s) {entry : ScopeOccurrence}
    {added : Option InstanceData} (scopes : t.scopes = s.scopes ++ [entry]) (fresh : Laws.State.ScopeFresh s t entry.id)
    (instances : t.slots.instances = s.slots.instances ++ added.toList)
    (rootedNew : ∀ data, added = some data → data.root = entry.id ∧ data.definition.isSome)
    (enteredNew : entry.calledInstance.isSome → added.isSome)
    (parentIssued : ∀ parent, entry.parent = some parent → Laws.State.ScopeIssued s parent)
    (placedNew : ∀ element parent, entry.element = some element → entry.parent = some parent →
      parent ∈ scopeIds s → PlacedIn program s element parent)
    (calledNew : entry.calledInstance.isSome →
      (∀ element, entry.element = some element → ((program.element? element).bind (·.scope?)).isNone) ∧
        ∀ owner ∈ s.occurrences, entry.occurrence = some owner.id →
          ((program.element? owner.element).bind (·.scope?)).isNone)
    (bareNew : entry.element = none ↔ entry.parent = none) (occurrences : t.occurrences = s.occurrences)
    (signals : Laws.State.allSignals t = Laws.State.allSignals s) (tokens : Laws.State.allQueuedTokens t = Laws.State.allQueuedTokens s)
    (compensation : t.slots.compensation = s.slots.compensation)
    (bodies : t.slots.multiInstances = s.slots.multiInstances) (parked : t.slots.parked = s.slots.parked) :
    PlacedLane program t := by
  have ids : scopeIds t = scopeIds s ++ [entry.id] := by simp [scopeIds, scopes]
  have rootIssued : Laws.State.ScopeIssued s State.root := present_issued formed formed.rooted.1
  have nodup : (scopeIds t).Nodup := by
    rw [ids]
    exact List.nodup_append.mpr ⟨formed.distinct.scopes, by simp, fun a inside b new => by
      rw [List.mem_singleton.mp new]
      exact fun same => fresh.1 (same ▸ present_issued formed inside)⟩
  have roots : ∀ x ∈ scopeIds t, x ∈ scopeIds s → t.instanceRoot x = s.instanceRoot x := fun x _ old =>
    instanceRoot_wider formed old nodup fun _ inside => scopes ▸ List.mem_append_left _ inside
  have newRoot : ∀ data ∈ t.slots.instances, data ∈ s.slots.instances ∨ data.root = entry.id ∧ data.definition.isSome :=
    fun data member => by
      rw [instances] at member
      rcases List.mem_append.mp member with old | new
      · exact .inl old
      · exact .inr (rootedNew data (Option.mem_toList.mp new))
  have move : ∀ {element x}, x ∈ scopeIds s → PlacedIn program s element x → PlacedIn program t element x :=
    fun old placed data member root => by
      rcases newRoot data member with kept | ⟨rooted, -⟩
      · exact placed data kept (root.trans (roots _ (ids ▸ List.mem_append_left _ old) old))
      · rw [roots _ (ids ▸ List.mem_append_left _ old) old, rooted] at root
        exact absurd (root ▸ instanceRoot_issued formed old) fresh.1
  have scopesT : ∀ other ∈ t.scopes, other ∈ s.scopes ∨ other = entry := fun other member => by
    rw [scopes] at member
    exact (List.mem_append.mp member).imp id List.mem_singleton.mp
  refine lane.carry formed ⟨?_, fun root member called => ?_, ?_, fun data member => ?_, fun data member => ?_,
    fun other member element parent named link stands => ?_, fun other member called => ?_, fun other member => ?_⟩
    fresh.2.2 (fun x member => ?_) roots (fun data member => (newRoot data member).imp id fun new => by
      rw [new.1]; exact fresh.1)
    (fun o member => .inl (occurrences ▸ member))
    (fun o member => ids ▸ List.mem_append_left _ (formed.owned.occurrenceScopes o (occurrences ▸ member)))
    (fun _ _ _ old => ids ▸ List.mem_append_left _ (flow_present formed old))
    (fun _ member => .inl (signals ▸ member)) (fun _ member => .inl (tokens ▸ member))
    (fun _ member => .inl (compensation ▸ member)) (fun _ member => .inl (compensation ▸ member))
    (fun _ member => .inl (bodies ▸ member)) (fun _ member => .inl (parked ▸ member))
  · obtain ⟨data, member, rooted⟩ := lane.placed.rooted
    exact ⟨data, instances ▸ List.mem_append_left _ member, rooted⟩
  · rcases scopesT root member with old | rfl
    · obtain ⟨data, inside, rooted⟩ := lane.placed.entered root old called
      exact ⟨data, instances ▸ List.mem_append_left _ inside, rooted⟩
    · obtain ⟨data, same⟩ := Option.isSome_iff_exists.mp (enteredNew called)
      exact ⟨data, by rw [instances, same]; simp, (rootedNew data same).1⟩
  · rw [instances, List.map_append]
    refine List.nodup_append.mpr ⟨lane.rootsApart, ?_, fun a inside b new => ?_⟩
    · cases added <;> simp
    · obtain ⟨data, member, rfl⟩ := List.mem_map.mp inside
      obtain ⟨other, picked, rfl⟩ := List.mem_map.mp new
      rw [(rootedNew other (Option.mem_toList.mp picked)).1]
      exact fun same => fresh.1 (same ▸ lane.rootsIssued data member)
  · rcases newRoot data member with old | ⟨rooted, -⟩
    · exact fresh.2.2.issued (lane.rootsIssued data old)
    · rw [rooted]; exact fresh.2.1
  · rcases newRoot data member with old | ⟨rooted, defined⟩
    · exact lane.rootDefinition data old
    · rw [rooted]
      refine ⟨fun same => absurd (same ▸ rootIssued) fresh.1,
        fun none_ => ?_⟩
      rw [none_] at defined; cases defined
  · rcases scopesT other member with old | rfl
    · exact move (parent_present formed old link)
        (lane.scopes other old element parent named link (parent_present formed old link))
    · rcases List.mem_append.mp (ids ▸ stands) with old | new
      · exact move old (placedNew element parent named link old)
      · have below := parentIssued parent link
        rw [List.mem_singleton.mp new] at below
        exact absurd below fresh.1
  · rcases scopesT other member with old | rfl
    · have apart := lane.calledApart other old called
      exact ⟨apart.1, fun owner inside owns => apart.2 owner (occurrences ▸ inside) owns⟩
    · obtain ⟨elements, owners⟩ := calledNew called
      exact ⟨elements, fun owner inside owns => owners owner (occurrences ▸ inside) owns⟩
  · rcases scopesT other member with old | rfl
    · exact lane.rootBare other old
    · exact bareNew
  · rw [ids] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]; exact .inr fresh.1

/-! ## Builders and operations that read no `WellFormed` -/

/-- A queued arming placed where it arms. -/
theorem SignalPlaced.ofArm {host : OccurrenceId} {element : ElementId} {scope : ScopeOccurrenceId}
    (placed : scope ∈ scopeIds s → PlacedIn program s element scope) : SignalPlaced program s (.arm host element scope) :=
  ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => by obtain ⟨-, rfl, rfl⟩ := Signal.arm.inj same; exact placed,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ _ same => Signal.noConfusion same,
    fun _ _ same => Signal.noConfusion same⟩

/-- A queued gateway arming placed where it arms. -/
theorem SignalPlaced.ofArmGateway {occurrence : OccurrenceId} {gateway : ElementId} {scope : ScopeOccurrenceId}
    (placed : scope ∈ scopeIds s → PlacedIn program s gateway scope) :
    SignalPlaced program s (.armGateway occurrence gateway scope) :=
  ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => by obtain ⟨-, rfl, rfl⟩ := Signal.armGateway.inj same; exact placed,
    fun _ _ _ _ same => Signal.noConfusion same, fun _ _ same => Signal.noConfusion same⟩

/-- A queued raise placed where it was raised, from an issued scope occurrence. -/
theorem SignalPlaced.ofRaise {raised : Raised} {origin : Origin}
    (placed : (origin.scope ∈ scopeIds s → PlacedIn program s origin.element origin.scope) ∧
      Laws.State.ScopeIssued s origin.scope) : SignalPlaced program s (.raise raised origin) :=
  ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ _ same => Signal.noConfusion same,
    fun _ _ same => by obtain ⟨-, rfl⟩ := Signal.raise.inj same; exact placed⟩

/-- A queued begin placed where it begins. -/
theorem SignalPlaced.ofBegin {request : BeginRequest}
    (placed : request.scope ∈ scopeIds s → BeginPlaced program s request) : SignalPlaced program s (.begin request) :=
  ⟨fun _ same => by cases Signal.begin.inj same; exact placed, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ _ same => Signal.noConfusion same,
    fun _ _ same => Signal.noConfusion same⟩

/-- A queued reservation placed where it reserves. -/
theorem SignalPlaced.ofOccur {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule} (placed : OccurPlaced program s element scope leave) :
    SignalPlaced program s (.occur element scope leave writes rule) :=
  ⟨fun _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => by obtain ⟨rfl, rfl, rfl, -⟩ := Signal.occur.inj same; exact placed,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ _ same => Signal.noConfusion same,
    fun _ _ same => Signal.noConfusion same⟩

/-- A queued compensation whose resume is placed. -/
theorem SignalPlaced.ofCompensate {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef}
    {leave : Option OccurrenceId} {resume : Option Resume} (placed : ResumePlaced program s resume) :
    SignalPlaced program s (.compensate scope activity trigger leave resume) :=
  ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => by
      obtain ⟨-, -, -, rest⟩ := Signal.compensate.inj same
      obtain ⟨-, rfl⟩ := rest
      exact placed,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ same => Signal.noConfusion same, fun _ _ same => Signal.noConfusion same⟩

/-- A queued completion whose named flows end where every occurrence of its number lies. -/
theorem SignalPlaced.ofComplete {id : OccurrenceId} {leave : Leave} {writes : List (String × Value)} {rule : WriteRule}
    (placed : ∀ selected, leave = .flows selected → ∀ occurrence ∈ s.occurrences, occurrence.id = id →
      ∀ flow ∈ selected, ∀ target, program.target? flow = some target → PlacedIn program s target occurrence.scope) :
    SignalPlaced program s (.complete id leave writes rule) :=
  ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => Signal.noConfusion same,
    fun _ selected _ _ same => by obtain ⟨rfl, rfl, -, -⟩ := Signal.complete.inj same; exact placed selected rfl,
    fun _ _ same => Signal.noConfusion same⟩

/-- The lane carries to a state with `s`'s scope occurrences, instance entries, work stack and slots that issued no
less, holds some of its occurrence records, and queues `s`'s signals or ones it places: what queuing a signal, issuing
an identifier and dropping a record do, read without `WellFormed`. -/
theorem PlacedLane.queue (lane : PlacedLane program s) (scopes : t.scopes = s.scopes)
    (instances : t.slots.instances = s.slots.instances) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences) (tokens : Laws.State.allQueuedTokens t = Laws.State.allQueuedTokens s) (slots : t.slots = s.slots)
    (signals : ∀ signal ∈ (Laws.State.allSignals t), signal ∈ (Laws.State.allSignals s) ∨ SignalPlaced program t signal) : PlacedLane program t := by
  have place : ∀ {element x}, PlacedIn program s element x → PlacedIn program t element x :=
    fun placed => placed.same scopes fun _ inside => instances ▸ inside
  have ids : scopeIds t = scopeIds s := by unfold scopeIds; rw [scopes]
  have begins : ∀ request, Queued s request → request.scope ∈ scopeIds t → BeginPlaced program t request :=
    fun request queued stands => have placed := lane.begins request queued (ids ▸ stands)
      ⟨place placed.element, fun o member same => place (placed.reserved o (occurrences o member) same), placed.incoming⟩
  have runs : ∀ run ∈ t.slots.compensation.runs, run ∈ s.slots.compensation.runs ∨ RunHeldPlaced program t run :=
    fun _ member => .inl (slots ▸ member)
  have issued : ∀ {y : ScopeOccurrenceId}, Laws.State.ScopeIssued s y → Laws.State.ScopeIssued t y :=
    (Laws.State.ScopeGrows.of_same ids ordinals).issued
  refine ⟨⟨⟨by rw [instances]; exact lane.placed.rooted, by rw [scopes, instances]; exact lane.placed.entered,
    fun o member => place (lane.placed.occurrences o (occurrences o member))⟩, by rw [instances]; exact lane.rootsApart,
    fun entry member => issued (lane.rootsIssued entry (instances ▸ member)), by rw [instances]; exact lane.rootDefinition,
    fun entry member element parent named link stands => place (lane.scopes entry (scopes ▸ member) element parent named
      link (ids ▸ stands)), fun o member => lane.incoming o (occurrences o member),
    fun waiting member o inside named target ends => place (lane.parked waiting (slots ▸ member) o (occurrences o inside)
      named target ends), fun run member => lane.resumes run (slots ▸ member)⟩,
    fun flow scope target member ends => place (lane.tokens flow scope target (tokens ▸ member) ends),
    fun request queued stands => ?_, fun element scope leave pending => ?_, fun host element scope queued stands => ?_,
    fun occurrence gateway scope queued stands => ?_, fun id selected writes rule queued => ?_,
    fun _ _ resumed => compensates_carry lane signals resumed,
    fun record member stands element named => place (lane.records record (slots ▸ member) (ids ▸ stands) element named),
    fun run member stands record inside element named => place (lane.pending run (slots ▸ member) (ids ▸ stands) record
      inside element named), fun entry member called => ?_, by rw [scopes]; exact lane.rootBare,
    fun run member stands => place (lane.runs run (slots ▸ member) (ids ▸ stands)),
    fun raised origin queued stands => ?_, fun x work => ?_,
    fun waiting member o inside named => lane.waits waiting (slots ▸ member) o (occurrences o inside) named⟩
  · rcases queued with signalled | deferred
    · rcases signals _ signalled with old | new
      · exact begins request (.inl old) stands
      · exact new.begin request rfl stands
    · exact begins request (.inr (tokens ▸ deferred)) stands
  · rcases occurAt_carry signals runs pending with old | new
    · obtain ⟨placed, listed⟩ := lane.occurs element scope leave old
      exact ⟨fun stands => place (placed (ids ▸ stands)), listed⟩
    · exact new.1
  · rcases signals _ queued with old | new
    · exact place (lane.arms host element scope old (ids ▸ stands))
    · exact new.arm host element scope rfl stands
  · rcases signals _ queued with old | new
    · exact place (lane.gateways occurrence gateway scope old (ids ▸ stands))
    · exact new.armGateway occurrence gateway scope rfl stands
  · rcases signals _ queued with old | new
    · exact fun o member named flow inside target ends =>
        place (lane.completes id selected writes rule old o (occurrences o member) named flow inside target ends)
    · exact new.complete id selected writes rule rfl
  · have apart := lane.calledApart entry (scopes ▸ member) called
    exact ⟨apart.1, fun owner inside owns => apart.2 owner (occurrences owner inside) owns⟩
  · rcases signals _ queued with old | new
    · exact place (lane.raises raised origin old (ids ▸ stands))
    · exact (new.raise raised origin rfl).1 stands
  · rcases work with ⟨element, leave, pending⟩ | ⟨raised, origin, queued, rfl⟩ | ⟨record, member, rfl⟩ |
        ⟨run, member, rfl, pending⟩ | ⟨run, member, rfl⟩
    · rcases occurAt_carry signals runs pending with old | new
      · exact issued (lane.issued _ (.inl ⟨element, leave, old⟩))
      · exact new.2
    · rcases signals _ queued with old | new
      · exact issued (lane.issued _ (.inr (.inl ⟨raised, origin, old, rfl⟩)))
      · exact (new.raise raised origin rfl).2
    · exact issued (lane.issued _ (.inr (.inr (.inl ⟨record, slots ▸ member, rfl⟩))))
    · exact issued (lane.issued _ (.inr (.inr (.inr (.inl ⟨run, slots ▸ member, rfl, pending⟩)))))
    · exact issued (lane.issued _ (.inr (.inr (.inr (.inr ⟨run, slots ▸ member, rfl⟩)))))

/-- A signal placed in `s` is placed in a state with its scope occurrences, instance entries, occurrence records and
counter. -/
theorem SignalPlaced.same {signal : Signal} (placed : SignalPlaced program s signal) (scopes : t.scopes = s.scopes)
    (instances : t.slots.instances = s.slots.instances) (occurrences : t.occurrences = s.occurrences)
    (ordinals : t.scopeOrdinals = s.scopeOrdinals) : SignalPlaced program t signal := by
  have place : ∀ {element x}, PlacedIn program s element x → PlacedIn program t element x :=
    fun placed => placed.same scopes fun _ inside => instances ▸ inside
  have ids : scopeIds t = scopeIds s := by unfold scopeIds; rw [scopes]
  have issued : ∀ {y}, Laws.State.ScopeIssued s y → Laws.State.ScopeIssued t y :=
    (Laws.State.ScopeGrows.of_same ids ordinals).issued
  have occur : ∀ {element x leave}, OccurPlaced program s element x leave → OccurPlaced program t element x leave :=
    fun ⟨⟨placed, listed⟩, below⟩ => ⟨⟨fun stands => place (placed (ids ▸ stands)), listed⟩, issued below⟩
  refine ⟨fun request same stands => ?_, fun _ _ _ _ _ same => occur (placed.occur _ _ _ _ _ same),
    fun _ _ _ _ _ same => ?_, fun _ _ _ same stands => place (placed.arm _ _ _ same (ids ▸ stands)),
    fun _ _ _ same stands => place (placed.armGateway _ _ _ same (ids ▸ stands)),
    fun _ _ _ _ same o member named flow inside target ends => place (placed.complete _ _ _ _ same o
      (occurrences ▸ member) named flow inside target ends), fun _ _ same => ?_⟩
  · have begun := placed.begin request same (ids ▸ stands)
    exact ⟨place begun.element, fun o member named => place (begun.reserved o (occurrences ▸ member) named),
      begun.incoming⟩
  · obtain ⟨occurs, completes⟩ := placed.compensate _ _ _ _ _ same
    exact ⟨fun _ _ _ resumes => occur (occurs _ _ _ resumes), completes⟩
  · obtain ⟨there, below⟩ := placed.raise _ _ same
    exact ⟨fun stands => place (there (ids ▸ stands)), issued below⟩

/-- Queuing a signal the lane places keeps it. -/
theorem PlacedLane.signalled {signal : Signal} (lane : PlacedLane program s) (placed : SignalPlaced program s signal) :
    PlacedLane program (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact lane.queue rfl rfl rfl (fun _ member => member) rfl rfl fun x member =>
    listExtended (list := Laws.State.allSignals s)
      (fun x member => by rw [List.mem_singleton.mp member]; exact placed.same rfl rfl rfl rfl) x
      (by rwa [Laws.State.allSignals_append] at member)

/-- Issuing an identifier keeps the lane. -/
theorem PlacedLane.takePosition (lane : PlacedLane program s) : PlacedLane program s.takePosition.1 := by
  rw [Laws.State.takePosition_eq]
  exact lane.queue rfl rfl rfl (fun _ member => member) rfl rfl listKept

/-- Dropping an occurrence's record keeps the lane. -/
theorem PlacedLane.withoutRecord (lane : PlacedLane program s) (id : OccurrenceId) :
    PlacedLane program (Laws.State.withoutRecord s id) :=
  lane.queue rfl rfl rfl (fun _ member => (List.mem_filter.mp member).1) rfl rfl listKept

end Carry

end Kernel.Proofs.Former
