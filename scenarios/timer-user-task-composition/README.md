# Timer and User Task composition scenario

This directory contains one answer-free standards-profile witness for the [profile-parameterized admission specification](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The exact Process is `None Start Event → literal PT1S Intermediate Catch Timer Event → User Task → None End Event`.

The scenario starts the Process, supplies the exact semantic timer firing at logical deadline 1000, completes the resulting User Task occurrence, and reaches Process completion. Lean, the independently implemented TypeScript core, and Temporal consume the same source/profile identity. Temporal derives the timer firing from committed semantic state and uses the existing User Task Update ingress.

CIB appears only in provenance for the separately classified mechanisms. It does not run this composition scenario and supplies no retained composition result or structural-admission evidence.
