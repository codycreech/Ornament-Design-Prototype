// sphereSketch.js — sphere preview (NOT paintable). Shows painted nodes from grid.
// Perf notes:
//  - Node world positions never change (only camera rotation does), so they are
//    computed ONCE in setup() and cached, instead of recomputing sin/cos for
//    ~2650 nodes on every single draw() call (was the single biggest CPU cost).
//  - Sphere polygon detail + target frame rate scale down automatically on
//    phones/tablets (see Shared.getQualitySettings), since immediate-mode
//    p.sphere() calls are expensive per-draw-call on mobile GPUs.
//  - Hover/pick math is skipped on frames where the pointer hasn't moved.

new p5((p) => {
  const S = window.Shared;
  const H = window.SharedHelpers;

  const R = 180;
  const ROT_STEP = 0.05;
  let rotX = 0;
  let rotY = 0;


  let mount = null;

  // Cached, precomputed once in setup() (or when quality settings change)
  let nodeCache = [];      // [{ id, x, y, z, defaultHex, isAnchor }]
  let quality = null;

  let meshes = [];
  let meshRevision = -1;
  let lastFrameKey = "";
  let canvasElement;

  p.setup = () => {
    quality = H.getQualitySettings();

    const c = p.createCanvas(10, 10, p.WEBGL);
    mount = p.select("#sphereMount");
    canvasElement = c.elt;
    canvasElement.tabIndex = 0;
    canvasElement.setAttribute("aria-label", "Ornament preview. Drag to rotate, scroll to zoom, or focus and use arrow keys.");
    canvasElement.addEventListener("pointerdown", () => canvasElement.focus({preventScroll: true}));
    canvasElement.addEventListener("keydown", e => { if (e.key.startsWith("Arrow")) e.preventDefault(); });

    resizeToMount();
    c.parent("sphereMount");
    p.pixelDensity(1);
    p.frameRate(quality.fps);

    function resizeToMount(){
      if (!mount) return;
      const el = mount && mount.elt ? mount.elt : null;
      let w = 650, h = 650;
      if (el){
        const r = el.getBoundingClientRect();
        w = Math.max(80, Math.floor(r.width || 0));
        h = Math.max(80, Math.floor(r.height || 0));
      }
      // If the mount has no height (e.g., auto), keep it square
      if (el){
        const r = el.getBoundingClientRect();
        if (!r.height || r.height < 50) h = w;
      }
      p.resizeCanvas(w, h);
    }

    if (mount) mount.style("position", "relative");

    c.elt.addEventListener("contextmenu", (e) => e.preventDefault());
    c.elt.style.touchAction = "none";

    buildNodeCache();

    new ResizeObserver(resizeToMount).observe(mount.elt);
  };

  function posOnSphere(lat, lon) {
    const y = R * p.sin(lat);
    const rr = R * p.cos(lat);
    return { x: rr * p.cos(lon), y: y, z: rr * p.sin(lon) };
  }

  function lerpOnSphereObj(a, b, t) {
    const va = p.createVector(a.x, a.y, a.z);
    const vb = p.createVector(b.x, b.y, b.z);
    const v = p5.Vector.lerp(va, vb, t);
    v.normalize().mult(R);
    return { x: v.x, y: v.y, z: v.z };
  }

  function defaultSubColor(k) {
    return (k % 2 === 0) ? "#e6e6e6" : "#ffffff";
  }

  // Computes every node's static world position + default color ONE TIME.
  // This replaces per-frame trig that previously ran for every node on every draw.
  function buildNodeCache() {
    nodeCache = [];

    const LAT_PAD = 0.15;
    const rows = [];
    for (let rIdx = 1; rIdx <= S.NUM_LATITUDE; rIdx++) {
      const lat = p.map(
        rIdx,
        0,
        S.NUM_LATITUDE + 1,
        -p.HALF_PI + LAT_PAD,
        p.HALF_PI - LAT_PAD
      );
      const phase = (rIdx % 2 === 0) ? 0.0 : 0.5;

      const pts = [];
      for (let i = 0; i < S.GRID_COUNT; i++) {
        const lon = p.TWO_PI * (i + phase) / S.GRID_COUNT;
        pts.push(posOnSphere(lat, lon));
      }
      rows.push({ phase, pts });
    }

    // Anchors: stable ids 0..255
    let anchorId = 0;
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < S.GRID_COUNT; i++) {
        const nodeId = anchorId++;
        if (!S.sphereNodeToCellId[String(nodeId)]) continue; // skip unmapped
        const v = rows[r].pts[i];
        nodeCache.push({ id: nodeId, x: v.x, y: v.y, z: v.z, defaultHex: "#ffffff", radius: 3.2 });
      }
    }

    // Subcells: stable ids 256+
    let subId = S.GRID_COUNT * S.NUM_LATITUDE; // 256
    for (let r = 0; r < rows.length - 1; r++) {
      const upper = rows[r];
      const lower = rows[r + 1];

      if (upper.phase === 0.0 && lower.phase === 0.5) {
        for (let idx = 0; idx < S.GRID_COUNT; idx++) {
          const apex = upper.pts[(idx + 1) % S.GRID_COUNT];
          const left = lower.pts[idx];
          const right = lower.pts[(idx + 1) % S.GRID_COUNT];
          for (let k = 1; k <= S.SUBCELLS_PER_LEG; k++) cacheSub(subId++, lerpOnSphereObj(apex, left, k / (S.SUBCELLS_PER_LEG + 1)), defaultSubColor(k));
          for (let k = 1; k <= S.SUBCELLS_PER_LEG; k++) cacheSub(subId++, lerpOnSphereObj(apex, right, k / (S.SUBCELLS_PER_LEG + 1)), defaultSubColor(k));
        }
      } else {
        for (let idx = 0; idx < S.GRID_COUNT; idx++) {
          const apex = upper.pts[idx];
          const left = lower.pts[idx];
          const right = lower.pts[(idx + 1) % S.GRID_COUNT];
          for (let k = 1; k <= S.SUBCELLS_PER_LEG; k++) cacheSub(subId++, lerpOnSphereObj(apex, left, k / (S.SUBCELLS_PER_LEG + 1)), defaultSubColor(k));
          for (let k = 1; k <= S.SUBCELLS_PER_LEG; k++) cacheSub(subId++, lerpOnSphereObj(apex, right, k / (S.SUBCELLS_PER_LEG + 1)), defaultSubColor(k));
        }
      }
    }

    function cacheSub(nodeId, v, defaultHex) {
      if (!S.sphereNodeToCellId[String(nodeId)]) return; // skip unmapped
      nodeCache.push({ id: nodeId, x: v.x, y: v.y, z: v.z, defaultHex, radius: 2.1 });
    }
  }

  // Combine the stationary beads into one mesh per color. Camera movement
  // then needs only a handful of draw calls rather than one per bead.
  function rebuildMeshes() {
    for (const mesh of meshes) p.freeGeometry(mesh.geometry);
    const groups = new Map();
    for (const node of nodeCache) {
      const color = S.nodePaint[node.id] || node.defaultHex;
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color).push(node);
    }
    meshes = [];
    for (const [color, nodes] of groups) {
      const geometry = p.buildGeometry(() => {
        for (const n of nodes) {
          p.push(); p.translate(n.x, n.y, n.z);
          p.sphere(n.radius, quality.nodeU, quality.nodeV); p.pop();
        }
      });
      meshes.push({color, geometry});
    }
    meshRevision = S.revision;
  }

  p.draw = () => {
    if (document.hidden) return;
    const nextQuality = H.getQualitySettings();
    if (!quality || quality.nodeU !== nextQuality.nodeU) {
      quality = nextQuality; p.frameRate(quality.fps); meshRevision = -1;
    }
    p.orbitControl(1, 1, 0.25);
    if (document.activeElement === canvasElement) {
      const step = ROT_STEP * Math.min(p.deltaTime, 50) / (1000 / 60);
      if (p.keyIsDown(p.LEFT_ARROW) || p.keyIsDown(65)) rotY += step;
      if (p.keyIsDown(p.RIGHT_ARROW) || p.keyIsDown(68)) rotY -= step;
      if (p.keyIsDown(p.UP_ARROW) || p.keyIsDown(87)) rotX += step;
      if (p.keyIsDown(p.DOWN_ARROW) || p.keyIsDown(83)) rotX -= step;
    }
    const camera = p._renderer._curCamera.cameraMatrix.mat4;
    const key = [S.revision, rotX, rotY, p.width, p.height, S.hoverGrid?.nodeId, ...camera].join(',');
    if (key === lastFrameKey) return;
    lastFrameKey = key;
    if (meshRevision !== S.revision) rebuildMeshes();
    p.background(15);
    // Fit the complete ornament even in the small phone preview.
    p.scale(Math.min(p.width, p.height) / 440);
    p.rotateX(rotX); p.rotateY(rotY); p.rotateY(-p.HALF_PI);
    p.ambientLight(90);
    p.directionalLight(255, 255, 255, 0.3, 0.6, -1);
    p.noStroke(); p.ambientMaterial(p.color(S.sphereBaseColor));
    p.sphere(R, quality.mainU, quality.mainV);
    for (const mesh of meshes) { p.ambientMaterial(p.color(mesh.color)); p.model(mesh.geometry); }
    const hovered = nodeCache.find(n => n.id === S.hoverGrid?.nodeId);
    S.hoverSphere = null;
    if (hovered) {
      p.push(); p.translate(hovered.x, hovered.y, hovered.z);
      p.noFill(); p.stroke(255); p.strokeWeight(1);
      p.sphere(hovered.radius * 1.9, 10, 8); p.pop();
    }
  };
  // Sphere is preview-only; painting is disabled here.

});
