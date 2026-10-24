module

public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission

/-! SMIS-ADMIT-01 connects task-barrier cuts and exact graph conservation to the admitted automatic-step bounds. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.StructuredParallelBody

/-- SMIS-ADMIT-01 separates enabled arrivals from armed Task outputs at a current body cut. -/
structure TaskBarrierCut (vertices : List Vertex) where
  fired : String → Nat
  completed : String → Nat
  waiting : String → Nat
  enabled : String → Nat
  startCredit : ∀ vertex ∈ vertices, vertex.kind = .start → fired vertex.id ≤ 1
  taskPartition : ∀ vertex ∈ vertices, vertex.kind = .task →
    fired vertex.id = completed vertex.id + waiting vertex.id
  readyConservation : ∀ vertex ∈ vertices, vertex.kind ≠ .start →
    enabled vertex.id + fired vertex.id * incomingCount vertices vertex.id =
      (vertices.map (fun predecessor =>
        (if predecessor.kind = .task then completed predecessor.id else fired predecessor.id) *
          predecessor.outputs.count vertex.id)).sum

def TaskBarrierCut.released (cut : TaskBarrierCut vertices) (vertex : Vertex) : Nat :=
  if vertex.kind = .task then cut.completed vertex.id else cut.fired vertex.id

def TaskBarrierCut.blocked (cut : TaskBarrierCut vertices) (vertex : Vertex) : Nat :=
  if vertex.kind = .task then cut.waiting vertex.id else 0

def TaskBarrierCut.continuationCredit (cut : TaskBarrierCut vertices) (target : String) : Nat :=
  cut.enabled target +
    (vertices.map (fun predecessor => cut.blocked predecessor * predecessor.outputs.count target)).sum

private theorem sum_map_add {α : Type} (values : List α) (left right : α → Nat) :
    (values.map (fun value => left value + right value)).sum =
      (values.map left).sum + (values.map right).sum := by
  induction values with
  | nil => simp
  | cons head tail ih => simp only [List.map_cons, List.sum_cons, ih]; omega

theorem TaskBarrierCut.firing_partition (cut : TaskBarrierCut vertices)
    (vertex : Vertex) (member : vertex ∈ vertices) :
    cut.fired vertex.id = cut.released vertex + cut.blocked vertex := by
  by_cases task : vertex.kind = .task
  · simpa only [TaskBarrierCut.released, TaskBarrierCut.blocked, task, ite_true] using
      cut.taskPartition vertex member task
  · simp only [TaskBarrierCut.released, TaskBarrierCut.blocked, task, ite_false, Nat.add_zero]

/-- Waiting credit is counted at its output, while readiness still uses only released arrivals. -/
theorem TaskBarrierCut.continuation_conservation (cut : TaskBarrierCut vertices)
    (vertex : Vertex) (member : vertex ∈ vertices) (notStart : vertex.kind ≠ .start) :
    cut.continuationCredit vertex.id + cut.fired vertex.id * incomingCount vertices vertex.id =
      (vertices.map (fun predecessor => cut.fired predecessor.id * predecessor.outputs.count vertex.id)).sum := by
  have incoming := cut.readyConservation vertex member notStart
  have partition :
      (vertices.map (fun predecessor => cut.fired predecessor.id * predecessor.outputs.count vertex.id)).sum =
        (vertices.map (fun predecessor => cut.released predecessor * predecessor.outputs.count vertex.id)).sum +
          (vertices.map (fun predecessor => cut.blocked predecessor * predecessor.outputs.count vertex.id)).sum := by
    rw [← sum_map_add]
    apply congrArg List.sum
    apply List.map_congr_left
    intro predecessor present
    rw [cut.firing_partition predecessor present, Nat.add_mul]
  change cut.enabled vertex.id + _ = _ at incoming
  unfold TaskBarrierCut.continuationCredit
  unfold TaskBarrierCut.released at partition
  omega

/-- Exact current-body conservation supplies the incoming budget consumed by structural admission. -/
theorem TaskBarrierCut.incoming_budget (cut : TaskBarrierCut vertices)
    (vertex : Vertex) (member : vertex ∈ vertices) (notStart : vertex.kind ≠ .start) :
    cut.fired vertex.id * incomingCount vertices vertex.id ≤
      (vertices.map (fun predecessor => cut.fired predecessor.id * predecessor.outputs.count vertex.id)).sum := by
  have conservation := cut.continuation_conservation vertex member notStart
  omega

theorem TaskBarrierCut.firing_count_le_one (cut : TaskBarrierCut vertices)
    (ordered : List Vertex) (admitted : structureOrder vertices = some ordered) :
    ∀ vertex ∈ vertices, cut.fired vertex.id ≤ 1 := by
  exact structureOrder_firing_count_le_one vertices ordered admitted cut.fired
    cut.startCredit cut.incoming_budget

