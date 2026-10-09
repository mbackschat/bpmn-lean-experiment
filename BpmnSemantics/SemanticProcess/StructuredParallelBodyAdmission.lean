import BpmnSemantics.SemanticProcess.GraphReachability

/-! SMIS-ADMIT-01 recognizes serial/paired regions and separate Ends, then counts task-cut automatic bursts. -/

namespace BpmnSemantics.SemanticProcess.StructuredParallelBody

inductive Kind where
  | start | task | fork | join | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  kind : Kind
  outputs : List String
  deriving Repr, DecidableEq

structure Bursts where
  entry : Nat
  resumption : Nat
  terminal : Nat
  deriving Repr, DecidableEq

def incomingCount (vertices : List Vertex) (id : String) : Nat :=
  (vertices.flatMap (·.outputs)).count id

def edges (vertices : List Vertex) : List (GraphEdge String) :=
  vertices.flatMap fun vertex => vertex.outputs.map fun target => ⟨vertex.id, target⟩

def aritiesValid (vertices : List Vertex) : Bool :=
  vertices.all fun vertex =>
    let inputs := incomingCount vertices vertex.id
    let outputs := vertex.outputs.length
    vertex.outputs.all (fun target => vertices.any (·.id == target)) &&
      match vertex.kind with
      | .start => inputs == 0 && outputs == 1
      | .task => inputs == 1 && outputs == 1
      | .fork => inputs == 1 && outputs ≥ 2
      | .join => inputs ≥ 2 && outputs == 1
      | .finish => inputs == 1 && outputs == 0

private def orderPending : Nat → List (Vertex × Nat) → Option (List Vertex)
  | 0, pending => if pending.isEmpty then some [] else none
  | fuel + 1, pending => do
      if pending.isEmpty then return []
      let (first, _) ← pending.find? (·.2 == 0)
      let remaining := (pending.filter (·.1.id != first.id)).map fun (vertex, incoming) =>
        (vertex, incoming - first.outputs.count vertex.id)
      let rest ← orderPending fuel remaining
      return first :: rest

/-- Kahn's indegree update preserves edge multiplicity without recounting the graph for each candidate. -/
def topologicalOrder (fuel : Nat) (vertices : List Vertex) : Option (List Vertex) :=
  orderPending fuel (vertices.map fun vertex => (vertex, incomingCount vertices vertex.id))

private theorem deduplicated_length_le (values : List String) :
    values.eraseDups.length ≤ values.length := by
  cases values with
  | nil => simp
  | cons head tail =>
      rw [List.eraseDups_cons]
      have smaller := deduplicated_length_le (tail.filter (fun value => !(value == head)))
      have retained := List.length_filter_le (fun value => !(value == head)) tail
      simp only [List.length_cons]
      omega
termination_by values.length
decreasing_by
  exact Nat.lt_succ_of_le (List.length_filter_le _ _)

private theorem unique_of_deduplicated_length (values : List String)
    (same : values.eraseDups.length = values.length) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      rw [List.eraseDups_cons] at same
      have small := deduplicated_length_le (tail.filter (fun value => !(value == head)))
      have retained := List.length_filter_le (fun value => !(value == head)) tail
      have lengthEqual : (tail.filter (fun value => !(value == head))).length = tail.length := by
        simp only [List.length_cons] at same
        omega
      have all := List.length_filter_eq_length_iff.mp lengthEqual
      have unchanged : tail.filter (fun value => !(value == head)) = tail :=
        List.filter_eq_self.mpr all
      rw [unchanged] at same
      apply List.nodup_cons.mpr
      refine ⟨?_, ih (by simpa using same)⟩
      intro member
      simpa using all head member

