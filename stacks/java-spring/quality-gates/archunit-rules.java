// Template — copy to src/test/java/<your>/<base>/architecture/ArchitectureTest.java and
// replace com.example.orderservice with your base package. The file must be renamed to
// ArchitectureTest.java to compile; checkstyle-suppressions.xml keys off that name.
//
// These are the structural rules prompting cannot guarantee. An agent that has read the
// conventions still drifts across a long session; this fails the build instead.
package com.example.orderservice.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.beans.factory.annotation.Autowired;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

@AnalyzeClasses(packages = "com.example.orderservice", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String CONTROLLER = "Controller";
    private static final String SERVICE = "Service";
    private static final String REPOSITORY = "Repository";

    private static final String CONTROLLER_PACKAGE = "..controller..";
    private static final String SERVICE_PACKAGE = "..service..";
    private static final String REPOSITORY_PACKAGE = "..repository..";

    /**
     * Types referenced by fully-qualified name rather than imported, so this test compiles
     * in a service that does not have the corresponding starter on the classpath.
     */
    private static final String MONGO_TEMPLATE = "org.springframework.data.mongodb.core.MongoTemplate";
    private static final String REST_TEMPLATE = "org.springframework.web.client.RestTemplate";

    @ArchTest
    static final ArchRule layersRespectDependencyDirection = layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .layer(CONTROLLER).definedBy(CONTROLLER_PACKAGE)
            .layer(SERVICE).definedBy(SERVICE_PACKAGE)
            .layer(REPOSITORY).definedBy(REPOSITORY_PACKAGE)
            .whereLayer(CONTROLLER).mayNotBeAccessedByAnyLayer()
            .whereLayer(SERVICE).mayOnlyBeAccessedByLayers(CONTROLLER)
            .whereLayer(REPOSITORY).mayOnlyBeAccessedByLayers(SERVICE);

    @ArchTest
    static final ArchRule noFieldInjection = noClasses()
            .should().haveFieldsAnnotatedWith(Autowired.class)
            .because("constructor injection keeps dependencies explicit and testable");

    /** RestTemplate is in maintenance mode; new call sites should use RestClient or WebClient. */
    @ArchTest
    static final ArchRule httpCallsDoNotUseRestTemplate = noClasses()
            .should().dependOnClassesThat().haveFullyQualifiedName(REST_TEMPLATE)
            .allowEmptyShould(true);

    /** Delete this rule if the service does not use MongoDB. */
    @ArchTest
    static final ArchRule mongoTemplateStaysInTheRepositoryLayer = noClasses()
            .that().resideOutsideOfPackage(REPOSITORY_PACKAGE)
            .should().dependOnClassesThat().haveFullyQualifiedName(MONGO_TEMPLATE)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule controllersDoNotReachPastTheServiceLayer = noClasses()
            .that().resideInAPackage(CONTROLLER_PACKAGE)
            .should().dependOnClassesThat().resideInAPackage(REPOSITORY_PACKAGE)
            .allowEmptyShould(true);

    /** Request/response binding belongs to the controller; the service takes domain arguments. */
    @ArchTest
    static final ArchRule servicesDoNotTouchTransportInternals = noClasses()
            .that().resideInAPackage(SERVICE_PACKAGE)
            .should().dependOnClassesThat().resideInAPackage("org.springframework.web..")
            .allowEmptyShould(true);
}
