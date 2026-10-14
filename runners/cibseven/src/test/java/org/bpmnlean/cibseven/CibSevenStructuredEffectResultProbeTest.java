package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.junit.Test;

/**
 * Calibrates the structured effect-data amendment (`CIB-EXT-0019`, `CIB-CFG-0009`) against the pinned engine's public
 * services: the retained credit-decision model's Assess delegate returns the capsule's assessment as a Java
 * {@code Map}, and the probe reads the stored value back and projects it as the capsule's local projection defines.
 *
 * <p>This is a calibration probe, not retained differential evidence. The expected projection is built here from the
 * capsule's definition of the assessment, never read from a target result. The Notify delegate also mutates its
 * structured input in place, recording the reference aliasing that `CIB-EXT-0019` excludes rather than imitates.
 */
public final class CibSevenStructuredEffectResultProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODEL =
      PROJECT_ROOT.resolve("scenarios/portable-business-effect-data/credit-decision.bpmn");
  private static final String PROCESS = "Process_CreditDecision";

  /** The portable projection of one value: a Decimal keeps only its canonical coefficient and scale. */
  private record Decimal(BigInteger coefficient, int scale) {}

  /** A projected Map entry; projected Maps are entry lists in Unicode scalar order of their keys. */
  private record Entry(String name, Object value) {}

  @Test
  public void storesTheStructuredAssessmentWithItsPortableMeaning() throws Exception {
    var notified = new AtomicReference<Object>();
    try (var fixture = new Fixture(assessment(), "sent", notified, false)) {
      String instance = fixture.start("A-17");
      fixture.executeJob(instance);
      Object stored = fixture.engine.getRuntimeService().getVariable(instance, "assessment");
      assertEquals(expectedAssessment(), project(stored));
      assertEquals(new BigDecimal("-1234.550"), ((Map<?, ?>) stored).get("amount"));
      fixture.executeJob(instance);
      assertEquals(expectedAssessment(), project(notified.get()));
      assertNull(fixture.engine.getRuntimeService().createProcessInstanceQuery()
          .processInstanceId(instance).singleResult());
      assertEquals(expectedAssessment(), project(fixture.historic(instance, "assessment")));
      assertEquals("sent", fixture.historic(instance, "receipt"));
    }
  }

  @Test
  public void keepsPresentNullApartFromTheEmptyMap() throws Exception {
    try (var fixture = new Fixture(null, new LinkedHashMap<String, Object>(), new AtomicReference<>(), false)) {
      String instance = fixture.start("A-18");
      fixture.executeJob(instance);
      assertTrue(fixture.engine.getRuntimeService().getVariables(instance).containsKey("assessment"));
      assertNull(fixture.engine.getRuntimeService().getVariable(instance, "assessment"));
      fixture.executeJob(instance);
      assertNull(fixture.historic(instance, "assessment"));
      assertEquals(List.of(), project(fixture.historic(instance, "receipt")));
    }
  }

  @Test
  public void anInPlaceInputMutationReachesTheProcessVariableThroughAliasing() throws Exception {
    var notified = new AtomicReference<Object>();
    try (var fixture = new Fixture(assessment(), "sent", notified, true)) {
      String instance = fixture.start("A-17");
      fixture.executeJob(instance);
      fixture.executeJob(instance);
      Object stored = fixture.historic(instance, "assessment");
      assertEquals("mutated-by-notify", ((Map<?, ?>) stored).get("note"));
      assertFalse(expectedAssessment().equals(project(stored)));
    }
  }

  /** Insertion order differs from canonical key order, and the amount carries a trailing zero CIB retains. */
  private static Map<String, Object> assessment() {
    var contact = new LinkedHashMap<String, Object>();
    contact.put("line2", null);
    contact.put("city", "Berlin");
    var result = new LinkedHashMap<String, Object>();
    result.put("note", null);
    result.put("contact", contact);
    result.put("checks", new ArrayList<>(Arrays.asList(
        new LinkedHashMap<>(Map.of("code", "ID")),
        new LinkedHashMap<>(Map.of("code", "ID")),
        new LinkedHashMap<>(Map.of("code", "INCOME")))));
    result.put("approved", true);
    result.put("amount", new BigDecimal("-1234.550"));
    return result;
  }

  private static Object expectedAssessment() {
    return List.of(
        new Entry("amount", new Decimal(BigInteger.valueOf(-123455), 2)),
        new Entry("approved", true),
        new Entry("checks", List.of(
            List.of(new Entry("code", "ID")),
            List.of(new Entry("code", "ID")),
            List.of(new Entry("code", "INCOME")))),
        new Entry("contact", List.of(new Entry("city", "Berlin"), new Entry("line2", null))),
        new Entry("note", null));
  }

  /**
   * The capsule's local projection: String Map keys in Unicode scalar order, nonnegative in-bound Integer/Long as
   * Integer, BigDecimal as the canonical Decimal of the same value. Anything else is outside the domain.
   */
  private static Object project(Object value) {
    if (value == null || value instanceof String || value instanceof Boolean) {
      return value;
    }
    if (value instanceof Integer || value instanceof Long) {
      long number = ((Number) value).longValue();
      if (number < 0 || number > 9_007_199_254_740_991L) {
        throw new IllegalArgumentException("Integer outside the portable domain: " + number);
      }
      return number;
    }
    if (value instanceof BigDecimal decimal) {
      BigDecimal canonical = decimal.stripTrailingZeros();
      if (canonical.scale() < 0) {
        canonical = canonical.setScale(0);
      }
      if (canonical.scale() > 6 || canonical.unscaledValue().bitLength() > 63) {
        throw new IllegalArgumentException("Decimal outside the portable domain: " + decimal);
      }
      return new Decimal(canonical.unscaledValue(), canonical.scale());
    }
    if (value instanceof List<?> list) {
      return list.stream().map(CibSevenStructuredEffectResultProbeTest::project).toList();
    }
    if (value instanceof Map<?, ?> map) {
      var entries = new ArrayList<Entry>();
      for (var entry : map.entrySet()) {
        if (!(entry.getKey() instanceof String name)) {
          throw new IllegalArgumentException("Map key outside the portable domain: " + entry.getKey());
        }
        entries.add(new Entry(name, project(entry.getValue())));
      }
      entries.sort((left, right) -> compareScalars(left.name(), right.name()));
      return List.copyOf(entries);
    }
    throw new IllegalArgumentException("Value outside the portable domain: " + value.getClass().getName());
  }

  private static int compareScalars(String left, String right) {
    return Arrays.compare(left.codePoints().toArray(), right.codePoints().toArray());
  }

  private static final class Fixture implements AutoCloseable {
    private final ProcessEngine engine;
    private final String deployment;

    private Fixture(Object assessment, Object receipt, AtomicReference<Object> notified, boolean mutateInput)
        throws Exception {
      var parse = new AtomicReference<BpmnParse>();
      JavaDelegate assess = execution -> {
        assertEquals(execution.getVariable("applicantRef"), execution.getVariableLocal("applicant"));
        execution.setVariableLocal("assessment", assessment);
      };
      JavaDelegate notify = execution -> {
        Object input = execution.getVariableLocal("assessment");
        notified.set(input);
        if (mutateInput) {
          assertSame(input, execution.getVariable("assessment"));
          @SuppressWarnings("unchecked")
          var map = (Map<String, Object>) input;
          map.put("note", "mutated-by-notify");
        }
        execution.setVariableLocal("receipt", receipt);
      };
      engine = CibSevenTestEngine.create("structured-effect-result", configuration -> {
        configuration.setBeans(Map.of("assessCredit", assess, "notifyApplicant", notify));
        configuration.setBpmnParseFactory(parser -> {
          var current = new BpmnParse(parser);
          parse.set(current);
          return current;
        });
      });
      String created = null;
      try {
        created = engine.getRepositoryService().createDeployment()
            .addString("credit-decision.bpmn", Files.readString(MODEL)).deploy().getId();
        assertNotNull(parse.get());
        assertFalse(parse.get().hasWarnings());
        deployment = created;
      } catch (RuntimeException | Error failure) {
        if (created != null) {
          engine.getRepositoryService().deleteDeployment(created, true);
        }
        engine.close();
        throw failure;
      }
    }

    private String start(String applicant) {
      return engine.getRuntimeService()
          .startProcessInstanceByKey(PROCESS, Map.of("applicantRef", applicant)).getId();
    }

    private void executeJob(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    /**
     * The Process-scope value. Audit history also keeps each task's local input and result copies, and records
     * Notify's local input under the Process activity instance, so only the Process-instance execution separates them.
     */
    private Object historic(String instance, String name) {
      var variable = engine.getHistoryService().createHistoricVariableInstanceQuery()
          .processInstanceId(instance).executionIdIn(instance).variableName(name).singleResult();
      assertNotNull(name, variable);
      return variable.getValue();
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deployment, true);
      } finally {
        engine.close();
      }
    }
  }
}