private theorem pending_split (pending : List (Vertex × Nat)) (chosen : Vertex × Nat)
    (unique : (pending.map (fun value => value.1.id)).Nodup) (member : chosen ∈ pending) :
    (pending.map Prod.fst).Perm
      (chosen.1 :: (pending.filter (fun value => value.1.id != chosen.1.id)).map Prod.fst) := by
  induction pending with
  | nil => simp at member
  | cons head tail ih =>
      simp only [List.map_cons, List.nodup_cons] at unique
      rcases List.mem_cons.mp member with equal | member
      · subst chosen
        have unchanged : tail.filter (fun value => value.1.id != head.1.id) = tail := by
          apply List.filter_eq_self.mpr
          intro value present
          have different : value.1.id ≠ head.1.id := by
            intro equal
            apply unique.1
            exact List.mem_map.mpr ⟨value, present, equal⟩
          simpa using different
        simp [unchanged]
      · have different : head.1.id ≠ chosen.1.id := by
          intro equal
          apply unique.1
          exact List.mem_map.mpr ⟨chosen, member, equal.symm⟩
        simpa [different] using
          (List.Perm.cons head.1 (ih unique.2 member)).trans
            (List.Perm.swap chosen.1 head.1
              ((tail.filter (fun value => value.1.id != chosen.1.id)).map Prod.fst))

private theorem orderPending_certificate (fuel : Nat) (pending : List (Vertex × Nat))
    (ordered : List Vertex)
    (unique : (pending.map (fun value => value.1.id)).Nodup)
    (counts : ∀ value ∈ pending,
      value.2 = incomingCount (pending.map Prod.fst) value.1.id)
    (success : orderPending fuel pending = some ordered) :
    (pending.map Prod.fst).Perm ordered ∧
      ordered.Pairwise (fun earlier later => earlier.id ∉ later.outputs) ∧
      (∀ vertex ∈ ordered, vertex.id ∉ vertex.outputs) := by
  induction fuel generalizing pending ordered with
  | zero =>
      simp only [orderPending] at success
      split at success
      · rename_i empty
        have : pending = [] := List.isEmpty_iff.mp empty
        subst pending
        simp_all
      · contradiction
  | succ fuel ih =>
      simp only [orderPending] at success
      split at success
      · rename_i empty
        have : pending = [] := List.isEmpty_iff.mp empty
        subst pending
        simp_all
      · cases found : pending.find? (fun value => value.2 == 0) with
        | none => simp [found] at success
        | some chosen =>
          have member := List.mem_of_find?_eq_some found
          have zero : chosen.2 = 0 := by simpa using List.find?_some found
          have split := pending_split pending chosen unique member
          let filtered := pending.filter (fun value => value.1.id != chosen.1.id)
          let remaining := filtered.map fun value =>
            (value.1, value.2 - chosen.1.outputs.count value.1.id)
          have vertices : remaining.map Prod.fst = filtered.map Prod.fst := by
            simp [remaining, List.map_map]
          have incoming (id : String) : incomingCount (pending.map Prod.fst) id =
              chosen.1.outputs.count id + incomingCount (filtered.map Prod.fst) id := by
            have perm := split.flatMap_right (fun vertex => vertex.outputs)
            have same := perm.count_eq id
            simpa [incomingCount, filtered] using same
          have nextUnique : (remaining.map (fun value => value.1.id)).Nodup := by
            have retained : (filtered.map (fun value => value.1.id)).Nodup :=
              (List.filter_sublist.map (fun value : Vertex × Nat => value.1.id)).nodup unique
            simpa [remaining, List.map_map, Function.comp_def] using retained
          have nextCounts : ∀ value ∈ remaining,
              value.2 = incomingCount (remaining.map Prod.fst) value.1.id := by
            intro value present
            change value ∈ filtered.map (fun value =>
              (value.1, value.2 - chosen.1.outputs.count value.1.id)) at present
            obtain ⟨original, originalPresent, equal⟩ := List.mem_map.mp present
            subst value
            have originalMember := (List.mem_filter.mp originalPresent).1
            have equation := counts original originalMember
            rw [incoming] at equation
            simp only [vertices]
            omega
          cases recursive : orderPending fuel remaining with
          | none => simp [found, remaining, filtered, recursive] at success
          | some rest =>
            have output : ordered = chosen.1 :: rest := by
              simpa [found, remaining, filtered, recursive] using success.symm
            subst ordered
            obtain ⟨permutation, pairwise, self⟩ :=
              ih remaining rest nextUnique nextCounts recursive
            have absent : ∀ vertex ∈ pending.map Prod.fst,
                chosen.1.id ∉ vertex.outputs := by
              intro vertex present edge
              have emptyCount : incomingCount (pending.map Prod.fst) chosen.1.id = 0 := by
                rw [← counts chosen member, zero]
              apply List.not_mem_of_count_eq_zero emptyCount
              exact List.mem_flatMap.mpr ⟨vertex, present, edge⟩
            refine ⟨split.trans (List.Perm.cons _ (by simpa [vertices] using permutation)), ?_, ?_⟩
            · exact List.pairwise_cons.mpr ⟨fun vertex present =>
                absent vertex ((split.trans (List.Perm.cons _
                  (by simpa [vertices] using permutation))).mem_iff.mpr (by simp [present])), pairwise⟩
            · intro vertex present
              rcases List.mem_cons.mp present with rfl | present
              · exact absent chosen.1 (List.mem_map.mpr ⟨chosen, member, rfl⟩)
              · exact self vertex present

