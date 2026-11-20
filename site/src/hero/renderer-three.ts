import * as THREE from "three";
import type { HeroRenderer, HeroState } from "./state";
import { buildTote, DIM } from "./tote";
import { drawPrint, makeWeave, shadowCanvas, tileTexture } from "./textures";

const WEAVE_PER_UNIT = 3.2; // weave tiles per scene unit, same on every panel

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

export function createThreeRenderer(stage: HTMLElement, state: HeroState): HeroRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  let maxPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 0);
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

  const { group: tote, faceAspect } = buildTote(mats);

  const redrawPrint = async () => {
    const wm = await loadWordmark();
    await drawPrint(printCanvas, weave.color, faceAspect, rep(DIM.w, DIM.h), wm);
    printT.needsUpdate = true;
  };

  // ---------- rig: tip (phase 3) > turn > float > tote ----------
  const tipPivot = new THREE.Group(); // pivots about the bottom edge in phase 3
  const turn = new THREE.Group();
  const float = new THREE.Group();
  tote.position.y = 0;
  float.add(tote);
  turn.add(float);
  tipPivot.add(turn);
  scene.add(tipPivot);

  // ---------- contact shadow ----------
  const shadowT = new THREE.CanvasTexture(shadowCanvas());
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  shadow.scale.set(DIM.w * 1.6, DIM.d * 2.4, 1);
  scene.add(shadow);

  // ---------- framing ----------
  const totalH = DIM.h + DIM.strapRise;
  const target = new THREE.Vector3(0, totalH * 0.47, 0);
  let baseDist = 5;
  const fit = () => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit height (tote + straps) to ~78% of the stage, and the turning width to ~80%
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distH = (totalH / 0.74) / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const span = Math.hypot(DIM.w, DIM.d) * 1.02;
    const distW = (span / 0.74) / 2 / Math.tan(hFov / 2);
    baseDist = Math.max(distH, distW);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  // ---------- loop ----------
  let active = true;
  let raf = 0;
  let t0 = performance.now();
  let frames = 0;
  let sampleStart = 0;
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let firstFrame = true;

  const ease = (x: number) => x * x * (3 - 2 * x);

  const frame = (now: number) => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const t = (now - t0) / 1000;

    // turn: 0 → π about Y, a slight forward lean mid-turn so it feels like an object, not a card
    const k = state.turn;
    turn.rotation.y = k * Math.PI;
    turn.rotation.x = Math.sin(k * Math.PI) * 0.07;
    turn.rotation.z = Math.sin(k * Math.PI) * -0.025;

    // float: a few millimetres of breathing, damped as the bag settles toward the floor later
    const f = 1 - state.tip;
    float.position.y = (0.018 + Math.sin(t * 1.15) * 0.014) * f;
    float.rotation.z = Math.sin(t * 0.72) * 0.008 * f;
    shadow.material.opacity = 0.85 - float.position.y * 6;
    const ss = 1 - float.position.y * 1.5;
    shadow.scale.set(DIM.w * 1.6 * ss, DIM.d * 2.4 * ss, 1);

    // camera: three-quarter view from slightly above, dolly in during the turn
    const dolly = ease(state.dolly);
    const dist = baseDist * (1 - 0.09 * dolly);
    const yaw = THREE.MathUtils.degToRad(-16 + 42 * dolly); // ends in a three-quarter view, tag side showing
    const pitch = THREE.MathUtils.degToRad(13 - 3 * dolly);
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

    // low-end detection: average frame time over the first ~60 frames
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
    raf = requestAnimationFrame(frame);
    document.fonts.ready.then(redrawPrint);
  })();

  return {
    ready,
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on && !raf) {
        t0 = performance.now() - 0;
        raf = requestAnimationFrame(frame);
      }
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
