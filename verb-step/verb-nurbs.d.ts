/*
Handcrafted types for verb-nurbs by @johncomposed
*/
declare module 'verb-nurbs' {
  type Point = number[];
  type Vector = number[];
  type Matrix = number[][];
  type KnotArray = number[];
  type Tri = number[];
  type UV = number[];

  namespace promhx {
    // STUB
    class AsyncBase<T> {}

    export class Deferred<T> extends AsyncBase<T> {
      constructor();
      /**
       The public write interface
       */
      resolve(val: T): void;
      /**
       Returns a new promise based on the current deferred instance
       */
      promise(): promhx.Promise<T>;
      /**
       Returns a new stream based on the current deferred instance
       */
      stream(): promhx.Stream<T>;
      /**
       Returns a stream based on the current deferred instance
       */
      publicStream(): promhx.PublicStream<T>;
    }

    export class Promise<T> extends AsyncBase<T> {
      constructor(d?: promhx.Deferred<T>);
      /**
       Rejects the promise, throwing an error.
       */
      reject(e: any): void;
      /**
       add a wait function directly to the Promise instance.
       */
      then<A>(f: (arg: T) => A): promhx.Promise<A>;
      unlink(to: AsyncBase<any>): void;
      pipe<A>(f: (arg: T) => promhx.Promise<A>): promhx.Promise<A>;
      /**
       Pipes an error back into a normal type.
       */
      errorPipe(f: (arg: any) => promhx.Promise<T>): promhx.Promise<T>;
      /**
       Macro method that binds the promise arguments to a single function
       callback that is triggered when all promises are resolved.
       Note: You may call this function on as many promise arguments as you
       like.
       */
      static when<T>(args: any): any;
      /**
       Transforms an iterable of promises into a single promise which resolves
       to an array of values.
       */
      static whenAll<T>(itb: Iterable<promhx.Promise<T>>): promhx.Promise<T[]>;
      /**
       Converts any value to a resolved Promise
       */
      static promise<T>(_val: T): promhx.Promise<T>;
    }

    export class Stream<T> extends AsyncBase<T> {
      constructor(d?: promhx.Deferred<T>);
      /**
       add a wait function directly to the Stream instance.
       */
      then<A>(f: (arg: T) => A): promhx.Stream<A>;
      detachStream(str: promhx.Stream<any>): boolean;
      /**
       Momentarily disable updates for the stream.  Set the pause state with
       the argument.  Call it without the argument to toggle the current state.
       */
      pause(set?: boolean): void;
      pipe<A>(f: (arg: T) => promhx.Stream<A>): promhx.Stream<A>;
      /**
       Pipes an error back into a normal type.
       */
      errorPipe(f: (arg: any) => promhx.Stream<T>): promhx.Stream<T>;
      end(): promhx.Stream<T>;
      /**
       Creates a new stream linked to the current instance that only updates
       if the [f] argument is true.
       */
      filter(f: (arg: T) => boolean): promhx.Stream<T>;
      /**
       Creates a new stream that updates with the values from the current
       stream until the stream ends, and then takes values from the next stream
       [s] until that stream ends.
       */
      concat(s: promhx.Stream<T>): promhx.Stream<T>;
      /**
       Merges another stream into the current one.
       */
      merge(s: promhx.Stream<T>): promhx.Stream<T>;
      /**
       Macro method that binds the stream arguments to a single function
       callback that is triggered when all streams are updated.
       Note: You may call this function on as many stream arguments as you
       like.
       */
      static whenever<T>(args: any): any;
      /**
       Creates a stream from the iterable [itb] that will immediately update
       for each value, and then end.
       */
      static foreach<T>(itb: Iterable<T>): promhx.Stream<T>;
      /**
       Transforms an iterable of streams into a single stream which resolves
       to an array of values.
       */
      static wheneverAll<T>(itb: Iterable<AsyncBase<T>>): promhx.Stream<T[]>;
      /**
       Concatenates all the streams in the iterable argument to a single stream.  See
       the [concat] instance method.
       */
      static concatAll<T>(itb: Iterable<promhx.Stream<T>>): promhx.Stream<T>;
      /**
       Merges all the streams in the iterable argument to a single stream.  See
       the [merge] instance method.
       */
      static mergeAll<T>(itb: Iterable<promhx.Stream<T>>): promhx.Stream<T>;
      /**
       Converts any value to a resolved Stream
       */
      static stream<A>(_val: A): promhx.Stream<A>;
    }

    export class PublicStream<T> extends promhx.Stream<T> {
      constructor(def?: promhx.Deferred<T>);
    }
  }

  namespace core {
    export type Point = number[];
    export type Vector = number[];
    export type Matrix = number[][];
    export type KnotArray = number[];
    export type Tri = number[];
    export type UV = number[];

    class MinimizationResult {
      constructor(
        solution: Vector,
        value: number,
        gradient: Vector,
        invHessian: Matrix,
        iterations: number,
        message: string
      );
      solution: Vector;
      value: number;
      gradient: Vector;
      invHessian: Matrix;
      iterations: number;
      message: string;
    }

    export class BoundingBox {
      constructor(pts?: Point[]);
      min: Point;
      max: Point;
      fromPoint(pt: Point): core.BoundingBox;
      add(point: Point): core.BoundingBox;
      addRange(points: Point[]): core.BoundingBox;
      contains(point: Point, tol?: number): boolean;
      intersects(bb: core.BoundingBox, tol?: number): boolean;
      clear(): core.BoundingBox;
      getLongestAxis(): number;
      getAxisLength(i: number): number;
      intersect(bb: core.BoundingBox, tol: number): core.BoundingBox;
      static intervalsOverlap(
        a1: number,
        a2: number,
        b1: number,
        b2: number,
        tol?: number
      ): boolean;
    }

