import * as THREE from "three";

/**
 * Procedural tote, proportioned from the product photo:
 * body about as tall as wide, deep side gusset (~half the width), flat bottom,
 * open top with a hem, two long flat straps sewn inside the rim that lean
 * toward each other, and a small grey woven tag on the seam right of the print.
 *
 * Local space: origin at the center of the bottom, +y up.
 * The PLAIN face looks at +z; the PRINTED face looks at -z, so a 180° turn
 * about Y brings the print to the camera.
 */
export const DIM = {
  w: 1.0, // bottom width
  wTop: 0.97, // slight taper
  h: 1.0,
  d: 0.48, // gusset depth
  bulge: 0.034,
  strapW: 0.075,
  strapT: 0.01,
  strapRise: 0.62,
  strapX: 0.25, // half-distance between a strap's two ends
};

const hw = (v: number) => THREE.MathUtils.lerp(DIM.w, DIM.wTop, v) / 2;

/** Plane whose vertices are placed by f(u, v). UVs stay 0..1. */
function panel(f: (u: number, v: number) => THREE.Vector3, segU = 28, segV = 28) {
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const p = f(uv.getX(i), uv.getY(i));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

const soft = (u: number, v: number) => Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.04)), 0.8);

export interface ToteParts {
  group: THREE.Group;
  /** material of the printed face, so the print texture can be swapped/redrawn */
  printMat: THREE.MeshStandardMaterial;
  faceAspect: number;
  /** strap pivots at the rim, rotated about local Z so the straps flop when the bag falls */
  straps: THREE.Group[];
  /** a point at the center of the opening, for the spill */
  mouth: THREE.Object3D;
}

