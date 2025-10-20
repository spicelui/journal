// ELEMENTOS DOM
const newEntryBtn = document.getElementById('newEntryBtn');
const exportBtn = document.getElementById('exportBtn');
const sheet = document.getElementById('sheet');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const sheetTitle = document.getElementById('sheetTitle');
const titleInput = document.getElementById('titleInput');
const bodyInput = document.getElementById('bodyInput');
const entriesContainer = document.getElementById('entries');

let db;
let currentId = null;

// ==========================
// ABRIR INDEXEDDB
// ==========================
const request = indexedDB.open("diarioDB", 3);
request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("entries")) {
    db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
  }
};
request.onsuccess = e => {
  db = e.target.result;
  renderEntries();
};
request.onerror = e => console.error("Error al abrir IndexedDB", e);

// ==========================
// FUNCIONES
// ==========================
function addEntry(entry) {
  const tx = db.transaction("entries", "readwrite");
  tx.objectStore("entries").add(entry);
  tx.oncomplete = renderEntries;
}

function updateEntry(id, updated) {
  const tx = db.transaction("entries", "readwrite");
  const store = tx.objectStore("entries");
  store.put({ ...updated, id });
  tx.oncomplete = renderEntries;
}

function deleteEntry(id) {
  const tx = db.transaction("entries", "readwrite");
  tx.objectStore("entries").delete(id);
  tx.oncomplete = renderEntries;
}

function getAllEntries() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("entries", "readonly");
    const store = tx.objectStore("entries");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.reverse());
    req.onerror = reject;
  });
}


// ==========================
// SHEET CONTROL
// ==========================
function openSheet(entry = null) {
  sheet.classList.add('visible');

  if (entry) {
    titleInput.value = entry.title || '';
    bodyInput.value = entry.body;
    saveBtn.textContent = 'Actualizar';
    sheetTitle.textContent = 'Entrada';
    deleteBtn.classList.remove('hidden');
    currentId = entry.id;
  } else {
    titleInput.value = '';
    bodyInput.value = '';
    saveBtn.textContent = 'Guardar';
    sheetTitle.textContent = 'Nueva entrada';
    deleteBtn.classList.add('hidden');
    currentId = null;
  }
}

function closeSheet() {
  sheet.classList.remove('visible');
  titleInput.value = '';
  bodyInput.value = '';
  currentId = null;
}

// ==========================
// GUARDAR / ACTUALIZAR
// ==========================
function saveEntry() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  if (!body) return alert('El cuerpo no puede estar vacío.');

  const now = new Date();
  const editedDate = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  if (currentId) {
    // Obtener la entrada original
    const tx = db.transaction("entries", "readonly");
    const store = tx.objectStore("entries");
    const req = store.get(currentId);
    req.onsuccess = () => {
      const original = req.result;
      updateEntry(currentId, { 
        title, 
        body, 
        date: original.date,        // mantener fecha original
        editedDate                  // nueva propiedad
      });
    };
  } else {
    const date = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    addEntry({ title, body, date });
  }
  closeSheet();
}

// ==========================
// ELIMINAR ENTRADA
// ==========================
function removeEntry() {
  if (!currentId) return;
  if (confirm('¿Eliminar esta entrada?')) {
    deleteEntry(currentId);
    closeSheet();
  }
}