    export class Constants {
      static TOLERANCE: number;
      static EPSILON: number;
      static VERSION: string;
    }

    export class SerializableBase {
      serialize(): string;
    }

    export class Plane extends core.SerializableBase {
      constructor(origin: Point, normal: Vector);
      normal: Vector;
      origin: Point;
    }

    export class Ray extends core.SerializableBase {
      constructor(origin: Point, dir: Vector);
      dir: Vector;
      origin: Point;
    }

    export class NurbsCurveData extends core.SerializableBase {
      constructor(degree: number, knots: number[], controlPoints: Point[]);
      degree: number;
      controlPoints: Point[];
      knots: number[];
    }

    export class NurbsSurfaceData extends core.SerializableBase {
      constructor(
        degreeU: number,
        degreeV: number,
        knotsU: KnotArray,
        knotsV: KnotArray,
        controlPoints: Point[][]
      );
      degreeU: number;
      degreeV: number;
      knotsU: KnotArray;
      knotsV: KnotArray;
      controlPoints: Point[][];
    }

    export class MeshData extends core.SerializableBase {
      constructor(faces: Tri[], points: Point[], normals: Point[], uvs: UV[]);
      faces: Tri[];
      points: Point[];
      normals: Point[];
      uvs: UV[];
      static empty(): core.MeshData;
    }

    export class PolylineData extends core.SerializableBase {
      constructor(points: Point[], params: number[]);
      points: Point[];
      params: number[];
    }

    export class VolumeData extends core.SerializableBase {
      constructor(
        degreeU: number,
        degreeV: number,
        degreeW: number,
        knotsU: KnotArray,
        knotsV: KnotArray,
        knotsW: KnotArray,
        controlPoints: Point[][][]
      );
      degreeU: number;
      degreeV: number;
      degreeW: number;
      knotsU: KnotArray;
      knotsV: KnotArray;
      knotsW: KnotArray;
      controlPoints: Point[][][];
    }

    export class Pair<T1, T2> {
      constructor(item1: T1, item2: T2);
      item0: T1;
      item1: T2;
    }

    export class Interval<T> {
      constructor(min: T, max: T);
      min: T;
      max: T;
    }

    export class CurveCurveIntersection {
      constructor(point0: Point, point1: Point, u0: number, u1: number);
      point0: Point;
      point1: Point;
      u0: number;
      u1: number;
    }

    export class CurveSurfaceIntersection {
      constructor(u: number, uv: UV, curvePoint: Point, surfacePoint: Point);
      u: number;
      uv: UV;
      curvePoint: Point;
      surfacePoint: Point;
    }

    export class MeshIntersectionPoint {
      constructor(
        uv0: UV,
        uv1: UV,
        point: Point,
        faceIndex0: number,
        faceIndex1: number
      );
      uv0: UV;
      uv1: UV;
      point: Point;
      faceIndex0: number;
      faceIndex1: number;
      opp: core.MeshIntersectionPoint;
      adj: core.MeshIntersectionPoint;
      visited: boolean;
    }

    export class PolylineMeshIntersection {
      constructor(
        point: Point,
        u: number,
        uv: UV,
        polylineIndex: number,
        faceIndex: number
      );
      point: Point;
      u: number;
      uv: UV;
      polylineIndex: number;
      faceIndex: number;
    }

    export class SurfaceSurfaceIntersectionPoint {
      constructor(uv0: UV, uv1: UV, point: Point, dist: number);
      uv0: UV;
      uv1: UV;
      point: Point;
      dist: number;
    }

    export class TriSegmentIntersection {
      constructor(point: Point, s: number, t: number, r: number);
      point: Point;
      s: number;
      t: number;
      p: number;
    }

    export class CurveTriPoint {
      constructor(u: number, point: Point, uv: UV);
      u: number;
      uv: UV;
      point: Point;
    }

    export class CurvePoint {
      constructor(u: number, pt: Point);
      u: number;
      pt: Point;
    }

    export class KdTree<T> {
      constructor(
        points: core.KdPoint<T>[],
        distanceFunction: (arg0: Point, arg1: Point) => number
      );
      nearest(
        point: Point,
        maxNodes: number,
        maxDistance: number
      ): core.Pair<core.KdPoint<T>, number>[];
    }

    export class KdPoint<T> {
      constructor(point: Point, obj: T);
      point: Point;
      obj: T;
    }

    export class KdNode<T> {
      constructor(
        kdPoint: core.KdPoint<T>,
        dimension: number,
        parent: core.KdNode<T>
      );
      kdPoint: core.KdPoint<T>;
      left: core.KdNode<T>;
      right: core.KdNode<T>;
      parent: core.KdNode<T>;
      dimension: number;
    }

    export class Mat {
      static mul(a: number, b: Matrix): Matrix;
      static mult(x: Matrix, y: Matrix): Matrix;
      static add(a: Matrix, b: Matrix): Matrix;
      static div(a: Matrix, b: number): Matrix;
      static sub(a: Matrix, b: Matrix): Matrix;
      static dot(a: Matrix, b: Vector): Vector;
      static identity(n: number): Matrix;
      static transpose<T>(a: T[][]): T[][];
      static solve(A: Matrix, b: Vector): Vector;
    }

