# Portable business values serial handoff profile

The [profile](profile.json) selects the [serial-handoff amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#serial-handoff-consuming-amendment): Start, two owned Data Input/Output User Tasks and End under the BPMN default expression language, wired through three distinct Process Properties from P_in through P_mid to P_out. Start carries exactly one P_in binding and each completion exactly its task's DataOutput binding.

Both external surfaces and the Property path copy one `SingletonBusinessItem`: String of at most 1,024 UTF-8 bytes, Null, Boolean, Integer, Decimal or Map of the portable value contract, never a root List or the legacy String list. Every other profile keeps its own value domain, and restoration under this profile requires the same domain at every carried path.

The [retained order scenarios](../../scenarios/portable-business-values-handoff/README.md) select Lean, TypeScript and Temporal with CIB absent. The inherited CIB relationship references bound only the User Task lifecycle and completion identity this profile reuses; no CIB portable-value or data-association claim follows. Public registration, hosting capacity and independent Closure are separate claims; the capsule owns current acceptance.
