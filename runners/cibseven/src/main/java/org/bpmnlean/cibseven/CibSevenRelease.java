package org.bpmnlean.cibseven;

import java.util.Arrays;
import org.cibseven.bpm.engine.ProcessEngine;

/** Exact packaged CIB Seven releases admitted as executable evidence producers. */
enum CibSevenRelease {
  TWO_ZERO("2.0.0", "57ed69550f1c9c2619b9711d8877418bb084a371"),
  TWO_TWO("2.2.0", "834a9874760de8a0107f7c1b32806e37f17fb017");

  private final String version;
  private final String revision;

  CibSevenRelease(String version, String revision) {
    this.version = version;
    this.revision = revision;
  }

  static CibSevenRelease current() {
    var loadedVersion = ProcessEngine.class.getPackage().getImplementationVersion();
    return Arrays.stream(values())
        .filter(release -> release.version.equals(loadedVersion))
        .findFirst()
        .orElseThrow(
            () ->
                new IllegalStateException(
                    "Unsupported packaged CIB Seven release: " + loadedVersion));
  }

  void requireScenarioRevision(ScenarioProtocol.ScenarioDefinition scenario) {
    if (!revision.equals(scenario.provenance().cibRevision())) {
      throw new IllegalArgumentException(
          "Scenario CIB revision "
              + scenario.provenance().cibRevision()
              + " does not match packaged "
              + version
              + " revision "
              + revision);
    }
  }

  String version() {
    return version;
  }
}
