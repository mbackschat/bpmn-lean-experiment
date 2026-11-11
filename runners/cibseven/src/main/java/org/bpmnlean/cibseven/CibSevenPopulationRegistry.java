package org.bpmnlean.cibseven;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import org.bpmnlean.cibseven.CibSevenScenarioValidator.ValidatedResource;
import org.bpmnlean.cibseven.PopulationProtocol.BroadcastAddress;
import org.bpmnlean.cibseven.PopulationProtocol.DefinitionSelector;
import org.bpmnlean.cibseven.PopulationProtocol.Deployed;
import org.bpmnlean.cibseven.PopulationProtocol.DeploymentEntry;
import org.bpmnlean.cibseven.PopulationProtocol.DeploymentRefused;
import org.bpmnlean.cibseven.PopulationProtocol.VersionEntry;
import org.bpmnlean.cibseven.ScenarioProtocol.DefinitionRef;
import org.bpmnlean.cibseven.ScenarioProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.OperationMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.cibseven.bpm.dmn.engine.DmnEngineException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.repository.ProcessDefinition;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;

/**
 * A population's deployments in deploy order, each numbered by its deploy ordinal
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments): the CIB deployment it became, or CIB's refusal,
 * which takes an ordinal too. It answers the population's definition selectors and translates the scenario's Message
 * and Signal identifiers into the names CIB addresses them by.
 */
final class CibSevenPopulationRegistry {

  /** A deployment CIB accepted, with the definition of its document's root process. */
  record Registered(long ordinal, String definitionRef, String deploymentId, String rootDefinitionId, String rootKey) {}

  private final ProcessEngine engine;
  private final List<DeploymentEntry> entries = new ArrayList<>();
  private final List<Registered> registered = new ArrayList<>();
  /** Every CIB deployment the population made, so cleanup reaches one whose root could not be read. */
  private final List<String> deploymentIds = new ArrayList<>();
  private final Map<String, BpmnModelInstance> models = new HashMap<>();

  CibSevenPopulationRegistry(ProcessEngine engine) {
    this.engine = engine;
  }

  /**
   * Deploys `definitionRef`'s resources as the next deployment. CIB refusing the deployment is its answer, recorded as
   * `deploymentRefused` without a code, as CIB names none; the ordinal is taken either way.
   */
  DeploymentEntry deploy(String definitionRef, ValidatedResource resource, String scenarioId) throws IOException {
    var ordinal = entries.size() + 1L;
    var bpmn = Files.readAllBytes(resource.bpmnPath());
    String deploymentId;
    try {
      // Duplicate filtering stays off, so redeploying one document is a new deployment, as the population counts it.
      var deployment = engine.getRepositoryService().createDeployment()
          .name(scenarioId + "#" + ordinal)
          .addInputStream(resource.bpmnPath().getFileName().toString(), new ByteArrayInputStream(bpmn));
      for (var decisionPath : resource.decisionPaths()) {
        deployment.addInputStream(
            decisionPath.getFileName().toString(), new ByteArrayInputStream(Files.readAllBytes(decisionPath)));
      }
      deploymentId = deployment.deploy().getId();
    } catch (ProcessEngineException | DmnEngineException refused) {
      CibSevenEngineScenarioRunner.requireNoIntegrityViolation(refused);
      return record(new DeploymentEntry(ordinal, definitionRef, List.of(), new DeploymentRefused()));
    }
    deploymentIds.add(deploymentId);
    var root = CibSevenEngineScenarioRunner.rootDefinitionId(engine, deploymentId, bpmn);
    var versions = engine.getRepositoryService().createProcessDefinitionQuery().deploymentId(deploymentId).list()
        .stream()
        .map(definition -> new VersionEntry(definition.getKey(), definition.getVersion()))
        .sorted(Comparator.comparing(VersionEntry::key, WireStrings::compare))
        .toList();
    var rootKey = engine.getRepositoryService().getProcessDefinition(root).getKey();
    registered.add(new Registered(ordinal, definitionRef, deploymentId, root, rootKey));
    return record(new DeploymentEntry(ordinal, definitionRef, versions, new Deployed()));
  }

