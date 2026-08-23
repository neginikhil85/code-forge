// Template: adjust the base package and model classes to the target service.
// Enforces the layered structure and conventions that prompting alone cannot.
package com.example.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.web.client.RestTemplate;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

@AnalyzeClasses(packages = "com.example.orderservice", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String CONTROLLER = "Controller";
    private static final String SERVICE_IMPL = "Service impl";
    private static final String REPOSITORY = "Repository";

    @ArchTest
    static final ArchRule layersRespectDependencyDirection = layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .layer(CONTROLLER).definedBy("..orderservice.controller..")
            .layer(SERVICE_IMPL).definedBy("..orderservice.service..")
            .layer(REPOSITORY).definedBy("..orderservice.repository..")
            .whereLayer(CONTROLLER).mayNotBeAccessedByAnyLayer()
            .whereLayer(SERVICE_IMPL).mayOnlyBeAccessedByLayers(CONTROLLER)
            .whereLayer(REPOSITORY).mayOnlyBeAccessedByLayers(SERVICE_IMPL);

    @ArchTest
    static final ArchRule noFieldInjection = noClasses()
            .should().haveFieldsAnnotatedWith(Autowired.class)
            .because("constructor injection keeps dependencies explicit and testable");

    @ArchTest
    static final ArchRule noDeprecatedHttpClients = noClasses()
            .should().dependOnClassesThat().areAssignableTo(RestTemplate.class);

    @ArchTest
    static final ArchRule mongoTemplateStaysInTheRepositoryLayer = noClasses()
            .that().resideOutsideOfPackage("..orderservice.repository..")
            .should().dependOnClassesThat().areAssignableTo(MongoTemplate.class);

    @ArchTest
    static final ArchRule controllersStayThin = noClasses()
            .that().resideInAPackage("..orderservice.controller..")
            .should().dependOnClassesThat().resideInAPackage("..orderservice.repository..");

    // Conversion logic belongs to mappers; services and controllers assemble nothing by hand.
    @ArchTest
    static final ArchRule servicesDoNotTouchTransportInternals = noClasses()
            .that().resideInAPackage("..orderservice.service..")
            .should().dependOnClassesThat().resideInAPackage("..org.springframework.web.bind.annotation..");
}
