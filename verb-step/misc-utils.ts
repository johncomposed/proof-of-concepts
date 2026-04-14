import { Vector3 } from "three";
import type {geom} from "verb-nurbs";

export function projectPointToSurface(
  surface: geom.NurbsSurface,
  u: number,
  v: number
): Vector3 {
  const pt = surface.point(u, v);
  return new Vector3(pt[0], pt[1], pt[2]);
}

export function computeNormal(
  surface: geom.NurbsSurface,
  u: number,
  v: number,
  epsilon = 0.0001
): Vector3 {
  const p = surface.point(u, v);
  const pu = surface.point(u + epsilon, v);
  const pv = surface.point(u, v + epsilon);

  const du = new Vector3().subVectors(new Vector3(...pu), new Vector3(...p));
  const dv = new Vector3().subVectors(new Vector3(...pv), new Vector3(...p));

  return new Vector3().crossVectors(du, dv).normalize();
}

export function sampleNurbsCurve2D(
  curve: geom.NurbsCurve,
  numPoints = 100
): [number, number][] {
  return Array.from({ length: numPoints }, (_, i) => {
    const t = i / (numPoints - 1);
    const pt = curve.point(t);
    return [pt[0], pt[1]];
  });
}

// Adaptive sampling for NURBS curve in 2D (UV space)
export function adaptiveSampleNurbsCurve2D(
  curve: geom.NurbsCurve,
  maxAngleDeg = 5,
  maxDepth = 10
): [number, number][] {
  const toVec2 = (pt: number[]) => [pt[0], pt[1]] as [number, number];
  const angleBetween = (a: [number, number], b: [number, number], c: [number, number]) => {
    const ab = [b[0] - a[0], b[1] - a[1]];
    const bc = [c[0] - b[0], c[1] - b[1]];
    const dot = ab[0] * bc[0] + ab[1] * bc[1];
    const magAB = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
    const magBC = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1]);
    if (magAB === 0 || magBC === 0) return 0;
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magBC))));
    return angle * (180 / Math.PI);
  };

  function subdivide(t0: number, t1: number, depth: number): [number, number][] {
    const p0 = toVec2(curve.point(t0));
    const p1 = toVec2(curve.point((t0 + t1) / 2));
    const p2 = toVec2(curve.point(t1));
    const angle = angleBetween(p0, p1, p2);
    if (angle > maxAngleDeg && depth < maxDepth) {
      // Subdivide further
      const left = subdivide(t0, (t0 + t1) / 2, depth + 1);
      const right = subdivide((t0 + t1) / 2, t1, depth + 1);
      return [...left.slice(0, -1), ...right];
    } else {
      return [p0, p2];
    }
  }

  const points: [number, number][] = [];
  const steps = 10;
  let last: [number, number] | null = null;
  for (let i = 0; i < steps; i++) {
    const seg = subdivide(i / steps, (i + 1) / steps, 0);
    for (const pt of seg) {
      if (!last || pt[0] !== last[0] || pt[1] !== last[1]) {
        points.push(pt);
        last = pt;
      }
    }
  }
  return points;
}

export function projectPointToSurfaceUV(
  surface: geom.NurbsSurface,
  point: number[],
  resolution = 20
): [number, number] | null {
  // Grid search for initial guess
  let minDist = Infinity;
  let bestUV: [number, number] | null = null;

  // Search in UV space
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const u = i / resolution;
      const v = j / resolution;
      const surfacePoint = surface.point(u, v);
      const dist = Math.sqrt(
        Math.pow(surfacePoint[0] - point[0], 2) +
        Math.pow(surfacePoint[1] - point[1], 2) +
        Math.pow(surfacePoint[2] - point[2], 2)
      );
      if (dist < minDist) {
        minDist = dist;
        bestUV = [u, v];
      }
    }
  }

  if (!bestUV) return null;

  // Simple gradient descent to refine the solution
  const epsilon = 0.0001;
  const stepSize = 0.01;
  const maxIterations = 100;
  let [u, v] = bestUV;

  for (let iter = 0; iter < maxIterations; iter++) {
    const p = surface.point(u, v);
    const pu = surface.point(u + epsilon, v);
    const pv = surface.point(u, v + epsilon);

    // Compute gradients
    const du = [
      (pu[0] - p[0]) / epsilon,
      (pu[1] - p[1]) / epsilon,
      (pu[2] - p[2]) / epsilon,
    ];
    const dv = [
      (pv[0] - p[0]) / epsilon,
      (pv[1] - p[1]) / epsilon,
      (pv[2] - p[2]) / epsilon,
    ];

    // Compute distance gradients
    const distU = 2 * (
      du[0] * (p[0] - point[0]) +
      du[1] * (p[1] - point[1]) +
      du[2] * (p[2] - point[2])
    );
    const distV = 2 * (
      dv[0] * (p[0] - point[0]) +
      dv[1] * (p[1] - point[1]) +
      dv[2] * (p[2] - point[2])
    );

    // Update UV coordinates
    const newU = Math.max(0, Math.min(1, u - stepSize * distU));
    const newV = Math.max(0, Math.min(1, v - stepSize * distV));

    // Check convergence
    if (Math.abs(newU - u) < epsilon && Math.abs(newV - v) < epsilon) {
      return [newU, newV];
    }

    u = newU;
    v = newV;
  }

  return [u, v];
} 


