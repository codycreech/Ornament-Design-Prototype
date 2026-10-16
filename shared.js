// shared.js — global shared state for all sketches

window.Shared = {
  revision: 0,
  // Sphere lattice constants (your finalized model)
  GRID_COUNT: 16,
  NUM_LATITUDE: 16,
  SUBCELLS_PER_LEG: 5,

  // Mapping (filled by mappingData.js)
  cellIdToSphereNode: Object.create(null), // cellId -> nodeId
  sphereNodeToCellId: Object.create(null), // nodeId -> cellId

  // Paint state (authoritative is nodePaint)
  selectedColor: "#00aaff",
  defaults: {
    anchors: "#dc2828",
    subOdd:  "#50dc78",
    subEven: "#e6c83c",
    sphere:  "#1c1c1c"
  },
  sphereBaseColor: "#1c1c1c",

  // Paint profiles (saved bead paint states)
  profiles: [],
  activeProfileName: "",

  nodePaint: Object.create(null), // nodeId -> css color
  cellPaint: Object.create(null), // cellId -> css color (cached for grid draw)

  // UI toggles
  paintEnabled: true,
  touchErase: false, // mobile: when true, touch paints as erase

  // Brush: how many cells wide a single paint stroke covers (1 = single cell)
  brushSize: 1,

  // Performance: 'auto' picks based on device, or force 'low' | 'medium' | 'high'
  performanceMode: "auto",

  // Live hover info
  hoverGrid: null,   // { cellId, nodeId }
  hoverSphere: null  // { nodeId }
};

// Helpers shared across sketches
window.SharedHelpers = {
  // All edits go through one validated model so grid, preview and history agree.
  isColor(value) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); },

  notifyChange() {
    window.Shared.revision++;
    if (this.changePending) return;
    this.changePending = true;
    requestAnimationFrame(() => {
      this.changePending = false;
      window.dispatchEvent(new Event("ornament:change"));
    });
  },

  setPaintByCellId(cellId, colorOrNull) {
    const nodeId = window.Shared.cellIdToSphereNode[String(cellId)];
    if (nodeId !== undefined) this.setPaintByNodeId(nodeId, colorOrNull);
  },

  setPaintByNodeId(nodeId, colorOrNull) {
    const S = window.Shared;
    const nk = String(nodeId);
    const cellId = S.sphereNodeToCellId[nk];
    if (cellId === undefined || (colorOrNull != null && !this.isColor(colorOrNull))) return;
    const color = colorOrNull == null ? undefined : colorOrNull.toLowerCase();
    if (S.nodePaint[nk] === color) return;
    if (color === undefined) { delete S.nodePaint[nk]; delete S.cellPaint[cellId]; }
    else { S.nodePaint[nk] = color; S.cellPaint[cellId] = color; }
    this.notifyChange();
  },

  buildPaintProfile(name) {
    const S = window.Shared;
    return { version: 1, name: String(name || "").trim(), createdAt: new Date().toISOString(),
      sphereBaseColor: S.sphereBaseColor, nodePaint: { ...S.nodePaint } };
  },

  normalizeProfile(profile) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile) ||
        (profile.version !== undefined && profile.version !== 1) ||
        !profile.nodePaint || typeof profile.nodePaint !== "object" || Array.isArray(profile.nodePaint)) {
      throw new Error("Choose an Ornament profile JSON file (version 1).");
    }
    const nodePaint = Object.create(null);
    for (const [id, color] of Object.entries(profile.nodePaint)) {
      if (!Object.hasOwn(window.Shared.sphereNodeToCellId, id) || !this.isColor(color)) {
        throw new Error("The profile contains an unknown bead or invalid color.");
      }
      nodePaint[id] = color.toLowerCase();
    }
    const base = profile.sphereBaseColor || window.Shared.defaults.sphere;
    if (!this.isColor(base)) throw new Error("The sphere color is invalid.");
    return { version: 1, name: typeof profile.name === "string" ? profile.name.trim().slice(0, 100) : "",
      createdAt: typeof profile.createdAt === "string" ? profile.createdAt : new Date().toISOString(),
      sphereBaseColor: base.toLowerCase(), nodePaint };
  },

  applyPaintProfile(profile) {
    const valid = this.normalizeProfile(profile); // Validate BEFORE changing anything.
    const S = window.Shared;
    S.nodePaint = Object.assign(Object.create(null), valid.nodePaint);
    S.cellPaint = Object.create(null);
    for (const [id, color] of Object.entries(valid.nodePaint)) S.cellPaint[S.sphereNodeToCellId[id]] = color;
    S.sphereBaseColor = valid.sphereBaseColor;
    this.notifyChange();
  },

  history: [], redoHistory: [], pendingEdit: null,
  beginEdit() { if (!this.pendingEdit) this.pendingEdit = this.buildPaintProfile(""); },
  endEdit() {
    if (!this.pendingEdit) return;
    const before = this.pendingEdit;
    this.pendingEdit = null;
    const after = this.buildPaintProfile("");
    if (before.sphereBaseColor === after.sphereBaseColor && JSON.stringify(before.nodePaint) === JSON.stringify(after.nodePaint)) return;
    this.history.push(before);
    if (this.history.length > 50) this.history.shift();
    this.redoHistory = [];
    this.notifyChange();
  },
  undo() {
    this.endEdit();
    if (!this.history.length) return;
    this.redoHistory.push(this.buildPaintProfile(""));
    this.applyPaintProfile(this.history.pop());
  },
  redo() {
    if (!this.redoHistory.length) return;
    this.history.push(this.buildPaintProfile(""));
    this.applyPaintProfile(this.redoHistory.pop());
  },

  // ---- Device / performance detection ----
  // Rough heuristic: phones get the lowest tier, tablets/small laptops medium,
  // everything else (desktop) high. Used to pick sphere polygon detail and
  // frame-rate caps so the app stays smooth on mobile GPUs and battery.
  detectDeviceTier() {
    const shortSide = Math.min(window.innerWidth || 1200, window.innerHeight || 1200);
    const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    if (touch && shortSide < 600) return "phone";
    if (touch && shortSide < 1100) return "tablet";
    return "desktop";
  },

  getPerformanceTier() {
    const S = window.Shared;
    if (S.performanceMode && S.performanceMode !== "auto") return S.performanceMode;
    const tier = window.SharedHelpers.detectDeviceTier();
    if (tier === "phone") return "low";
    if (tier === "tablet") return "medium";
    return "high";
  },

  // Tunables per tier: [sphereMainDetailU, sphereMainDetailV, nodeDetailU, nodeDetailV, targetFrameRate]
  getQualitySettings() {
    const tier = window.SharedHelpers.getPerformanceTier();
    if (tier === "low") return { mainU: 32, mainV: 16, nodeU: 4, nodeV: 3, fps: 30 };
    if (tier === "medium") return { mainU: 44, mainV: 22, nodeU: 5, nodeV: 4, fps: 45 };
    return { mainU: 56, mainV: 28, nodeU: 7, nodeV: 5, fps: 60 };
  }
};