export function buildTote(mats: {
  outer: THREE.MeshStandardMaterial;
  print: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  strap: THREE.MeshStandardMaterial;
  hem: THREE.MeshStandardMaterial;
  tag: THREE.MeshStandardMaterial;
}): ToteParts {
  const { h, d, bulge } = DIM;
  const group = new THREE.Group();
  group.name = "tote";

  // a hint of gravity: the fabric sags a little below the rim at the gusset
  const pinch = (u: number, v: number) => 0.035 * Math.sin(Math.PI * u) * Math.pow(v, 3);

  const geos = {
    // plain face, +z, u → +x
    plain: panel((u, v) => new THREE.Vector3((u * 2 - 1) * hw(v), v * h, d / 2 + bulge * soft(u, v))),
    // printed face, -z, u → -x (reads correctly when seen from -z)
    print: panel((u, v) => new THREE.Vector3((1 - u * 2) * hw(v), v * h, -d / 2 - bulge * soft(u, v))),
    // gusset on +x, u → -z ; on -x, u → +z ; pinched inward toward the top
    gR: panel((u, v) => new THREE.Vector3(hw(v) + bulge * 0.4 * soft(u, v) - pinch(u, v), v * h, (0.5 - u) * d), 14, 28),
    gL: panel((u, v) => new THREE.Vector3(-hw(v) - bulge * 0.4 * soft(u, v) + pinch(u, v), v * h, (u - 0.5) * d), 14, 28),
    // bottom, outward -y: u → +x, v → +z
    bottom: panel((u, v) => new THREE.Vector3((u * 2 - 1) * hw(0), 0, (v - 0.5) * d), 8, 4),
  };

  const add = (g: THREE.BufferGeometry, outer: THREE.Material) => {
    const o = new THREE.Mesh(g, outer);
    const i = new THREE.Mesh(g, mats.inner);
    o.castShadow = i.castShadow = false;
    group.add(o, i);
  };
  add(geos.plain, mats.outer);
  add(geos.print, mats.print);
  add(geos.gR, mats.outer);
  add(geos.gL, mats.outer);
  add(geos.bottom, mats.outer);

  // UV scale so the weave has the same density on every panel
  const scaleUV = (g: THREE.BufferGeometry, su: number, sv: number) => {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    g.setAttribute("uv1", uv.clone()); // weave maps use the scaled set
  };
  // print map needs 0..1 UVs, so it keeps "uv"; weave maps read "uv1" (channel 1)
  for (const [k, g] of Object.entries(geos)) {
    const uv0 = (g.attributes.uv as THREE.BufferAttribute).clone();
    const su = k === "gR" || k === "gL" ? d : DIM.w;
    const sv = k === "bottom" ? d : h;
    scaleUV(g, su, sv);
    g.setAttribute("uv", uv0);
  }

  // hem: a rolled rim traced exactly along the top edges of the four panels
  const rimPts: THREE.Vector3[] = [];
  const edge = (f: (u: number, v: number) => THREE.Vector3, n: number) => {
    for (let i = 0; i < n; i++) rimPts.push(f(i / n, 1));
  };
  edge((u, v) => new THREE.Vector3((u * 2 - 1) * hw(v), v * h, d / 2 + bulge * soft(u, v)), 24);
  edge((u, v) => new THREE.Vector3(hw(v) + bulge * 0.4 * soft(u, v) - pinch(u, v), v * h, (0.5 - u) * d), 12);
  edge((u, v) => new THREE.Vector3((1 - u * 2) * hw(v), v * h, -d / 2 - bulge * soft(u, v)), 24);
  edge((u, v) => new THREE.Vector3(-hw(v) - bulge * 0.4 * soft(u, v) + pinch(u, v), v * h, (u - 0.5) * d), 12);
  const rim = new THREE.CatmullRomCurve3(rimPts, true, "catmullrom", 0.1);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(rim, 240, 0.0075, 6, true), mats.hem));

  // straps: flat ribbons sewn inside each long face, leaning toward each other at the apex
  const strap = (side: 1 | -1) => {
    const z0 = side * (d / 2 - 0.012);
    const zTop = side * 0.03;
    const x = DIM.strapX;
    const rise = DIM.strapRise;
    const pts = [
      new THREE.Vector3(-x, h - 0.09, z0),
      new THREE.Vector3(-x, h + 0.02, z0),
      new THREE.Vector3(-x * 0.82, h + rise * 0.55, THREE.MathUtils.lerp(z0, zTop, 0.55)),
      new THREE.Vector3(-x * 0.32, h + rise * 0.95, zTop),
      new THREE.Vector3(0, h + rise, zTop),
      new THREE.Vector3(x * 0.32, h + rise * 0.95, zTop),
      new THREE.Vector3(x * 0.82, h + rise * 0.55, THREE.MathUtils.lerp(z0, zTop, 0.55)),
      new THREE.Vector3(x, h + 0.02, z0),
      new THREE.Vector3(x, h - 0.09, z0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    // ribbon: width lies in the face plane (perpendicular to the curve), thickness along the face normal
    const N = 90;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const faceN = new THREE.Vector3(0, 0, side);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const n = faceN.clone().sub(tan.clone().multiplyScalar(faceN.dot(tan))).normalize();
      const s = new THREE.Vector3().crossVectors(tan, n).normalize();
      const hw2 = DIM.strapW / 2;
      const ht = DIM.strapT / 2;
      // four corners of the cross-section
      const c = [
        p.clone().addScaledVector(s, -hw2).addScaledVector(n, ht),
        p.clone().addScaledVector(s, hw2).addScaledVector(n, ht),
        p.clone().addScaledVector(s, hw2).addScaledVector(n, -ht),
        p.clone().addScaledVector(s, -hw2).addScaledVector(n, -ht),
      ];
      const ns = [n, s, n.clone().negate(), s.clone().negate()];
      // 4 faces × 2 verts each so normals stay flat per face
      for (let f = 0; f < 4; f++) {
        const a = c[f];
        const b = c[(f + 1) % 4];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const fn = f === 0 ? ns[0] : f === 1 ? ns[1] : f === 2 ? ns[2] : ns[3];
        nor.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
        const L = curve.getLength();
        uv.push(0, t * L * 12, 1, t * L * 12);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let f = 0; f < 4; f++) {
        const a = i * 8 + f * 2;
        const b = a + 1;
        const c2 = a + 8;
        const d2 = b + 8;
        idx.push(a, b, c2, b, d2, c2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mats.strap);
    return m;
  };
  const straps = [strap(1), strap(-1)].map((m) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, h, 0);
    m.position.y = -h;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  });
  const mouth = new THREE.Object3D();
  mouth.position.set(0, h * 0.92, 0);
  group.add(mouth);

  // woven tag on the seam to the right of the print (viewer's right when the print faces you = -x)
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.004), mats.tag);
  tag.position.set(-hw(0.74) - 0.012, h * 0.74, -d / 2 - 0.004);
  tag.rotation.y = Math.PI / 2 - 0.55; // flap angled out of the seam, toward the gusset
  group.add(tag);

  return { group, printMat: mats.print, faceAspect: h / DIM.w, straps, mouth };
}
