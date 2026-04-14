type EntityId = number & {
    __brand: "EntityId";
};
declare const eid: (n: number) => EntityId;

declare class Repository {
    private map;
    private order;
    private maxId;
    schema: "AP214" | "AP242";
    units: {
        length: string;
        angle: "RAD";
        solidAngle: "SR";
    };
    set(id: EntityId, e: Entity): void;
    add<T extends Entity>(e: T): Ref<T>;
    get(id: EntityId): Entity | undefined;
    entries(): (readonly [EntityId, Entity])[];
    toPartFile(meta: {
        name: string;
        author?: string;
        org?: string;
    }): string;
}

declare class Ref<T extends Entity> {
    id: EntityId;
    constructor(id: EntityId);
    resolve(repo: Repository): T;
    toString(): string;
}

interface ParseContext {
    repo: Repository;
    parseRef<T extends Entity>(tok: string): Ref<T>;
    parseNumber(tok: string): number;
    parseString(tok: string): string;
}

declare abstract class Entity {
    abstract readonly type: string;
    abstract toStep(repo: Repository): string;
    static parse(_a: string[], _ctx: ParseContext): Entity;
}

declare const stepStr: (s: string) => string;
declare const fmtNum: (n: number) => string;

declare class CartesianPoint extends Entity {
    name: string;
    x: number;
    y: number;
    z: number;
    readonly type = "CARTESIAN_POINT";
    constructor(name: string, x: number, y: number, z: number);
    static parse(a: string[], ctx: ParseContext): CartesianPoint;
    toStep(): string;
}

declare class Direction extends Entity {
    name: string;
    dx: number;
    dy: number;
    dz: number;
    readonly type = "DIRECTION";
    constructor(name: string, dx: number, dy: number, dz: number);
    static parse(a: string[], ctx: ParseContext): Direction;
    toStep(): string;
}

declare class Axis2Placement3D extends Entity {
    name: string;
    location: Ref<CartesianPoint>;
    axis?: Ref<Direction> | undefined;
    refDirection?: Ref<Direction> | undefined;
    readonly type = "AXIS2_PLACEMENT_3D";
    constructor(name: string, location: Ref<CartesianPoint>, axis?: Ref<Direction> | undefined, // Z
    refDirection?: Ref<Direction> | undefined);
    static parse(a: string[], ctx: ParseContext): Axis2Placement3D;
    toStep(): string;
}

declare class Circle extends Entity {
    name: string;
    placement: Ref<Axis2Placement3D>;
    radius: number;
    readonly type = "CIRCLE";
    constructor(name: string, placement: Ref<Axis2Placement3D>, radius: number);
    static parse(a: string[], ctx: ParseContext): Circle;
    toStep(): string;
}

declare class CylindricalSurface extends Entity {
    name: string;
    position: Ref<Axis2Placement3D>;
    radius: number;
    readonly type = "CYLINDRICAL_SURFACE";
    constructor(name: string, position: Ref<Axis2Placement3D>, radius: number);
    static parse(a: string[], ctx: ParseContext): CylindricalSurface;
    toStep(): string;
}

declare class Vector extends Entity {
    name: string;
    orientation: Ref<Direction>;
    magnitude: number;
    readonly type = "VECTOR";
    constructor(name: string, orientation: Ref<Direction>, magnitude: number);
    static parse(a: string[], ctx: ParseContext): Vector;
    toStep(): string;
}

declare class Line extends Entity {
    name: string;
    pnt: Ref<CartesianPoint>;
    dir: Ref<Vector>;
    readonly type = "LINE";
    constructor(name: string, pnt: Ref<CartesianPoint>, dir: Ref<Vector>);
    static parse(a: string[], ctx: ParseContext): Line;
    toStep(): string;
}

declare class Plane extends Entity {
    name: string;
    placement: Ref<Axis2Placement3D>;
    readonly type = "PLANE";
    constructor(name: string, placement: Ref<Axis2Placement3D>);
    static parse(a: string[], ctx: ParseContext): Plane;
    toStep(): string;
}