theorem TaskBarrierCut.released_le_fired (cut : TaskBarrierCut vertices)
    (vertex : Vertex) (member : vertex ∈ vertices) :
    cut.released vertex ≤ cut.fired vertex.id := by
  have partition := cut.firing_partition vertex member
  omega

theorem TaskBarrierCut.waiting_le_one (cut : TaskBarrierCut vertices)
    (ordered : List Vertex) (admitted : structureOrder vertices = some ordered)
    (vertex : Vertex) (member : vertex ∈ vertices) : cut.blocked vertex ≤ 1 := by
  have bounded := cut.firing_count_le_one ordered admitted vertex member
  have partition := cut.firing_partition vertex member
  omega

private theorem incomingCount_eq_sum (vertices : List Vertex) (target : String) :
    incomingCount vertices target = (vertices.map (fun vertex => vertex.outputs.count target)).sum := by
  induction vertices with
  | nil => simp [incomingCount]
  | cons head tail ih =>
      simpa only [incomingCount, List.flatMap_cons, List.count_append, List.map_cons, List.sum_cons] using
        congrArg (head.outputs.count target + ·) ih

private theorem sum_map_le {α : Type} (values : List α) (left right : α → Nat)
    (bounded : ∀ value ∈ values, left value ≤ right value) :
    (values.map left).sum ≤ (values.map right).sum := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      have first := bounded head (by simp)
      have rest := ih (fun value member => bounded value (by simp [member]))
      simp only [List.map_cons, List.sum_cons]
      omega

private theorem sum_map_lt_of_member {α : Type} (values : List α) (left right : α → Nat)
    (bounded : ∀ value ∈ values, left value ≤ right value)
    (selected : α) (member : selected ∈ values) (strict : left selected < right selected) :
    (values.map left).sum < (values.map right).sum := by
  induction values with
  | nil => simp at member
  | cons head tail ih =>
      have first := bounded head (by simp)
      rcases List.mem_cons.mp member with rfl | present
      · have tailBound := sum_map_le tail left right
          (fun value present => bounded value (by simp [present]))
        simp only [List.map_cons, List.sum_cons]
        omega
      · have tailStrict := ih (fun value present => bounded value (by simp [present])) present
        simp only [List.map_cons, List.sum_cons]
        omega

/-- A Join cannot cross a still-blocked incoming branch, even when its independent inputs have arrived. -/
theorem TaskBarrierCut.unreleased_predecessor_blocks (cut : TaskBarrierCut vertices)
    (ordered : List Vertex) (admitted : structureOrder vertices = some ordered)
    (predecessor vertex : Vertex) (predecessorMember : predecessor ∈ vertices)
    (member : vertex ∈ vertices) (notStart : vertex.kind ≠ .start)
    (edge : vertex.id ∈ predecessor.outputs) (blocked : cut.released predecessor = 0) :
    cut.fired vertex.id = 0 := by
  have bounded := cut.firing_count_le_one ordered admitted
  have weights : ∀ prior ∈ vertices,
      cut.released prior * prior.outputs.count vertex.id ≤ prior.outputs.count vertex.id := by
    intro prior present
    have release := cut.released_le_fired prior present
    have unit := bounded prior present
    have limited : cut.released prior ≤ 1 := by omega
    simpa using Nat.mul_le_mul_right (prior.outputs.count vertex.id) limited
  have strict : cut.released predecessor * predecessor.outputs.count vertex.id < predecessor.outputs.count vertex.id := by
    simpa only [blocked, Nat.zero_mul] using List.count_pos_iff.mpr edge
  have capacity := sum_map_lt_of_member vertices
    (fun prior => cut.released prior * prior.outputs.count vertex.id)
    (fun prior => prior.outputs.count vertex.id) weights predecessor predecessorMember strict
  rw [← incomingCount_eq_sum] at capacity
  have incoming := cut.readyConservation vertex member notStart
  change cut.enabled vertex.id + cut.fired vertex.id * incomingCount vertices vertex.id =
    (vertices.map (fun prior => cut.released prior * prior.outputs.count vertex.id)).sum at incoming
  by_cases fired : cut.fired vertex.id = 0
  · exact fired
  · have positive : 1 ≤ cut.fired vertex.id := by omega
    have required : incomingCount vertices vertex.id ≤ cut.fired vertex.id * incomingCount vertices vertex.id := by
      simpa using Nat.mul_le_mul_right (incomingCount vertices vertex.id) positive
    omega

theorem TaskBarrierCut.waiting_task_unreleased (cut : TaskBarrierCut vertices)
    (ordered : List Vertex) (admitted : structureOrder vertices = some ordered)
    (task : Vertex) (member : task ∈ vertices) (isTask : task.kind = .task)
    (waiting : cut.waiting task.id = 1) : cut.released task = 0 := by
  have bounded := cut.firing_count_le_one ordered admitted task member
  have partition := cut.taskPartition task member isTask
  simp only [TaskBarrierCut.released, isTask, ite_true]
  omega

end BpmnSemantics.SemanticProcess.StructuredParallelBody