import * as THREE from 'three';
import type { geom, core, eval as verb_eval } from 'verb-nurbs';

/**
 * Helper to convert a THREE.Matrix4 to a 4x4 number array for verb-nurbs.
 */
export function matrix4ToNumberArray(m: THREE.Matrix4): core.Matrix {
  const e = m.elements;
  // THREE.Matrix4 elements are column-major, verb expects row-major.
  return [
    [e[0], e[4], e[8], e[12]],
    [e[1], e[5], e[9], e[13]],
    [e[2], e[6], e[10], e[14]],
    [e[3], e[7], e[11], e[15]],
  ];
}

/**
 * Converts a verb.geom.ISurface into a THREE.BufferGeometry.
 * This function tessellates the NURBS surface into a triangle mesh
 * that can be rendered by three.js.
 *
 * @param verbSurface - An object that implements the verb.geom.ISurface interface
 *   (e.g., NurbsSurface, SweptSurface, RevolvedSurface).
 * @param options - Optional adaptive refinement options for tessellation.
 * @returns A THREE.BufferGeometry ready for use in a THREE.Mesh.
 */
export function surfaceToBufferGeometry(
  verbSurface: geom.NurbsSurface,
  options?: verb_eval.AdaptiveRefinementOptions
): THREE.BufferGeometry {
  // Tessellate the NURBS surface to get vertices, normals, and face indices.
  // The result is of type verb.core.MeshData.
  const tessellated: core.MeshData = verbSurface.tessellate(options);
  const geometry = new THREE.BufferGeometry();

  // Set the position attribute from the tessellated points.
  // The points are in the format [[x1, y1, z1], [x2, y2, z2], ...].
  // .flat() converts this to [x1, y1, z1, x2, y2, z2, ...].
  if (tessellated.points && tessellated.points.length > 0) {
    const positions = new Float32Array(tessellated.points.flat());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }

  // Set the normal attribute from the tessellated normals.
  if (tessellated.normals && tessellated.normals.length > 0) {
    const normals = new Float32Array(tessellated.normals.flat());
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }

  // Set the index for the faces. The faces are triangle indices.
  // The format is [[i1, i2, i3], [i4, i5, i6], ...].
  if (tessellated.faces && tessellated.faces.length > 0) {
    const indices = tessellated.faces.flat();
    geometry.setIndex(indices);
  }

  return geometry;
}

/**
 * Converts a verb.geom.ICurve into a THREE.BufferGeometry for rendering as a line.
 * This function samples points along the NURBS curve.
 *
 * @param verbCurve - An object that implements the verb.geom.ICurve interface
 *   (e.g., NurbsCurve, BezierCurve, Line).
 * @param tolerance - Optional tolerance for adaptive tessellation. A lower value
 *   results in a higher-resolution curve with more points.
 * @returns A THREE.BufferGeometry ready for use in a THREE.Line or similar.
 */
export function curveToBufferGeometry(
  verbCurve: geom.NurbsCurve,
  tolerance?: number
): THREE.BufferGeometry {
  // Tessellate the curve to get an array of points.
  // The result is of type verb.core.Point[], which is number[][].
  const points: core.Point[] = verbCurve.tessellate(tolerance);

  // Convert the verb points (number[]) into THREE.Vector3 instances.
  const threePoints: THREE.Vector3[] = points.map(
    (p: core.Point) => new THREE.Vector3(...p)
  );

  // Create the geometry directly from the array of Vector3.
  const geometry = new THREE.BufferGeometry().setFromPoints(threePoints);

  return geometry;
}


import v, { type geom, type core } from 'verb-nurbs';

// The output structure for a single top-level shape and its holes.
export interface OrganizedContour {
  profile: geom.NurbsCurve[];
  holes: geom.NurbsCurve[][];
}

/**
 * Checks if a 2D point is inside a closed polygon using simple ray casting algorithm.
 * @param point The point to check [x, y].
 * @param polygon The polygon defined by an array of vertices [[x1, y1], [x2, y2], ...].
 * @returns True if the point is inside the polygon.
 */
