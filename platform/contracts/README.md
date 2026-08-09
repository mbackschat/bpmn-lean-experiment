# Platform public contracts

This package owns transport-visible HTTP and event shapes. Contracts carry no service implementation and no BPMN interpretation.

The M1 definition contract publishes exact source identity, located admission diagnostics, deployed definition versions, closed deployment and listing results, route builders, and strict unknown-to-response decoders. Engine diagnostic codes and required capabilities remain opaque strings: the platform reports them but does not author their meaning.

The current contract deliberately excludes HTTP server behavior, persistence, engine calls, BPMN interpretation, start-result semantics, pagination, authentication, and UI state. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#public-contracts) owns the boundary.
