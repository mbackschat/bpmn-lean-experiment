# Lean build modularity proposal

## Status

Lifecycle: draft
Review: pending

## Problem

The owner directed on 2026-10-23 that ordinary work must never need a complete Lean rebuild. Required item 1 below changes a gate, the fixture evidence format, and needs an owner decision before implementation. Today an ordinary family increment rebuilds most of the Lean library. Across the 88 Lean commits from 2026-09-23 to 2026-10-23, the median commit invalidated 811 of 974 modules, and 69% of them invalidated more than 500. Two mechanisms cause this:

- **Closed-world shared definitions.** Profile catalogs, value domains, admission, structural validation and the transition dispatch each enumerate every family in one module that sits low in the import graph. Of the 616 edits to modules with more than 200 transitive dependents, 55% added `match` arms for a new family and 33% edited existing bodies. Only 8 were pure profile-identity edits. The imports themselves are not spurious: the referenced closure roughly equals the import closure.
- **Kernel-decided fixtures.** There are 1,821 `decide`-proved theorems in 202 modules. The 177 measured fixture modules sum to 55 minutes serial, and 39 of them peak above 2 GiB ([cost ledger](../scripts/lean-module-cost.ts)). Only about 209 of those theorems (11%, by a name-reference count) are consumed by another proof; the rest are standalone finite witnesses. Kernel reduction also forces definition bodies to be visible to every fixture, which defeats module-level isolation.

More build threads do not compensate. On 2026-10-23, eight conformance modules took 8:45 at one thread and 7:31 at three, because each module ran two to four times slower under parallel load.

## Proposed contract

Required:

1. **Checked-lane witnesses run as compiled executable guards.** One data-driven Lean driver evaluates the semantic checks over retained model and expectation data, reusing the existing JSON decoders. The [Lean assurance lane](PROJECT-DESIGN.md#lean-assurance-lane) already admits "a decided fixture or executable guard" for the checked shape. Kernel decision is kept only for facts that a proof consumes. Adding a model then rebuilds no Lean module.
2. **Stable kernel with families as extensions.** The kernel owns the IL and runtime types, the family interface and the generic composition laws. Each family owns its step, admission, descriptor, proofs and family-local fixtures. The registry, global dispatch and closed-world claims (for example "no current profile admits X") sit at the top of the import graph.
3. **Module-system enforcement (Lean `module`).**
   - Dispatch modules import families privately and do not expose their bodies.
   - Consumers reason through per-family characterization lemmas in bridge modules, rather than unfolding the dispatcher.
   - Migration is bottom-up, because a module cannot import a non-module file.
4. **IL vocabulary changes are batched**, at most once per family, at proposal time. This is the only remaining edit that invalidates everything.
5. **A rebuild-fanout ratchet.** A guard fails when a change to a non-registry module would invalidate more than a recorded bound of modules.

Optional: moving the remaining full builds to hosted CI through feature-branch pushes, which needs a standing push authorization.

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

Hub functions are mentioned widely but explicitly unfolded in few files. `programWellFormed` appears in 235 files and is unfolded in 18; `applyStimulus` appears in 84 and is unfolded in 7. The remainder is fixture reduction, so required items 1 and 3 reinforce each other.

## Migration order

Executable guards first, family by family. Then module-system conversion of the kernel types. The next family, `PC-SCOPE-05` Stage B, is built in the extension shape; existing families move when next touched. Profile identity branches become per-family descriptors as their families move.

## Acceptance

- An ordinary family increment invalidates only its own modules, the registry and the global fixtures, enforced by the ratchet.
- No lane shape, claim or gate is weaker than before.
- Each converted family keeps the same propositions, now evidenced by its kernel-decided fact or its executable guard.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
