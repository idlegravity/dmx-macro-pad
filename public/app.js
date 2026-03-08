/** @type {Set<string>} */
let activeSceneIds = new Set();

const grid = document.getElementById('scenes-grid');
const blackoutBtn = document.getElementById('blackout-btn');
const statusDot = document.getElementById('connection-status');

const STORAGE_KEY = 'dmx-macro-pad-collapsed';

// ── Collapse state (persisted) ─────────────────────────────────────────────

function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveCollapsed(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

const collapsedGroups = loadCollapsed();

// ── API helpers ────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Render ─────────────────────────────────────────────────────────────────

function setActiveScenes(ids) {
  activeSceneIds = new Set(ids);

  document.querySelectorAll('.scene-btn').forEach((btn) => {
    btn.classList.toggle('active', activeSceneIds.has(btn.dataset.id));
  });

  // Blackout button highlights when nothing is active
  blackoutBtn.classList.toggle('active', activeSceneIds.size === 0);
}

function renderGroups(groups) {
  grid.innerHTML = '';

  if (!groups.length) {
    grid.innerHTML = '<p class="loading">No scenes configured.</p>';
    return;
  }

  for (const group of groups) {
    const isDefaultGroup = group.id === '__default__';
    const isCollapsed = collapsedGroups.has(group.id);

    const groupEl = document.createElement('div');
    groupEl.className = 'group' + (isCollapsed ? ' collapsed' : '');
    groupEl.dataset.groupId = group.id;

    if (!isDefaultGroup) {
      const header = document.createElement('button');
      header.className = 'group-header';
      header.innerHTML = `<span class="group-name">${group.name}</span><span class="group-chevron">›</span>`;
      header.addEventListener('click', () => toggleGroup(group.id, groupEl));
      groupEl.appendChild(header);
    }

    const scenesEl = document.createElement('div');
    scenesEl.className = 'group-scenes';

    const innerGrid = document.createElement('div');
    innerGrid.className = 'scenes-inner-grid';

    for (const scene of group.scenes) {
      const btn = document.createElement('button');
      btn.className = 'scene-btn';
      btn.dataset.id = scene.id;
      if (scene.color) btn.style.setProperty('--scene-color', scene.color);

      const dot = document.createElement('span');
      dot.className = 'color-dot';

      const label = document.createElement('span');
      label.textContent = scene.name;

      btn.append(dot, label);
      btn.addEventListener('click', () => activateScene(scene.id));
      innerGrid.appendChild(btn);
    }

    scenesEl.appendChild(innerGrid);
    groupEl.appendChild(scenesEl);
    grid.appendChild(groupEl);
  }
}

function toggleGroup(groupId, groupEl) {
  const collapsed = groupEl.classList.toggle('collapsed');
  if (collapsed) {
    collapsedGroups.add(groupId);
  } else {
    collapsedGroups.delete(groupId);
  }
  saveCollapsed(collapsedGroups);
}

// ── Actions ────────────────────────────────────────────────────────────────

async function activateScene(id) {
  // Optimistic toggle
  const next = new Set(activeSceneIds);
  if (next.has(id)) { next.delete(id); } else { next.add(id); }
  setActiveScenes(next);

  try {
    await apiPost(`/api/scenes/${encodeURIComponent(id)}/activate`);
  } catch (err) {
    console.error('Activate failed:', err);
  }
}

async function blackout() {
  setActiveScenes([]);
  try {
    await apiPost('/api/blackout');
  } catch (err) {
    console.error('Blackout failed:', err);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const data = await apiGet('/api/scenes');
    renderGroups(data.groups ?? []);
    setActiveScenes(data.activeSceneIds ?? []);
  } catch (err) {
    grid.innerHTML = '<p class="error">Failed to load scenes. Check connection.</p>';
    console.error('Init failed:', err);
    return;
  }

  blackoutBtn.addEventListener('click', blackout);
  connectSSE();
}

function connectSSE() {
  const source = new EventSource('/api/events');

  source.onopen = () => {
    statusDot.className = 'status-dot connected';
  };

  source.onmessage = (e) => {
    try {
      const state = JSON.parse(e.data);
      setActiveScenes(state.activeSceneIds ?? []);
    } catch (_) {}
  };

  source.onerror = () => {
    statusDot.className = 'status-dot disconnected';
  };
}

init();