    export class Mesh {
      static getTriangleNorm(points: Point[], tri: Tri): Point;
      static makeMeshAabb(
        mesh: core.MeshData,
        faceIndices: number[]
      ): core.BoundingBox;
      static sortTrianglesOnLongestAxis(
        bb: core.BoundingBox,
        mesh: core.MeshData,
        faceIndices: number[]
      ): number[];
      static getTriangleCentroid(points: Point[], tri: Tri): Point;
      static triangleUVFromPoint(
        mesh: core.MeshData,
        faceIndex: number,
        f: Point
      ): UV;
    }

    export class Minimizer {
      static uncmin(
        f: (arg: Vector) => number,
        x0: Vector,
        tol?: number,
        gradient?: (arg: Vector) => Vector,
        maxit?: number
      ): MinimizationResult;
    }

    export class Deserializer {
      static deserialize<T>(s: string): T;
    }

    export class Trig {
      static isPointInPlane(pt: Point, p: core.Plane, tol: number): boolean;
      static distToSegment(a: Point, b: Point, c: Point): number;
      static rayClosestPoint(pt: number[], o: number[], r: number[]): number[];
      static distToRay(pt: number[], o: number[], r: number[]): number;
      static threePointsAreFlat(
        p1: number[],
        p2: number[],
        p3: number[],
        tol: number
      ): boolean;
      static segmentClosestPoint(
        pt: Point,
        segpt0: Point,
        segpt1: Point,
        u0: number,
        u1: number
      ): { pt: Point; u: number };
    }

    export class Vec {
      static angleBetween(a: number[], b: number[]): number;
      static positiveAngleBetween(
        a: number[],
        b: number[],
        n: number[]
      ): number;
      static signedAngleBetween(a: number[], b: number[], n: number[]): number;
      static angleBetweenNormalized2d(a: number[], b: number[]): number;
      static range(max: number): number[];
      static span(min: number, max: number, step: number): number[];
      static neg(arr: number[]): number[];
      static min(arr: number[]): number;
      static max(arr: number[]): number;
      static all(arr: boolean[]): boolean;
      static finite(arr: number[]): boolean[];
      static onRay(origin: Point, dir: Vector, u: number): number[];
      static lerp(i: number, u: number[], v: number[]): number[];
      static normalized(arr: number[]): number[];
      static cross(u: number[], v: number[]): number[];
      static dist(a: number[], b: number[]): number;
      static distSquared(a: number[], b: number[]): number;
      static sum(a: Iterable<number>): number;
      static addAll(a: Iterable<number[]>): number[];
      static addAllMutate(a: number[][]): void;
      static addMulMutate(a: number[], s: number, b: number[]): void;
      static subMulMutate(a: number[], s: number, b: number[]): void;
      static addMutate(a: number[], b: number[]): void;
      static subMutate(a: number[], b: number[]): void;
      static mulMutate(a: number, b: number[]): void;
      static norm(a: Iterable<number>): number;
      static normSquared(a: Iterable<number>): number;
      static rep<T>(num: number, ele: T): T[];
      static zeros1d(rows: number): number[];
      static zeros2d(rows: number, cols: number): number[][];
      static zeros3d(rows: number, cols: number, depth: number): number[][][];
      static dot(a: number[], b: number[]): number;
      static add(a: number[], b: number[]): number[];
      static mul(a: number, b: number[]): number[];
      static div(a: number[], b: number): number[];
      static sub(a: number[], b: number[]): number[];
      static isZero(vec: number[]): boolean;
      static sortedSetUnion(a: number[], b: number[]): number[];
      static sortedSetSub(a: number[], b: number[]): number[];
    }
  }

  namespace eval {
    interface IBoundingBoxTree<T> {
      boundingBox(): core.BoundingBox;
      split(): [IBoundingBoxTree<T>, IBoundingBoxTree<T>];
      yield(): T;
      indivisible(tolerance: number): boolean;
      empty(): boolean;
    }

    class SurfacePoint {
      constructor(
        point: Point,
        normal: Point,
        uv: UV,
        id?: number,
        degen?: boolean
      );
      uv: UV;
      point: Point;
      normal: Point;
      id: number;
      degen: boolean;
      static fromUv(u: number, v: number): SurfacePoint;
    }

    export class Analyze {
      static knotMultiplicities(knots: KnotArray): eval.KnotMultiplicity[];
      static isRationalSurfaceClosed(
        surface: core.NurbsSurfaceData,
        uDir?: boolean
      ): boolean;
      static rationalSurfaceClosestPoint(
        surface: core.NurbsSurfaceData,
        p: Point
      ): Point;
      static rationalSurfaceClosestParam(
        surface: core.NurbsSurfaceData,
        p: Point
      ): UV;
      static rationalCurveClosestPoint(
        curve: core.NurbsCurveData,
        p: Point
      ): Point;
      static rationalCurveClosestParam(
        curve: core.NurbsCurveData,
        p: Point
      ): number;
      static rationalCurveParamAtArcLength(
        curve: core.NurbsCurveData,
        len: number,
        tol?: number,
        beziers?: core.NurbsCurveData[],
        bezierLengths?: number[]
      ): number;
      static rationalBezierCurveParamAtArcLength(
        curve: core.NurbsCurveData,
        len: number,
        tol?: number,
        totalLength?: number
      ): number;
      static rationalCurveArcLength(
        curve: core.NurbsCurveData,
        u?: number,
        gaussDegIncrease?: number
      ): number;
      static rationalBezierCurveArcLength(
        curve: core.NurbsCurveData,
        u?: number,
        gaussDegIncrease?: number
      ): number;
    }

    export class KnotMultiplicity {
      constructor(knot: number, mult: number);
      knot: number;
      mult: number;
      inc(): void;
    }