def replaceTarget (vertices : List Vertex) (removed replacement : String) : List Vertex :=
  vertices.map fun vertex =>
    { vertex with outputs := vertex.outputs.map fun id => if id == removed then replacement else id }

def contractAt (vertices : List Vertex) (vertex : Vertex) : Option (List Vertex) := do
  match vertex.kind with
  | .task =>
      let [next] := vertex.outputs | none
      return replaceTarget (vertices.filter (·.id != vertex.id)) vertex.id next
  | .fork =>
      let first ← vertex.outputs.head?
      let target ← vertices.find? (·.id == first)
      if vertex.outputs.all (· == first) && target.kind == .join &&
          incomingCount vertices first == vertex.outputs.length then
        let [next] := target.outputs | none
        return replaceTarget (vertices.filter fun node => node.id != vertex.id && node.id != first) vertex.id next
      else if vertex.outputs.eraseDups.length == vertex.outputs.length &&
          vertex.outputs.all (fun id => incomingCount vertices id == 1 &&
            vertices.any (fun node => node.id == id && node.kind == .finish)) then
        -- BPMN 13.3.4: this is an analysis sink, never a runtime join or first-End completion rule.
        return (vertices.filter fun node => !vertex.outputs.contains node.id).map fun node =>
          if node.id == vertex.id then { node with kind := .finish, outputs := [] } else node
      else none
  | _ => none

def paired : Nat → List Vertex → Bool
  | 0, _ => false
  | fuel + 1, vertices =>
      if vertices.length == 2 then
        match vertices.find? (·.kind == .start), vertices.find? (·.kind == .finish) with
        | some start, some finish => start.outputs == [finish.id] && finish.outputs.isEmpty
        | _, _ => false
      else match vertices.findSome? (contractAt vertices) with
        | none => false
        | some reduced => paired fuel reduced

structure Closure where
  arrivals : List String
  steps : Nat := 0
  waits : Nat := 0
  deriving Repr, DecidableEq

/-- Topological scanning counts each enabled operation once; a newly armed Task stops its own branch. -/
def close (vertices ordered : List Vertex) (arrivals : List String) : Closure :=
  ordered.foldl (init := { arrivals }) fun state vertex =>
    let enabled := if vertex.kind == .start then state.arrivals.contains vertex.id
      else state.arrivals.count vertex.id == incomingCount vertices vertex.id
    if !enabled then state
    else match vertex.kind with
      | .task => { state with steps := state.steps + 1, waits := state.waits + 1 }
      | .start => { state with arrivals := state.arrivals ++ vertex.outputs }
      | _ => { state with arrivals := state.arrivals ++ vertex.outputs, steps := state.steps + 1 }

/-- Only causally independent join inputs can have arrived before the selected Task completion. -/
def afterTask (vertices ordered : List Vertex) (task : Vertex) : Closure :=
  let descendants := reachedSet (edges vertices) vertices.length task.id
  let prior := (edges vertices).filterMap fun edge =>
    if !descendants.contains edge.source && descendants.contains edge.target &&
        vertices.any (fun vertex => vertex.id == edge.target && vertex.kind == .join) then some edge.target else none
  close vertices ordered (prior ++ task.outputs)

