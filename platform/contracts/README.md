# Platform public contracts

This package owns transport-visible HTTP and event shapes. Contracts carry no service implementation and no BPMN interpretation.

The M1 definition contract publishes exact source identity, located admission diagnostics, deployed definition versions, closed deployment, listing, and definition-version start results, route builders, API error codes, and strict unknown-to-response decoders. A successful start exposes only the semantic Process-instance ID bound to its exact deployed definition version. A pre-start rejection exposes that definition and one opaque failure. Temporal identity, handles, private engine representations, task identity, commands, and mutable nested values do not cross this boundary. The error decoder accepts every published error code, including `methodNotAllowed`, while rejecting private fields and empty messages. Engine diagnostic and start-failure codes remain opaque strings: the platform reports them but does not author their meaning.

The current contract deliberately excludes HTTP server behavior, persistence, engine calls, BPMN interpretation, a start request body, initial variables, instance routes, observation, command submission, pagination, authentication, and UI state. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#public-contracts) owns the boundary.