    export class Check {
      static isValidKnotVector(vec: number[], degree: number): boolean;
      static isNonDecreasing(vec: number[]): boolean;
      static isValidNurbsCurveData(
        data: core.NurbsCurveData
      ): core.NurbsCurveData;
      static isValidNurbsSurfaceData(
        data: core.NurbsSurfaceData
      ): core.NurbsSurfaceData;
    }

    export class Divide {
      static surfaceSplit(
        surface: core.NurbsSurfaceData,
        u: number,
        useV?: boolean
      ): core.NurbsSurfaceData[];
      static curveSplit(
        curve: core.NurbsCurveData,
        u: number
      ): core.NurbsCurveData[];
      static rationalCurveByEqualArcLength(
        curve: core.NurbsCurveData,
        num: number
      ): eval.CurveLengthSample[];
      static rationalCurveByArcLength(
        curve: core.NurbsCurveData,
        l: number
      ): eval.CurveLengthSample[];
    }

    export class CurveLengthSample {
      constructor(u: number, len: number);
      u: number;
      len: number;
    }

    export class Eval {
      static rationalCurveTangent(
        curve: core.NurbsCurveData,
        u: number
      ): number[];
      static rationalSurfaceNormal(
        surface: core.NurbsSurfaceData,
        u: number,
        v: number
      ): number[];
      static rationalSurfaceDerivatives(
        surface: core.NurbsSurfaceData,
        u: number,
        v: number,
        numDerivs?: number
      ): number[][][];
      static rationalSurfacePoint(
        surface: core.NurbsSurfaceData,
        u: number,
        v: number
      ): Point;
      static rationalCurveDerivatives(
        curve: core.NurbsCurveData,
        u: number,
        numDerivs?: number
      ): Point[];
      static rationalCurvePoint(curve: core.NurbsCurveData, u: number): Point;
      static surfaceDerivatives(
        surface: core.NurbsSurfaceData,
        u: number,
        v: number,
        numDerivs: number
      ): Point[][];
      static surfaceDerivativesGivenNM(
        n: number,
        m: number,
        surface: core.NurbsSurfaceData,
        u: number,
        v: number,
        numDerivs: number
      ): Point[][];
      static surfacePoint(
        surface: core.NurbsSurfaceData,
        u: number,
        v: number
      ): Point;
      static surfacePointGivenNM(
        n: number,
        m: number,
        surface: core.NurbsSurfaceData,
        u: number,
        v: number
      ): Point;
      static curveRegularSamplePoints(
        crv: core.NurbsCurveData,
        divs: number
      ): Point[];
      static curveRegularSamplePoints2(
        crv: core.NurbsCurveData,
        divs: number
      ): Point[];
      static rationalSurfaceRegularSampleDerivatives(
        surface: core.NurbsSurfaceData,
        divsU: number,
        divsV: number,
        numDerivs: number
      ): number[][][][][];
      static surfaceRegularSampleDerivatives(
        surface: core.NurbsSurfaceData,
        divsU: number,
        divsV: number,
        numDerivs: number
      ): number[][][][][];
      static rationalSurfaceRegularSamplePoints(
        surface: core.NurbsSurfaceData,
        divsU: number,
        divsV: number
      ): Point[][];
      static surfaceRegularSamplePoints(
        surface: core.NurbsSurfaceData,
        divsU: number,
        divsV: number
      ): Point[][];
      static curveDerivatives(
        crv: core.NurbsCurveData,
        u: number,
        numDerivs: number
      ): Point[];
      static curveDerivativesGivenN(
        n: number,
        curve: core.NurbsCurveData,
        u: number,
        numDerivs: number
      ): Point[];
      static curvePoint(curve: core.NurbsCurveData, u: number): Point;
      static areValidRelations(
        degree: number,
        num_controlPoints: number,
        knots_length: number
      ): boolean;
      static curvePointGivenN(
        n: number,
        curve: core.NurbsCurveData,
        u: number
      ): Point;
      static volumePoint(
        volume: core.VolumeData,
        u: number,
        v: number,
        w: number
      ): Point;
      static volumePointGivenNML(
        volume: core.VolumeData,
        n: number,
        m: number,
        l: number,
        u: number,
        v: number,
        w: number
      ): Point;
      static derivativeBasisFunctions(
        u: number,
        degree: number,
        knots: KnotArray
      ): number[][];
      static derivativeBasisFunctionsGivenNI(
        knotIndex: number,
        u: number,
        p: number,
        n: number,
        knots: KnotArray
      ): number[][];
      static basisFunctions(
        u: number,
        degree: number,
        knots: KnotArray
      ): number[];
      static basisFunctionsGivenKnotSpanIndex(
        knotSpan_index: number,
        u: number,
        degree: number,
        knots: KnotArray
      ): number[];
      static knotSpan(degree: number, u: number, knots: number[]): number;
      static knotSpanGivenN(
        n: number,
        degree: number,
        u: number,
        knots: number[]
      ): number;
      static dehomogenize(homoPoint: Point): Point;
      static rational1d(homoPoints: Point[]): Point[];
      static rational2d(homoPoints: Point[][]): Point[][];
      static weight1d(homoPoints: Point[]): number[];
      static weight2d(homoPoints: Point[][]): number[][];
      static dehomogenize1d(homoPoints: Point[]): Point[];
      static dehomogenize2d(homoPoints: Point[][]): Point[][];
      static homogenize1d(controlPoints: Point[], weights?: number[]): Point[];
      static homogenize2d(
        controlPoints: Point[][],
        weights?: number[][]
      ): Point[][];
    }

