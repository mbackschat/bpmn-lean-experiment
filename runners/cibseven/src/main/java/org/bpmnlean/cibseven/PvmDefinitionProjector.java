package org.bpmnlean.cibseven;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmActivityProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.TransitionProjection;
import org.cibseven.bpm.engine.impl.bpmn.helper.BpmnProperties;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.engine.impl.persistence.entity.ProcessDefinitionEntity;
import org.cibseven.bpm.engine.impl.pvm.process.ActivityImpl;
import org.cibseven.bpm.engine.impl.pvm.process.ScopeImpl;

/**
 * A read-only diagnostic view of CIB-seven's deployed PVM definition.
 *
 * <p>This projection helps explain observations. It is intentionally excluded from the canonical
 * compatibility trace because CIB-seven internals are not the behavioral oracle.
 */
final class PvmDefinitionProjector {

  PvmDefinitionProjection project(
      ProcessEngineConfigurationImpl configuration,
      String deployedProcessDefinitionId,
      String sourceProcessId) {
    return configuration
        .getCommandExecutorTxRequired()
        .execute(
            commandContext -> {
              var definition =
                  configuration
                      .getDeploymentCache()
                      .findDeployedProcessDefinitionById(deployedProcessDefinitionId);
              if (definition == null) {
                throw new IllegalStateException(
                    "No deployed process definition " + deployedProcessDefinitionId);
              }
              return project(definition, sourceProcessId);
            });
  }

  private PvmDefinitionProjection project(
      ProcessDefinitionEntity definition, String sourceProcessId) {
    var projected = new LinkedHashMap<String, PvmActivityProjection>();
    collect(definition, definition, sourceProcessId, projected);
    var initial = definition.getInitial();
    if (initial == null) {
      throw new IllegalStateException("Process has no initial activity: " + sourceProcessId);
    }
    return new PvmDefinitionProjection(
        sourceProcessId, initial.getId(), List.copyOf(projected.values()));
  }

  private void collect(
      ScopeImpl scope,
      ProcessDefinitionEntity root,
      String sourceProcessId,
      Map<String, PvmActivityProjection> projected) {
    var children = new ArrayList<>(scope.getActivities());
    scope.getEventActivities().stream()
        // A normal-flow Intermediate Catch Event is its own CIB event scope. That registration
        // describes scope ownership; it is not a nested PVM activity to traverse again.
        .filter(activity -> activity != scope)
        .filter(activity -> !children.contains(activity))
        .sorted(Comparator.comparing(ActivityImpl::getId))
        .forEach(children::add);

    for (var activity : children) {
      if (projected.putIfAbsent(
              activity.getId(), projectActivity(activity, root, sourceProcessId))
          != null) {
        throw new IllegalStateException("Duplicate PVM activity id: " + activity.getId());
      }
      if (!activity.getActivities().isEmpty() || !activity.getEventActivities().isEmpty()) {
        collect(activity, root, sourceProcessId, projected);
      }
    }
  }

  private PvmActivityProjection projectActivity(
      ActivityImpl activity, ProcessDefinitionEntity root, String sourceProcessId) {
    var behavior = activity.getActivityBehavior();
    var outgoing =
        activity.getOutgoingTransitions().stream()
            .map(
                transition ->
                    new TransitionProjection(
                        transition.getId(), transition.getDestination().getId()))
            .toList();
    return new PvmActivityProjection(
        activity.getId(),
        activity.getProperties().get(BpmnProperties.TYPE),
        behavior == null ? "none" : behavior.getClass().getSimpleName(),
        normalizeRequiredScope(activity.getFlowScope(), root, sourceProcessId),
        normalizeOptionalScope(activity.getEventScope(), root, sourceProcessId),
        outgoing);
  }

  private String normalizeRequiredScope(
      ScopeImpl scope, ProcessDefinitionEntity root, String sourceProcessId) {
    if (scope == null) {
      throw new IllegalStateException("PVM activity has no scope");
    }
    return normalizePresentScope(scope, root, sourceProcessId);
  }

  private String normalizeOptionalScope(
      ScopeImpl scope, ProcessDefinitionEntity root, String sourceProcessId) {
    return scope == null ? null : normalizePresentScope(scope, root, sourceProcessId);
  }

  private String normalizePresentScope(
      ScopeImpl scope, ProcessDefinitionEntity root, String sourceProcessId) {
    if (scope == root) {
      return sourceProcessId;
    }
    return scope.getId();
  }
}
