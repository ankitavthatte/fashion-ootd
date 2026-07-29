/* body-fit — A-Frame component that fits a 3D garment to the wearer.
 *
 * 8th Wall gives you the hosted WebAR camera + an A-Frame/Three.js scene, but
 * NOT full-body garment tracking. This component fills that gap: it runs
 * MediaPipe Pose Landmarker on the camera video and drives the garment
 * entity's position / scale / rotation each frame, and gives the model a
 * shiny metallic material for the "inflated chrome" look.
 *
 * This is a scaffold — sound in shape, but the fit constants and the depth
 * model are approximate (a single camera can't measure true distance). Tune
 * OOTD_CONFIG.distance / scale / yOffset on-device.
 */
/* global AFRAME, THREE */
(function () {
  "use strict";

  var TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20";
  var WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
  var MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  if (typeof AFRAME === "undefined") return; // page not configured yet

  AFRAME.registerComponent("body-fit", {
    init: function () {
      this.cfg = window.OOTD_CONFIG || {};
      this.landmarker = null;
      this.lastTs = 0;
      this.tmp = new THREE.Vector3();

      this.stylizeWhenLoaded();
      this.loadPose();
    },

    // Give the garment a shiny, reflective PBR look.
    stylizeWhenLoaded: function () {
      var el = this.el;
      el.addEventListener("model-loaded", function () {
        var mesh = el.getObject3D("mesh");
        if (!mesh) return;
        var env = buildEnv(el.sceneEl);
        mesh.traverse(function (n) {
          if (!n.isMesh || !n.material) return;
          var m = n.material;
          m.metalness = 1.0;      // chrome/latex
          m.roughness = 0.15;     // low = mirror-like
          m.envMap = env;         // reflections = the "inflated" cue
          m.envMapIntensity = 1.4;
          m.needsUpdate = true;
        });
      });
    },

    loadPose: function () {
      var self = this;
      import(TASKS_URL).then(function (vision) {
        return vision.FilesetResolver.forVisionTasks(WASM_URL).then(function (res) {
          return vision.PoseLandmarker.createFromOptions(res, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO", numPoses: 1
          });
        });
      }).then(function (lm) { self.landmarker = lm; })
        .catch(function (e) { console.warn("[body-fit] pose model failed to load:", e); });
    },

    tick: function () {
      if (!this.landmarker) return;
      // 8th Wall renders the camera into a <video>; grab it as the pose input.
      var video = document.querySelector("video");
      if (!video || !video.videoWidth) return;

      var ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;

      var result;
      try { result = this.landmarker.detectForVideo(video, ts); }
      catch (e) { return; }
      if (!result || !result.landmarks || !result.landmarks[0]) return;

      this.fit(result.landmarks[0]);
    },

    // Map shoulders/hips to a world transform in front of the camera.
    fit: function (lm) {
      var LS = lm[11], RS = lm[12], LH = lm[23], RH = lm[24];
      if (!LS || !RS) return;

      var cam = this.el.sceneEl.camera; // THREE.PerspectiveCamera
      var cfg = this.cfg;
      var dist = cfg.distance || 1.6;

      // Shoulder centre in normalized image space (0..1) -> camera-space offset.
      var cx = (LS.x + RS.x) / 2, cy = (LS.y + RS.y) / 2;
      var span = Math.hypot((RS.x - LS.x), (RS.y - LS.y));

      // Convert the normalized point to a ray through the camera at `dist`.
      var ndcX = (cx * 2 - 1);
      var ndcY = -(cy * 2 - 1);
      var vFov = THREE.MathUtils.degToRad(cam.fov);
      var h = 2 * Math.tan(vFov / 2) * dist;
      var w = h * cam.aspect;
      var local = this.tmp.set(ndcX * w / 2, ndcY * h / 2 + (cfg.yOffset || 0), -dist);
      var world = local.applyMatrix4(cam.matrixWorld);
      this.el.object3D.position.copy(world);

      // Scale from shoulder span (wider span on screen = closer = bigger).
      var s = span * dist * 2.4 * (cfg.scale || 1);
      this.el.object3D.scale.setScalar(s);

      // Face the camera, rolled to match shoulder tilt.
      var roll = Math.atan2((RS.y - LS.y), (RS.x - LS.x));
      this.el.object3D.quaternion.copy(cam.quaternion);
      this.el.object3D.rotateZ(-roll);

      this.el.setAttribute("visible", true);
    }
  });

  // A cheap procedural environment so reflections work without shipping an HDRI.
  function buildEnv(sceneEl) {
    try {
      var renderer = sceneEl && sceneEl.renderer;
      if (!renderer || !THREE.PMREMGenerator) return null;
      var pmrem = new THREE.PMREMGenerator(renderer);
      // A soft studio gradient; swap for an equirect HDRI for richer reflections.
      var scene = new THREE.Scene();
      var geo = new THREE.SphereGeometry(50, 16, 16);
      var mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
      var colors = [];
      var pos = geo.attributes.position;
      var top = new THREE.Color(0xdfe8f5), bot = new THREE.Color(0x2b3038);
      for (var i = 0; i < pos.count; i++) {
        var t = (pos.getY(i) / 50 + 1) / 2;
        var c = bot.clone().lerp(top, t);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      scene.add(new THREE.Mesh(geo, mat));
      var tex = pmrem.fromScene(scene).texture;
      pmrem.dispose();
      return tex;
    } catch (e) { return null; }
  }
})();
