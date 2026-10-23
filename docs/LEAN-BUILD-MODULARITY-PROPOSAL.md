# Lean build modularity proposal

## Status

Lifecycle: draft
Review: pending

## Problem

The owner directed on 2026-10-23 that ordinary work must never need a complete Lean rebuild. Today an ordinary family increment rebuilds most of the Lean library. Across the 88 Lean commits from 2026-09-23 to 2026-10-23, the median commit invalidated 811 of 974 modules, and 69% of them invalidated more than 500. Two mechanisms cause this:

- **Closed-world shared definitions.** Profile catalogs, value domains, admission, structural validation and the transition dispatch each enumerate every family in one module that sits low in the import graph. Of the 616 edits to modules with more than 200 transitive dependents, 55% added `match` arms for a new family and 33% edited existing bodies. Only 8 were pure profile-identity edits. The imports themselves are not spurious: the referenced closure roughly equals the import closure.
- **Fixture placement.** Kernel-decided fixtures reduce the closed-world hub functions, so every hub edit rebuilds them, and they dominate wall time (see the [inventory](#fixture-inventory)). Kernel reduction also needs the reduced bodies visible, which works against module-level isolation.

More build threads do not compensate. On 2026-10-23, eight conformance modules took 8:45 at one thread and 7:31 at three, because each module ran two to four times slower under parallel load.

## Fixture inventory

Fixtures are the Lean lane's test suite, not waste: the problem is their placement and their cost, not their existence. The counts below come from a static scan on 2026-10-23. A use is counted when the theorem's name appears in another module, recurs in its own module, or is linked as `Module.lean#declaration` evidence; name collisions make the proof-use counts upper bounds. Measured minutes come from the [cost ledger](../scripts/lean-module-cost.ts), attributed by each module's dominant class.

| Class | Decided theorems | Used by a proof elsewhere | Reused in its module | Documentation evidence | No recorded use | Modules (measured min, above 2 GiB) |
|---|---|---|---|---|---|---|
| Unit checks of Lean semantic functions on small literal states | 954 | 28 | 55 | 81 | 795 | 110 (37.8, 23) |
| Whole-model admission and closure analysis | 609 | 91 | 30 | 33 | 472 | 63 (13.0, 11) |
| Whole-model runtime journeys | 218 | 10 | 7 | 32 | 170 | 22 (3.9, 4) |
| Wire encodings | 45 | 0 | 0 | 4 | 41 | 2 (0.2, 1) |
| Constructor distinctness | 10 | 0 | 0 | 2 | 8 | 1 (0.0, 0) |
| Finite sub-steps inside quantified proofs | 7 | 3 | 4 | 0 | 0 | 5 (not measured) |

Uses:

- About 80% of decided theorems are standalone checks: the claim is the theorem itself, and no proof consumes it.
- Whole-model admission witnesses mostly mirror TypeScript tests: 89 of the 102 theorems carrying a rule ID share that ID with a TypeScript test.
- Only 37 of 162 conformance modules have a same-named differential test family, so most whole-model witnesses are the only Lean-side execution of their model.
- Unit checks dominate cost: 23 of their modules exceed 2 GiB. That means small-state checks often reduce through program-wide well-formedness or dispatch rather than the function under test.

Accumulated special cases are the profile identities, not the fixtures. The Lean code defines 32 profile identities, 11 of them per-slice checkpoint profiles that predate the cumulative family profile rule, and runtime and validation modules branch on them at 282 file sites.

## Proposed contract

Required:

1. **Family-local fixtures.** A family's fixtures import only the kernel and that family, and decide family-local functions. Global claims about a registered profile follow from bridge lemmas at the top. Unit checks reduce the function under test, not program-wide well-formedness or dispatch.
2. **Stable kernel with families as extensions.** The kernel owns the IL and runtime types, the family interface and the generic composition laws. Each family owns its step, admission, descriptor, proofs and family-local fixtures. The registry, global dispatch and closed-world claims (for example "no current profile admits X") sit at the top of the import graph.
3. **Module-system enforcement (Lean `module`).**
   - Dispatch modules import families privately and do not expose their bodies.
   - Consumers reason through per-family characterization lemmas in bridge modules, rather than unfolding the dispatcher.
   - Migration is bottom-up, because a module cannot import a non-module file.
4. **IL vocabulary changes are batched**, at most once per family, at proposal time. This is the only remaining edit that invalidates everything.
5. **A rebuild-fanout ratchet.** A guard fails when a change to a non-registry module would invalidate more than a recorded bound of modules.

Optional:

- Standalone checks may move to compiled executable guards over retained data, reusing the existing JSON decoders. The [Lean assurance lane](PROJECT-DESIGN.md#lean-assurance-lane) admits "a decided fixture or executable guard" for the checked shape, but evidence links and their guard name declarations, so this changes a gate and needs an owner decision. Kernel decision stays for every fact a proof consumes.
- The remaining full builds may run in hosted CI through feature-branch pushes, which the owner authorized on 2026-10-23.
- Per-slice checkpoint profiles may be consolidated into cumulative family profiles. This changes profile identity, so it needs its own review.

Excluded:

- a speculative up-front design of all remaining family semantics;
- dropping the shared kernel;
- raising build threads or memory ceilings;
- weakening any lane shape or claim.

## Verified mechanisms (Lean v4.34.1, 2026-10-23)

| Witness | Result |
|---|---|
| Hidden definition body or theorem proof edited | Module importers not rebuilt |
| Private import | Stops transitive propagation |
| Imported module's public interface unchanged | Dependents not rebuilt (comparison is by public interface) |
| A family added to a record-of-functions kernel | Rebuilt only that family, the registry and the all-families fixture. The composition law was proved once against the interface, and `decide +kernel` works through the dispatch |
| Bridge module (`import all` plus a `by rfl` lemma) | An edit to another family's arm or body leaves this family's proofs and fixtures untouched |
| Traps | `simp [f]` and `simp only [f]` generate public equation lemmas for every arm and so propagate arm edits; `by rfl` and `by unfold f; rfl` do not. Term-mode `rfl` is rejected for a hidden body. A derived `DecidableEq` must be exposed for kernel decision |

Hub functions are mentioned widely but explicitly unfolded in few files. `programWellFormed` appears in 235 files and is unfolded in 18; `applyStimulus` appears in 84 and is unfolded in 7. The remainder is fixture reduction, so family-local fixtures (required item 1) are what lets the module system hide hub bodies (required item 3).

## Migration order

Module-system conversion of the kernel types first, then family-local fixtures, family by family. The next family, `PC-SCOPE-05` Stage B, is built in the extension shape; existing families move when next touched. Profile identity branches become per-family descriptors as their families move.

## Acceptance

- An ordinary family increment invalidates only its own modules, the registry and the global fixtures, enforced by the ratchet.
- No lane shape, claim or gate is weaker than before.
- Each converted family keeps the same propositions and evidence links.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
