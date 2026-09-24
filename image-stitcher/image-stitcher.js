const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const addBtn = document.getElementById('addBtn');
const clearBtn = document.getElementById('clearBtn');
const thumbList = document.getElementById('thumbList');
const btnVertical = document.getElementById('btnVertical');
const btnHorizontal = document.getElementById('btnHorizontal');
const gapInput = document.getElementById('gap');
const gapVal = document.getElementById('gapVal');
const bgInput = document.getElementById('bg');
const formatInput = document.getElementById('format');
const normalizeInput = document.getElementById('normalize');
const allowFullResInput = document.getElementById('allowFullRes');
const filenameInput = document.getElementById('filename');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const scaleWarn = document.getElementById('scaleWarn');
const preview = document.getElementById('preview');
const emptyMsg = document.getElementById('emptyMsg');
const statCount = document.getElementById('statCount');
const statSize = document.getElementById('statSize');
const statMode = document.getElementById('statMode');
const ctx = preview.getContext('2d');

let images = []; // { id, el, name, w, h }
let direction = 'vertical';
let dragId = null;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

// ---------- upload ----------
addBtn.onclick = () => fileInput.click();
dropzone.onclick = () => fileInput.click();
dropzone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } };
fileInput.onchange = (e) => addFiles(e.target.files, () => { fileInput.value = ''; });

['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); dropzone.classList.add('dragover');
}));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function addFiles(fileList, done) {
  const files = [...(fileList || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) { if (done) done(); return; }
  let pending = files.length;
  const finish = () => { if (--pending === 0) { renderThumbs(); renderPreview(); if (done) done(); } };
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      images.push({ id: uid(), el: img, name: file.name || 'image', w: img.naturalWidth, h: img.naturalHeight });
      finish();
    };
    img.onerror = () => { URL.revokeObjectURL(url); finish(); };
    img.src = url;
  });
}

clearBtn.onclick = () => { images = []; renderThumbs(); renderPreview(); };

// ---------- direction ----------
btnVertical.onclick = () => setDirection('vertical');
btnHorizontal.onclick = () => setDirection('horizontal');
function setDirection(d) {
  direction = d;
  btnVertical.classList.toggle('active', d === 'vertical');
  btnHorizontal.classList.toggle('active', d === 'horizontal');
  statMode.textContent = d === 'vertical' ? 'Vertical' : 'Horizontal';
  renderPreview();
}

// ---------- options ----------
gapInput.oninput = () => { gapVal.textContent = gapInput.value; renderPreview(); };
bgInput.oninput = renderPreview;
normalizeInput.onchange = renderPreview;
allowFullResInput.onchange = renderPreview;
formatInput.onchange = renderPreview;

function moveItem(id, delta) {
  const i = images.findIndex(x => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= images.length) return;
  const [m] = images.splice(i, 1);
  images.splice(j, 0, m);
  renderThumbs(); renderPreview();
}

// ---------- thumbnails + reorder (desktop DnD + Android touch) ----------
function renderThumbs() {
  thumbList.innerHTML = '';
  images.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'thumb';
    div.dataset.id = item.id;
    // Desktop HTML5 drag stays enabled; touch uses handle + arrows below
    div.draggable = true;
    div.innerHTML = `
      <div class="num">${i + 1}</div>
      <img src="${item.el.src}" alt="" draggable="false" />
      <div class="meta"><b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b><span>${item.w} × ${item.h}px</span></div>
      <div class="movers">
        <button class="move" data-move="-1" title="Move up" aria-label="Move up">▲</button>
        <button class="move" data-move="1" title="Move down" aria-label="Move down">▼</button>
      </div>
      <span class="handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
      <button class="remove" title="Remove" aria-label="Remove">×</button>`;

    div.querySelector('.remove').onclick = (e) => {
      e.stopPropagation();
      images = images.filter(x => x.id !== item.id);
      renderThumbs(); renderPreview();
    };
    div.querySelectorAll('.move').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); moveItem(item.id, parseInt(btn.dataset.move, 10)); };
    });

    // --- Desktop drag & drop ---
    div.addEventListener('dragstart', (e) => {
      dragId = item.id;
      div.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); } catch (_) {}
    });
    div.addEventListener('dragend', () => {
      dragId = null;
      div.classList.remove('dragging');
      thumbList.querySelectorAll('.thumb').forEach(t => t.classList.remove('dragover'));
    });
    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (item.id !== dragId) div.classList.add('dragover');
    });
    div.addEventListener('dragleave', () => div.classList.remove('dragover'));
    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('dragover');
      const from = images.findIndex(x => x.id === dragId);
      const to = images.findIndex(x => x.id === item.id);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = images.splice(from, 1);
      images.splice(to, 0, moved);
      renderThumbs(); renderPreview();
    });

    // --- Android touch drag via handle (HTML5 DnD doesn't fire on touch) ---
    const handle = div.querySelector('.handle');
    handle.addEventListener('touchstart', (e) => startTouchDrag(e, item.id, div), { passive: false });
    handle.addEventListener('mousedown', (e) => {
      // allow mouse-drag from handle too without selecting text
      e.preventDefault();
    });

    thumbList.appendChild(div);
  });
}

