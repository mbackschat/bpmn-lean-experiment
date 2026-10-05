# Scalar Call Activity data profile

The [profile artifact](profile.json) registers the reviewed [Call data account](../../docs/capsules/CALL-ACTIVITY-DATA-BOUNDARIES-PROPOSAL.md): one in-document called Process receives one required String-or-null input through its own interface and returns one declared output to a caller Property. Caller-only data remains isolated. Each Process contains one ordinary User Task with direct input/output mediation.

The [supplier onboarding scenarios](../../scenarios/call-activity-data-boundaries/README.md) exercise String and explicit null through normal return and final caller approval. The inherited CIB relationship IDs describe only the ordinary User Task interaction; no CIB Call-data comparison is selected. Multiple ports, child Properties, implicit inheritance, expressions, repeated or concurrent Calls, exceptional return, external resolution and browser journey acceptance remain outside this profile.
