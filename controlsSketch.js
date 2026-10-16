// Accessible DOM controls; canvases are reserved for the grid and 3D preview.
(() => {
  const S = window.Shared, H = window.SharedHelpers;
  const PROFILES = 'ornament_profiles_v1', ACTIVE = 'ornament_active_profile_v1';
  const DRAFT = 'ornament_draft_v1';
  const ui = document.getElementById('controlsUI');
  const title = document.getElementById('controlsMount');
  title.innerHTML = '<h1>Ornament studio</h1><p>Paint a pattern. Preview every bead.</p><p id="designCount"></p>';
  ui.innerHTML = `
    <div class="row"><label for="brushColor">Brush color</label><input id="brushColor" type="color" value="#00aaff"></div>
    <div class="row"><label for="brushSize">Brush size <output id="brushValue">1</output></label><input id="brushSize" type="range" min="1" max="6" value="1"></div>
    <label><input id="paintEnabled" type="checkbox" checked> Painting enabled</label>
    <label><input id="touchErase" type="checkbox"> Touch eraser</label>
    <div class="row"><label for="quality">Performance</label><select id="quality"><option value="auto">Auto</option><option value="low">Battery saver</option><option value="medium">Balanced</option><option value="high">Best quality</option></select></div>
    <div class="row"><label for="sphereColor">Sphere color</label><input id="sphereColor" type="color" value="#1c1c1c"></div>
    <div class="row actions"><button id="undo">Undo</button><button id="redo">Redo</button><button id="clear">Clear paint</button></div>
    <h2>Profiles</h2>
    <label for="profileName">Profile name</label><input id="profileName" type="text" maxlength="100" placeholder="e.g. Snowflake A">
    <label for="profileSelect">Saved profiles</label><select id="profileSelect"></select>
    <div class="row actions"><button id="save">Save</button><button id="load">Load</button><button id="delete">Delete</button></div>
    <div class="row actions"><button id="export">Export JSON</button><button id="import">Import JSON</button></div>
    <input id="importFile" type="file" accept=".json,application/json" hidden>
    <p id="status" class="hint" role="status" aria-live="polite"></p>
    <h2>Output</h2>
    <div class="row actions"><button id="print">Print grid</button><button id="png">Download PNG</button></div>
    <p class="hint">Drag to paint; right-drag to erase. On touch screens, use Touch eraser; turn painting off to scroll the grid. Drag the sphere to rotate; pinch or scroll to zoom. Undo: Ctrl/Cmd+Z.</p>`;
  document.getElementById('previewToggle').onclick = event => {
    const collapsed = document.getElementById('spherePanel').classList.toggle('collapsed');
    event.target.textContent = collapsed ? 'Show' : 'Hide';
    event.target.setAttribute('aria-expanded', String(!collapsed));
  };
  const el = id => document.getElementById(id);
  const status = message => { el('status').textContent = message; };
  function persistProfiles() {
    try {
      const profiles = Object.create(null);
      for (const profile of S.profiles) profiles[profile.name] = profile;
      localStorage.setItem(PROFILES, JSON.stringify(profiles));
      localStorage.setItem(ACTIVE, S.activeProfileName);
      return true;
    } catch { status('Browser storage is unavailable or full. Export JSON to keep a copy.'); return false; }
  }
  function refresh() {
    el('profileSelect').replaceChildren(new Option('Select a profile', ''));
    for (const profile of S.profiles) el('profileSelect').add(new Option(profile.name, profile.name));
    el('profileSelect').value = S.activeProfileName;
    el('profileName').value = S.activeProfileName;
    update();
  }
  function update() {
    el('designCount').textContent = `${Object.keys(S.nodePaint).length} of ${Object.keys(S.sphereNodeToCellId).length} beads painted`;
    el('sphereColor').value = S.sphereBaseColor;
    el('undo').disabled = !H.history.length;
    el('redo').disabled = !H.redoHistory.length;
    const selected = S.profiles.some(p => p.name === el('profileSelect').value);
    el('load').disabled = el('delete').disabled = !selected;
  }
  function upsert(profile) {
    S.profiles = S.profiles.filter(p => p.name !== profile.name);
    S.profiles.push(profile);
    S.profiles.sort((a, b) => a.name.localeCompare(b.name));
    S.activeProfileName = profile.name;
    const saved = persistProfiles();
    refresh();
    return saved;
  }
  el('brushColor').oninput = e => { S.selectedColor = e.target.value; };
  el('brushSize').oninput = e => { S.brushSize = Number(e.target.value); el('brushValue').value = S.brushSize; H.notifyChange(); };
  el('paintEnabled').onchange = e => { S.paintEnabled = e.target.checked; H.notifyChange(); };
  el('touchErase').onchange = e => { S.touchErase = e.target.checked; };
  el('quality').onchange = e => { S.performanceMode = e.target.value; H.notifyChange(); };
  el('sphereColor').oninput = e => { H.beginEdit(); S.sphereBaseColor = e.target.value; H.notifyChange(); };
  el('sphereColor').onchange = () => H.endEdit();
  el('clear').onclick = () => { H.beginEdit(); S.nodePaint = Object.create(null); S.cellPaint = Object.create(null); H.endEdit(); };
  el('undo').onclick = () => H.undo();
  el('redo').onclick = () => H.redo();
  el('profileSelect').onchange = () => { el('profileName').value = el('profileSelect').value; update(); };
  el('save').onclick = () => {
    const name = el('profileName').value.trim();
    if (!name) { status('Enter a profile name first.'); el('profileName').focus(); return; }
    if (upsert(H.buildPaintProfile(name))) status(`Saved: ${name}`);
  };
  el('load').onclick = () => {
    const profile = S.profiles.find(p => p.name === el('profileSelect').value);
    if (!profile) return;
    H.beginEdit(); H.applyPaintProfile(profile); H.endEdit();
    S.activeProfileName = profile.name;
    if (persistProfiles()) status(`Loaded: ${profile.name}`);
    refresh();
  };
  el('delete').onclick = () => {
    const name = el('profileSelect').value;
    S.profiles = S.profiles.filter(p => p.name !== name);
    if (S.activeProfileName === name) S.activeProfileName = '';
    if (persistProfiles()) status(`Deleted profile: ${name}. The current design is still on the canvas.`);
    refresh();
  };
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filename() { return (el('profileName').value.trim() || S.activeProfileName || 'ornament').replace(/[^a-z0-9_-]+/gi, '_'); }
  el('export').onclick = () => download(new Blob([JSON.stringify(H.buildPaintProfile(el('profileName').value || S.activeProfileName), null, 2)], {type: 'application/json'}), filename() + '.json');
  el('import').onclick = () => { el('importFile').value = ''; el('importFile').click(); };
  el('importFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Profile files must be smaller than 2 MB.');
      const profile = H.normalizeProfile(JSON.parse(await file.text()));
      profile.name ||= 'Imported ' + new Date().toISOString().slice(0, 19).replace('T', ' ');
      H.beginEdit(); H.applyPaintProfile(profile); H.endEdit();
      if (upsert(profile)) status(`Imported: ${profile.name}`);
    } catch (error) { status(`Import failed: ${error.message}`); }
  };
  el('print').onclick = () => { H.prepareGridOutput?.(); window.print(); H.notifyChange(); };
  el('png').onclick = () => {
    H.prepareGridOutput?.();
    document.querySelector('#gridMount canvas')?.toBlob(blob => { if (blob) download(blob, filename() + '.png'); });
    H.notifyChange();
  };
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? H.redo() : H.undo(); }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); H.redo(); }
  });
  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    try { localStorage.setItem(DRAFT, JSON.stringify({...H.buildPaintProfile(S.activeProfileName), draft: true})); }
    catch { status('The draft could not be saved in this browser. Export JSON to keep your work.'); }
  }
  window.addEventListener('ornament:change', () => { update(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); });
  window.addEventListener('pagehide', saveDraft);
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES) || '{}');
    for (const item of Object.values(raw)) {
      try { const profile = H.normalizeProfile(item); if (profile.name) S.profiles.push(profile); } catch { /* skip damaged entries */ }
    }
    S.profiles.sort((a, b) => a.name.localeCompare(b.name));
    S.activeProfileName = localStorage.getItem(ACTIVE) || '';
    const draft = localStorage.getItem(DRAFT);
    const profile = draft ? JSON.parse(draft) : S.profiles.find(p => p.name === S.activeProfileName);
    if (profile) { H.applyPaintProfile(profile); if (draft) { S.activeProfileName = profile.name || ''; status('Restored your last working draft.'); } }
  } catch { status('Saved browser data could not be read. You can still paint and export JSON.'); }
  refresh();
})();
