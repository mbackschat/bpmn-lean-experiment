# Product 2 UI-quality harness

This isolated Playwright lane verifies the production-built BPM platform web application without starting Temporal, the platform server, or any Product 1 semantic, Lean, CIB, differential, or replay process. It intercepts same-origin requests only at the published Product 2 HTTP boundary and returns fixed contract-valid fixtures.

## Scope

The blocking Chromium matrix is exactly 1280×900 and 1600×900. Functional behavior runs once at the wide desktop viewport. Tests tagged `@responsive` additionally run at 1280 and cover every main collection, detail, table, form, diagram, and audit layout that owns the desktop-width contract. This avoids duplicating API failure and state-machine checks whose behavior is independent of viewport size while keeping responsive geometry executable at both required widths.

The M4 Operations fixtures add two exact generation-1 incidents, collection and full-width detail navigation, the exact Diagram highlight, Retry response-loss recovery, Cancel confirmation and terminal rejection, paged action audit, explicit loading/empty/error/unavailable states, and recursive private-host-fact exclusion. The fixed HTTP boundary captures action URLs and JSON bytes so the lane can prove exact retry identity without starting Temporal or inferring a semantic fact from browser state.

The M5 E1 fixture adds one exact committed-execution publication with repeated BPMN element identity under distinct activations. It proves fresh-detail loading, revision-ordered external/internal History, simultaneous token and active-wait Diagram markers, neutral scope containers, honest off-diagram positions, exact canonical download bytes and filename, stale-response invalidation, gap and malformed-export suppression, and recursive private-host-fact absence at both desktop widths.

The M5 Flow-node metrics fixture adds two exact definition versions, aggregate metrics with one element absent from DI, and deterministic 404, 503, transport, retry, and delayed-response controls. It proves that only the latest selected version can mount values, tab abandonment clears pending work, Frequency and Duration replace overlay badges without another request, zero-completion duration badges stay absent, the complete table remains readable, focus moves with loading/available/unavailable state, and the document, detail, and table do not overflow at either desktop width.

The About fixture proves that the package-bound product version, BPMN 2.0.2 target, 25-row executable capability table, row-level restrictions, separate CIB Seven evidence, and explicit non-conformance warning remain visible, keyboard-reachable, and free of horizontal overflow at both desktop widths.

The geometry oracle checks each named owner directly, including its `scrollWidth <= clientWidth` invariant, so a clipped inner overflow cannot pass merely because the document itself does not scroll. The fixtures deliberately include multiple tasks and long task, process, actor, candidate-group, and occurrence identities.

One optional screenshot assertion covers the 1600-pixel multi-position execution Diagram. It is a manually invoked human-review aid, not part of ordinary CI, release acceptance, or the functional regression contract. Animations and carets are disabled for capture, and the harness waits for network idle, fonts, and completed diagram rendering before comparing the image.

## Commands

Run the deterministic functional lane while developing and before a UI-facing commit:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-platform-ui-quality test:e2e:functional
```

For the development inner loop, run only the owning specification at the wide project, for example:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-platform-ui-quality exec playwright test e2e/ui-quality.spec.ts --project=chromium-1600
```

The complete functional command is the pre-push boundary, not the default response to every source edit. The `chromium-1280` project runs only `@responsive` layout discriminators; viewport-independent contract, state, and error cases run once at `chromium-1600`.

Run the same blocking gate locally before pushing a UI-facing change:

```sh
./scripts/pnpm.sh run test:ui-quality
```

Before pushing a change that also affects Product 2 platform packages or showcase typing, run the exact ordinary GitHub entry point:

```sh
./scripts/pnpm.sh run test:pre-push:ui
```

The optional screenshot is reviewed in the digest-pinned `mcr.microsoft.com/playwright:v1.62.1-noble` container declared by [the Product 2 UI-quality workflow](../../.github/workflows/ui-quality.yml). Start that workflow manually with `regenerate_baselines` enabled to run the one explicit screenshot with Playwright's `--update-snapshots` option. The workflow uploads one candidate without modifying the repository. Review it before copying it into a normal pull request. Ordinary local and CI commands neither compare nor update pixels.

M3 and M4 release acceptance each compose their real Temporal-backed showcase with this deterministic UI-quality lane:

```sh
./scripts/pnpm.sh run test:release:m3
./scripts/pnpm.sh run test:release:m4
```

This lane is intentionally absent from `scripts/verify.sh` and Product 1 feedback loops. A UI-quality failure does not slow or redefine semantic work, and semantic verification does not need a browser. The [three-level verification policy](../../docs/TESTING-SPEC.md#three-level-verification-policy) defines focused commit checks, exact pre-push workflow checks, and milestone/tag gates.
