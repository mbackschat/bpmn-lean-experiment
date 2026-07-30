package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assume.assumeTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.impl.juel.ExpressionFactoryImpl;
import org.cibseven.bpm.impl.juel.RootPropertyResolver;
import org.cibseven.bpm.impl.juel.SimpleContext;
import org.cibseven.bpm.impl.juel.jakarta.el.ArrayELResolver;
import org.cibseven.bpm.impl.juel.jakarta.el.CompositeELResolver;
import org.cibseven.bpm.impl.juel.jakarta.el.ListELResolver;
import org.cibseven.bpm.impl.juel.jakarta.el.MapELResolver;
import org.cibseven.bpm.impl.juel.jakarta.el.MethodNotFoundException;
import org.cibseven.bpm.impl.juel.jakarta.el.PropertyNotFoundException;
import org.cibseven.bpm.impl.juel.jakarta.el.PropertyNotWritableException;
import org.junit.Test;

/**
 * Proves that the pinned CIB JUEL artifact can evaluate immutable data without a Process Engine,
 * bean resolver, function mapper, or Java object-property resolver.
 */
public final class CibSevenIsolatedJuelRuntimeProbeTest {

  @Test
  public void evaluatesBothDelimitersOverAnImmutableNestedDataContext() {
    requireTargetRelease();
    var document = new HashMap<String, Object>();
    document.put(
        "claim",
        Map.of(
            "accepted", true,
            "tags", List.of("urgent", "external")));
    document.put("optional", null);
    var evaluator =
        evaluator(
            Map.of(
                "document", document,
                "expectedTag", "external"));

    assertEquals(
        true,
        evaluator.evaluate(
            "${document.claim.accepted"
                + " and document.claim.tags[1] == expectedTag}"));
    assertEquals(
        true,
        evaluator.evaluate("#{document.optional == null}"));
  }

  @Test
  public void rejectsAbsentRootsMethodsAndWritesAtTheResolverBoundary() {
    requireTargetRelease();
    var evaluator =
        evaluator(
            Map.of(
                "document", Map.of("accepted", true),
                "text", "value"));

    assertThrows(
        PropertyNotFoundException.class,
        () -> evaluator.evaluate("${missing == null}"));
    assertThrows(
        MethodNotFoundException.class,
        () -> evaluator.evaluate("${text.toUpperCase()}"));
    assertThrows(
        MethodNotFoundException.class,
        () -> evaluator.evaluate("${document.clear()}"));
    assertThrows(
        PropertyNotWritableException.class,
        () -> evaluator.write("${text}", "replacement"));
  }

  private static Evaluator evaluator(Map<String, Object> bindings) {
    var roots = new RootPropertyResolver(true);
    for (var binding : bindings.entrySet()) {
      roots.setProperty(binding.getKey(), binding.getValue());
    }
    var resolvers = new CompositeELResolver();
    resolvers.add(roots);
    resolvers.add(new ArrayELResolver(true));
    resolvers.add(new ListELResolver(true));
    resolvers.add(new MapELResolver(true));
    return new Evaluator(
        new ExpressionFactoryImpl(),
        new SimpleContext(resolvers));
  }

  private static void requireTargetRelease() {
    assumeTrue(
        "2.0.0".equals(
            ProcessEngine.class.getPackage().getImplementationVersion()));
  }

  private record Evaluator(
      ExpressionFactoryImpl factory,
      SimpleContext context) {

    Object evaluate(String source) {
      return expression(source).getValue(context);
    }

    void write(String source, Object value) {
      expression(source).setValue(context, value);
    }

    private org.cibseven.bpm.impl.juel.jakarta.el.ValueExpression expression(
        String source) {
      return factory.createValueExpression(context, source, Object.class);
    }
  }
}
