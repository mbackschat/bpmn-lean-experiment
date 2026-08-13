/** Mutable successor fixtures for incident cancellation definition drift tests. */
import {
  serviceTaskIncidentDefinitionArtifacts,
} from "./contract-incident-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";

export function serviceTaskIncidentCancellationDefinitionArtifacts(): MutableDefinitionArtifacts {
  const artifacts = serviceTaskIncidentDefinitionArtifacts();
  artifacts.checkedProcess.identity.semanticProfile =
    "cibseven-2.2.0-service-task-incident-cancellation-draft";
  artifacts.semanticProcess.identity.semanticProfile =
    "cibseven-2.2.0-service-task-incident-cancellation-draft";
  return artifacts;
}