    export class Intersect {
      static surfaces(
        surface0: core.NurbsSurfaceData,
        surface1: core.NurbsSurfaceData,
        tol: number
      ): core.NurbsCurveData[];
      static surfacesAtPointWithEstimate(
        surface0: core.NurbsSurfaceData,
        surface1: core.NurbsSurfaceData,
        uv1: UV,
        uv2: UV,
        tol: number
      ): core.SurfaceSurfaceIntersectionPoint;
      static meshes(
        mesh0: core.MeshData,
        mesh1: core.MeshData,
        bbtree0?: IBoundingBoxTree<number>,
        bbtree1?: IBoundingBoxTree<number>
      ): core.MeshIntersectionPoint[][];
      static meshSlices(
        mesh: core.MeshData,
        min: number,
        max: number,
        step: number
      ): core.MeshIntersectionPoint[][][];
      static makeMeshIntersectionPolylines(
        segments: core.Interval<core.MeshIntersectionPoint>[]
      ): core.MeshIntersectionPoint[][];
      static lookupAdjacentSegment(
        segEnd: core.MeshIntersectionPoint,
        tree: core.KdTree<core.MeshIntersectionPoint>,
        numResults: number
      ): core.MeshIntersectionPoint;
      static curveAndSurface(
        curve: core.NurbsCurveData,
        surface: core.NurbsSurfaceData,
        tol?: number,
        crvBbTree?: IBoundingBoxTree<core.NurbsCurveData>,
        srfBbTree?: IBoundingBoxTree<core.NurbsSurfaceData>
      ): core.CurveSurfaceIntersection[];
      static curveAndSurfaceWithEstimate(
        curve: core.NurbsCurveData,
        surface: core.NurbsSurfaceData,
        start_params: number[],
        tol?: number
      ): core.CurveSurfaceIntersection;
      static polylineAndMesh(
        polyline: core.PolylineData,
        mesh: core.MeshData,
        tol: number
      ): core.PolylineMeshIntersection[];
      static curves(
        curve1: core.NurbsCurveData,
        curve2: core.NurbsCurveData,
        tolerance: number
      ): core.CurveCurveIntersection[];
      static triangles(
        mesh0: core.MeshData,
        faceIndex0: number,
        mesh1: core.MeshData,
        faceIndex1: number
      ): core.Interval<core.MeshIntersectionPoint>;
      static clipRayInCoplanarTriangle(
        ray: core.Ray,
        mesh: core.MeshData,
        faceIndex: number
      ): core.Interval<core.CurveTriPoint>;
      static mergeTriangleClipIntervals(
        clip1: core.Interval<core.CurveTriPoint>,
        clip2: core.Interval<core.CurveTriPoint>,
        mesh1: core.MeshData,
        faceIndex1: number,
        mesh2: core.MeshData,
        faceIndex2: number
      ): core.Interval<core.MeshIntersectionPoint>;
      static planes(
        origin0: Point,
        normal0: Vector,
        origin1: Point,
        normal1: Vector
      ): core.Ray;
      static threePlanes(
        n0: Point,
        d0: number,
        n1: Point,
        d1: number,
        n2: Point,
        d2: number
      ): Point;
      static polylines(
        polyline0: core.PolylineData,
        polyline1: core.PolylineData,
        tol: number
      ): core.CurveCurveIntersection[];
      static segments(
        a0: Point,
        a1: Point,
        b0: Point,
        b1: Point,
        tol: number
      ): core.CurveCurveIntersection;
      static rays(
        a0: Point,
        a: Point,
        b0: Point,
        b: Point
      ): core.CurveCurveIntersection;
      static segmentWithTriangle(
        p0: Point,
        p1: Point,
        points: Point[],
        tri: Tri
      ): core.TriSegmentIntersection;
      static segmentAndPlane(
        p0: Point,
        p1: Point,
        v0: Point,
        n: Point
      ): { p: number };
    }

    export class Make {
      static rationalTranslationalSurface(
        profile: core.NurbsCurveData,
        rail: core.NurbsCurveData
      ): core.NurbsSurfaceData;
      static surfaceBoundaryCurves(
        surface: core.NurbsSurfaceData
      ): core.NurbsCurveData[];
      static surfaceIsocurve(
        surface: core.NurbsSurfaceData,
        u: number,
        useV?: boolean
      ): core.NurbsCurveData;
      static loftedSurface(
        curves: core.NurbsCurveData[],
        degreeV?: number
      ): core.NurbsSurfaceData;
      static clonedCurve(curve: core.NurbsCurveData): core.NurbsCurveData;
      static rationalBezierCurve(
        controlPoints: Point[],
        weights?: number[]
      ): core.NurbsCurveData;
      static fourPointSurface(
        p1: Point,
        p2: Point,
        p3: Point,
        p4: Point,
        degree?: number
      ): core.NurbsSurfaceData;
      static ellipseArc(
        center: Point,
        xaxis: Point,
        yaxis: Point,
        startAngle: number,
        endAngle: number
      ): core.NurbsCurveData;
      static arc(
        center: Point,
        xaxis: Vector,
        yaxis: Vector,
        radius: number,
        startAngle: number,
        endAngle: number
      ): core.NurbsCurveData;
      static polyline(pts: Point[]): core.NurbsCurveData;
      static extrudedSurface(
        axis: Point,
        length: number,
        profile: core.NurbsCurveData
      ): core.NurbsSurfaceData;
      static cylindricalSurface(
        axis: Point,
        xaxis: Point,
        base: Point,
        height: number,
        radius: number
      ): core.NurbsSurfaceData;
      static revolvedSurface(
        profile: core.NurbsCurveData,
        center: Point,
        axis: Point,
        theta: number
      ): core.NurbsSurfaceData;
      static sphericalSurface(
        center: Point,
        axis: Point,
        xaxis: Point,
        radius: number
      ): core.NurbsSurfaceData;
      static conicalSurface(
        axis: Point,
        xaxis: Point,
        base: Point,
        height: number,
        radius: number
      ): core.NurbsSurfaceData;
      static rationalInterpCurve(
        points: number[][],
        degree?: number,
        homogeneousPoints?: boolean,
        start_tangent?: Point,
        end_tangent?: Point
      ): core.NurbsCurveData;
    }

