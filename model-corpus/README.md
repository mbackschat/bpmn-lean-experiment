# Executable BPMN model corpus

This directory is the maintained entry point for representative whole BPMN models used to test what the engine and platform can actually run. It keeps executable project-owned scenarios separate from exact external research candidates and counts clone families instead of inflating priorities with copied or versioned files. The MVP suite currently contains 24 retained, business-purpose-shaped models covering all 25 executable BPMN element or semantic variants registered by the production pipeline, plus seven external product-shaped candidates used to expose realistic admission and mechanism gaps.

After `@bpmn-lean/bpmn-source` has been built once, run the reuse-only provenance and admission check with:

```sh
gtimeout 60s node --test --test-concurrency=1 model-corpus/test/executable-model-corpus.test.ts
```

On a clean checkout, or before committing an execution/readiness claim, verify the registered external research checkouts and run the complete gate. It builds the shared pipeline graph once, then runs the static corpus oracle and the retained models through their claimed Lean, semantic-core, CIB-when-selected, and Temporal lanes without rebuilding:

```sh
./scripts/doctor.sh research
gtimeout 120s ./scripts/pnpm.sh run test:model-corpus
```

The machine-owned model source is [`manifest.json`](manifest.json), while [`mvp-capabilities.ts`](mvp-capabilities.ts) is the canonical executable capability and restriction catalog shared with the Product 2 About page. The guard derives the actual supported variant set from every registered pipeline model, requires the catalog to match it exactly, and requires the retained-model union to cover it. A new supported variant therefore cannot land without a project-owned whole model, business purpose, capability row, exact pipeline binding, and regenerated [corpus coverage and blocker map](EXECUTABLE-MODEL-CORPUS-MAP.md). External model bytes stay in the registered checkouts or official archive from [the source registry](../docs/SOURCES.md); this directory records only exact paths, revisions or archive identity, licenses, and digests. The archive consumer requires `unzip`, verifies both the complete archive and selected entry, and never writes extracted external bytes into the repository.

A model is not a browser-catalog model merely because the engine admits it. Browser eligibility additionally requires a named production-backed Playwright journey that deploys or selects the exact model, starts it through the public platform, observes every mutation precondition, claims each User Task before completing it, completes its advertised work, and verifies the resulting instance, History, and applicable audit surfaces.

## Admission and product-readiness gate

The curated corpus is an engine and product acceptance input, not a fourth conformance denominator. Its manifest distinguishes exact source admission, semantic execution, durable Temporal execution, selected CIB comparison, and Product 2 usability. Clone-normalized family reach and semantic risk remain separate scheduling inputs under the [breadth-ordering rule](../docs/PROJECT-DESIGN.md#cib-seven-220-breadth-ordering).

A model may succeed in one lane and fail in another without that distinction being collapsed. An engine-runnable User Task model without public assignment metadata is not operator-workspace-ready, and a viewer-renderable model is not necessarily startable.

Every catalog-visible model passes a production-backed headless-Chromium user journey through deploy or selection, start, each required Work or Operations action, terminal or explicit resumption status, and applicable public history or audit. Each mutation's false precondition is separately locked, and strict public-contract failures are corpus failures rather than hidden fixture gaps.

The corpus increment closes only when licence and provenance controls keep external copyrighted or reciprocal material out of the MIT retained tree; duplicate and near-duplicate examples cannot inflate rankings; every retained model is schema-valid, parser-admitted, profile-bound, and exercised to a terminal state or public resumption point through the semantic core and production Temporal path; every catalog-visible model has a production-backed browser journey through all required work and operations; unsupported candidates remain classified blockers with an exact first unsupported mechanism and are never offered as runnable examples; the generated roadmap reports clone-family reach separately from the owning semantic-risk assessment; and every newly registered executable variant atomically adds or expands a credible retained model, concrete business purpose, capability/restriction row, pipeline binding, derived map, and Product 2 disclosure.

The MVP suite currently has three browser-eligible models. **Review a request with assignment and form metadata** is covered by the [single-review M3 corpus journey](../showcase/m3-human-work/e2e/corpus-user-task-journey.spec.ts), **Review content and risk in parallel** is covered by the [parallel-review M3 corpus journey](../showcase/m3-human-work/e2e/parallel-user-task-metadata-journey.spec.ts), and **Resolve an expense exception with structured human work** is covered by the [structured Human Work M6 journey](../showcase/m3-human-work/e2e/structured-human-work-journey.spec.ts). The other 21 retained models remain engine regression cases only until their own complete journeys are green.