declare class ToroidalSurface extends Entity {
    name: string;
    position: Ref<Axis2Placement3D>;
    majorRadius: number;
    minorRadius: number;
    readonly type = "TOROIDAL_SURFACE";
    constructor(name: string, position: Ref<Axis2Placement3D>, majorRadius: number, minorRadius: number);
    static parse(a: string[], ctx: ParseContext): ToroidalSurface;
    toStep(): string;
}

declare class Ellipse extends Entity {
    name: string;
    placement: Ref<Axis2Placement3D>;
    semiAxis1: number;
    semiAxis2: number;
    readonly type = "ELLIPSE";
    constructor(name: string, placement: Ref<Axis2Placement3D>, semiAxis1: number, semiAxis2: number);
    static parse(a: string[], ctx: ParseContext): Ellipse;
    toStep(): string;
}

declare class ConicalSurface extends Entity {
    name: string;
    position: Ref<Axis2Placement3D>;
    radius: number;
    semiAngle: number;
    readonly type = "CONICAL_SURFACE";
    constructor(name: string, position: Ref<Axis2Placement3D>, radius: number, semiAngle: number);
    static parse(a: string[], ctx: ParseContext): ConicalSurface;
    toStep(): string;
}

declare class SphericalSurface extends Entity {
    name: string;
    position: Ref<Axis2Placement3D>;
    radius: number;
    readonly type = "SPHERICAL_SURFACE";
    constructor(name: string, position: Ref<Axis2Placement3D>, radius: number);
    static parse(a: string[], ctx: ParseContext): SphericalSurface;
    toStep(): string;
}

declare class BSplineCurveWithKnots extends Entity {
    name: string;
    degree: number;
    controlPointsList: Ref<CartesianPoint>[];
    curveForm: string;
    closedCurve: boolean;
    selfIntersect: boolean;
    knotMultiplicities: number[];
    knots: number[];
    knotSpec: string;
    readonly type = "B_SPLINE_CURVE_WITH_KNOTS";
    constructor(name: string, degree: number, controlPointsList: Ref<CartesianPoint>[], curveForm: string, closedCurve: boolean, selfIntersect: boolean, knotMultiplicities: number[], knots: number[], knotSpec: string);
    static parse(a: string[], ctx: ParseContext): BSplineCurveWithKnots;
    toStep(): string;
}

declare class ColourRgb extends Entity {
    name: string;
    r: number;
    g: number;
    b: number;
    readonly type = "COLOUR_RGB";
    constructor(name: string, r: number, g: number, b: number);
    static parse(a: string[], ctx: ParseContext): ColourRgb;
    toStep(): string;
}

declare class FillAreaStyleColour extends Entity {
    name: string;
    colour: Ref<ColourRgb>;
    readonly type = "FILL_AREA_STYLE_COLOUR";
    constructor(name: string, colour: Ref<ColourRgb>);
    static parse(a: string[], ctx: ParseContext): FillAreaStyleColour;
    toStep(): string;
}

declare class FillAreaStyle extends Entity {
    name: string;
    items: Ref<FillAreaStyleColour>[];
    readonly type = "FILL_AREA_STYLE";
    constructor(name: string, items: Ref<FillAreaStyleColour>[]);
    static parse(a: string[], ctx: ParseContext): FillAreaStyle;
    toStep(): string;
}

declare class MechanicalDesignGeometricPresentationRepresentation extends Entity {
    name: string;
    items: Ref<Entity>[];
    contextOfItems: Ref<Entity>;
    readonly type = "MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION";
    constructor(name: string, items: Ref<Entity>[], contextOfItems: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): MechanicalDesignGeometricPresentationRepresentation;
    toStep(): string;
}

declare class SurfaceStyleFillArea extends Entity {
    style: Ref<FillAreaStyle>;
    readonly type = "SURFACE_STYLE_FILL_AREA";
    constructor(style: Ref<FillAreaStyle>);
    static parse(a: string[], ctx: ParseContext): SurfaceStyleFillArea;
    toStep(): string;
}

declare class SurfaceSideStyle extends Entity {
    name: string;
    styles: Ref<SurfaceStyleFillArea>[];
    readonly type = "SURFACE_SIDE_STYLE";
    constructor(name: string, styles: Ref<SurfaceStyleFillArea>[]);
    static parse(a: string[], ctx: ParseContext): SurfaceSideStyle;
    toStep(): string;
}