// ==========================
// EXPORTAR ENTRADAS
// ==========================
async function exportEntries() {
  const entries = await getAllEntries();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diario_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================
// EVENTOS
// ==========================
newEntryBtn.addEventListener('click', () => openSheet());
cancelBtn.addEventListener('click', closeSheet);
saveBtn.addEventListener('click', saveEntry);
deleteBtn.addEventListener('click', removeEntry);
exportBtn.addEventListener('click', exportEntries);

// ================ ==========
// PWA SERVICE WORKER
// ==========================
// FUNCION AUXILIAR: normalizar texto (quita acentos y pone minúsculas)
function normalizeText(text) {
  return text
    .normalize("NFD")        // separar acentos
    .replace(/[\u0300-\u036f]/g, "") // eliminar acentos
    .toLowerCase();
}
/* ---- HELPERS ---- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Construye cadena normalizada (sin diacríticos) y mapa de índices
function buildNormMap(orig) {
  let norm = '';
  const map = [];
  for (let i = 0; i < orig.length; i++) {
    const ch = orig[i];
    const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let k = 0; k < decomposed.length; k++) {
      map.push(i);
    }
    norm += decomposed;
  }
  return { norm, map };
}

/**
 * highlightTextPreserveNewlines(raw, query, wrapParagraphs)
 * - raw: texto original (con \n)
 * - query: texto de búsqueda (puede contener acentos)
 * - wrapParagraphs: si true envuelve cada bloque en <p>...</p>
 * Devuelve HTML seguro con <span class="highlight">...</span> en coincidencias.
 */
function highlightTextPreserveNewlines(raw, query, wrapParagraphs = false) {
  raw = raw || '';
  query = (query || '').trim();
  // Si no hay query, solo formatea y escapa
  if (!query) {
    if (!wrapParagraphs) return escapeHtml(raw).replace(/\n/g, '<br>');
    return raw
      .split('\n\n')
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  const qNorm = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const paragraphs = raw.split('\n\n');
  const outParagraphs = [];

  for (const p of paragraphs) {
    const { norm, map } = buildNormMap(p);
    const normLower = norm.toLowerCase();

    // buscar todas las coincidencias (no solapadas) en la cadena normalizada
    const matches = [];
    let startPos = 0;
    while (true) {
      const idx = normLower.indexOf(qNorm, startPos);
      if (idx === -1) break;
      const origStart = map[idx];
      const origEnd = map[idx + qNorm.length - 1] + 1; // exclusive
      matches.push([origStart, origEnd]);
      startPos = idx + qNorm.length;
    }

    if (matches.length === 0) {
      outParagraphs.push(`<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`);
      continue;
    }

    // construir HTML escapado con spans en posiciones originales
    let out = '';
    let last = 0;
    for (const [s, e] of matches) {
      out += escapeHtml(p.slice(last, s)).replace(/\n/g, '<br>');
      out += `<span class="highlight">${escapeHtml(p.slice(s, e)).replace(/\n/g, '<br>')}</span>`;
      last = e;
    }
    out += escapeHtml(p.slice(last)).replace(/\n/g, '<br>');
    outParagraphs.push(`<p>${out}</p>`);
  }

  if (!wrapParagraphs) return outParagraphs.join('');
  return outParagraphs.join('');
}

/* ---- RENDER ENTRADAS (continuación) ---- */
async function renderEntries() {
  const entries = await getAllEntries();
  entriesContainer.innerHTML = '';

  for (const e of entries) {
    const div = document.createElement('div');
    div.classList.add('entry');
    div.dataset.id = e.id;

    if (e.title) {
      const title = document.createElement('h3');
      title.textContent = e.title;
      div.appendChild(title);
    }

    const date = document.createElement('small');
    date.textContent = e.date;
    if (e.editedDate) {
      date.textContent += ` (Editado el ${e.editedDate})`;
    }
    div.appendChild(date);

    const bodyWrapper = document.createElement('div');
    bodyWrapper.dataset.rawBody = e.body;

    const cleanBody = e.body.trim().replace(/\n{3,}/g, '\n\n');

    const paragraphs = cleanBody
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .join('');

    bodyWrapper.innerHTML = paragraphs;
    div.appendChild(bodyWrapper);

    div.addEventListener('click', () => openSheet(e));

    entriesContainer.appendChild(div);

    const hr = document.createElement('hr');
    hr.style.margin = '0';
    entriesContainer.appendChild(hr);
  }
}

/* ---- BUSCADOR CORREGIDO ---- */
searchInput.addEventListener('input', () => {
  const query = normalizeText(searchInput.value.trim());
  const entries = document.querySelectorAll('#entries .entry');

  entries.forEach(entry => {
    const titleEl = entry.querySelector('h3');
    const bodyEl = entry.querySelector('div');
    const hr = entry.nextElementSibling;

    const rawBody = bodyEl.dataset.rawBody || bodyEl.textContent;
    const titleText = titleEl ? titleEl.textContent : '';

    if (!query) {
      // restablecer texto normal (con saltos)
      if (titleEl) titleEl.innerHTML = escapeHtml(titleText);
      bodyEl.innerHTML = rawBody
         .split('\n\n')
         .map(p => p.trim()) // elimina espacios o saltos sobrantes
         .filter(p => p.length > 0) // evita párrafos vacíos
         .join('');
      entry.style.display = '';
      if (hr) hr.style.display = '';
      return;
    }

    const titleMatch = normalizeText(titleText).includes(query);
    const bodyMatch = normalizeText(rawBody).includes(query);

    if (titleMatch || bodyMatch) {
      entry.style.display = '';
      if (hr) hr.style.display = '';

      if (titleEl && titleMatch) {
        const regex = new RegExp(`(${query})`, 'gi');
        titleEl.innerHTML = escapeHtml(titleText).replace(regex, `<span class="highlight">$1</span>`);
      }

      if (bodyMatch) {
        bodyEl.innerHTML = highlightTextPreserveNewlines(rawBody, query, true);
      } else {
        bodyEl.innerHTML = rawBody
          .split('\n\n')
         .map(p => p.trim()) // elimina espacios o saltos sobrantes
         .filter(p => p.length > 0) // evita párrafos vacíos
         .join('');
      }
    } else {
      entry.style.display = 'none';
      if (hr) hr.style.display = 'none';
    }
  });
});


