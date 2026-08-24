# BPM platform implementation map

This detail map owns exact current Product 2 modules, persistence, HTTP, UI, deployment composition, browser evidence, and platform exclusions. Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

M1 through M6 and Horizon 1 shared persistence are closed. Local mode remains single-node; shared mode uses PostgreSQL 18 with replicated API and bounded recovery-worker composition. The evaluation Compose distribution is complete, but no production-capacity, database-high-availability, or complete external-instance-discovery claim is made.

The closure-reviewed [structured Human Work specification](BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) is evidence-closed across Product 1 semantics and Product 2 forms.

## Implemented

### BPM platform

- The concrete modular-monolith architecture, decision register, and complete owner inventory in [ARCHITECTURE.md](ARCHITECTURE.md)
- Narrow `@bpmn-lean/engine-api` compilation and exact-definition start entry points plus `@bpmn-lean/platform-engine-gateway`, projecting source identity, definition identity, located admission diagnostics, and handle-free start outcomes without exposing the checked graph, Semantic Process program, or Temporal Workflow handle
- `@bpmn-lean/platform-artifact-store`, whose filesystem and PostgreSQL adapters atomically insert-or-compare exact SHA-256 bytes, reject corruption, return copies, and share one behavioral contract
- `@bpmn-lean/platform-postgresql-runtime` and `@bpmn-lean/platform-recovery-runtime`, with bounded pools, checksum migrations through 0011 and epoch 11, database-clock token leases, and fenced applies without business ownership
- `@bpmn-lean/platform-contracts` with closed deeply immutable M1 definition and exact-version start transport types, strict unknown decoders, opaque engine diagnostics and start failures, and safe versioned route construction
- `@bpmn-lean/platform-definitions`, with five repository contracts, Unicode/artifact integrity, gap-free versions, lifecycle CAS, exact deployment/start, and four recovery families
- `@bpmn-lean/platform-operate` and `@bpmn-lean/platform-work`, with Unicode-safe dual adapters, monotone CAS, suffix projection, eleven shared recovery families, independent Audit order, immutable generations, exact-current Work mutations, and one-statement fresh reads
- A Fetch-compatible definitions route contribution with closed raw-XML deployment input, claimed and streamed byte ceilings, producer-mutation-resistant chunk capture, exact-version start using a strict canonical `initialVariables` command, public-only accepted/rejected projections, exact version/source reads, strict path and method validation, and generic internal failures
- `@bpmn-lean/platform-server` with local filesystem/SQLite or shared PostgreSQL-only composition, epoch-11 readiness, projection-backed freshness headers, background-only recovery, and no shared startup or request-time population scan
- Credential-separated `@bpmn-lean/platform-postgresql-migrate` and non-HTTP `@bpmn-lean/platform-recovery-worker` applications; API and workers never migrate, and the worker supervises exactly eleven bounded families
- One evaluation-only Docker Compose distribution with pinned PostgreSQL 18.4, Temporal CLI 1.8.1, four non-root project runtime images built from injected production package closures, a health-gated migration/Worker/API startup order, one public web/API port, separate database roles, and named PostgreSQL/Temporal volumes; Lean, CIB Seven, Java, research sources, and test harnesses remain outside every runtime image
- One text-first maintained browser walkthrough with an exact ten-image 1440 by 900 catalog, a public-UI-only Playwright capture, isolated dynamic-port Compose lifecycle, fresh temporary volumes, explicit release/material-UI refresh, and a manual-or-tagged Linux artifact workflow; ordinary CI performs no screenshot regeneration or pixel comparison
- PostgreSQL 18 evidence for two exact-byte-sharing API replicas, two disjoint workers with dead-lease reclaim, and API/worker readiness beside 5,000 retained registrations, with emitted epoch, settings, replicas, and wall time
- Executable platform dependency and licence guards over tracked and pending sources, manifest resolution, pnpm production closure, approved licences, and the exact bpmn.io exception
- The HTTP-only React definition workspace with exact upload, diagnostics, versions, digest/length/ETag-verified source, selected-version start, and no server/module/foundation import
- The hash-bound viewer-only `bpmn-js` adapter with its shipped licence and visible attribution, plus Linux Playwright evidence over unseen exact bytes and located rejection
- The private M1 showcase composing cached Temporal, the production Worker/server, and the HTTP-only client without reusable behavior or a private API
- Accepted compilation projects exact Timer Start identity and normalized duration into a platform-owned immutable capability stored with every exact definition version; other current profiles retain an empty collection
- Accepted compilation also projects the exact Message Start Event and complete operation-addressed channel into the atomic `{ messageStarts, timerStarts }` capability contract; every other current profile publishes an empty Message Start collection
- Exact one-target Message Start persistence, no-redispatch recovery, private Product 1 addressing, strict HTTP/UI, and live response-loss, replacement, replay, and privacy evidence
- Exact one-shot Schedule persistence and host lifecycle, strict HTTP/UI, and live version retention, restart, race, cleanup, replay, and privacy evidence
- Identity-only Process search with three durable producers, exact filters, stable opaque-cursor paging, strict HTTP/UI, and restart, insertion, privacy, and three-execution evidence
- Strict Work contracts and opaque Product 1 locators over one all-producer confirmation lifecycle; all-or-error task aggregation before fake group policy; uniform hiding; exact unavailable and ceiling distinctions; durable registrations, claim generations, retry-safe completion, same-transaction audit outbox, and reopen/concurrency/response-loss/ABA/reconciliation evidence
- Strict Work HTTP/UI with claim-before-completion, distinct definite and uncertain failures, and live/browser agreement, restart, replacement, audit, replay, privacy, and task-removal evidence
- Exact-source-bound Product 2 Human Task catalogs, element-ID joining, Zod validation, canonical completion, retry/conflict preservation, zero-mutation refusal, priority ordering, six accessible field kinds, three conditional actions, and 1280/1600 expense-exception journeys through semantic History and Work audit
- A Work-first responsive shell with deferred workspaces and diagrams, accessible collections/details, exact highlights and downloads, governed focus/motion, real M1/M2/M3 floors, and 1280/1600 production-bundle evidence
- A read-only About destination with package version, the BPMN 2.0.2 target, every executable restriction owned by the capability catalog, separate CIB evidence, a non-conformance warning, and two-width browser acceptance
- Confirmed-locator incidents with complete current aggregation, authorization, content-bound Retry/Cancel, independent audit, strict HTTP/UI, and real Temporal/browser/replay evidence
- Engine-neutral committed execution with contiguous projection, overlap/gap/rebuild rules, authorized History/Diagram/export, independent operator audit, restart/privacy, and two-width evidence
- E1-aligned flow-node lifecycle publication, live replay evidence, exact-version transactional occurrence projection, all-or-unavailable frequency and completed-duration aggregation, authorization-first HTTP, and accessible bpmn-js badges plus the same values in a table