declare class SurfaceStyleUsage extends Entity {
    side: ".BOTH." | ".POS." | ".NEG.";
    style: Ref<SurfaceSideStyle>;
    readonly type = "SURFACE_STYLE_USAGE";
    constructor(side: ".BOTH." | ".POS." | ".NEG.", style: Ref<SurfaceSideStyle>);
    static parse(a: string[], ctx: ParseContext): SurfaceStyleUsage;
    toStep(): string;
}

declare class PresentationStyleAssignment extends Entity {
    items: Ref<SurfaceStyleUsage>[];
    readonly type = "PRESENTATION_STYLE_ASSIGNMENT";
    constructor(items: Ref<SurfaceStyleUsage>[]);
    static parse(a: string[], ctx: ParseContext): PresentationStyleAssignment;
    toStep(): string;
}

declare class StyledItem extends Entity {
    name: string;
    styles: Ref<PresentationStyleAssignment>[];
    item: Ref<Entity>;
    readonly type = "STYLED_ITEM";
    constructor(name: string, styles: Ref<PresentationStyleAssignment>[], item: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): StyledItem;
    toStep(): string;
}

declare class AdvancedBrepShapeRepresentation extends Entity {
    name: string;
    items: Ref<Entity>[];
    context: Ref<Entity>;
    readonly type = "ADVANCED_BREP_SHAPE_REPRESENTATION";
    constructor(name: string, items: Ref<Entity>[], // solids etc.
    context: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): AdvancedBrepShapeRepresentation;
    toStep(): string;
}

declare class ApplicationContext extends Entity {
    application: string;
    readonly type = "APPLICATION_CONTEXT";
    constructor(application: string);
    static parse(a: string[], ctx: ParseContext): ApplicationContext;
    toStep(): string;
}

declare class ApplicationProtocolDefinition extends Entity {
    status: string;
    applicationInterpretedModelSchemaName: string;
    applicationProtocolYear: number;
    application: Ref<ApplicationContext>;
    readonly type = "APPLICATION_PROTOCOL_DEFINITION";
    constructor(status: string, applicationInterpretedModelSchemaName: string, applicationProtocolYear: number, application: Ref<ApplicationContext>);
    static parse(a: string[], ctx: ParseContext): ApplicationProtocolDefinition;
    toStep(): string;
}

declare class ContextDependentShapeRepresentation extends Entity {
    representationRelation: Ref<Entity>;
    representedProductRelation: Ref<Entity>;
    readonly type = "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION";
    constructor(representationRelation: Ref<Entity>, // REPRESENTATION_RELATIONSHIP
    representedProductRelation: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): ContextDependentShapeRepresentation;
    toStep(): string;
}

declare class ItemDefinedTransformation extends Entity {
    name: string;
    description: string;
    transformItem1: Ref<Entity>;
    transformItem2: Ref<Entity>;
    readonly type = "ITEM_DEFINED_TRANSFORMATION";
    constructor(name: string, description: string, transformItem1: Ref<Entity>, // Usually AXIS2_PLACEMENT_3D
    transformItem2: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): ItemDefinedTransformation;
    toStep(): string;
}

declare class ProductContext extends Entity {
    name: string;
    frameOfReference: Ref<Entity>;
    disciplineType: string;
    readonly type = "PRODUCT_CONTEXT";
    constructor(name: string, frameOfReference: Ref<Entity>, // APPLICATION_CONTEXT
    disciplineType: string);
    static parse(a: string[], ctx: ParseContext): ProductContext;
    toStep(): string;
}

declare class Product extends Entity {
    name: string;
    id: string;
    description: string;
    frameOfReference: Ref<ProductContext>[];
    readonly type = "PRODUCT";
    constructor(name: string, id: string, description: string, frameOfReference: Ref<ProductContext>[]);
    static parse(a: string[], ctx: ParseContext): Product;
    toStep(): string;
}

declare class ProductDefinitionFormation extends Entity {
    id: string;
    description: string;
    ofProduct: Ref<Product>;
    readonly type = "PRODUCT_DEFINITION_FORMATION";
    constructor(id: string, description: string, ofProduct: Ref<Product>);
    static parse(a: string[], ctx: ParseContext): ProductDefinitionFormation;
    toStep(): string;
}

