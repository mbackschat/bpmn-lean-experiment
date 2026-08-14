# Product 2 UI-quality harness

This isolated Playwright lane verifies the production-built BPM platform web application without starting Temporal, the platform server, or any Product 1 semantic, Lean, CIB, differential, or replay process. It intercepts same-origin requests only at the published Product 2 HTTP boundary and returns fixed contract-valid fixtures.

## Scope

The Chromium matrix is exactly 1600×900, 1280×900, 1024×900, and 768×900. Every project exercises the same semantic DOM and verifies the task collection, each responsive task row/card, selected task form, generated diagram, keyboard and tab behavior, focus transfer and return, and reduced-motion preference.

The M4 Operations fixtures add two exact generation-1 incidents, collection and full-width detail navigation, the exact Diagram highlight, Retry response-loss recovery, Cancel confirmation and terminal rejection, paged action audit, explicit loading/empty/error/unavailable states, and recursive private-host-fact exclusion. The fixed HTTP boundary captures action URLs and JSON bytes so the lane can prove exact retry identity without starting Temporal or inferring a semantic fact from browser state.

The geometry oracle checks each named owner directly, including its `scrollWidth <= clientWidth` invariant, so a clipped inner overflow cannot pass merely because the document itself does not scroll. The fixtures deliberately include multiple tasks and long task, process, actor, candidate-group, and occurrence identities.

The committed screenshot assertions cover the task collection, selected form, generated-definition diagram, Operations incident collection, incident Overview actions, incident Diagram provenance, Cancel dialog, and top-level incident audit. Animations and carets are disabled for capture, and the harness waits for network idle, fonts, and diagram rendering before comparing images.

## Commands

Run the deterministic functional lane on macOS while developing:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-platform-ui-quality test:e2e:functional
```

Run the complete gate only in the pinned Linux Chromium environment:

```sh
./scripts/pnpm.sh run test:ui-quality
```

Authoritative screenshot baselines are generated and reviewed only in the digest-pinned `mcr.microsoft.com/playwright:v1.62.1-noble` container declared by [the Product 2 UI-quality workflow](../../.github/workflows/ui-quality.yml). Do not generate or commit Darwin baselines. Start that workflow manually with `regenerate_baselines` enabled to run Playwright's explicit `--update-snapshots` option. The workflow uploads candidate images without modifying the repository. Review the complete image changes before copying them into a normal pull request. Ordinary local and CI commands never update baselines.

M3 and M4 release acceptance each compose their real Temporal-backed showcase with this deterministic UI-quality lane:

```sh
./scripts/pnpm.sh run test:release:m3
./scripts/pnpm.sh run test:release:m4
```

This lane is intentionally absent from `scripts/verify.sh` and Product 1 feedback loops. A UI-quality failure does not slow or redefine semantic work, and semantic verification does not need a browser.