// Touch reorder: drag handle, finger moves row, drop to new position
let touchState = null;
function startTouchDrag(e, id, rowEl) {
  if (e.touches.length !== 1) return;
  e.preventDefault(); // takes over from scroll since handle has touch-action:none
  dragId = id;
  rowEl.classList.add('dragging');
  touchState = { id, rowEl };
  highlightTouchRow(e.touches[0]);
}
function highlightTouchRow(touch) {
  thumbList.querySelectorAll('.thumb').forEach(t => t.classList.remove('dragover'));
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const row = el ? el.closest('.thumb') : null;
  if (row && row.dataset.id !== dragId) row.classList.add('dragover');
}
document.addEventListener('touchmove', (e) => {
  if (!touchState) return;
  e.preventDefault(); // keep scroll locked while touch-dragging
  highlightTouchRow(e.touches[0]);
}, { passive: false });
document.addEventListener('touchend', (e) => {
  if (!touchState) return;
  const t = (e.changedTouches && e.changedTouches[0]) || null;
  let targetId = null;
  if (t) {
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const row = el ? el.closest('.thumb') : null;
    if (row) targetId = row.dataset.id;
  }
  const from = images.findIndex(x => x.id === touchState.id);
  const to = images.findIndex(x => x.id === targetId);
  touchState = null;
  const dragged = dragId;
  dragId = null;
  if (from >= 0 && to >= 0 && from !== to) {
    const [moved] = images.splice(from, 1);
    images.splice(to, 0, moved);
  }
  void dragged;
  renderThumbs(); renderPreview();
});
document.addEventListener('touchcancel', () => {
  touchState = null; dragId = null;
  renderThumbs();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- combine + preview (with mobile memory guard) ----------
const MAX_SIDE = 4096;        // longest canvas edge cap (prevents OOM on phones)
const MAX_PIXELS = 16000000;  // ~16MP cap, common mobile canvas safe zone
const MAX_SIDE_FULLRES = 16384;       // most desktop browsers' hard canvas-edge limit
const MAX_PIXELS_FULLRES = 100000000; // ~100MP, generous desktop/PC memory budget

function computedSizes() {
  let gap = parseInt(gapInput.value, 10) || 0;
  const normalize = normalizeInput.checked;
  if (!images.length) return { sizes: [], W: 0, H: 0, gap, scale: 1 };
  let sizes, W, H;
  if (direction === 'vertical') {
    const baseW = Math.max(...images.map(i => i.w));
    sizes = images.map(i => normalize ? { w: baseW, h: Math.round(i.h * (baseW / i.w)) } : { w: i.w, h: i.h });
    W = Math.max(...sizes.map(s => s.w));
    H = sizes.reduce((a, s) => a + s.h, 0) + gap * (sizes.length - 1);
  } else {
    const baseH = Math.max(...images.map(i => i.h));
    sizes = images.map(i => normalize ? { w: Math.round(i.w * (baseH / i.h)), h: baseH } : { w: i.w, h: i.h });
    W = sizes.reduce((a, s) => a + s.w, 0) + gap * (sizes.length - 1);
    H = Math.max(...sizes.map(s => s.h));
  }
  // downscale uniformly if a phone photo combo would blow the canvas budget
  const maxSide = allowFullResInput.checked ? MAX_SIDE_FULLRES : MAX_SIDE;
  const maxPixels = allowFullResInput.checked ? MAX_PIXELS_FULLRES : MAX_PIXELS;
  let scale = 1;
  if (W > 0 && H > 0) {
    scale = Math.min(1, maxSide / Math.max(W, H), Math.sqrt(maxPixels / (W * H)));
  }
  if (scale < 1) {
    sizes = sizes.map(s => ({ w: Math.max(1, Math.round(s.w * scale)), h: Math.max(1, Math.round(s.h * scale)) }));
    W = direction === 'vertical'
      ? Math.max(...sizes.map(s => s.w))
      : sizes.reduce((a, s) => a + s.w, 0) + Math.round(gap * scale) * (sizes.length - 1);
    H = direction === 'vertical'
      ? sizes.reduce((a, s) => a + s.h, 0) + Math.round(gap * scale) * (sizes.length - 1)
      : Math.max(...sizes.map(s => s.h));
    gap = Math.round(gap * scale);
  }
  return { sizes, W, H, gap, scale };
}

function renderPreview() {
  statCount.textContent = images.length;
  downloadBtn.disabled = images.length === 0;
  updateShareVisibility();
  if (!images.length) {
    preview.style.display = 'none';
    emptyMsg.style.display = 'block';
    statSize.textContent = '—';
    scaleWarn.style.display = 'none';
    return;
  }
  const { sizes, W, H, gap, scale } = computedSizes();
  preview.width = W;
  preview.height = H;
  ctx.fillStyle = bgInput.value;
  ctx.fillRect(0, 0, W, H);
  let x = 0, y = 0;
  images.forEach((item, i) => {
    const s = sizes[i];
    if (direction === 'vertical') {
      ctx.drawImage(item.el, Math.round((W - s.w) / 2), y, s.w, s.h);
      y += s.h + gap;
    } else {
      ctx.drawImage(item.el, x, Math.round((H - s.h) / 2), s.w, s.h);
      x += s.w + gap;
    }
  });
  preview.style.display = 'block';
  emptyMsg.style.display = 'none';
  statSize.textContent = `${W} × ${H}px`;
  if (scale < 1) {
    scaleWarn.style.display = 'block';
    const limitLabel = allowFullResInput.checked ? 'browser canvas limits' : 'mobile memory limits';
    scaleWarn.textContent = `⚠ Large photos auto-scaled to ${Math.round(scale * 100)}% to stay within ${limitLabel} (${W}×${H}).`;
  } else {
    scaleWarn.style.display = 'none';
  }
}

// ---------- download + Android share ----------
function exportBlob(cb) {
  const mime = formatInput.value;
  preview.toBlob(cb, mime, 0.92);
}
function cleanName() {
  let name = (filenameInput.value || 'combined-image').trim() || 'combined-image';
  return name.replace(/[\\/:*?"<>|]+/g, '-');
}
function extFor(mime) { return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'; }

downloadBtn.onclick = () => {
  if (!images.length) return;
  const mime = formatInput.value;
  const ext = extFor(mime);
  const base = cleanName();
  const full = base.toLowerCase().endsWith('.' + ext) ? base : `${base}.${ext}`;
  exportBlob((blob) => {
    if (!blob) { alert('Export failed — try PNG format.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = full; // Android Chrome saves to Downloads
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
};

function updateShareVisibility() {
  // Web Share with files works on Android Chrome — offer it as an alternative
  const canShare = navigator.canShare && images.length > 0;
  shareBtn.style.display = 'none';
  if (!canShare || !images.length) return;
  exportBlobShimCheck();
}
function exportBlobShimCheck() {
  try {
    const probe = new File([], 'probe.png', { type: 'image/png' });
    if (navigator.canShare({ files: [probe] })) shareBtn.style.display = 'block';
  } catch (_) { /* share unsupported */ }
}
shareBtn.onclick = async () => {
  if (!images.length) return;
  const mime = formatInput.value;
  const ext = extFor(mime);
  exportBlob(async (blob) => {
    if (!blob) { alert('Export failed — try PNG format.'); return; }
    const file = new File([blob], `${cleanName()}.${ext}`, { type: mime });
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      if (err && err.name !== 'AbortError') alert('Share failed — use Download instead.');
    }
  });
};

renderThumbs();
