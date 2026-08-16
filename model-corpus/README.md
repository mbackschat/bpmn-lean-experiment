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

The MVP suite currently has three browser-eligible models. **Review a request with assignment and form metadata** is covered by the [single-review M3 corpus journey](../showcase/m3-human-work/e2e/corpus-user-task-journey.spec.ts), **Review content and risk in parallel** is covered by the [parallel-review M3 corpus journey](../showcase/m3-human-work/e2e/parallel-user-task-metadata-journey.spec.ts), and **Resolve an expense exception with structured human work** is covered by the [structured Human Work M6 journey](../showcase/m3-human-work/e2e/structured-human-work-journey.spec.ts). The other 21 retained models remain engine regression cases only until their own complete journeys are green.
