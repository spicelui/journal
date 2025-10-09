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
// RENDER ENTRADAS
// ==========================
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
    div.appendChild(date);

    const bodyWrapper = document.createElement('div');

    // Separar doble salto de línea en párrafos <p>
    const paragraphs = e.body
      .split('\n\n')               // doble salto = nuevo párrafo
      .map(p => p.replace(/\n/g, '<br>'))  // saltos simples dentro del párrafo
      .map(p => `<p>${p}</p>`)     // envolver en <p>
      .join('');
   bodyWrapper.innerHTML = paragraphs;
    div.appendChild(bodyWrapper);

    // click para editar
    div.addEventListener('click', () => openSheet(e));

    entriesContainer.appendChild(div);
    entriesContainer.appendChild(document.createElement('hr'));
  }
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
  const date = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  if (currentId) {
    updateEntry(currentId, { title, body, date });
  } else {
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

searchInput.addEventListener('input', () => {
  const query = normalizeText(searchInput.value.trim());
  const entries = document.querySelectorAll('#entries .entry');

  entries.forEach(entry => {
    const titleEl = entry.querySelector('h3');
    const bodyEl = entry.querySelector('div');
    const hr = entry.nextElementSibling; // hr que sigue a la entrada

    let titleText = titleEl ? titleEl.textContent : '';
    let bodyHTML = bodyEl.innerHTML;

    // Limpiar highlights previos
    if (titleEl) titleEl.innerHTML = titleText;
    bodyEl.innerHTML = bodyHTML.replace(/<span class="highlight">(.*?)<\/span>/g, '$1');

    if (!query) {
      entry.style.display = '';
      if (hr) hr.style.display = '';
      return;
    }

    const titleMatch = normalizeText(titleText).includes(query);
    const bodyMatch = normalizeText(bodyEl.textContent).includes(query);

    if (titleMatch || bodyMatch) {
      entry.style.display = '';
      if (hr) hr.style.display = '';

      // Resaltar coincidencias
      if (titleMatch) {
        const regex = new RegExp(`(${query})`, 'gi');
        titleEl.innerHTML = titleText.replace(regex, `<span class="highlight">$1</span>`);
      }
      if (bodyMatch) {
        const regex = new RegExp(`(${query})`, 'gi');
        bodyEl.innerHTML = bodyEl.textContent.replace(regex, `<span class="highlight">$1</span>`);
      }

    } else {
      entry.style.display = 'none';
      if (hr) hr.style.display = 'none';
    }
  });
});
titleInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    bodyInput.focus({ preventScroll: true }); // evita el scroll automático
    bodyInput.scrollIntoView({ block: 'nearest', behavior: 'instant' }); // asegura visibilidad sin animación
  }
});

// Obtener fecha formateada en español
const now = new Date();
const fechaFormateada = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

// Actualizar placeholder del título
titleInput.placeholder = `${fechaFormateada}`;