/-- A complete acyclic contraction certifies the selected body independently of burst limits. -/
def structureOrder (vertices : List Vertex) : Option (List Vertex) := do
  if !(vertices.all (fun vertex => !vertex.id.isEmpty) &&
      (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
      (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) then none
  else do
    let ordered ← topologicalOrder vertices.length vertices
    if !paired (vertices.length + 1) vertices then none else some ordered

/-- PMIS-ADMIT-01: successful structural admission returns the complete unique vertex
population in strict predecessor order; self edges and backward edges are excluded. -/
theorem structureOrder_certificate (vertices ordered : List Vertex)
    (success : structureOrder vertices = some ordered) :
    vertices.Perm ordered ∧ (ordered.map (·.id)).Nodup ∧
      ordered.Pairwise (fun earlier later => earlier.id ∉ later.outputs) ∧
      (∀ vertex ∈ ordered, vertex.id ∉ vertex.outputs) ∧
      (∀ vertex ∈ ordered, ∀ target ∈ vertex.outputs,
        ∃ next ∈ ordered, next.id = target) := by
  unfold structureOrder at success
  split at success
  · simp at success
  · rename_i admitted
    have checked : (vertices.all (fun vertex => !vertex.id.isEmpty) &&
        (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
        (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) = true := by
      cases value : (vertices.all (fun vertex => !vertex.id.isEmpty) &&
        (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
        (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) <;>
        simp_all
    simp only [Bool.and_eq_true, beq_iff_eq] at checked
    have unique : (vertices.map (·.id)).Nodup :=
      unique_of_deduplicated_length _ (by simpa using checked.1.1.1.2)
    cases ordering : topologicalOrder vertices.length vertices with
    | none => simp [ordering] at success
    | some result =>
      split at success
      · simp at success
      · have equal : result = ordered := by simpa [ordering] using success
        subst result
        obtain ⟨permutation, pairwise, self⟩ := orderPending_certificate vertices.length
          (vertices.map fun vertex => (vertex, incomingCount vertices vertex.id)) ordered
          (by simpa [List.map_map, Function.comp_def] using unique)
          (by intro value member; obtain ⟨vertex, _, rfl⟩ := List.mem_map.mp member; simp [List.map_map, Function.comp_def])
          ordering
        have population : vertices.Perm ordered := by simpa [List.map_map, Function.comp_def] using permutation
        refine ⟨population, (population.map (·.id)).nodup_iff.mp unique, pairwise, self, ?_⟩
        intro vertex present target edge
        have vertexMember := population.mem_iff.mpr present
        have arities : aritiesValid vertices = true := checked.1.1.2
        have arity := List.all_eq_true.mp arities vertex vertexMember
        have targets : vertex.outputs.all (fun target => vertices.any (·.id == target)) = true :=
          (Bool.and_eq_true_iff.mp arity).1
        obtain ⟨next, member, equal⟩ := List.any_eq_true.mp (List.all_eq_true.mp targets target edge)
        exact ⟨next, population.mem_iff.mp member, by simpa using equal⟩

private theorem incoming_budget_bound (vertices : List Vertex) (fire : String → Nat)
    (target : String)
    (bounded : ∀ vertex ∈ vertices, vertex.outputs.count target ≠ 0 → fire vertex.id ≤ 1) :
    (vertices.map (fun vertex => fire vertex.id * vertex.outputs.count target)).sum ≤
      incomingCount vertices target := by
  induction vertices with
  | nil => simp [incomingCount]
  | cons head tail ih =>
      have rest := ih (fun vertex member => bounded vertex (by simp [member]))
      have headBound : fire head.id * head.outputs.count target ≤ head.outputs.count target := by
        by_cases zero : head.outputs.count target = 0
        · simp [zero]
        · simpa using Nat.mul_le_mul_right (head.outputs.count target)
            (bounded head (by simp) zero)
      simp only [List.map_cons, List.sum_cons, incomingCount, List.flatMap_cons,
        List.count_append] at rest ⊢
      omega

private theorem firing_scan (graph : List Vertex) (fire : String → Nat)
    (start : ∀ vertex ∈ graph, vertex.kind = .start → fire vertex.id ≤ 1)
    (positive : ∀ vertex ∈ graph, vertex.kind ≠ .start → 0 < incomingCount graph vertex.id)
    (budget : ∀ vertex ∈ graph, vertex.kind ≠ .start →
      fire vertex.id * incomingCount graph vertex.id ≤
        (graph.map (fun pred => fire pred.id * pred.outputs.count vertex.id)).sum)
    (rest priorVertices : List Vertex) (population : graph.Perm (priorVertices ++ rest))
    (prior : ∀ vertex ∈ priorVertices, fire vertex.id ≤ 1)
    (ordered : rest.Pairwise (fun earlier later => earlier.id ∉ later.outputs))
    (self : ∀ vertex ∈ rest, vertex.id ∉ vertex.outputs) :
    ∀ vertex ∈ rest, fire vertex.id ≤ 1 := by
  induction rest generalizing priorVertices with
  | nil => simp
  | cons head tail ih =>
      have headMember : head ∈ graph := population.mem_iff.mpr (by simp)
      have nextOrder := List.pairwise_cons.mp ordered
      have headBound : fire head.id ≤ 1 := by
        by_cases synthetic : head.kind = .start
        · exact start head headMember synthetic
        · have weighted := incoming_budget_bound graph fire head.id (by
            intro pred member nonzero
            have present := population.mem_iff.mp member
            rcases List.mem_append.mp present with before | after
            · exact prior pred before
            · rcases List.mem_cons.mp after with equal | later
              · subst pred
                exact False.elim (nonzero (List.count_eq_zero.mpr (self head (by simp))))
              · exact False.elim (nonzero (List.count_eq_zero.mpr (nextOrder.1 pred later))))
          have supply := budget head headMember synthetic
          have nonempty := positive head headMember synthetic
          by_cases bounded : fire head.id ≤ 1
          · exact bounded
          · have twice := Nat.mul_le_mul_right (incomingCount graph head.id)
                (show 2 ≤ fire head.id by omega)
            simp only [Nat.succ_mul, Nat.zero_mul, Nat.zero_add] at twice
            omega
      have remaining := ih (priorVertices ++ [head])
        (by simpa [List.append_assoc] using population)
        (by intro vertex member; rcases List.mem_append.mp member with old | new
            · exact prior vertex old
            · have equal : vertex = head := by simpa using new
              subst vertex
              exact headBound)
        nextOrder.2 (fun vertex member => self vertex (by simp [member]))
      intro vertex member
      rcases List.mem_cons.mp member with rfl | later
      · exact headBound
      · exact remaining vertex later

/-- PMIS-ADMIT-01's strict graph order turns a one-shot Start and incoming-flow
budget into a firing bound; the budget remains a separate execution obligation. -/
theorem structureOrder_firing_count_le_one (vertices ordered : List Vertex)
    (success : structureOrder vertices = some ordered) (fire : String → Nat)
    (start : ∀ vertex ∈ vertices, vertex.kind = .start → fire vertex.id ≤ 1)
    (budget : ∀ vertex ∈ vertices, vertex.kind ≠ .start →
      fire vertex.id * incomingCount vertices vertex.id ≤
        (vertices.map (fun pred => fire pred.id * pred.outputs.count vertex.id)).sum) :
    ∀ vertex ∈ vertices, fire vertex.id ≤ 1 := by
  obtain ⟨population, _, pairwise, self, _⟩ := structureOrder_certificate vertices ordered success
  have arities : aritiesValid vertices = true := by
    unfold structureOrder at success
    split at success
    · simp at success
    · rename_i admitted
      have checked : (vertices.all (fun vertex => !vertex.id.isEmpty) &&
          (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
          (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) = true := by
        cases value : (vertices.all (fun vertex => !vertex.id.isEmpty) &&
          (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
          (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) <;> simp_all
      simp only [Bool.and_eq_true] at checked
      exact checked.1.1.2
  have positive : ∀ vertex ∈ vertices, vertex.kind ≠ .start →
      0 < incomingCount vertices vertex.id := by
    intro vertex member nonstart
    have shape := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp arities vertex member)).2
    cases kind : vertex.kind <;> simp [kind, beq_iff_eq, decide_eq_true_eq] at shape nonstart <;> omega
  have bounded := firing_scan vertices fire start positive budget ordered []
    (by simpa using population) (by simp) pairwise self
  intro vertex member
  exact bounded vertex (population.mem_iff.mp member)

def analyze (vertices : List Vertex) : Option Bursts := do
  let ordered ← structureOrder vertices
  let start ← vertices.find? (·.kind == .start)
  let resumed := (vertices.filter (·.kind == .task)).map (afterTask vertices ordered)
  return {
    entry := (close vertices ordered [start.id]).steps
    resumption := resumed.foldl (fun maximum result => max maximum result.steps) 0
    terminal := resumed.foldl (fun maximum result => if result.waits == 0 then max maximum result.steps else maximum) 0 }


structure FrontierCapacity where
  waits : Nat := 0
  effects : Nat := 0
  deriving Repr, DecidableEq

private def serialCapacity (left right : FrontierCapacity) : FrontierCapacity :=
  ⟨max left.waits right.waits, max left.effects right.effects⟩

private def parallelCapacity (left right : FrontierCapacity) : FrontierCapacity :=
  ⟨left.waits + right.waits, left.effects + right.effects⟩

private structure WeightedVertex where
  id : String
  kind : Kind
  outputs : List (String × FrontierCapacity)
  weight : FrontierCapacity := {}

private def replaceWeighted (vertices : List WeightedVertex) (removed replacement : String)
    (weight : FrontierCapacity) : List WeightedVertex :=
  vertices.map fun vertex => { vertex with outputs := vertex.outputs.map fun (id, prior) =>
    if id == removed then (replacement, serialCapacity prior weight) else (id, prior) }

/-- PMIS-ADMIT-01: task elimination takes serial maxima; paired branches add independent frontier capacities. -/
private def contractWeighted (vertices : List WeightedVertex) (vertex : WeightedVertex) : Option (List WeightedVertex) := do
  match vertex.kind with
  | .task =>
      let [(next, width)] := vertex.outputs | none
      return replaceWeighted (vertices.filter (·.id != vertex.id)) vertex.id next (serialCapacity vertex.weight width)
  | .fork =>
      let (first, _) ← vertex.outputs.head?
      let target ← vertices.find? (·.id == first)
      let incoming := fun id => ((vertices.flatMap (·.outputs)).map (·.1)).count id
      if vertex.outputs.all (fun edge => edge.1 == first) && target.kind == .join && incoming first == vertex.outputs.length then
        let [(next, width)] := target.outputs | none
        let branches := vertex.outputs.foldl (fun total edge => parallelCapacity total edge.2) {}
        return replaceWeighted (vertices.filter fun node => node.id != vertex.id && node.id != first)
          vertex.id next (serialCapacity branches width)
      else if (vertex.outputs.map (·.1)).eraseDups.length == vertex.outputs.length &&
          vertex.outputs.all (fun edge => incoming edge.1 == 1 && vertices.any (fun node => node.id == edge.1 && node.kind == .finish)) then
        let branches := vertex.outputs.foldl (fun total (id, width) =>
          let terminal := (vertices.find? (·.id == id)).map (·.weight) |>.getD {}
          parallelCapacity total (serialCapacity width terminal)) {}
        return (vertices.filter fun node => !(vertex.outputs.map (·.1)).contains node.id).map fun node =>
          if node.id == vertex.id then { node with kind := .finish, outputs := [], weight := branches } else node
      else none
  | _ => none

private def reduceWeighted : Nat → List WeightedVertex → Option FrontierCapacity
  | 0, _ => none
  | fuel + 1, vertices => do
      if vertices.length == 2 then
        let start ← vertices.find? (·.kind == .start)
        let finish ← vertices.find? (·.kind == .finish)
        let [(target, width)] := start.outputs | none
        if target == finish.id && finish.outputs.isEmpty then some (serialCapacity width finish.weight) else none
      else do
        let reduced ← vertices.findSome? (contractWeighted vertices)
        reduceWeighted fuel reduced

/-- The caller supplies an already admitted structured graph; reduction still refuses an incomplete contraction. -/
def frontierCapacity (vertices : List Vertex) (effectIds : List String) : Option FrontierCapacity :=
  reduceWeighted (vertices.length + 1) (vertices.map fun vertex => {
    id := vertex.id, kind := vertex.kind, outputs := vertex.outputs.map (fun id => (id, {}))
    weight := if vertex.kind == .task then ⟨1, if effectIds.contains vertex.id then 1 else 0⟩ else {} })

end BpmnSemantics.SemanticProcess.StructuredParallelBody