    export class Modify {
      static curveReverse(curve: core.NurbsCurveData): core.NurbsCurveData;
      static surfaceReverse(
        surface: core.NurbsSurfaceData,
        useV?: boolean
      ): core.NurbsSurfaceData;
      static knotsReverse(knots: KnotArray): KnotArray;
      static unifyCurveKnotVectors(
        curves: core.NurbsCurveData[]
      ): core.NurbsCurveData[];
      static curveElevateDegree(
        curve: core.NurbsCurveData,
        finalDegree: number
      ): core.NurbsCurveData;
      static rationalSurfaceTransform(
        surface: core.NurbsSurfaceData,
        mat: Matrix
      ): core.NurbsSurfaceData;
      static rationalCurveTransform(
        curve: core.NurbsCurveData,
        mat: Matrix
      ): core.NurbsCurveData;
      static surfaceKnotRefine(
        surface: core.NurbsSurfaceData,
        knotsToInsert: number[],
        useV: boolean
      ): core.NurbsSurfaceData;
      static decomposeCurveIntoBeziers(
        curve: core.NurbsCurveData
      ): core.NurbsCurveData[];
      static curveKnotRefine(
        curve: core.NurbsCurveData,
        knotsToInsert: number[]
      ): core.NurbsCurveData;
      static curveKnotInsert(
        curve: core.NurbsCurveData,
        u: number,
        r: number
      ): core.NurbsCurveData;
    }

    export class Tess {
      static rationalCurveRegularSample(
        curve: core.NurbsCurveData,
        numSamples: number,
        includeU: boolean
      ): Point[];
      static rationalCurveRegularSampleRange(
        curve: core.NurbsCurveData,
        start: number,
        end: number,
        numSamples: number,
        includeU: boolean
      ): Point[];
      static rationalCurveAdaptiveSample(
        curve: core.NurbsCurveData,
        tol?: number,
        includeU?: boolean
      ): Point[];
      static rationalCurveAdaptiveSampleRange(
        curve: core.NurbsCurveData,
        start: number,
        end: number,
        tol: number,
        includeU: boolean
      ): Point[];
      static rationalSurfaceNaive(
        surface: core.NurbsSurfaceData,
        divs_u: number,
        divs_v: number
      ): core.MeshData;
      static divideRationalSurfaceAdaptive(
        surface: core.NurbsSurfaceData,
        options?: eval.AdaptiveRefinementOptions
      ): eval.AdaptiveRefinementNode[];
      static rationalSurfaceAdaptive(
        surface: core.NurbsSurfaceData,
        options?: eval.AdaptiveRefinementOptions
      ): core.MeshData;
    }

    export class AdaptiveRefinementOptions {
      constructor();
      normTol: number;
      minDepth: number;
      maxDepth: number;
      refine: boolean;
      minDivsU: number;
      minDivsV: number;
    }

    export class AdaptiveRefinementNode {
      constructor(
        srf: core.NurbsSurfaceData,
        corners: SurfacePoint[],
        neighbors?: eval.AdaptiveRefinementNode[]
      );
      neighbors: eval.AdaptiveRefinementNode[];
      isLeaf(): boolean;
      center(): SurfacePoint;
      evalCorners(): void;
      evalSrf(u: number, v: number, srfPt?: SurfacePoint): SurfacePoint;
      getEdgeCorners(edgeIndex: number): SurfacePoint[];
      getAllCorners(edgeIndex: number): SurfacePoint[];
      midpoint(index: number): SurfacePoint;
      hasBadNormals(): boolean;
      fixNormals(): void;
      shouldDivide(
        options: eval.AdaptiveRefinementOptions,
        currentDepth: number
      ): boolean;
      divide(options?: eval.AdaptiveRefinementOptions): void;
      triangulate(mesh?: core.MeshData): core.MeshData;
      triangulateLeaf(mesh: core.MeshData): core.MeshData;
    }
  }

  namespace exe {
    export class Dispatcher {
      static THREADS: number;
      static dispatchMethod<T>(
        classType: any,
        methodName: string,
        args: any[]
      ): promhx.Promise<T>;
    }

    export class WorkerPool {
      constructor(numThreads?: number, fileName?: string);
      addWork(
        className: string,
        methodName: string,
        args: any[],
        callback: any
      ): void;
      static basePath: string;
    }
  }

  namespace geom {
    interface ISerializable {
      serialize(): string;
    }

    interface ICurve extends ISerializable {
      // Provide the NURBS representation of the curve
      //
      // **returns**
      //
      // * A NurbsCurveData object representing the curve
      asNurbs(): core.NurbsCurveData;

      // Obtain the parametric domain of the curve
      //
      // **returns**
      //
      // * An Interval object containing the min and max of the domain
      domain(): core.Interval<number>;

