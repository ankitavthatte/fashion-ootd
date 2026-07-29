/* Try On — open the camera and wear the jacket.
 * The jacket is warped in real perspective onto the wearer's torso using
 * shoulder + hip landmarks (MediaPipe Pose Landmarker), so it turns and
 * foreshortens with the body instead of looking pasted on. Falls back to a
 * fixed front-on fit when the pose model can't load.
 * Vanilla JS, no build step. */
(function () {
  "use strict";

  var TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20";
  var WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
  var MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  // Art geometry (viewBox 320x340). Torso quad = where the body panel sits.
  var ART_W = 320, ART_H = 340;
  var SRC = [ { x: 100, y: 96 }, { x: 220, y: 96 }, { x: 214, y: 300 }, { x: 106, y: 300 } ]; // LS, RS, RH, LH
  var SMOOTH = 0.4;

  var cam = byId("cam");
  var overlay = byId("overlay");
  var shadow = byId("shadow");
  var jacket = byId("jacket");
  var hint = byId("hint");
  var canvas = byId("canvas");
  var startScreen = byId("start");
  var errorScreen = byId("error");
  var errorMsg = byId("error-msg");
  var resultScreen = byId("result");
  var photo = byId("photo");
  var saveLink = byId("save");

  var stream = null;
  var facing = "user";
  var landmarker = null;
  var tracking = false;
  var running = false;
  var raf = 0, lastTs = 0, lostFrames = 0;
  var quad = null;     // current smoothed destination corners [LS,RS,RH,LH]
  var visible = false;

  var jacketImg = new Image();
  jacketImg.src = svgToUri(jacket);
  var jacketTex = null, shadowTex = null;

  // ---- Controls ----
  byId("flip").addEventListener("click", flip);
  byId("shot").addEventListener("click", capture);
  byId("retake").addEventListener("click", retake);
  byId("start-btn").addEventListener("click", function () { hide(startScreen); openCamera(); });
  byId("retry-btn").addEventListener("click", function () { hide(errorScreen); openCamera(); });
  window.addEventListener("resize", function () { if (!tracking) applyFixed(); });

  // Test hook: /?mocktrack lets a harness drive tracking with fake landmarks.
  if (location.search.indexOf("mocktrack") >= 0) {
    tracking = true;
    window.__ootd = { feed: function (lm) { updateFromPose(lm); place(); }, capture: capture, state: function () { return { visible: visible, quad: quad }; } };
  }

  // ---- Boot ----
  initPose();
  openCamera();

  // ---- Pose model ----
  function initPose() {
    import(TASKS_URL).then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(WASM_URL).then(function (resolver) {
        return make(vision, resolver, "GPU").catch(function () { return make(vision, resolver, "CPU"); });
      });
    }).then(function (lm) {
      landmarker = lm; tracking = true;
    }).catch(function () {
      tracking = false; applyFixed();
    });
  }
  function make(vision, resolver, delegate) {
    return vision.PoseLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
      runningMode: "VIDEO", numPoses: 1
    });
  }

  // ---- Camera ----
  function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return fail("This browser can't open the camera. Try Safari or Chrome on a phone.");
    }
    stopTracks();
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } })
      .then(function (s) {
        stream = s;
        cam.srcObject = s;
        cam.classList.toggle("mirror", facing === "user");
        var p = cam.play(); if (p && p.catch) p.catch(function () {});
        running = true;
        if (!tracking) applyFixed();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      })
      .catch(function (err) {
        var n = err && err.name;
        if (n === "NotAllowedError" || n === "SecurityError") show(startScreen);
        else if (n === "NotFoundError" || n === "OverconstrainedError") fail("No camera found on this device.");
        else fail("Couldn't open the camera. Make sure no other app is using it, then try again.");
      });
  }

  function flip() {
    facing = facing === "user" ? "environment" : "user";
    visible = false;
    openCamera();
  }

  // ---- Frame loop ----
  function loop() {
    if (!running) return;
    if (tracking && landmarker && cam.videoWidth) {
      var ts = performance.now();
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;
      try {
        var res = landmarker.detectForVideo(cam, ts);
        if (res && res.landmarks && res.landmarks[0]) updateFromPose(res.landmarks[0]);
        else markLost();
      } catch (e) { /* skip frame */ }
    }
    place();
    raf = requestAnimationFrame(loop);
  }

  function updateFromPose(lm) {
    var LS = lm[11], RS = lm[12], LH = lm[23], RH = lm[24];
    if (!LS || !RS) return markLost();
    if (vis(LS) < 0.5 || vis(RS) < 0.5) return markLost();

    var ls = toDisplay(LS), rs = toDisplay(RS);
    var span = dist(ls, rs);
    if (!span) return markLost();

    // Down axis: use hips if we can see them, else drop straight below shoulders.
    var lh, rh;
    if (LH && RH && vis(LH) > 0.4 && vis(RH) > 0.4) {
      lh = toDisplay(LH); rh = toDisplay(RH);
    } else {
      var ex = { x: (rs.x - ls.x) / span, y: (rs.y - ls.y) / span };
      var down = { x: -ex.y, y: ex.x };
      if (down.y < 0) { down.x = -down.x; down.y = -down.y; }
      var t = span * 1.6;
      lh = { x: ls.x + down.x * t, y: ls.y + down.y * t };
      rh = { x: rs.x + down.x * t, y: rs.y + down.y * t };
    }
    setTarget(fitQuad(ls, rs, lh, rh));
    lostFrames = 0;
    hint.style.display = "none";
  }

  // Expand shoulder/hip landmarks outward to where the jacket's seams sit.
  function fitQuad(ls, rs, lh, rh) {
    var span = dist(ls, rs);
    var ex = { x: (rs.x - ls.x) / span, y: (rs.y - ls.y) / span };
    var mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    var hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    var ey = { x: hipMid.x - mid.x, y: hipMid.y - mid.y };
    var tl = Math.hypot(ey.x, ey.y) || 1; ey.x /= tl; ey.y /= tl;
    var oS = span * 0.16, up = span * 0.10, oH = span * 0.06;
    return [
      { x: ls.x - ex.x * oS - ey.x * up, y: ls.y - ex.y * oS - ey.y * up },
      { x: rs.x + ex.x * oS - ey.x * up, y: rs.y + ex.y * oS - ey.y * up },
      { x: rh.x + ex.x * oH, y: rh.y + ex.y * oH },
      { x: lh.x - ex.x * oH, y: lh.y - ex.y * oH }
    ];
  }

  function markLost() { if (++lostFrames > 18) visible = false; }

  function setTarget(t) {
    if (!quad || !visible) { quad = t.map(function (p) { return { x: p.x, y: p.y }; }); }
    else for (var i = 0; i < 4; i++) {
      quad[i].x = lerp(quad[i].x, t[i].x, SMOOTH);
      quad[i].y = lerp(quad[i].y, t[i].y, SMOOTH);
    }
    visible = true;
  }

  // Fixed front-on fit (no tracking / model unavailable).
  function applyFixed() {
    var cw = cam.clientWidth || window.innerWidth;
    var ch = cam.clientHeight || window.innerHeight;
    var sw = Math.min(cw * 0.22, 150);
    var hw = sw * 0.95, ty = ch * 0.26, by = ch * 0.72, cx = cw / 2;
    quad = [ { x: cx - sw, y: ty }, { x: cx + sw, y: ty }, { x: cx + hw, y: by }, { x: cx - hw, y: by } ];
    visible = true;
    place();
  }

  // ---- Placement (perspective) ----
  function place() {
    var on = visible && quad;
    overlay.style.opacity = on ? 0.97 : 0;
    shadow.style.opacity = on ? 0.4 : 0;
    if (!on) return;
    var H = homography(SRC, quad);
    if (!H) return;
    var m = matrix3d(H);
    overlay.style.transform = m;
    shadow.style.transform = m;
  }

  // Map a normalized landmark to on-screen pixels (object-fit: cover + mirror).
  function toDisplay(pt) {
    var cw = cam.clientWidth, ch = cam.clientHeight, vw = cam.videoWidth, vh = cam.videoHeight;
    var scale = Math.max(cw / vw, ch / vh);
    var dx = (pt.x * vw - (vw - cw / scale) / 2) * scale;
    var dy = (pt.y * vh - (vh - ch / scale) / 2) * scale;
    if (facing === "user") dx = cw - dx;
    return { x: dx, y: dy };
  }

  // ---- Capture (replicate the perspective with a triangle mesh) ----
  function capture() {
    if (!stream || !cam.videoWidth) return;
    running = false; cancelAnimationFrame(raf);

    var cw = cam.clientWidth, ch = cam.clientHeight, vw = cam.videoWidth, vh = cam.videoHeight;
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext("2d");

    var scale = Math.max(cw / vw, ch / vh);
    var visW = cw / scale, visH = ch / scale;
    var sx = (vw - visW) / 2, sy = (vh - visH) / 2;

    if (facing === "user") { ctx.translate(cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(cam, sx, sy, visW, visH, 0, 0, cw, ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (visible && quad) {
      buildTextures();
      var H = homography(SRC, quad);
      if (H) {
        try {
          ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.4;
          warp(ctx, shadowTex, H);
          ctx.restore();
          ctx.save(); ctx.globalAlpha = 0.97;
          warp(ctx, jacketTex, H);
          ctx.restore();
        } catch (e) { /* keep the plain photo if compositing fails */ }
      }
    }

    var url = canvas.toDataURL("image/jpeg", 0.92);
    photo.src = url; saveLink.href = url;
    show(resultScreen);
    stopTracks();
  }

  function buildTextures() {
    if (jacketTex || !jacketImg.complete || !jacketImg.naturalWidth) {
      if (!jacketTex && jacketImg.complete && !jacketImg.naturalWidth) rasterFallback();
      if (jacketTex) return;
    }
    var w = 640, h = 680;
    jacketTex = raster(w, h, function (c) { c.drawImage(jacketImg, 0, 0, w, h); });
    shadowTex = raster(w, h, function (c) {
      c.filter = "blur(10px)";
      c.drawImage(jacketImg, 0, 0, w, h);
      c.filter = "none";
      c.globalCompositeOperation = "source-in";
      c.fillStyle = "#000";
      c.fillRect(0, 0, w, h);
    });
  }
  function rasterFallback() { /* SVG failed to decode; leave textures null */ }
  function raster(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d"); draw(g); return c;
  }

  // Draw a texture through homography H by subdividing into a triangle mesh.
  function warp(ctx, tex, H) {
    var N = 10, tw = tex.width / ART_W, th = tex.height / ART_H;
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var ax0 = i / N * ART_W, ax1 = (i + 1) / N * ART_W;
        var ay0 = j / N * ART_H, ay1 = (j + 1) / N * ART_H;
        var A = { x: ax0, y: ay0 }, B = { x: ax1, y: ay0 }, C = { x: ax1, y: ay1 }, D = { x: ax0, y: ay1 };
        var sA = { x: ax0 * tw, y: ay0 * th }, sB = { x: ax1 * tw, y: ay0 * th };
        var sC = { x: ax1 * tw, y: ay1 * th }, sD = { x: ax0 * tw, y: ay1 * th };
        tri(ctx, tex, sA, sB, sC, applyH(H, A), applyH(H, B), applyH(H, C));
        tri(ctx, tex, sA, sC, sD, applyH(H, A), applyH(H, C), applyH(H, D));
      }
    }
  }
  function tri(ctx, tex, s0, s1, s2, d0, d1, d2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.closePath();
    ctx.clip();
    // Affine mapping from source triangle to destination triangle.
    var denom = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y;
    if (denom === 0) { ctx.restore(); return; }
    var a = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / denom;
    var b = (s1.y * d2.y + s0.y * (d1.y - d2.y) - s2.y * d1.y + (s2.y - s1.y) * d0.y) / denom;
    var c = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / denom;
    var d = -(s1.x * d2.y + s0.x * (d1.y - d2.y) - s2.x * d1.y + (s2.x - s1.x) * d0.y) / denom;
    var e = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / denom;
    var f = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / denom;
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(tex, 0, 0);
    ctx.restore();
  }

  // ---- Homography (maps src[4] -> dst[4]); returns h0..h7 (h8 = 1) ----
  function homography(src, dst) {
    var A = [], y = [];
    for (var i = 0; i < 4; i++) {
      var s = src[i], d = dst[i];
      A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]); y.push(d.x);
      A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]); y.push(d.y);
    }
    return solve(A, y, 8);
  }
  function solve(A, y, n) {
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-9) return null;
      var tA = A[col]; A[col] = A[piv]; A[piv] = tA;
      var ty = y[col]; y[col] = y[piv]; y[piv] = ty;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = A[r2][col] / A[col][col];
        for (var c2 = col; c2 < n; c2++) A[r2][c2] -= f * A[col][c2];
        y[r2] -= f * y[col];
      }
    }
    var h = [];
    for (var k = 0; k < n; k++) h[k] = y[k] / A[k][k];
    return h;
  }
  function applyH(h, p) {
    var w = h[6] * p.x + h[7] * p.y + 1;
    return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
  }
  function matrix3d(h) {
    return "matrix3d(" + [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1].join(",") + ")";
  }

  function retake() {
    hide(resultScreen); photo.removeAttribute("src"); visible = false; openCamera();
  }

  // ---- Helpers ----
  function fail(m) { running = false; errorMsg.textContent = m; show(errorScreen); }
  function stopTracks() {
    running = false; cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    cam.srcObject = null;
  }
  function svgToUri(el) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el)); }
  function vis(p) { return p.visibility === undefined ? 1 : p.visibility; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function byId(id) { return document.getElementById(id); }
})();
