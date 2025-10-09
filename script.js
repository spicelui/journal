// ELEMENTOS DOM
const newEntryBtn = document.getElementById('newEntryBtn');
const exportBtn = document.getElementById('exportBtn');
const sheet = document.getElementById('sheet');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const sheetTitle = document.getElementById('sheetTitle');
const titleInput = document.getElementById('titleInput');
const entriesContainer = document.getElementById('entries');
const searchInput = document.getElementById('searchInput');

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
// RENDER ENTRADAS SIMPLIFICADO
// ==========================
async function renderEntries() {
  const entries = await getAllEntries();
  entriesContainer.innerHTML = '';

  entries.forEach(e => {
    const div = document.createElement('div');
    div.classList.add('entry');
    div.dataset.id = e.id;

    const title = document.createElement('h3');
    title.textContent = e.title || 'Sin título';
    div.appendChild(title);

    const date = document.createElement('small');
    date.textContent = e.date;
    div.appendChild(date);

    div.addEventListener('click', () => openSheet(e));

    entriesContainer.appendChild(div);

    // hr separado y manejable
    const hr = document.createElement('hr');
    entriesContainer.appendChild(hr);
  });
}

// ==========================
// SHEET CONTROL
// ==========================
function openSheet(entry = null) {
  sheet.classList.add('visible');

  if (entry) {
    titleInput.value = entry.title || '';
    saveBtn.textContent = 'Actualizar';
    sheetTitle.textContent = 'Editar entrada';
    deleteBtn.classList.remove('hidden');
    currentId = entry.id;
  } else {
    titleInput.value = '';
    saveBtn.textContent = 'Guardar';
    sheetTitle.textContent = 'Nueva entrada';
    deleteBtn.classList.add('hidden');
    currentId = null;
  }

  // Focus confiable en Safari
  setTimeout(() => {
    titleInput.focus();
    titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
  }, 50);
}

function closeSheet() {
  sheet.classList.remove('visible');
  titleInput.value = '';
  currentId = null;
}

// ==========================
// GUARDAR / ACTUALIZAR
// ==========================
function saveEntry() {
  const title = titleInput.value.trim();
  if (!title) return alert('El título no puede estar vacío.');

  const now = new Date();
  const date = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  if (currentId) {
    updateEntry(currentId, { title, date });
  } else {
    addEntry({ title, date });
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

// ==========================
// BUSQUEDA EN TIEMPO REAL (solo título)
function normalizeText(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

searchInput.addEventListener('input', () => {
  const query = normalizeText(searchInput.value.trim());
  const entries = document.querySelectorAll('#entries .entry');

  entries.forEach(entry => {
    const titleEl = entry.querySelector('h3');
    const hr = entry.nextElementSibling;

    let titleText = titleEl.textContent;
    titleEl.innerHTML = titleText; // limpiar highlights previos

    if (!query) {
      entry.style.display = '';
      if (hr) hr.style.display = '';
      return;
    }

    if (normalizeText(titleText).includes(query)) {
      entry.style.display = '';
      if (hr) hr.style.display = '';
      const regex = new RegExp(`(${query})`, 'gi');
      titleEl.innerHTML = titleText.replace(regex, `<span class="highlight">$1</span>`);
    } else {
      entry.style.display = 'none';
      if (hr) hr.style.display = 'none';
    }
  });
});

// ==========================
// Placeholder dinámico
// ==========================
const now = new Date();
titleInput.placeholder = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
