/**
 * Profiles that reuse the structured-composition source projection: Process-owned Properties and User Tasks that
 * carry a direct Data Input/Output association pair.
 *
 * The projection itself is shared, so a profile selects it here and differs only in what its admission demands of the
 * projected graph.
 */
import { STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID, SemanticProfileId } from "@bpmn-lean/semantic-core";

const portableHandoffPropertyCount = 3;

/** Whether the profile reads Process Properties and owned Data Input/Output User Tasks from source. */
export function selectsStructuredCompositionSource(semanticProfile: string): boolean {
  switch (semanticProfile) {
    case STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.PortableBusinessValuesHandoff:
      return true;
    default:
      return false;
  }
}

/**
 * Whether the Process declares the number of Properties the profile demands. The serial handoff declares exactly P_in,
 * P_mid and P_out: the checked graph proves the three used Properties are distinct and owned by the Process, so equal
 * counts mean no declaration is spare. The structured-composition profile permits spare declarations.
 */
export function declaresExactPropertyCount(semanticProfile: string, properties: readonly unknown[]): boolean {
  return semanticProfile !== SemanticProfileId.PortableBusinessValuesHandoff ||
    properties.length === portableHandoffPropertyCount;
}
