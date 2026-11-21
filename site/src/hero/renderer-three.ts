import * as THREE from "three";
import type { HeroRenderer, HeroState } from "./state";
import { buildTote, DIM } from "./tote";
import { buildGroceries } from "./groceries";
import { drawPrint, makeWeave, shadowCanvas, tileTexture } from "./textures";

const WEAVE_PER_UNIT = 3.2; // weave tiles per scene unit, same on every panel
const TIP_MAX = THREE.MathUtils.degToRad(86);
const STRAP_FLOP = THREE.MathUtils.degToRad(-62);

export interface ThreeRendererOptions {
  /** render a still (no float), opaque paper background — used to bake the poster images */
  still?: boolean;
}

async function loadWordmark(): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch("/assets/wordmark.svg", { method: "HEAD" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("svg")) return null;
    const img = new Image();
    img.src = "/assets/wordmark.svg";
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);

export function createThreeRenderer(stage: HTMLElement, state: HeroState, opts: ThreeRendererOptions = {}): HeroRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: !opts.still,
    powerPreference: "high-performance",
    preserveDrawingBuffer: !!opts.still,
  });
  let maxPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  if (opts.still) renderer.setClearColor(0xf3efe7, 1);
  else renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity .6s cubic-bezier(.16,1,.3,1)";
  stage.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

  // ---------- lights: soft key from top-left, fill, a little back light ----------
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf3efe7, 1.55));
  const key = new THREE.DirectionalLight(0xfffaf2, 1.9);
  key.position.set(-2.6, 4.2, 3.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf3efe7, 0.55);
  fill.position.set(3, 1.2, 2.4);
  scene.add(fill);
  const back = new THREE.DirectionalLight(0xffffff, 0.5);
  back.position.set(0.5, 2.5, -3.5);
  scene.add(back);

  // ---------- materials ----------
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const weave = makeWeave();
  const rep = (w: number, h: number): [number, number] => [w * WEAVE_PER_UNIT, h * WEAVE_PER_UNIT];
  // weave maps read uv1, whose coordinates are already in scene units
  const colorT = tileTexture(weave.color, rep(1, 1), true, aniso);
  const normalT = tileTexture(weave.normal, rep(1, 1), false, aniso);
  const roughT = tileTexture(weave.rough, rep(1, 1), false, aniso);
  for (const t of [colorT, normalT, roughT]) t.channel = 1;

  const fabric = (extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({
      map: colorT,
      normalMap: normalT,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughnessMap: roughT,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
      ...extra,
    });

  const printCanvas = document.createElement("canvas");
  printCanvas.width = 1536;
  const printT = new THREE.CanvasTexture(printCanvas);
  printT.colorSpace = THREE.SRGBColorSpace;
  printT.anisotropy = aniso;

  const mats = {
    outer: fabric(),
    print: fabric({ map: printT }),
    inner: fabric({ side: THREE.BackSide, color: 0xcfc4ae }),
    strap: fabric({ side: THREE.DoubleSide }),
    hem: fabric({ color: 0xf6f1e6 }),
    tag: new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.75 }),
  };

  const { group: tote, faceAspect, straps, mouth } = buildTote(mats);

  const redrawPrint = async () => {
    const wm = await loadWordmark();
    await drawPrint(printCanvas, weave.color, faceAspect, rep(DIM.w, DIM.h), wm);
    printT.needsUpdate = true;
  };

  // ---------- rig: tip pivot (bottom edge) > turn > float > tote ----------
  // After the 180° turn the bottom edge on the viewer's right sits at x = +w/2.
  // The bag tips over that edge, onto its tagged gusset, mouth toward +x.
  const P = DIM.w / 2;
  const tipPivot = new THREE.Group();
  tipPivot.position.set(P, 0, 0);
  const turn = new THREE.Group();
  turn.position.set(-P, 0, 0);
  const float = new THREE.Group();
  float.add(tote);
  turn.add(float);
  tipPivot.add(turn);
  scene.add(tipPivot);

  // ---------- contact shadow ----------
  const shadowT = new THREE.CanvasTexture(shadowCanvas());
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  scene.add(shadow);

  // ---------- groceries ----------
  const coverT = new THREE.TextureLoader().load("/assets/unbound-cover.jpg");
  coverT.colorSpace = THREE.SRGBColorSpace;
  coverT.anisotropy = aniso;
  const items = buildGroceries(coverT);

  // where the bag's mouth ends up once it has tipped over
  tipPivot.rotation.z = -TIP_MAX;
  turn.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  const mouthW = mouth.getWorldPosition(new THREE.Vector3());
  tipPivot.rotation.z = 0;
  turn.rotation.y = 0;
  const anchor = new THREE.Vector3(mouthW.x + 0.04, 0, mouthW.z);

  const itemState = items.map((it, i) => {
    it.obj.visible = false;
    scene.add(it.obj);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat.clone());
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.0015 + i * 0.0001;
    sh.visible = false;
    scene.add(sh);
    const start = mouthW.clone().add(new THREE.Vector3(-0.08, ((i % 3) - 1) * 0.12, ((i % 4) - 1.5) * 0.08));
    const end = new THREE.Vector3(anchor.x + it.rest.dx, it.rest.y, anchor.z + it.rest.dz);
    const qEnd = new THREE.Quaternion().setFromEuler(it.restRot);
    const qStart = new THREE.Quaternion().setFromEuler(new THREE.Euler(it.restRot.x + it.spin * 0.6, it.restRot.y - it.spin * 0.4, it.restRot.z + it.spin));
    return { it, sh, start, end, qStart, qEnd, delay: i * 0.055 };
  });
  const tmpQ = new THREE.Quaternion();

  // composition bounds once everything has landed (for the camera)
  const spillMinX = Math.min(P - 0.08, ...itemState.map((s) => s.end.x - s.it.r));
  const spillMaxX = Math.max(...itemState.map((s) => s.end.x + s.it.r));
  const spillMinZ = Math.min(-DIM.d / 2, ...itemState.map((s) => s.end.z - s.it.r));
  const spillMaxZ = Math.max(...itemState.map((s) => s.end.z + s.it.r));

  // ---------- framing ----------
  const totalH = DIM.h + DIM.strapRise;
  const target1 = new THREE.Vector3(0, totalH * 0.47, 0);
  const target2 = new THREE.Vector3((spillMinX + spillMaxX) / 2, 0.2, (spillMinZ + spillMaxZ) / 2);
  let dist1 = 5;
  let dist2 = 6;
  let portrait = true;
  const vFov = THREE.MathUtils.degToRad(28);
  const fit = () => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    portrait = camera.aspect < 0.9;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const t = Math.tan(vFov / 2);
    const th = Math.tan(hFov / 2);
    // upright: tote + straps ~74% of the stage height, the turning width ~74% of the width
    dist1 = Math.max(totalH / 0.74 / 2 / t, (Math.hypot(DIM.w, DIM.d) * 1.02) / 0.74 / 2 / th);
    // spilled: the whole still life, a little looser
    const spanX = (spillMaxX - spillMinX) * (portrait ? 0.92 : 1);
    const spanV = 1.05 + (spillMaxZ - spillMinZ) * 0.5;
    dist2 = Math.max(spanV / (portrait ? 0.62 : 0.7) / 2 / t, spanX / (portrait ? 0.9 : 0.78) / 2 / th);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  // ---------- loop ----------
  let active = true;
  let raf = 0;
  const t0 = performance.now();
  let frames = 0;
  let sampleStart = 0;
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let firstFrame = true;
  const target = new THREE.Vector3();

  const frame = (now: number) => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const t = (now - t0) / 1000;

    // ---- turn: 0 → π about Y, a slight lean mid-turn so it reads as an object, not a card
    const k = state.turn;
    turn.rotation.y = k * Math.PI;
    turn.rotation.x = Math.sin(k * Math.PI) * 0.07;
    turn.rotation.z = Math.sin(k * Math.PI) * -0.025;

    // ---- tip over the bottom edge, straps flop toward the floor
    const tip = clamp01(state.tip);
    tipPivot.rotation.z = -TIP_MAX * tip;
    for (const s of straps) {
      // straps go slack and fall toward the floor as the bag lands
      const k2 = smooth(clamp01((tip - 0.3) / 0.7));
      s.rotation.z = STRAP_FLOP * k2;
      s.scale.y = 1 - 0.42 * k2;
    }

    // ---- float: a few millimetres of breathing, gone once it starts to fall
    const f = opts.still ? 0 : 1 - smooth(clamp01(tip * 3));
    float.position.y = (0.018 + Math.sin(t * 1.15) * 0.014) * f;
    float.rotation.z = Math.sin(t * 0.72) * 0.008 * f;

    // ---- bag shadow follows the bag from standing to lying
    const ss = 1 - float.position.y * 1.5;
    shadow.position.x = THREE.MathUtils.lerp(0, P + DIM.h * 0.48, smooth(tip));
    shadow.scale.set(
      THREE.MathUtils.lerp(DIM.w * 1.6, DIM.h * 1.75, smooth(tip)) * ss,
      THREE.MathUtils.lerp(DIM.d * 2.4, DIM.d * 2.2, smooth(tip)) * ss,
      1
    );
    shadowMat.opacity = 0.85 - float.position.y * 6;

    // ---- groceries: thrown out of the mouth, land, one small bounce, settle
    const sp = state.spill;
    for (const s of itemState) {
      const p = clamp01((sp - s.delay) / 0.6);
      const on = p > 0;
      s.it.obj.visible = on;
      s.sh.visible = on;
      if (!on) continue;
      const o = s.it.obj;
      const FLY = 0.68;
      if (p < FLY) {
        const u = p / FLY;
        const e = easeOutQuad(u);
        o.position.set(
          THREE.MathUtils.lerp(s.start.x, s.end.x, e),
          THREE.MathUtils.lerp(s.start.y, s.end.y, u) + s.it.arc * 4 * u * (1 - u),
          THREE.MathUtils.lerp(s.start.z, s.end.z, e)
        );
        tmpQ.slerpQuaternions(s.qStart, s.qEnd, smooth(u));
        o.quaternion.copy(tmpQ);
      } else {
        const u = (p - FLY) / (1 - FLY);
        const bounce = 0.035 * (s.it.r < 0.1 ? 1.3 : 0.6) * 4 * u * (1 - u) * (1 - u * 0.5);
        o.position.set(s.end.x, s.end.y + bounce, s.end.z);
        o.quaternion.copy(s.qEnd);
        o.rotateZ(Math.sin(u * Math.PI * 2) * 0.05 * (1 - u));
      }
      const hgt = Math.max(0, o.position.y - s.end.y);
      const r = s.it.r * (2.6 + hgt * 3);
      s.sh.position.x = o.position.x;
      s.sh.position.z = o.position.z;
      s.sh.scale.set(r, r * (s.it.name === "baguette" ? 0.5 : 1), 1);
      s.sh.rotation.z = s.it.name === "baguette" ? -s.it.restRot.y : 0;
      (s.sh.material as THREE.MeshBasicMaterial).opacity = 0.6 * clamp01(1 - hgt * 2.2) * clamp01(p * 4);
    }

    // ---- camera: three-quarter view orbit during the turn, then pulls back over the spill
    const d1 = smooth(state.dolly);
    const c = smoother(clamp01(state.tip * 0.85 + state.spill * 0.15));
    const dist = THREE.MathUtils.lerp(dist1 * (1 - 0.09 * d1), dist2, c);
    const yaw = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-16 + 42 * d1, portrait ? 30 : 12, c));
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(13 - 3 * d1, portrait ? 40 : 28, c));
    target.lerpVectors(target1, target2, c);
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camera.lookAt(target);

    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      canvas.style.opacity = "1";
      resolveReady();
    }

    // low-end detection: average frame time over ~60 frames after warm-up
    if (frames === 10) sampleStart = now;
    if (frames === 70 && maxPR > 1.5) {
      const avg = (now - sampleStart) / 60;
      if (avg > 22) {
        maxPR = 1.5;
        renderer.setPixelRatio(maxPR);
        fit();
      }
    }
    frames++;
  };

  // draw the print (Spalla or wordmark.svg) before the first frame, redraw when fonts land
  (async () => {
    try {
      await document.fonts.load(`400 100px "spalla"`);
    } catch {}
    await redrawPrint();
    if (opts.still) {
      await new Promise<void>((r) => {
        if (coverT.image) r();
        else coverT.onUpdate = () => r();
        setTimeout(r, 3000);
      });
    }
    raf = requestAnimationFrame(frame);
    document.fonts.ready.then(redrawPrint);
  })();

  return {
    ready,
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on && !raf) raf = requestAnimationFrame(frame);
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}
