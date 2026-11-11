package org.bpmnlean.cibseven;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationScenario;
import org.bpmnlean.cibseven.ScenarioProtocol.BpmnResource;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;

/** Validates the closed scenario shape and binds its content-addressed BPMN and DMN resources, a population's too. */
final class CibSevenScenarioValidator {

  private static final String BPMN_MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
  private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

  private final CibSevenRelease release;

  CibSevenScenarioValidator(CibSevenRelease release) {
    this.release = Objects.requireNonNull(release, "release");
  }

  ValidatedScenario validate(ScenarioDefinition scenario, Path projectRoot) throws IOException {
    Objects.requireNonNull(scenario, "scenario");
    Objects.requireNonNull(projectRoot, "projectRoot");
    release.requireScenarioRevision(scenario.provenance());
    if (!ScenarioProtocol.SCENARIO_KIND.equals(scenario.kind()) || scenario.profile().isBlank()) {
      throw new IllegalArgumentException("Scenario kind and profile identity are required");
    }
    var stimuli = scenario.stimuli();
    if (stimuli.isEmpty()
        || !(stimuli.getFirst() instanceof Start start)
        || stimuli.stream().skip(1).anyMatch(Start.class::isInstance)) {
      throw new IllegalArgumentException("Scenario starts exactly once, with its first stimulus");
    }
    var resource = resource(scenario.bpmn(), projectRoot);
    return new ValidatedScenario(start, resource.bpmnPath(), resource.decisionPaths());
  }

  /**
   * Binds every definition of a population by its `definitionRef`, which names one definition; a step naming another is
   * a malformed scenario (harness refusal `population-unknown-definition`), which the population runner raises.
   */
  Map<String, ValidatedResource> validatePopulation(PopulationScenario scenario, Path projectRoot) throws IOException {
    Objects.requireNonNull(scenario, "scenario");
    Objects.requireNonNull(projectRoot, "projectRoot");
    release.requireScenarioRevision(scenario.provenance());
    if (scenario.profile().isBlank()) {
      throw new IllegalArgumentException("Population profile identity is required");
    }
    var resources = new LinkedHashMap<String, ValidatedResource>();
    for (var definition : scenario.definitions()) {
      if (resources.put(definition.definitionRef(), resource(definition.bpmn(), projectRoot)) != null) {
        throw new IllegalArgumentException("Population declares definition " + definition.definitionRef() + " twice");
      }
    }
    return resources;
  }

  private static ValidatedResource resource(BpmnResource bpmn, Path projectRoot) throws IOException {
    var bpmnPath = projectRoot.resolve(bpmn.relativePath()).normalize();
    requireContainedByProject(projectRoot, bpmnPath);
    verifySha256(bpmnPath, bpmn.sha256());
    var decisionPaths = bpmn.declaredDecisions().stream()
        .map(decision -> projectRoot.resolve(decision.relativePath()).normalize())
        .toList();
    for (var index = 0; index < decisionPaths.size(); index++) {
      requireContainedByProject(projectRoot, decisionPaths.get(index));
      verifySha256(decisionPaths.get(index), bpmn.declaredDecisions().get(index).sha256());
    }
    requireRealizable(bpmnPath, !decisionPaths.isEmpty());
    return new ValidatedResource(bpmnPath, decisionPaths);
  }

  /**
   * Refuses a model whose behaviour this runner's environment cannot give faithfully. The engine has no JSR-223 script
   * engine (adding one is a dependency decision), and a scenario that binds no DMN resource deploys none, so a
   * referenced DMN decision is never deployed. CIB would answer both with an engine exception that the runner records as
   * a rolled-back command, an answer of this environment, not of CIB; refusing here keeps them harness failures. A
   * scenario that binds DMN resources deploys them with the model, so a decision it still lacks is CIB's answer.
   */
  private static void requireRealizable(Path bpmnPath, boolean decisionsDeployed) throws IOException {
    // A streaming scan, not the model API: the model API validates against the XSD and refuses documents CIB's own
    // deployment parser accepts, which would turn CIB's answer for them into a harness failure.
    var factory = XMLInputFactory.newFactory();
    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
    factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
    var script = false;
    var decision = false;
    try (var input = Files.newInputStream(bpmnPath)) {
      var reader = factory.createXMLStreamReader(input);
      try {
        while (reader.hasNext()) {
          if (reader.next() != XMLStreamConstants.START_ELEMENT) {
            continue;
          }
          var namespace = reader.getNamespaceURI();
          var name = reader.getLocalName();
          if (BPMN_MODEL.equals(namespace)) {
            var language = reader.getAttributeValue(null, "language");
            script |= "scriptTask".equals(name)
                || (("conditionExpression".equals(name) || "condition".equals(name))
                    && language != null && !"juel".equalsIgnoreCase(language));
            decision |= "businessRuleTask".equals(name) && reader.getAttributeValue(CAMUNDA, "decisionRef") != null;
          } else if (CAMUNDA.equals(namespace) && "script".equals(name)) {
            script = true;
          }
        }
      } finally {
        reader.close();
      }
    } catch (XMLStreamException unreadable) {
      // A document the scan cannot read is left to CIB's deployment, whose refusal is the oracle's answer.
      return;
    }
    if (script) {
      throw new IllegalStateException("A script has no realization in this runner: " + bpmnPath.getFileName());
    }
    if (decision && !decisionsDeployed) {
      throw new IllegalStateException("A DMN decision has no realization in this runner: " + bpmnPath.getFileName());
    }
  }

  private static void requireContainedByProject(Path projectRoot, Path resource)
      throws IOException {
    var realRoot = projectRoot.toRealPath();
    var realResource = resource.toRealPath();
    if (!realResource.startsWith(realRoot)) {
      throw new IllegalArgumentException("Scenario resource escapes project root: " + resource);
    }
  }

  private static void verifySha256(Path path, String expected) throws IOException {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      try (InputStream input = new DigestInputStream(Files.newInputStream(path), digest)) {
        input.transferTo(OutputStream.nullOutputStream());
      }
      var actual = HexFormat.of().formatHex(digest.digest());
      if (!actual.equals(expected)) {
        throw new IllegalArgumentException(
            "Resource SHA-256 mismatch for " + path + ": expected " + expected + ", got " + actual);
      }
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("Java runtime does not provide SHA-256", impossible);
    }
  }

  record ValidatedScenario(Start start, Path bpmnPath, List<Path> decisionPaths) {}

  /** A definition's BPMN document and the DMN resources deployed with it, each verified against its digest. */
  record ValidatedResource(Path bpmnPath, List<Path> decisionPaths) {}
}
