# Executable BPMN model corpus

This directory is the maintained entry point for representative whole BPMN models used to test what the engine and platform can actually run. It keeps executable project-owned scenarios separate from exact external research candidates and counts clone families instead of inflating priorities with copied or versioned files.

After `@bpmn-lean/bpmn-source` has been built once, run the reuse-only provenance and admission check with:

```sh
gtimeout 60s node --test --test-concurrency=1 model-corpus/test/executable-model-corpus.test.ts
```

On a clean checkout, or before committing an execution/readiness claim, verify the registered external research checkouts and run the complete gate. It builds the shared pipeline graph once, then runs the static corpus oracle and the retained models through their claimed Lean, semantic-core, CIB-when-selected, and Temporal lanes without rebuilding:

```sh
./scripts/doctor.sh research
gtimeout 120s ./scripts/pnpm.sh run test:model-corpus
```

The machine-owned source is [`manifest.json`](manifest.json). The generated [corpus index and blocker ranking](INDEX.md) is for inspection. External model bytes stay in the registered checkouts or official archive from [the source registry](../docs/SOURCES.md); this directory records only exact paths, revisions or archive identity, licenses, and digests. The archive consumer requires `unzip`, verifies both the complete archive and selected entry, and never writes extracted external bytes into the repository.

A model is not a browser-catalog model merely because the engine admits it. Browser eligibility additionally requires a named production-backed Playwright journey that deploys or selects the exact model, starts it through the public platform, observes every mutation precondition, claims each User Task before completing it, completes its advertised work, and verifies the resulting instance, History, and applicable audit surfaces.

The first tranche currently has one browser-eligible model. **Review a request with assignment and form metadata** is covered by the exact [M3 corpus journey](../showcase/m3-human-work/e2e/corpus-user-task-journey.spec.ts). The other four retained models remain engine regression cases only until their own complete journeys are green.
