# Platform modules

Business modules follow durable product capabilities rather than global technical layers. Each module owns its application service, domain-specific persistence ports, HTTP route contribution, and projections.

The [definitions module](definitions/README.md) owns deployment and the three Product 2 start producers. The [operate module](operate/README.md) owns the M2 confirmed-start Process-instance index and search service. Work, Connect, Lifecycle, Intelligence, Agents, and Administration remain ownership seams in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#business-modules), not implemented directories.
