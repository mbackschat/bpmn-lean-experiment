/** Focused mutable fixtures for successor-definition drift mutations. */
import {
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";

export function serviceTaskIncidentDefinitionArtifacts(): MutableDefinitionArtifacts {
  const artifacts = serviceTaskDefinitionArtifacts();
  artifacts.checkedProcess.identity.semanticProfile =
    "cibseven-2.2.0-service-task-incident-draft";
  artifacts.semanticProcess.identity.semanticProfile =
    "cibseven-2.2.0-service-task-incident-draft";
  return artifacts;
}