      // Evaluate a point on the curve
      //
      // **params**
      //
      // * The parameter on the curve
      //
      // **returns**
      //
      // * The evaluated point
      point(u: number): Point;

      // Evaluate the derivatives at a point on a curve
      //
      // **params**
      //
      // * The parameter on the curve
      // * The number of derivatives to evaluate on the curve
      //
      // **returns**
      //
      // * An array of derivative vectors
      derivatives(u: number, numDerivs?: number): Vector[];
    }

    interface ISurface extends ISerializable {
      // Provide the NURBS representation of the curve
      //
      // **returns**
      //
      // * A NurbsCurveData object representing the curve
      asNurbs(): core.NurbsSurfaceData;

      // Provide the domain of the surface in the U direction
      //
      // **returns**
      //
      // * An interval object with min and max properties
      domainU(): core.Interval<number>;

      // Provide the domain of the surface in the V direction
      //
      // **returns**
      //
      // * An interval object with min and max properties
      domainV(): core.Interval<number>;

      // Obtain a point on the surface at the given parameter
      //
      // **params**
      //
      // * The u parameter
      // * The v parameter
      //
      // **returns**
      //
      // * A point on the surface
      point(u: number, v: number): Point;

      // Obtain the derivatives of the NurbsSurface.  Returns a two dimensional array
      // containing the derivative vectors.  Increasing U partial derivatives are increasing
      // row-wise.  Increasing V partial derivatives are increasing column-wise.  Therefore,
      // the [0][0] position is a point on the surface, [n][0] is the nth V partial derivative,
      // the [1][1] position is twist vector or mixed partial derivative Puv.
      //
      // **params**
      //
      // * The u parameter
      // * The v parameter
      // * Number of derivatives to evaluate
      //
      // **returns**
      //
      // * A two dimensional array of vectors
      derivatives(u: number, v: number, numDerivs?: number): Vector[][];
    }

    export class NurbsCurve
      extends core.SerializableBase
      implements geom.ICurve
    {
      constructor(data: core.NurbsCurveData);
      degree(): number;
      knots(): KnotArray;
      controlPoints(): Point[];
      weights(): number[];
      asNurbs(): core.NurbsCurveData;
      clone(): geom.NurbsCurve;
      domain(): core.Interval<number>;
      transform(mat: Matrix): geom.NurbsCurve;
      transformAsync(mat: Matrix): promhx.Promise<geom.NurbsCurve>;
      point(u: number): Point;
      pointAsync(u: number): promhx.Promise<Point>;
      tangent(u: number): Vector;
      tangentAsync(u: number): promhx.Promise<Vector>;
      derivatives(u: number, numDerivs?: number): Vector[];
      derivativesAsync(u: number, numDerivs?: number): promhx.Promise<Vector[]>;
      closestPoint(pt: Point): Point;
      closestPointAsync(pt: Point): promhx.Promise<Point>;
      closestParam(pt: Point): number;
      closestParamAsync(pt: any): promhx.Promise<Point>;
      length(): number;
      lengthAsync(): promhx.Promise<number>;
      lengthAtParam(u: number): number;
      lengthAtParamAsync(): promhx.Promise<number>;
      paramAtLength(len: number, tolerance?: number): number;
      paramAtLengthAsync(
        len: number,
        tolerance?: number
      ): promhx.Promise<number>;
      divideByEqualArcLength(divisions: number): eval.CurveLengthSample[];
      divideByEqualArcLengthAsync(
        divisions: number
      ): promhx.Promise<eval.CurveLengthSample[]>;
      divideByArcLength(arcLength: number): eval.CurveLengthSample[];
      divideByArcLengthAsync(
        divisions: number
      ): promhx.Promise<eval.CurveLengthSample[]>;
      split(u: number): geom.NurbsCurve[];
      splitAsync(u: number): promhx.Promise<geom.NurbsCurve[]>;
      reverse(): geom.NurbsCurve;
      reverseAsync(): promhx.Promise<geom.NurbsCurve>;
      tessellate(tolerance?: number): Point[];
      tessellateAsync(tolerance?: number): promhx.Promise<Point[]>;
      static byKnotsControlPointsWeights(
        degree: number,
        knots: KnotArray,
        controlPoints: Point[],
        weights?: number[]
      ): geom.NurbsCurve;
      static byPoints(points: Point[], degree?: number): geom.NurbsCurve;
    }

    export class Arc extends geom.NurbsCurve {
      constructor(
        center: Point,
        xaxis: Vector,
        yaxis: Vector,
        radius: number,
        minAngle: number,
        maxAngle: number
      );
      center(): Point;
      xaxis(): Vector;
      yaxis(): Vector;
      radius(): number;
      minAngle(): number;
      maxAngle(): number;
    }

    export class BezierCurve extends geom.NurbsCurve {
      constructor(points: Point[], weights?: number[]);
    }

    export class Circle extends geom.Arc {
      constructor(center: Point, xaxis: Vector, yaxis: Vector, radius: number);
    }

