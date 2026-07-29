/* Fashion OOTD — Outfit of the Day
 * Vanilla JS, persisted to localStorage. No build step, no dependencies. */
(function () {
  "use strict";

  var STORE_KEY = "ootd.looks.v1";
  var THEME_KEY = "ootd.theme";

  var SEED = [
    {
      id: uid(), title: "Cozy autumn layers", cover: "🧥",
      notes: "Oversized camel blazer, cream knit, straight-leg denim, white sneakers.",
      occasion: "Casual", weather: "⛅ Mild", tags: ["neutral", "denim", "layers"],
      likes: 12, liked: false, created: Date.now() - 864e5 * 2
    },
    {
      id: uid(), title: "Monochrome monday", cover: "🖤",
      notes: "All-black tailored set, chunky loafers, silver hoops.",
      occasion: "Work", weather: "☀️ Sunny", tags: ["minimal", "monochrome"],
      likes: 8, liked: false, created: Date.now() - 864e5
    },
    {
      id: uid(), title: "Golden hour date", cover: "👗",
      notes: "Slip dress, cropped leather jacket, strappy heels.",
      occasion: "Date", weather: "☀️ Sunny", tags: ["evening", "romantic"],
      likes: 21, liked: true, created: Date.now() - 3600e3 * 5
    },
    {
      id: uid(), title: "Sunday run club", cover: "👟",
      notes: "Matching seamless set, windbreaker, running shoes.",
      occasion: "Athleisure", weather: "🌧️ Rainy", tags: ["sporty", "comfy"],
      likes: 5, liked: false, created: Date.now() - 3600e3 * 30
    }
  ];

  var OCCASIONS = ["All", "Casual", "Work", "Date", "Party", "Athleisure", "Formal"];

  // ---- State ----
  var looks = load();
  var activeFilter = "All";
  var query = "";

  // ---- Elements ----
  var feed = byId("feed");
  var filtersEl = byId("filters");
  var statsEl = byId("stats");
  var emptyEl = byId("empty");
  var searchEl = byId("search");
  var modal = byId("modal");
  var form = byId("outfit-form");

  // ---- Init ----
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  renderFilters();
  render();

  // ---- Events ----
  byId("open-add").addEventListener("click", openModal);
  byId("close-add").addEventListener("click", closeModal);
  byId("cancel-add").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  byId("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  searchEl.addEventListener("input", function () {
    query = searchEl.value.trim().toLowerCase();
    render();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var look = {
      id: uid(),
      title: (data.get("title") || "").trim() || "Untitled look",
      cover: (data.get("cover") || "").trim() || pickEmoji(),
      notes: (data.get("notes") || "").trim(),
      occasion: data.get("occasion") || "Casual",
      weather: data.get("weather") || "⛅ Mild",
      tags: parseTags(data.get("tags")),
      likes: 0, liked: false, created: Date.now()
    };
    looks.unshift(look);
    save();
    closeModal();
    form.reset();
    activeFilter = "All"; query = ""; searchEl.value = "";
    renderFilters();
    render();
  });

  // ---- Rendering ----
  function renderFilters() {
    filtersEl.innerHTML = "";
    OCCASIONS.forEach(function (name) {
      var b = document.createElement("button");
      b.className = "chip" + (name === activeFilter ? " active" : "");
      b.textContent = name;
      b.type = "button";
      b.addEventListener("click", function () {
        activeFilter = name;
        renderFilters();
        render();
      });
      filtersEl.appendChild(b);
    });
  }

  function render() {
    var list = looks.filter(matches);
    feed.innerHTML = "";
    emptyEl.hidden = list.length !== 0;

    list.forEach(function (look) {
      feed.appendChild(cardFor(look));
    });

    renderStats();
  }

  function renderStats() {
    var totalLikes = looks.reduce(function (s, l) { return s + (l.likes || 0); }, 0);
    statsEl.innerHTML =
      stat(looks.length, looks.length === 1 ? "look" : "looks") +
      stat(totalLikes, "likes") +
      stat(uniqueTags().length, "tags");
  }

  function stat(n, label) {
    return '<span><b>' + n + '</b> ' + label + '</span>';
  }

  function cardFor(look) {
    var card = el("article", "card");
    card.appendChild(coverFor(look));

    var body = el("div", "card-body");

    var h = el("h3", "card-title");
    h.textContent = look.title;
    body.appendChild(h);

    if (look.notes) {
      var p = el("p", "card-notes");
      p.textContent = look.notes;
      body.appendChild(p);
    }

    var meta = el("div", "card-meta");
    meta.appendChild(badge(look.occasion));
    meta.appendChild(badge(look.weather));
    body.appendChild(meta);

    if (look.tags && look.tags.length) {
      var tags = el("div", "card-tags");
      look.tags.forEach(function (t) {
        var s = el("span", "tag");
        s.textContent = "#" + t;
        tags.appendChild(s);
      });
      body.appendChild(tags);
    }

    var foot = el("div", "card-foot");
    var like = el("button", "like-btn" + (look.liked ? " liked" : ""));
    like.type = "button";
    like.innerHTML = (look.liked ? "♥" : "♡") + " " + (look.likes || 0);
    like.addEventListener("click", function () {
      look.liked = !look.liked;
      look.likes = (look.likes || 0) + (look.liked ? 1 : -1);
      if (look.likes < 0) look.likes = 0;
      save();
      render();
    });
    foot.appendChild(like);

    var del = el("button", "del-btn");
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", function () {
      looks = looks.filter(function (l) { return l.id !== look.id; });
      save();
      renderFilters();
      render();
    });
    foot.appendChild(del);

    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }

  function coverFor(look) {
    var cover = el("div", "card-cover");
    if (isUrl(look.cover)) {
      var img = document.createElement("img");
      img.src = look.cover;
      img.alt = look.title;
      img.loading = "lazy";
      img.addEventListener("error", function () {
        cover.textContent = "👗";
      });
      cover.appendChild(img);
    } else {
      cover.textContent = look.cover || "👗";
    }
    return cover;
  }

  // ---- Filtering ----
  function matches(look) {
    if (activeFilter !== "All" && look.occasion !== activeFilter) return false;
    if (!query) return true;
    var hay = [look.title, look.notes, look.occasion, (look.tags || []).join(" ")]
      .join(" ").toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function uniqueTags() {
    var set = {};
    looks.forEach(function (l) { (l.tags || []).forEach(function (t) { set[t] = 1; }); });
    return Object.keys(set);
  }

  // ---- Modal ----
  function openModal() { modal.hidden = false; setTimeout(function () { form.elements.title.focus(); }, 20); }
  function closeModal() { modal.hidden = true; }

  // ---- Theme ----
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    byId("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
  }

  // ---- Persistence ----
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    // First visit: seed and persist.
    try { localStorage.setItem(STORE_KEY, JSON.stringify(SEED)); } catch (e) {}
    return SEED.slice();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(looks)); } catch (e) {}
  }

  // ---- Helpers ----
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function badge(text) { var b = el("span", "badge"); b.textContent = text; return b; }
  function isUrl(s) { return /^https?:\/\//i.test(s || ""); }
  function parseTags(s) {
    return (s || "").split(",").map(function (t) { return t.trim().toLowerCase(); })
      .filter(Boolean).slice(0, 6);
  }
  function pickEmoji() {
    var e = ["👗", "🧥", "👚", "👖", "👔", "🥻", "👠", "🧣", "🕶️"];
    return e[Math.floor(Math.random() * e.length)];
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
})();
