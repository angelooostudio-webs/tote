import * as THREE from "three";

/**
 * The groceries that spill out of the tote, modeled procedurally (low-poly,
 * soft, in the same matte world as the canvas): baguette, oranges, an apple,
 * a milk carton, a paper-wrapped bunch of flowers and — the easter egg — a
 * small copy of UNBOUND using public/assets/unbound-cover.jpg.
 *
 * Each item carries where it comes to rest relative to the bag's mouth.
 */
export interface Grocery {
  name: string;
  obj: THREE.Object3D;
  /** resting offset from the mouth anchor on the floor: +x away from the bag, +z toward the camera */
  rest: { dx: number; dz: number; y: number };
  restRot: THREE.Euler;
  /** footprint radius for the blob shadow */
  r: number;
  /** extra spin (radians) while flying */
  spin: number;
  /** arc height of the throw */
  arc: number;
}

const mat = (color: number, roughness = 0.75, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

function baguette() {
  const g = new THREE.Group();
  const crust = mat(0xc98d4b, 0.7);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.5, 6, 14), crust);
  body.scale.set(1, 1, 0.82);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  // scores along the top
  const score = mat(0xe8c48e, 0.85);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), score);
    s.position.set(-0.2 + i * 0.1, 0.043, 0);
    s.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.5);
    s.scale.set(1, 1, 0.35);
    g.add(s);
  }
  return g;
}

function citrus(color: number, r: number, squash = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), mat(color, 0.62));
  m.scale.set(1, squash, 1);
  g.add(m);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.02, 6), mat(0x4c5a2e, 0.8));
  stem.position.y = r * squash + 0.006;
  g.add(stem);
  return g;
}

function labelTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function milk() {
  const g = new THREE.Group();
  const W = 0.13;
  const H = 0.24;
  const side = labelTexture(256, 512, (c, w, h) => {
    c.fillStyle = "#f6f4ee";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#d6eeff"; // the brand's light blue, one detail
    c.fillRect(0, h * 0.42, w, h * 0.3);
    c.fillStyle = "#111112";
    c.font = "500 34px 'Geist Mono', ui-monospace, monospace";
    c.textAlign = "center";
    c.fillText("LECHE", w / 2, h * 0.6);
    c.font = "400 18px 'Geist Mono', ui-monospace, monospace";
    c.fillText("ENTERA · 1 L", w / 2, h * 0.66);
  });
  const sideMat = mat(0xffffff, 0.55, { map: side });
  const white = mat(0xf6f4ee, 0.55);
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, W), [sideMat, sideMat, white, white, sideMat, sideMat]);
  box.position.y = H / 2;
  g.add(box);
  // gable top
  const roof = new THREE.Shape();
  roof.moveTo(-W / 2, 0);
  roof.lineTo(0, W * 0.42);
  roof.lineTo(W / 2, 0);
  roof.closePath();
  const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(roof, { depth: W, bevelEnabled: false }), white);
  gable.position.set(0, H, -W / 2);
  g.add(gable);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, W), white);
  fin.position.set(0, H + W * 0.42 + 0.008, 0);
  g.add(fin);
  // center the group on its middle so it tumbles about its center
  g.children.forEach((c) => (c.position.y -= (H + W * 0.42) / 2));
  return g;
}

function flowers() {
  const g = new THREE.Group();
  // kraft paper cone
  const paper = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 18, 1, true), mat(0xe9dcc2, 0.9, { side: THREE.DoubleSide }));
  paper.rotation.x = Math.PI;
  paper.position.y = -0.02;
  g.add(paper);
  const stemM = mat(0x6b7a45, 0.8);
  const heads = [0xf6f1e4, 0xf1d36b, 0xf6f1e4, 0xe9b9a4, 0xf6f1e4, 0xf1d36b];
  heads.forEach((hc, i) => {
    const a = (i / heads.length) * Math.PI * 2;
    const rr = 0.035 + (i % 2) * 0.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.36, 5), stemM);
    stem.position.set(Math.cos(a) * rr * 0.5, 0.08, Math.sin(a) * rr * 0.5);
    stem.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
    g.add(stem);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03 + (i % 3) * 0.006, 1), mat(hc, 0.85, { flatShading: true }));
    head.position.set(Math.cos(a) * rr, 0.27 + (i % 3) * 0.02, Math.sin(a) * rr);
    head.scale.set(1, 0.7, 1);
    g.add(head);
  });
  return g;
}

function magazine(cover: THREE.Texture) {
  const W = 0.2;
  const H = 0.265;
  const T = 0.01;
  const pages = mat(0xf7f4ec, 0.9);
  const coverMat = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.45 });
  const back = mat(0x111112, 0.5);
  // box faces: +x, -x, +y (cover, lies face up), -y, +z, -z
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, T, H), [pages, pages, coverMat, back, pages, pages]);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** groceries are modeled at roughly half scale, then sized against the 40 cm bag (1 unit) */
const S = 1.65;

export function buildGroceries(cover: THREE.Texture): Grocery[] {
  const E = (x: number, y: number, z: number) => new THREE.Euler(x, y, z);
  // rest offsets from the mouth anchor: +dx away from the bag, +dz toward the camera.
  // The magazine lands front and center: it is the easter egg.
  const list: Grocery[] = [
    { name: "flowers", obj: flowers(), rest: { dx: 0.42, dz: -0.42, y: 0.075 }, restRot: E(0, 0.6, -Math.PI / 2 + 0.08), r: 0.2, spin: 0.6, arc: 0.1 },
    { name: "milk", obj: milk(), rest: { dx: 0.86, dz: -0.12, y: 0.066 }, restRot: E(0, -0.5, Math.PI / 2), r: 0.16, spin: 1.6, arc: 0.14 },
    { name: "baguette", obj: baguette(), rest: { dx: 0.5, dz: 0.42, y: 0.045 }, restRot: E(0, 0.5, 0), r: 0.32, spin: 1.2, arc: 0.16 },
    { name: "orange1", obj: citrus(0xe98a2c, 0.062), rest: { dx: 0.02, dz: 0.66, y: 0.062 }, restRot: E(0.4, 0, 0.9), r: 0.07, spin: 5, arc: 0.14 },
    { name: "unbound", obj: magazine(cover), rest: { dx: -0.4, dz: 0.92, y: 0.006 }, restRot: E(0, -0.28, 0), r: 0.18, spin: 2.2, arc: 0.22 },
    { name: "orange2", obj: citrus(0xe98a2c, 0.06), rest: { dx: 1.08, dz: 0.38, y: 0.06 }, restRot: E(1.2, 0, 0.3), r: 0.07, spin: 6, arc: 0.12 },
    { name: "apple", obj: citrus(0xb3342b, 0.058, 0.9), rest: { dx: 0.82, dz: 0.84, y: 0.052 }, restRot: E(0.2, 0, 1.4), r: 0.065, spin: 4, arc: 0.14 },
    { name: "orange3", obj: citrus(0xe98a2c, 0.059), rest: { dx: 0.3, dz: 1.22, y: 0.059 }, restRot: E(0.9, 0, 0.2), r: 0.065, spin: 7, arc: 0.1 },
  ];
  for (const g of list) {
    g.obj.scale.setScalar(S);
    g.rest.y *= S;
    g.r *= S;
    g.arc *= S;
  }
  return list;
}