function isPointInPolygon(point: core.Point, polygon: core.Point[]): boolean {
  let isInside = false;
  const [px, py] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) {
      isInside = !isInside;
    }
  }

  return isInside;
}

/**
 * Takes a flat list of closed contours and organizes them into profiles and holes.
 * It determines containment by testing if a contour's representative point is inside another.
 *
 * @param contours A flat array of contours, where each contour is an array of verb ICurve segments.
 * @returns An array of OrganizedContour objects, representing all top-level shapes.
 */
export function organizeContours(
  contours: geom.NurbsCurve[][]
): OrganizedContour[] {
  if (contours.length <= 1) {
    return contours.map((profile) => ({ profile, holes: [] }));
  }

  // 1. Pre-calculate tessellated points and bounding boxes for efficiency.
  const contourData = contours.map((contour) => {
    const points = contour.flatMap((segment) => segment.tessellate());
    const bb = new v.core.BoundingBox(points);
    return {
      original: contour,
      points,
      bb,
      area: bb.getAxisLength(0) * bb.getAxisLength(1), // Use area to find smallest container
      // Use a point guaranteed to be inside the contour for testing
      testPoint: points[0],
    };
  });

  const parentIndices = new Array(contours.length).fill(-1);

  // 2. For each contour, find its smallest direct parent.
  for (let i = 0; i < contourData.length; i++) {
    let potentialParentIndex = -1;
    let minParentArea = Infinity;

    for (let j = 0; j < contourData.length; j++) {
      if (i === j) continue;

      // Quick check: must be smaller and its bounding box must be inside.
      if (
        contourData[j].area > contourData[i].area &&
        contourData[j].bb.contains(contourData[i].bb.min) &&
        contourData[j].bb.contains(contourData[i].bb.max)
      ) {
        // Full check: use point-in-polygon test.
        if (isPointInPolygon(contourData[i].testPoint, contourData[j].points)) {
          // If this is a smaller container than the last one we found, it's a better parent.
          if (contourData[j].area < minParentArea) {
            minParentArea = contourData[j].area;
            potentialParentIndex = j;
          }
        }
      }
    }
    parentIndices[i] = potentialParentIndex;
  }

  // 3. Build the final hierarchical structure.
  const organized: OrganizedContour[] = [];
  const contourMap = new Map<number, OrganizedContour>();

  // Add all top-level profiles first (those with no parent).
  parentIndices.forEach((parentIndex, i) => {
    if (parentIndex === -1) {
      const org = { profile: contourData[i].original, holes: [] };
      organized.push(org);
      contourMap.set(i, org);
    }
  });

  // Add all holes to their respective parents.
  parentIndices.forEach((parentIndex, i) => {
    if (parentIndex !== -1) {
      const parentOrg = contourMap.get(parentIndex);
      // This handles nested holes correctly: a hole's parent must be a top-level shape.
      // For more complex cases (islands within holes), this logic would need to be a tree traversal.
      // But for ShapeGeometry, only one level of holes is supported.
      if (parentOrg) {
        parentOrg.holes.push(contourData[i].original);
      }
    }
  });

  return organized;
}


import verb from 'verb-nurbs';
import type { geom } from 'verb-nurbs';
import * as THREE from 'three';
import earcut from 'earcut';
import { organizeContours } from './organizeContours';

// --- Interfaces for the generic function ---

export interface ExtrudeContoursOptions {
  extrusionDepth: number;
  tessellationTolerance?: number;
}

export interface ContourExtrusionResult {
  sideGeometries: THREE.BufferGeometry[];
  frontCapGeometries: THREE.BufferGeometry[];
  backCapGeometries: THREE.BufferGeometry[];
}

// --- Internal Helper Functions (Implementation Details) ---

/**
 * Creates a non-planar cap geometry from 3D points using earcut triangulation.
 */
