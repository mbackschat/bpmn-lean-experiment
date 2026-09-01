import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! # Compensation Event Sub-Process snapshot commutation atoms

These helpers classify the snapshot-specific atoms even though the proved commutation lane admits
only ordinary wait-arming operations. Entry, completion, Error, Timer interruption, and cancellation
therefore remain fail-closed in `internalTransitionFootprint?`; a later proof may compose these atoms
with their complete operation footprints without changing their identity account.
-/

namespace BpmnSemantics.SemanticProcess

/- Snapshot atoms extend rather than enlarge the legacy atom type: the 3 GiB cost gate on
`BpmnSemantics.MessageStartConformance` showed that changing the shared inductive makes every
legacy kernel-decided footprint witness elaborate the new family. See the dated evidence in
`docs/CAPSULE-COST-LEDGER.md`. -/
inductive CompensationSnapshotStateAtom where
  | ordinary (atom : InternalStateAtom)
  | compensationParentContextCapacity
  | compensationParentContextRetention (parent : RuntimeScopeOccurrence)
  deriving Repr, DecidableEq

namespace CompensationSnapshotInternalCommutation

private def runtimeScopeOccurrenceBefore
    (left right : RuntimeScopeOccurrence) : Bool :=
  if left.id ≠ right.id then InternalCommutation.scopeBefore left.id right.id
  else
    match left.parent, right.parent with
    | none, some _ => true
    | some leftParent, some rightParent =>
        InternalCommutation.scopeBefore leftParent rightParent
    | _, _ => false

private def atomRank : CompensationSnapshotStateAtom → Nat
  | .ordinary atom =>
      let rank := InternalCommutation.stateAtomRank atom
      if rank < 7 then rank else rank + 2
  | .compensationParentContextCapacity => 7
  | .compensationParentContextRetention _ => 8

private def atomBefore
    (left right : CompensationSnapshotStateAtom) : Bool :=
  if atomRank left ≠ atomRank right then atomRank left < atomRank right
  else
    match left, right with
    | .ordinary left, .ordinary right => InternalCommutation.stateAtomBefore left right
    | .compensationParentContextCapacity, .compensationParentContextCapacity => false
    | .compensationParentContextRetention left,
        .compensationParentContextRetention right =>
        runtimeScopeOccurrenceBefore left right
    | _, _ => false

private def canonicalAtomSet
    (atoms : List CompensationSnapshotStateAtom) : List CompensationSnapshotStateAtom :=
  InternalCommutation.sortBy atomBefore atoms.eraseDups

end CompensationSnapshotInternalCommutation

/-- Exact reservation atoms, including the shared capacity measure. -/
def compensationSnapshotReservationAtoms (program : Program)
    (parent : RuntimeScopeOccurrence) : List CompensationSnapshotStateAtom :=
  match program.compensationEventSubProcessSnapshots with
  | none => []
  | some declaration =>
      if declaration.targets.any fun target =>
          target.parentScopeId == parent.id.definitionScopeId then
        [.compensationParentContextCapacity,
          .compensationParentContextRetention parent]
      else []

/-- Promotion reads the complete Process context and rewrites the exact reservation. -/
def compensationSnapshotPromotionAtoms (program : Program) (state : RuntimeState)
    (parent : RuntimeScopeOccurrence) :
    List CompensationSnapshotStateAtom × List CompensationSnapshotStateAtom :=
  let snapshotAtoms := compensationSnapshotReservationAtoms program parent
  if snapshotAtoms.isEmpty then ([], [])
  else
    (CompensationSnapshotInternalCommutation.canonicalAtomSet <| snapshotAtoms ++
      state.variables.process.bindings.map fun binding =>
        .ordinary (.processVariable parent.id.processInstanceId binding.name),
      CompensationSnapshotInternalCommutation.canonicalAtomSet snapshotAtoms)

/-- Purge owns each exact record whose parent or containing root belongs to the removed region. -/
def compensationSnapshotPurgeAtoms (state : RuntimeState)
    (removed : ScopeOccurrenceId → Bool) : List CompensationSnapshotStateAtom :=
  let owned := state.compensationParentContextRetentions.filter fun retention =>
    removed retention.parent.id ||
      match retention.parent.parent with
      | none => false
      | some root => removed root
  if owned.isEmpty then []
  else
    CompensationSnapshotInternalCommutation.canonicalAtomSet <|
      .compensationParentContextCapacity ::
        owned.map fun retention =>
          .compensationParentContextRetention retention.parent

end BpmnSemantics.SemanticProcess