declare class ProductDefinition extends Entity {
    id: string;
    description: string;
    formation: Ref<ProductDefinitionFormation>;
    frameOfReference: Ref<Entity>;
    readonly type = "PRODUCT_DEFINITION";
    constructor(id: string, description: string, formation: Ref<ProductDefinitionFormation>, frameOfReference: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): ProductDefinition;
    toStep(): string;
}

declare class NextAssemblyUsageOccurrence extends Entity {
    id: string;
    name: string;
    description: string;
    relatingProductDefinition: Ref<ProductDefinition>;
    relatedProductDefinition: Ref<ProductDefinition>;
    referenceDesignator: string;
    readonly type = "NEXT_ASSEMBLY_USAGE_OCCURRENCE";
    constructor(id: string, name: string, description: string, relatingProductDefinition: Ref<ProductDefinition>, relatedProductDefinition: Ref<ProductDefinition>, referenceDesignator: string);
    static parse(a: string[], ctx: ParseContext): NextAssemblyUsageOccurrence;
    toStep(): string;
}

declare class ProductDefinitionContext extends Entity {
    name: string;
    frameOfReference: Ref<Entity>;
    lifecycleStage: string;
    readonly type = "PRODUCT_DEFINITION_CONTEXT";
    constructor(name: string, frameOfReference: Ref<Entity>, // APPLICATION_CONTEXT
    lifecycleStage: string);
    static parse(a: string[], ctx: ParseContext): ProductDefinitionContext;
    toStep(): string;
}

declare class ProductDefinitionShape extends Entity {
    name: string;
    description: string;
    definition: Ref<ProductDefinition>;
    readonly type = "PRODUCT_DEFINITION_SHAPE";
    constructor(name: string, description: string, definition: Ref<ProductDefinition>);
    static parse(a: string[], ctx: ParseContext): ProductDefinitionShape;
    toStep(): string;
}

declare class ProductRelatedProductCategory extends Entity {
    name: string;
    description: string;
    products: Ref<Product>[];
    readonly type = "PRODUCT_RELATED_PRODUCT_CATEGORY";
    constructor(name: string, description: string, products: Ref<Product>[]);
    static parse(a: string[], ctx: ParseContext): ProductRelatedProductCategory;
    toStep(): string;
}

declare class ShapeDefinitionRepresentation extends Entity {
    definition: Ref<ProductDefinitionShape>;
    usedRepresentation: Ref<Entity>;
    readonly type = "SHAPE_DEFINITION_REPRESENTATION";
    constructor(definition: Ref<ProductDefinitionShape>, usedRepresentation: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): ShapeDefinitionRepresentation;
    toStep(): string;
}

declare class ShapeRepresentation extends Entity {
    name: string;
    items: Ref<Entity>[];
    contextOfItems: Ref<Entity>;
    readonly type = "SHAPE_REPRESENTATION";
    constructor(name: string, items: Ref<Entity>[], contextOfItems: Ref<Entity>);
    static parse(a: string[], ctx: ParseContext): ShapeRepresentation;
    toStep(): string;
}

type Curve = Line | Circle

declare class VertexPoint extends Entity {
    name: string;
    pnt: Ref<CartesianPoint>;
    readonly type = "VERTEX_POINT";
    constructor(name: string, pnt: Ref<CartesianPoint>);
    static parse(a: string[], ctx: ParseContext): VertexPoint;
    toStep(): string;
}

declare class EdgeCurve extends Entity {
    name: string;
    start: Ref<VertexPoint>;
    end: Ref<VertexPoint>;
    curve: Ref<Curve>;
    sameSense: boolean;
    readonly type = "EDGE_CURVE";
    constructor(name: string, start: Ref<VertexPoint>, end: Ref<VertexPoint>, curve: Ref<Curve>, // accepts Line or Circle ref
    sameSense: boolean);
    static parse(a: string[], ctx: ParseContext): EdgeCurve;
    toStep(): string;
}

declare class OrientedEdge extends Entity {
    name: string;
    edge: Ref<EdgeCurve>;
    orientation: boolean;
    readonly type = "ORIENTED_EDGE";
    constructor(name: string, edge: Ref<EdgeCurve>, orientation: boolean);
    static parse(a: string[], ctx: ParseContext): OrientedEdge;
    toStep(): string;
}