    export class NurbsSurface
      extends core.SerializableBase
      implements geom.ISurface
    {
      constructor(data: core.NurbsSurfaceData);
      degreeU(): number;
      degreeV(): number;
      knotsU(): number[];
      knotsV(): number[];
      controlPoints(): Point[][];
      weights(): Point[];
      asNurbs(): core.NurbsSurfaceData;
      clone(): geom.NurbsSurface;
      domainU(): core.Interval<number>;
      domainV(): core.Interval<number>;
      point(u: number, v: number): Point;
      pointAsync(u: number, v: number): promhx.Promise<Point>;
      normal(u: number, v: number): Point;
      normalAsync(u: number, v: number): promhx.Promise<Vector[][]>;
      derivatives(u: number, v: number, numDerivs?: number): Vector[][];
      derivativesAsync(
        u: number,
        v: number,
        numDerivs?: number
      ): promhx.Promise<Vector[][]>;
      closestParam(pt: Point): UV;
      closestParamAsync(pt: Point): promhx.Promise<UV>;
      closestPoint(pt: Point): Point;
      closestPointAsync(pt: Point): promhx.Promise<Point>;
      split(u: number, useV?: boolean): geom.NurbsSurface[];
      splitAsync(
        u: number,
        useV?: boolean
      ): promhx.Promise<geom.NurbsSurface[]>;
      reverse(useV?: boolean): geom.NurbsSurface;
      reverseAsync(useV?: boolean): promhx.Promise<geom.NurbsSurface>;
      isocurve(u: number, useV?: boolean): geom.NurbsCurve;
      isocurveAsync(u: number, useV?: boolean): promhx.Promise<geom.NurbsCurve>;
      boundaries(options?: eval.AdaptiveRefinementOptions): geom.NurbsCurve[];
      boundariesAsync(
        options?: eval.AdaptiveRefinementOptions
      ): promhx.Promise<geom.NurbsCurve[]>;
      tessellate(options?: eval.AdaptiveRefinementOptions): core.MeshData;
      tessellateAsync(
        options?: eval.AdaptiveRefinementOptions
      ): promhx.Promise<core.MeshData>;
      transform(mat: Matrix): geom.NurbsSurface;
      transformAsync(mat: Matrix): promhx.Promise<geom.NurbsSurface>;
      static byKnotsControlPointsWeights(
        degreeU: number,
        degreeV: number,
        knotsU: KnotArray,
        knotsV: KnotArray,
        controlPoints: Point[][],
        weights?: number[][]
      ): geom.NurbsSurface;
      static byCorners(
        point0: Point,
        point1: Point,
        point2: Point,
        point3: Point
      ): geom.NurbsSurface;
      static byLoftingCurves(
        curves: geom.ICurve[],
        degreeV?: number
      ): geom.NurbsSurface;
    }

    export class ConicalSurface extends geom.NurbsSurface {
      constructor(
        axis: Vector,
        xaxis: Vector,
        base: Point,
        height: number,
        radius: number
      );
      axis(): Vector;
      xaxis(): Vector;
      base(): Point;
      height(): number;
      radius(): number;
    }

    export class CylindricalSurface extends geom.NurbsSurface {
      constructor(
        axis: Vector,
        xaxis: Vector,
        base: Point,
        height: number,
        radius: number
      );
      axis(): Vector;
      xaxis(): Vector;
      base(): Point;
      height(): number;
      radius(): number;
    }

    export class EllipseArc extends geom.NurbsCurve {
      constructor(
        center: Point,
        xaxis: Vector,
        yaxis: Vector,
        minAngle: number,
        maxAngle: number
      );
      center(): Point;
      xaxis(): Vector;
      yaxis(): Vector;
      minAngle(): number;
      maxAngle(): number;
    }

    export class Ellipse extends geom.EllipseArc {
      constructor(center: Point, xaxis: Vector, yaxis: Vector);
    }

    export class ExtrudedSurface extends geom.NurbsSurface {
      constructor(profile: geom.ICurve, direction: Vector);
      profile(): geom.ICurve;
      direction(): Vector;
    }

    export class Intersect {
      static curves(
        first: geom.ICurve,
        second: geom.ICurve,
        tol?: number
      ): core.CurveCurveIntersection[];
      static curvesAsync(
        first: geom.ICurve,
        second: geom.ICurve,
        tol?: number
      ): promhx.Promise<core.CurveCurveIntersection[]>;
      static curveAndSurface(
        curve: geom.ICurve,
        surface: geom.ISurface,
        tol?: number
      ): core.CurveSurfaceIntersection[];
      static curveAndSurfaceAsync(
        curve: geom.ICurve,
        surface: geom.ISurface,
        tol?: number
      ): promhx.Promise<core.CurveSurfaceIntersection[]>;
      static surfaces(
        first: geom.ISurface,
        second: geom.ISurface,
        tol?: number
      ): geom.NurbsCurve[];
      static surfacesAsync(
        first: geom.ISurface,
        second: geom.ISurface,
        tol?: number
      ): promhx.Promise<geom.NurbsCurve[]>;
    }

    export class Line extends geom.NurbsCurve {
      constructor(start: Point, end: Point);
      start(): Point;
      end(): Point;
    }

    export class RevolvedSurface extends geom.NurbsSurface {
      constructor(
        profile: geom.NurbsCurve,
        center: Point,
        axis: Vector,
        angle: number
      );
      profile(): geom.ICurve;
      center(): Point;
      axis(): Vector;
      angle(): number;
    }

    export class SphericalSurface extends geom.NurbsSurface {
      constructor(center: Point, radius: number);
      center(): Point;
      radius(): number;
    }

    export class SweptSurface extends geom.NurbsSurface {
      constructor(profile: geom.ICurve, rail: geom.ICurve);
      profile(): geom.ICurve;
      rail(): geom.ICurve;
    }
  }

  export type { promhx, core, eval, exe, geom };

  interface Verb {
    EPSILON: number;
    TOLERANCE: number;
    VERSION: string;
    promhx: typeof promhx;
    core: typeof core;
    eval: typeof eval;
    exe: typeof exe;
    geom: typeof geom;
  }

  const verb: Verb;
  export default verb;
}