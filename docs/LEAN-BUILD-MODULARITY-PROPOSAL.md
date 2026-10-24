# Lean build modularity proposal

## Status

Lifecycle: owner-approved
Review: approved-with-required-edits

## Problem

The owner directed on 2026-10-23 that ordinary work must never need a complete Lean rebuild. Under the current import graph, the median of the 88 Lean commits from 2026-09-23 to 2026-10-23 would invalidate 811 of 974 modules, and 69% of them more than 500. This applies today's graph to older commits and counts comment-only edits. Three mechanisms cause it:

- **Closed-world shared definitions.** Profile catalogs, value domains, admission, structural and runtime well-formedness, scope cancellation, publication projection and the transition dispatch each enumerate every family in one module low in the import graph.
  - Of the 616 edits to modules with more than 200 transitive dependents, 55% added lines beginning with `|` (`match` arms or proof case alternatives) and 33% edited existing bodies.
  - Only 8 were pure profile-identity edits.
  - A heuristic name-reference scan finds no large set of unused imports.
- **Family-enumerating kernel types.** `SemanticOperation`, `Program`, `CheckedProcess`, `RuntimeState` and the value contract carry per-family constructors and fields. Over the same period, 18 commits touched `SemanticProcessContract`, `CheckedProcessContract`, `RuntimeState` or `Data`. Four were on or after 2026-10-13, and one of those four is a lemma-renaming refactor.
- **Fixtures over shared definitions.** Kernel-decided fixtures reduce those shared definitions, so a hub edit rebuilds them, and they dominate wall time ([inventory](#fixture-inventory)).

More build threads do not compensate. A cache-free hosted run on 2026-10-23 (run 39966178466) built the Lean library in 44 minutes at three threads against 67–68 minutes at one, with an 8.6 GiB process-tree peak: a fixed factor of about 1.5 on a 16 GB runner, which leaves the rebuild set unchanged.

## Fixture inventory

Fixtures are the Lean lane's test suite, not waste. The problem is their placement and cost, not their existence.

Method: a static scan on 2026-10-23 of decided theorems outside `BpmnSemantics/Experiments/` (1,816 theorems in 199 modules).
- A use is counted when the theorem's name appears in another module, recurs in its own module, or is linked as `Module.lean#declaration` evidence. Name collisions make the proof-use counts upper bounds.
- Classes come from statement text. Journey helpers (`openTasks`, traces, stimuli) count as journeys. "Unit" is the remainder, so it still contains whole-state checks such as runtime well-formedness of a program-bound state.
- Measured minutes come from the [cost ledger](../scripts/lean-module-cost.ts), attributed by each module's dominant class.

| Class | Decided theorems | Used by a proof elsewhere | Reused in its module | Documentation evidence | No recorded use | Modules (measured min, above 2 GiB) |
|---|---|---|---|---|---|---|
| Unit and whole-state checks | 850 | 26 | 46 | 77 | 706 | 95 (26.2, 16) |
| Whole-model admission and closure analysis | 554 | 87 | 27 | 30 | 425 | 57 (13.8, 10) |
| Whole-model runtime journeys | 350 | 15 | 16 | 39 | 283 | 39 (14.6, 12) |
| Wire encodings | 45 | 0 | 0 | 4 | 41 | 2 (0.2, 1) |
| Constructor distinctness | 10 | 0 | 0 | 2 | 8 | 1 (0.0, 0) |
| Finite sub-steps inside quantified proofs | 7 | 3 | 4 | 0 | 0 | 5 (not measured) |

Findings:

- About 80% of decided theorems are standalone checks: the theorem is the claim, and no proof consumes it.
- 1,028 decided theorems name a definition owned by one of the 170 modules with more than 500 transitive dependents, and their 173 modules carry 48.8 of the 54.9 measured fixture minutes. This is an upper bound on future global fixtures, because the set includes kernel types such as `Program` and `RuntimeState`, which family-local fixtures also name.
- Of the 102 decided theorems carrying a rule ID (all classes), 89 share it with a TypeScript test. This shows shared rule coverage, not duplicated assertions.
- Only 37 of 161 conformance modules have a name-matched differential test family, so most whole-model witnesses have no name-matched Lean–TypeScript differential cross-check.

Accumulated special cases are the profile identities, not the fixtures. The Lean source declares 32 `…ProfileId` constants. 11 of them name per-slice checkpoint profiles that predate the cumulative family profile rule, and runtime and validation modules branch on them.

## Proposed contract

Required:

1. **Guard migration first.** Before the first `module` conversion, every Lean-source guard that parses imports learns the module syntax (`public import`, `import all`), and unrecognized import forms fail closed. This covers [import boundaries](../scripts/lean-import-boundaries.test.ts), [source contracts](../scripts/lean-source-contracts.test.ts) and the source analysis behind `what-binds`.
2. **Module-system enforcement (Lean `module`).** The conversion runs bottom-up, because a module cannot import a non-module file. Rules:
   - Definition bodies stay hidden unless kernel reduction needs them.
   - Kernel decision through hidden bodies needs `import all` of every module on the reduction path.
   - A public theorem may not name a constant that its module imports privately.
   - Proofs characterize a dispatcher with `by rfl` or `by unfold f; rfl` lemmas, never `simp [f]`, which exports equation lemmas for every arm.
3. **Kernel and families.**
   - The kernel owns the shared types and the generic composition laws.
   - Each family owns its step, admission, descriptor, proofs, and the fixtures that reduce only its own functions.
   - The closed-world functions are named and stay above the families: program structural well-formedness, runtime-state well-formedness, scope cancellation, publication projection, the global dispatch and the profile registry. Their bodies are hidden, and consumers reason through characterization lemmas in bridge modules. Adding a family arm is expected to be a body-only edit, provided the private import of the new family leaves the public interface unchanged; the first converted family verifies this.
   - The bridges, the proved-lane theorems over closed-world functions (such as cancellation and well-formedness preservation) and the fixtures that reduce a closed-world function rebuild whenever it changes.
4. **Kernel types change at most once per family.** Changes to checked source, IL, value domain and runtime-state types are batched at family start and recorded in the family proposal. That one change is a complete rebuild, and may run in hosted CI. Per-family extension points in these types would remove it, but they change the IL and runtime representation and are excluded here.
5. **Fixture placement.** A fixture that reduces only family-owned functions imports only the kernel and its family. A fixture that reduces a closed-world function is global. A multi-family whole-model fixture may instead reduce a closed-world function instantiated with only the families its model uses, if a generic lemma states that this agrees with the full registry. That design is unverified on the real code and is settled in the first converted family.
6. **Fanout ratchet.**
   - A fast static guard follows `public import` edges and cuts at private imports, so it gives an upper bound.
   - For every module outside a declared kernel and registry list, the transitive public importers stay within a recorded bound. The list changes only by reviewed edit, like the source-hygiene exceptions.
   - The guard measures graph shape, not commits, so the once-per-family kernel change needs no exemption.

Optional:

- **Executable guards for standalone checks.** Standalone checks may move to compiled executable guards over retained data. The [Lean assurance lane](PROJECT-DESIGN.md#lean-assurance-lane) admits "a decided fixture or executable guard" for the checked shape. Evidence links and their guard name declarations, so this changes a gate and needs an owner decision. Such guards run through the [native-driver helper](../scripts/lean-native-driver.ts), and their JSON decoders join the trusted base. Kernel decision stays for every fact a proof consumes.
- **Hosted CI for full builds.** The remaining full builds may run in hosted CI through feature-branch pushes, which the owner authorized on 2026-10-23.
- **Profile consolidation.** Per-slice checkpoint profiles may be consolidated into cumulative family profiles. This changes profile identity and needs its own review.

Excluded:

- per-family extension points in kernel types;
- a speculative up-front design of all remaining family semantics;
- dropping the shared kernel;
- raising local build threads or memory ceilings; the hosted CI pin is a separate owner decision of 2026-10-23;
- weakening any lane shape, claim or gate.

## Mechanism observations (Lean v4.34.1, 2026-10-23)

These come from small scratch projects, not the library, and are not retained in the repository.

| Observation | Result |
|---|---|
| Hidden definition body or theorem proof edited | Module importers not rebuilt |
| Private import | Stops transitive propagation |
| Imported module's public interface unchanged | Dependents not rebuilt |
| A family added to a record-of-functions kernel whose dispatch was exposed and whose all-families fixture was not a module | Rebuilt only that family, the registry and that fixture. The composition law was proved once against the interface. Hidden dispatch bodies were not tested in this run |
| Kernel decision through hidden bodies | Fails unless every module on the reduction path is imported with `import all` |
| Bridge module (`import all` plus a `by rfl` lemma) | An edit to another family's arm or body left this family's proof and family-local fixture unrebuilt (probe output not retained) |
| Equation-lemma trap | `simp [f]` and `simp only [f]` propagated an arm edit; `by rfl` and `by unfold f; rfl` did not; term-mode `rfl` was rejected for a hidden body (probe output not retained) |

Hub functions are explicitly unfolded in few files: `programWellFormed` in 18 of the 235 that mention it, and `applyStimulus` in 7 of 84. A broader scan found 80 modules unfolding a hub function through some route, so bridge work is larger than those direct counts suggest.

## Migration order

1. Guard migration.
2. Module conversion of the kernel types, a one-time complete rebuild.
3. Module conversion of every remaining library module with exposed bodies, a one-time complete rebuild.
4. Hidden hub bodies, one hub at a time in the order of the measurement below: an importer that unfolds or kernel-reduces the hub imports it with `import all` until a bridge lemma replaces that use.
5. The next coverage family, built in the family shape: its declarations live in family-owned modules, never appended to a hub.

Existing families move when next touched, and profile identity branches become per-family descriptors as their families move. `PC-SCOPE-05` Stage B ran before step 3 on the owner's delegation of 2026-10-23, batching its kernel and closed-world edits into one complete rebuild under rule 4.

Hiding pays off only with every importer converted, because a hidden-body edit still rebuilds every non-module importer (scratch probe on the pinned toolchain, 2026-10-23, not retained). A static replay on 2026-10-24 of the 92 Lean commits from 2026-09-24 to 2026-10-24 against today's import graph (979 modules) gives the median number of modules each commit invalidates. It counts comment-free changes, charges a new file only to itself, and treats a theorem statement, a signature, a structure or an inductive as interface. Kernel-reducing fixtures that `import all` a hub are not modelled, so the hidden-body rows are lower bounds.

| Design | Median invalidated | Commits above 500 |
|---|---|---|
| Today | 786 | 58 |
| Step 3: every module converted, bodies exposed | 661 | 54 |
| Step 3 with every body hidden | 649 | 49 |
| New declarations placed in leaf modules, no module system | 660 | 50 |
| Placement and step 3, bodies exposed | 541 | 46 |
| Placement, step 3 and hidden bodies | 11 | 34 |

Only the combination meets the acceptance below; the remaining commits above 500 change a signature or a kernel type. The hubs whose interface edit set a commit's invalidation above 500 most often were `CheckedProcessContract` (5), `ParallelScopeRuntime` (4), and `ScopeCompletion`, `ProfileShapeCatalog`, `ValueDomain` and `SemanticProcessContract` (3 each); half of those edits only added declarations.

## Acceptance

- The fanout ratchet is green.
- An increment that adds no kernel type invalidates only its family's modules, the registry, the closed-world bridges and the global fixtures.
- An increment that adds kernel types costs one complete rebuild, at family start.
- The serial build time of the global fixtures an ordinary increment rebuilds is measured at the first converted family. If it exceeds 15 minutes, the owner decides between registry-instantiated whole-model fixtures (required item 5) and the optional executable guards.
- No lane shape, claim or gate is weaker, and the guards are migrated before the first conversion.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `056241144bd4e3828355e2e88f3a2de715815c93` | `fork-turns-none` | `approve-with-required-edits` | `c46dcce614d999e0a9976339f405f2cfdfcf5c8d, 02ff88ba6cda59a67119dc3a536b175ab14b6ae5` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The cold review of `05624114` (baseline `af8828a9`, packet `3b1bf9ed3419574012cf3d79c850381590c41bec006c3997945b68ffe61aee5b`) required eight edits: kernel types that enumerate families, cross-family operations, global whole-model fixtures, the fixture classification, the ratchet measure, guard migration, retained mechanism evidence and the rule-ID claim. The first audit closed them at `c46dcce6` and required the resume point to order guard migration first. The second audit approved `02ff88ba`. The owner adopted the proposal on 2026-10-23 after the hosted thread measurement.