  private DeploymentEntry record(DeploymentEntry entry) {
    entries.add(entry);
    return entry;
  }

  List<DeploymentEntry> entries() {
    return List.copyOf(entries);
  }

  List<String> deploymentIds() {
    return List.copyOf(deploymentIds);
  }

  /** The deployment a new instance of `definitionRef` starts in: its latest; null when none was accepted. */
  Registered latestOf(String definitionRef) {
    return registered.stream().filter(entry -> entry.definitionRef().equals(definitionRef))
        .reduce((earlier, later) -> later).orElse(null);
  }

  /** The accepted deployment with deploy ordinal `ordinal`, or null. */
  Registered byOrdinal(long ordinal) {
    return registered.stream().filter(entry -> entry.ordinal() == ordinal).findFirst().orElse(null);
  }

  /**
   * The deployment a selector names: a process key's current deployment, the last accepted one whose root has that key,
   * as CIB's redeployment supersedes the earlier versions' start subscriptions (`BpmnDeployer.java:232-292`); or a
   * deployment by its ordinal. Null when it names no accepted deployment (`definition-not-deployed`).
   */
  Registered selected(DefinitionSelector selector) {
    if (selector.deploymentId() != null) {
      return byOrdinal(selector.deploymentId());
    }
    return registered.stream().filter(entry -> entry.rootKey().equals(selector.processKey()))
        .reduce((earlier, later) -> later).orElse(null);
  }

  /** The deploy ordinal of the CIB deployment `deploymentId`. */
  long ordinalOf(String deploymentId) {
    return registered.stream().filter(entry -> entry.deploymentId().equals(deploymentId))
        .mapToLong(Registered::ordinal).findFirst()
        .orElseThrow(() -> new IllegalStateException("CIB deployment " + deploymentId + " is not the population's"));
  }

  /**
   * A called instance's definition as the kernel stamps it in a population: its key, CIB's version and version tag, and
   * the ordinal of the deployment that carries it. The kernel's source digest records which document its assembly
   * copied a process from; CIB copies nothing, so the digest has no CIB counterpart and stays absent.
   */
  DefinitionRef calledDefinition(ProcessDefinition definition) {
    return new DefinitionRef(
        definition.getKey(),
        (long) definition.getVersion(),
        definition.getVersionTag(),
        ordinalOf(definition.getDeploymentId()),
        null,
        null);
  }

  /**
   * The name CIB addresses a publication's Message by: the name every accepted deployment that declares the channel's
   * Message gives it. A channel without a Message, a Message no deployment declares, or one declared under several
   * names has no single CIB form.
   */
  String messageName(MessageChannel channel) {
    var messageId =
        switch (channel) {
          case DirectMessageChannel direct -> direct.messageId();
          case OperationMessageChannel operation -> operation.messageId();
          case UnspecifiedMessageChannel ignored ->
              throw new IllegalStateException("A publication without a Message has no CIB form");
        };
    return single(model -> CibSevenModelAddresses.messageName(model, messageId), "Message " + messageId);
  }

  /** The name CIB addresses a broadcast's Signal by: its own, or the one its QName names, by the same rule. */
  String signalName(BroadcastAddress address) {
    if (address.name() != null) {
      return address.name();
    }
    return single(
        model -> CibSevenModelAddresses.signalName(model, address.signalRef()), "Signal " + address.signalRef());
  }

  private String single(Function<BpmnModelInstance, String> name, String what) {
    var names = new LinkedHashSet<String>();
    for (var entry : registered) {
      var model = models.computeIfAbsent(
          entry.rootDefinitionId(), id -> engine.getRepositoryService().getBpmnModelInstance(id));
      var found = name.apply(model);
      if (found != null) {
        names.add(found);
      }
    }
    if (names.size() != 1) {
      throw new IllegalStateException("The population's deployments name " + what + " " + names.size() + " ways");
    }
    return Objects.requireNonNull(names.getFirst());
  }
}