declare class EdgeLoop extends Entity {
    name: string;
    edges: Ref<OrientedEdge>[];
    readonly type = "EDGE_LOOP";
    constructor(name: string, edges: Ref<OrientedEdge>[]);
    static parse(a: string[], ctx: ParseContext): EdgeLoop;
    toStep(): string;
}

declare class FaceBound extends Entity {
    name: string;
    bound: Ref<EdgeLoop>;
    sameSense: boolean;
    readonly type = "FACE_BOUND";
    constructor(name: string, bound: Ref<EdgeLoop>, sameSense: boolean);
    static parse(a: string[], ctx: ParseContext): FaceBound;
    toStep(): string;
}

declare class FaceOuterBound extends Entity {
    name: string;
    bound: Ref<EdgeLoop>;
    sameSense: boolean;
    readonly type = "FACE_OUTER_BOUND";
    constructor(name: string, bound: Ref<EdgeLoop>, sameSense: boolean);
    static parse(a: string[], ctx: ParseContext): FaceOuterBound;
    toStep(): string;
}

type AnyFaceBound = FaceBound | FaceOuterBound
type Surface = Plane | CylindricalSurface | ToroidalSurface

declare class AdvancedFace extends Entity {
    name: string;
    bounds: Ref<AnyFaceBound>[];
    surface: Ref<Surface>;
    sameSense: boolean;
    readonly type = "ADVANCED_FACE";
    constructor(name: string, bounds: Ref<AnyFaceBound>[], surface: Ref<Surface>, sameSense: boolean);
    static parse(a: string[], ctx: ParseContext): AdvancedFace;
    toStep(): string;
}

declare class ClosedShell extends Entity {
    name: string;
    faces: Ref<AdvancedFace>[];
    readonly type = "CLOSED_SHELL";
    constructor(name: string, faces: Ref<AdvancedFace>[]);
    static parse(a: string[], ctx: ParseContext): ClosedShell;
    toStep(): string;
}

declare class ManifoldSolidBrep extends Entity {
    name: string;
    outer: Ref<ClosedShell>;
    readonly type = "MANIFOLD_SOLID_BREP";
    constructor(name: string, outer: Ref<ClosedShell>);
    static parse(a: string[], ctx: ParseContext): ManifoldSolidBrep;
    toStep(): string;
}

declare class Unknown extends Entity {
    type: string;
    args: string[];
    constructor(type: string, args: string[]);
    toStep(): string;
}

declare function parseRepository(data: string): Repository;

type Parser = (args: string[], ctx: ParseContext) => Entity;
declare function register(type: string, parser: Parser): void;
declare function getParser(type: string): Parser | undefined;

interface RawEntityRow {
    id: EntityId;
    type: string;
    args: string[];
}
declare function tokenizeSTEP(data: string): RawEntityRow[];
declare function splitArgs(s: string): string[];

export { AdvancedBrepShapeRepresentation, AdvancedFace, ApplicationContext, ApplicationProtocolDefinition, Axis2Placement3D, BSplineCurveWithKnots, CartesianPoint, Circle, ClosedShell, ColourRgb, ConicalSurface, ContextDependentShapeRepresentation, type Curve, CylindricalSurface, Direction, EdgeCurve, EdgeLoop, Ellipse, Entity, type EntityId, FaceBound, FaceOuterBound, FillAreaStyle, FillAreaStyleColour, ItemDefinedTransformation, Line, ManifoldSolidBrep, MechanicalDesignGeometricPresentationRepresentation, NextAssemblyUsageOccurrence, OrientedEdge, type ParseContext, Plane, PresentationStyleAssignment, Product, ProductContext, ProductDefinition, ProductDefinitionContext, ProductDefinitionFormation, ProductDefinitionShape, ProductRelatedProductCategory, type RawEntityRow, Ref, Repository, ShapeDefinitionRepresentation, ShapeRepresentation, SphericalSurface, StyledItem, type Surface, SurfaceSideStyle, SurfaceStyleFillArea, SurfaceStyleUsage, ToroidalSurface, Unknown, Vector, VertexPoint, eid, fmtNum, getParser, parseRepository, register, splitArgs, stepStr, tokenizeSTEP };
