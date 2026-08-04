/* puffer3d — builds the 3D glossy puffer garment + a studio environment for
 * reflections, as pure Three.js geometry (no external model file). Shared by
 * the live try-on page and the offline preview harness. Import THREE via an
 * import map ("three" -> a build of three.module.js). */
import * as THREE from "three";

// ---- Studio environment: dark surround with a few bright softboxes, so the
// glossy material picks up crisp wet-look reflections. Returned as a PMREM
// env texture. ----
export function buildStudioEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();

  // gradient backdrop sphere (bright above, dark below)
  const geo = new THREE.SphereGeometry(12, 24, 24);
  const top = new THREE.Color(0x8a929e), mid = new THREE.Color(0x4a4f58), bot = new THREE.Color(0x14161a);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 12 + 1) / 2;
    const c = t > 0.5 ? mid.clone().lerp(top, (t - 0.5) * 2) : bot.clone().lerp(mid, t * 2);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));

  // bright softbox panels -> crisp specular streaks on the glossy nylon
  const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dim = new THREE.MeshBasicMaterial({ color: 0xaebbd0 });
  function box(w, h, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.lookAt(0, y, 0); scene.add(m);
  }
  box(4, 9, -4, 3, 6, panel);    // key softbox, front-upper-left
  box(1.4, 9, -2.4, 0, 7, panel);// vertical strip -> signature gloss streak
  box(2, 8, 6, 1, 4, dim);       // fill, right
  box(7, 2.4, 0, 8, 1, panel);   // top light
  box(1.2, 6, 3, 0, -7, dim);    // back rim

  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// ---- Glossy nylon puffer material ----
function nylon(color) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.0, roughness: 0.09,
    clearcoat: 1.0, clearcoatRoughness: 0.03,
    envMapIntensity: 2.6, specularIntensity: 1.0,
    sheen: 0.5, sheenColor: new THREE.Color(0xfff2c8),
  });
}

// Lathe profile with scalloped baffle rings -> a solid quilted barrel.
function baffleProfile(yBot, yTop, rAt, nb, amp) {
  const pts = [];
  pts.push(new THREE.Vector2(0.001, yBot));
  const steps = nb * 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = yBot + (yTop - yBot) * t;
    const g = (t * nb) % 1;                 // 0..1 within a baffle
    const bulge = Math.sin(Math.PI * g);    // 0 at seams, 1 at centre
    const r = Math.max(0.02, rAt(t) + amp * bulge);
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(0.001, yTop));
  return pts;
}

// ---- Build the puffer as a THREE.Group centred at origin, ~1.5 units tall ----
export function buildPuffer(env) {
  const g = new THREE.Group();
  const mat = nylon(0xf3a200);
  const cuffMat = new THREE.MeshPhysicalMaterial({ color: 0x17181c, roughness: 0.6, clearcoat: 0.3 });
  // Translucent green collar — glossy but see-through.
  const collarMat = new THREE.MeshPhysicalMaterial({
    color: 0x3fd98a, metalness: 0.0, roughness: 0.12,
    clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 2.2,
    transparent: true, opacity: 0.42, transmission: 0.55,
    thickness: 0.4, ior: 1.35, side: THREE.DoubleSide,
  });
  mat.envMap = env; cuffMat.envMap = env; collarMat.envMap = env;

  // BODY: revolved quilted barrel, flattened on Z to an oval torso. Boxy and
  // wide (oversized) with only gentle taper near the very top and hem.
  const bodyPts = baffleProfile(-0.72, 0.54, (t) => {
    const taperTop = t > 0.82 ? (1 - (t - 0.82) / 0.18 * 0.42) : 1;
    const taperBot = t < 0.08 ? (0.72 + t / 0.08 * 0.28) : 1;
    return 0.5 * taperTop * taperBot;
  }, 6, 0.05);
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 48), mat);
  body.scale.z = 0.62;
  g.add(body);

  // COLLAR: smaller translucent-green stand collar around the neck.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.10, 18, 36), collarMat);
  collar.rotation.x = Math.PI / 2 - 0.35;
  collar.position.y = 0.54; collar.scale.set(1, 1, 0.7);
  g.add(collar);

  // SLEEVES: bent quilted tubes hanging down from each shoulder.
  function sleeve(side) {
    const sg = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.34, 0.42, 0.02),
      new THREE.Vector3(side * 0.52, 0.16, 0.05),
      new THREE.Vector3(side * 0.56, -0.12, 0.06),
      new THREE.Vector3(side * 0.52, -0.42, 0.05),
      new THREE.Vector3(side * 0.48, -0.60, 0.03),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.155, 20, false), mat);
    sg.add(tube);
    // quilting rings + a ribbed cuff
    const N = 6;
    for (let i = 1; i < N; i++) {
      const p = curve.getPointAt(i / N);
      const tan = curve.getTangentAt(i / N);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.157, 0.03, 10, 24), mat);
      ring.position.copy(p);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      sg.add(ring);
    }
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.12, 20), cuffMat);
    const cp = curve.getPointAt(0.985), ct = curve.getTangentAt(1);
    cuff.position.copy(cp);
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ct);
    sg.add(cuff);
    return sg;
  }
  g.add(sleeve(-1));
  g.add(sleeve(1));

  // ZIPPER: thin dark strip down the front centre.
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.18, 0.02), new THREE.MeshPhysicalMaterial({ color: 0x111318, roughness: 0.5, metalness: 0.3 }));
  zip.position.set(0, -0.08, 0.40 * 0.62 + 0.03);
  g.add(zip);

  return g;
}