function createCapWithEarcut(
  profilePts: THREE.Vector3[],
  holesPts: THREE.Vector3[][]
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  profilePts.forEach((p) => vertices.push(p.x, p.y, p.z));

  const holeIndices: number[] = [];
  holesPts.forEach((hole) => {
    holeIndices.push(vertices.length / 3);
    hole.forEach((p) => vertices.push(p.x, p.y, p.z));
  });

  const faceIndices = earcut(vertices, holeIndices, 3);

  geometry.setIndex(faceIndices);
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Offsets an array of 3D points that lie on a surface along the surface normals.
 */
function offsetProjectedPoints(
  points: THREE.Vector3[],
  surface: geom.NurbsSurface,
  distance: number
): THREE.Vector3[] {
  return points.map((pt) => {
    const uv = surface.closestParam(pt.toArray());
    const normal = surface.normal(uv[0], uv[1]);
    const offsetVector = new THREE.Vector3(
      ...verb.core.Vec.normalized(normal)
    ).multiplyScalar(distance);
    return new THREE.Vector3().addVectors(pt, offsetVector);
  });
}

// --- The Main Generic Function ---

/**
 * Takes a set of 2D NURBS contours and a 3D NURBS surface, and generates a solid 3D
 * object by projecting the contours onto the surface and extruding them.
 *
 * @param flatContours An array of contours, where each contour is an array of NURBS curves.
 * @param surface The target verb.geom.NurbsSurface to project onto.
 * @param options Options for the extrusion process.
 * @returns An object containing BufferGeometries for the sides, front cap, and back cap.
 */
export function extrudeContoursOnSurface(
  flatContours: geom.NurbsCurve[][],
  surface: geom.NurbsSurface,
  options: ExtrudeContoursOptions
): ContourExtrusionResult {
  const { extrusionDepth, tessellationTolerance = 0.5 } = options;

  // 1. Organize the input contours into profiles and holes.
  const organizedContours = organizeContours(flatContours);

  // 2. Calculate a single, global 2D bounding box for all contours.
  const pathBoundingBox = new THREE.Box2();
  flatContours.flat().forEach((segment) => {
    segment.tessellate(tessellationTolerance).forEach((p) => {
      pathBoundingBox.expandByPoint(new THREE.Vector2(p[0], p[1]));
    });
  });

  const sideGeometries: THREE.BufferGeometry[] = [];
  const frontCapGeometries: THREE.BufferGeometry[] = [];
  const backCapGeometries: THREE.BufferGeometry[] = [];

  // 3. Process each top-level shape.
  for (const { profile, holes } of organizedContours) {
    const mapContourTo3D = (
      contourSegments: geom.NurbsCurve[]
    ): THREE.Vector3[] => {
      const points3D: THREE.Vector3[] = [];
      const originalPoints2D = contourSegments.flatMap((s) =>
        s.tessellate(tessellationTolerance)
      );

      originalPoints2D.forEach((pt2D) => {
        const u =
          (pt2D[0] - pathBoundingBox.min.x) /
          (pathBoundingBox.max.x - pathBoundingBox.min.x);
        const v =
          (pt2D[1] - pathBoundingBox.min.y) /
          (pathBoundingBox.max.y - pathBoundingBox.min.y);
        const projectedPtArray = surface.point(u, v);
        points3D.push(new THREE.Vector3(...projectedPtArray));
      });
      return points3D;
    };

    // 4. Project and Offset points.
    const profileProjected = mapContourTo3D(profile);
    const holesProjected = holes.map((h) => mapContourTo3D(h));

    const profileOffset = offsetProjectedPoints(
      profileProjected,
      surface,
      extrusionDepth
    );
    const holesOffset = holesProjected.map((h) =>
      offsetProjectedPoints(h, surface, extrusionDepth)
    );

    // 5. Build Meshes.
    const buildSideWall = (front: THREE.Vector3[], back: THREE.Vector3[]) => {
      if (front.length < 2) return new THREE.BufferGeometry();
      const geometry = new THREE.BufferGeometry();
      const vertices: number[] = [];
      const indices: number[] = [];
      const numPoints = front.length;

      for (let i = 0; i < numPoints; i++) {
        const p0 = front[i];
        const p1 = front[(i + 1) % numPoints];
        const o0 = back[i];
        const o1 = back[(i + 1) % numPoints];

        const vIndex = i * 4;
        vertices.push(
          p0.x,
          p0.y,
          p0.z,
          p1.x,
          p1.y,
          p1.z,
          o0.x,
          o0.y,
          o0.z,
          o1.x,
          o1.y,
          o1.z
        );
        indices.push(
          vIndex,
          vIndex + 2,
          vIndex + 1,
          vIndex + 1,
          vIndex + 2,
          vIndex + 3
        );
      }
      geometry.setIndex(indices);
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3)
      );
      geometry.computeVertexNormals();
      return geometry;
    };

    sideGeometries.push(buildSideWall(profileProjected, profileOffset));
    holesProjected.forEach((hole, i) =>
      sideGeometries.push(buildSideWall(hole, holesOffset[i]))
    );

    frontCapGeometries.push(
      createCapWithEarcut(profileProjected, holesProjected)
    );
    backCapGeometries.push(createCapWithEarcut(profileOffset, holesOffset));
  }

  return {
    sideGeometries,
    frontCapGeometries,
    backCapGeometries,
  };
}