## Explicitly absent

### BPM platform

- shared-database high availability, automated backup/restore, online schema rollback or mixed-version compatibility, read replicas, external poolers, partitioning, object storage, tenant isolation, measured throughput, percentile latency, saturation, failover time, cost, and a production capacity claim
- Adjustable metric periods, running pseudo-duration, charts, heatmaps, metric export, post-retention archive, and cross-instance semantic ordering

- a production identity provider, directory synchronization, administrator role, claim delegation, or authorization model beyond the exact fake actor and group policy
- separately deployed or arbitrary rendered forms, nested structured values, BPMN data associations, or assignment expressions beyond the implemented metadata and fake-identity boundary
- a client router, form library, themed component framework, virtualization, visual form builder, arbitrary or nested form schema, remote options, draft storage, attachments, or validation/computation involving I/O or user-authored expressions
- complete discovery of engine Process instances started outside Product 2
- the deferred JUEL evaluator implementation under its product-owned `platform/workers/juel-evaluator/` location
- recovery of legacy engine instances that predate the confirmed-start publication contract
- BPMN diagram editing, a public raw-sidecar format, automatic layout for multiple root Processes, collaborations, Call Activities without complete source DI, Sub-Processes, groups, annotations, associations, or data artifacts

## Evidence owners

[ARCHITECTURE.md](ARCHITECTURE.md) owns the concrete module and deployment shape. Product 2 specifications own their public contracts, package tests bind module behavior, PostgreSQL gates bind shared mode, and maintained Chromium journeys bind the selected user-facing surfaces.

## Nearest unsupported claims

- **Platform scale:** database high availability, backup/restore, online rollback, mixed versions, replicas, poolers, partitioning, tenant isolation, production capacity, and measured throughput, latency, saturation, failover, and cost remain absent.
- **Product breadth:** production identity, arbitrary forms, complete discovery of externally started engine instances, diagram editing, broader mining, and general operations remain absent.
