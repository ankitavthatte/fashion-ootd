/* Try On — open the camera and wear the jacket.
 * The jacket tracks your shoulders in real time (MediaPipe Pose Landmarker),
 * scaling, following and rotating as you move. If the model can't load it
 * falls back to a fixed centered overlay so the app always works.
 * Vanilla JS, no build step. */
(function () {
  "use strict";

  // MediaPipe Tasks Vision (loaded lazily from CDN in the browser).
  var TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20";
  var WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
  var MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  // Jacket art geometry (matches the SVG viewBox 320 x 340).
  var ASPECT = 340 / 320;
  var ANCHOR_Y = 0.25;       // vertical spot in the art that sits on the shoulder line
  var SPAN_TO_WIDTH = 3.2;   // jacket width relative to shoulder span
  var SMOOTH = 0.4;          // 0..1, higher = snappier / more jitter

  var cam = byId("cam");
  var overlay = byId("overlay");
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
  var facing = "user"; // "user" = front (selfie), "environment" = back
  var landmarker = null;
  var tracking = false;   // pose model is available
  var running = false;    // camera loop is active
  var raf = 0;
  var lastTs = 0;
  var lostFrames = 0;
  var state = { x: 0, y: 0, w: 0, h: 0, angle: 0, visible: false };
  var jacketImg = new Image();

  // Preload the jacket art as an image for compositing into captures.
  jacketImg.src = "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(jacket));

  // ---- Controls ----
  byId("flip").addEventListener("click", flip);
  byId("shot").addEventListener("click", capture);
  byId("retake").addEventListener("click", retake);
  byId("start-btn").addEventListener("click", function () { hide(startScreen); openCamera(); });
  byId("retry-btn").addEventListener("click", function () { hide(errorScreen); openCamera(); });
  window.addEventListener("resize", function () { if (!tracking) applyFixed(); });

  // ---- Boot ----
  initPose();     // load the tracker in the background (non-blocking)
  openCamera();   // open the camera right away

  // ---- Pose model ----
  function initPose() {
    import(TASKS_URL).then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(WASM_URL).then(function (resolver) {
        return createLandmarker(vision, resolver, "GPU").catch(function () {
          return createLandmarker(vision, resolver, "CPU");
        });
      });
    }).then(function (lm) {
      landmarker = lm;
      tracking = true;
    }).catch(function () {
      // Offline or blocked — keep the fixed overlay fallback.
      tracking = false;
      applyFixed();
    });
  }

  function createLandmarker(vision, resolver, delegate) {
    return vision.PoseLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: delegate },
      runningMode: "VIDEO",
      numPoses: 1
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
        var p = cam.play();
        if (p && p.catch) p.catch(function () {});
        running = true;
        if (!tracking) applyFixed();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      })
      .catch(function (err) {
        var name = err && err.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          show(startScreen);
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          fail("No camera found on this device.");
        } else {
          fail("Couldn't open the camera. Make sure no other app is using it, then try again.");
        }
      });
  }

  function flip() {
    facing = facing === "user" ? "environment" : "user";
    state.visible = false; // reset so the jacket snaps to the new view
    openCamera();
  }

  // ---- Frame loop ----
  function loop() {
    if (running) {
      if (tracking && landmarker && cam.videoWidth) {
        var ts = performance.now();
        if (ts <= lastTs) ts = lastTs + 1;
        lastTs = ts;
        try {
          var res = landmarker.detectForVideo(cam, ts);
          if (res && res.landmarks && res.landmarks[0]) updateFromPose(res.landmarks[0]);
          else markLost();
        } catch (e) { /* transient — skip this frame */ }
      }
      place();
      raf = requestAnimationFrame(loop);
    }
  }

  function updateFromPose(lm) {
    var L = lm[11], R = lm[12]; // shoulders
    if (!L || !R) return markLost();
    if ((L.visibility !== undefined && L.visibility < 0.5) ||
        (R.visibility !== undefined && R.visibility < 0.5)) return markLost();

    var a = toDisplay(L), b = toDisplay(R);
    var midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y;
    var span = Math.hypot(dx, dy);
    if (!span) return markLost();

    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;

    var w = span * SPAN_TO_WIDTH;
    setTarget(midx, midy, w, w * ASPECT, ang);
    lostFrames = 0;
    hint.style.display = "none";
  }

  function markLost() {
    if (++lostFrames > 18) state.visible = false;
  }

  function setTarget(x, y, w, h, angle) {
    if (!state.visible) {
      state.x = x; state.y = y; state.w = w; state.h = h; state.angle = angle;
    } else {
      state.x = lerp(state.x, x, SMOOTH);
      state.y = lerp(state.y, y, SMOOTH);
      state.w = lerp(state.w, w, SMOOTH);
      state.h = lerp(state.h, h, SMOOTH);
      state.angle = lerp(state.angle, angle, SMOOTH);
    }
    state.visible = true;
  }

  // Fixed centered overlay when tracking isn't available.
  function applyFixed() {
    var cw = cam.clientWidth || window.innerWidth;
    var ch = cam.clientHeight || window.innerHeight;
    var w = Math.min(cw * 0.88, 460);
    var h = w * ASPECT;
    state = { x: cw / 2, y: ch * 0.14 + ANCHOR_Y * h, w: w, h: h, angle: 0, visible: true };
    place();
  }

  // Map a normalized landmark to on-screen pixels (object-fit: cover + mirror).
  function toDisplay(pt) {
    var cw = cam.clientWidth, ch = cam.clientHeight;
    var vw = cam.videoWidth, vh = cam.videoHeight;
    var scale = Math.max(cw / vw, ch / vh);
    var sx = (vw - cw / scale) / 2;
    var sy = (vh - ch / scale) / 2;
    var dx = (pt.x * vw - sx) * scale;
    var dy = (pt.y * vh - sy) * scale;
    if (facing === "user") dx = cw - dx; // mirror to match the flipped preview
    return { x: dx, y: dy };
  }

  function place() {
    overlay.style.opacity = state.visible ? 0.96 : 0;
    if (!state.visible) return;
    overlay.style.width = state.w + "px";
    overlay.style.left = state.x + "px";
    overlay.style.top = state.y + "px";
    overlay.style.transformOrigin = "50% " + (ANCHOR_Y * 100) + "%";
    overlay.style.transform =
      "translate(-50%, -" + (ANCHOR_Y * 100) + "%) rotate(" + state.angle + "deg)";
  }

  // ---- Capture ----
  function capture() {
    if (!stream || !cam.videoWidth) return;
    running = false;
    cancelAnimationFrame(raf);

    var cw = cam.clientWidth, ch = cam.clientHeight;
    var vw = cam.videoWidth, vh = cam.videoHeight;
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext("2d");

    var scale = Math.max(cw / vw, ch / vh);
    var visW = cw / scale, visH = ch / scale;
    var sx = (vw - visW) / 2, sy = (vh - visH) / 2;

    if (facing === "user") { ctx.translate(cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(cam, sx, sy, visW, visH, 0, 0, cw, ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (state.visible && jacketImg.complete) {
      var h = state.w * ASPECT;
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.angle * Math.PI / 180);
      ctx.globalAlpha = 0.96;
      ctx.drawImage(jacketImg, -state.w / 2, -ANCHOR_Y * h, state.w, h);
      ctx.restore();
    }

    var url = canvas.toDataURL("image/jpeg", 0.92);
    photo.src = url;
    saveLink.href = url;
    show(resultScreen);
    stopTracks();
  }

  function retake() {
    hide(resultScreen);
    photo.removeAttribute("src");
    state.visible = false;
    openCamera();
  }

  // ---- Helpers ----
  function fail(msg) { running = false; errorMsg.textContent = msg; show(errorScreen); }
  function stopTracks() {
    running = false;
    cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    cam.srcObject = null;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function byId(id) { return document.getElementById(id); }
})();
