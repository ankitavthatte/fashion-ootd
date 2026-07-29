/* Try On — open the camera and wear the jacket. As simple as that.
 * Vanilla JS, no dependencies, no build step. */
(function () {
  "use strict";

  var cam = byId("cam");
  var overlay = byId("overlay");
  var jacket = byId("jacket");
  var canvas = byId("canvas");
  var startScreen = byId("start");
  var errorScreen = byId("error");
  var errorMsg = byId("error-msg");
  var resultScreen = byId("result");
  var photo = byId("photo");
  var saveLink = byId("save");

  var stream = null;
  var facing = "user"; // "user" = front (selfie, default for trying it on), "environment" = back

  // ---- Wire up controls ----
  byId("flip").addEventListener("click", flip);
  byId("shot").addEventListener("click", capture);
  byId("retake").addEventListener("click", retake);
  byId("start-btn").addEventListener("click", function () { hide(startScreen); openCamera(); });
  byId("retry-btn").addEventListener("click", function () { hide(errorScreen); openCamera(); });

  // ---- Open the camera immediately ----
  openCamera();

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
      })
      .catch(function (err) {
        var name = err && err.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          // Often needs a tap first (or permission was blocked).
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
    openCamera();
  }

  function capture() {
    if (!stream || !cam.videoWidth) return;

    var cw = cam.clientWidth, ch = cam.clientHeight;
    var vw = cam.videoWidth, vh = cam.videoHeight;
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext("2d");

    // Replicate object-fit: cover cropping from the source video.
    var scale = Math.max(cw / vw, ch / vh);
    var visW = cw / scale, visH = ch / scale;
    var sx = (vw - visW) / 2, sy = (vh - visH) / 2;

    if (facing === "user") {
      // Mirror the front camera so the photo matches the preview.
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(cam, sx, sy, visW, visH, 0, 0, cw, ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    drawJacket(ctx, function () {
      var url = canvas.toDataURL("image/jpeg", 0.92);
      photo.src = url;
      saveLink.href = url;
      show(resultScreen);
      stopTracks();
    });
  }

  // Composite the jacket overlay at exactly the spot it appears on screen.
  function drawJacket(ctx, done) {
    var appRect = byId("app").getBoundingClientRect();
    var r = jacket.getBoundingClientRect();
    var svg = new XMLSerializer().serializeToString(jacket);
    var img = new Image();
    img.onload = function () {
      ctx.globalAlpha = 0.94;
      ctx.drawImage(img, r.left - appRect.left, r.top - appRect.top, r.width, r.height);
      ctx.globalAlpha = 1;
      done();
    };
    img.onerror = function () { done(); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function retake() {
    hide(resultScreen);
    photo.removeAttribute("src");
    openCamera();
  }

  // ---- Helpers ----
  function fail(msg) { errorMsg.textContent = msg; show(errorScreen); }
  function stopTracks() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    cam.srcObject = null;
  }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function byId(id) { return document.getElementById(id); }
})();
