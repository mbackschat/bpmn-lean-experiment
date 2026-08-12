# Platform server

This directory contains the Node modular-monolith composition root for the public HTTP API, module wiring, and local configuration. It owns no BPMN meaning and no module business rule.

The server adapts Node HTTP requests to ordered Fetch-compatible module routes, composes definition deployment, exact-version start, exact-version Timer Start scheduling, global exact-version Message Start publication, and the confirmed-start Process-instance recorder from published package entry points. It owns one HTTP server, the definition, schedule, publication, and Process-instance SQLite owners, and one lazy reusable Temporal client connection. Startup reconciles durable nonterminal schedule and publication rows before constructing the HTTP route set and before listening. Request authority comes only from the configured public origin, never from the untrusted Host header. Definition source limits remain owned by the definitions route and engine gateway; the transport adapter streams bodies without adding another size policy.

The executable entry point defaults to `127.0.0.1:3000`, `.data/platform`, a 1 MiB source limit, a 1000 ms parser deadline, Temporal at `127.0.0.1:7233` in namespace `default`, Task Queue `bpmn-semantic`, and a 5000 ms connection timeout. Configuration is read from `PLATFORM_HOST`, `PLATFORM_PORT`, `PLATFORM_PUBLIC_ORIGIN`, `PLATFORM_DATA_DIRECTORY`, `PLATFORM_MAX_SOURCE_BYTES`, `PLATFORM_PARSER_DEADLINE_MS`, `PLATFORM_TEMPORAL_ADDRESS`, `PLATFORM_TEMPORAL_NAMESPACE`, `PLATFORM_TEMPORAL_TASK_QUEUE`, and `PLATFORM_TEMPORAL_CONNECT_TIMEOUT_MS`.

See [the architecture](../../../docs/ARCHITECTURE.md#applications) and [the M1 showcase](../../../showcase/m1-definition-deployment/README.md).
