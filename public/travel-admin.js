const state = {
  mode: 'people',
  data: null,
  selectedId: null,
  isNew: false
};

const list = document.querySelector('#adminList');
const form = document.querySelector('#adminForm');
const status = document.querySelector('#adminStatus');
const search = document.querySelector('#adminSearch');
const placeFields = document.querySelector('#placeFields');
const currentReferenceList = document.querySelector('#currentReferenceList');
const personActions = document.querySelector('#personActions');
const personMigrateTarget = document.querySelector('#personMigrateTarget');

function records() {
  return state.mode === 'people' ? state.data.people : state.data.locations;
}

function overrides() {
  return state.mode === 'people' ? state.data.overrides.people : state.data.overrides.locations;
}

function selectedRecord() {
  return records().find((record) => record.id === state.selectedId) || null;
}

function lines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function setLines(element, values) {
  element.value = (values || []).join('\n');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function renderDocs() {
  document.querySelector('#docList').innerHTML = state.data.docs.map((doc) => `
    <button type="button" data-doc-id="${escapeHtml(doc.id)}">
      <strong>${escapeHtml(doc.title)}</strong>
      <span>${escapeHtml(doc.id)}</span>
    </button>
  `).join('');
}

function renderList() {
  const query = search.value.trim().toLowerCase();
  const visible = records().filter((record) => record.name.toLowerCase().includes(query));
  document.querySelector('#adminListHeading').textContent = state.mode === 'people' ? 'People' : 'Places';
  list.innerHTML = visible.map((record) => `
    <button class="travel-admin-record ${record.id === state.selectedId ? 'is-active' : ''}" type="button" data-id="${escapeHtml(record.id)}">
      <strong>${escapeHtml(record.name)}</strong>
      <span>${record.referenceCount} refs${record.manual ? ' · manual' : ''}</span>
    </button>
  `).join('');
}

function renderEditor() {
  const record = selectedRecord();
  placeFields.hidden = state.mode !== 'locations';
  personActions.hidden = state.mode !== 'people' || state.isNew || !record;
  document.querySelector('#recordKind').textContent = state.isNew ? 'New record' : state.mode;
  document.querySelector('#editorHeading').textContent = record ? record.name : 'New record';
  document.querySelector('#recordMeta').textContent = record ? `${record.id} · ${record.referenceCount || 0} references` : '';
  document.querySelector('#recordName').value = record?.name || '';
  document.querySelector('#recordLat').value = record?.lat ?? '';
  document.querySelector('#recordLng').value = record?.lng ?? '';
  document.querySelector('#recordTheme').value = record?.theme || '';

  const override = overrides()[state.selectedId] || {};
  setLines(document.querySelector('#referenceAdds'), state.isNew ? [] : override.referenceAdds);
  setLines(document.querySelector('#referenceRemoves'), state.isNew ? [] : override.referenceRemoves);
  renderPersonTargets(record);
  renderCurrentReferences(record);
  document.querySelector('#hideRecord').hidden = state.isNew || !record;
  document.querySelector('#resetOverride').hidden = state.isNew || !record;
}

function renderPersonTargets(record) {
  if (state.mode !== 'people' || state.isNew || !record) {
    personMigrateTarget.innerHTML = '';
    return;
  }

  const options = state.data.people
    .filter((person) => person.id !== record.id)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} (${person.referenceCount || 0} refs)</option>`);
  personMigrateTarget.innerHTML = options.length ? options.join('') : '<option value="">No other people</option>';
}

function renderCurrentReferences(record) {
  if (!record || state.isNew) {
    currentReferenceList.innerHTML = '<p class="empty">Choose a record to review its document context.</p>';
    return;
  }

  const removedIds = new Set(lines(document.querySelector('#referenceRemoves').value));
  const references = Array.isArray(record.references) ? record.references : [];
  currentReferenceList.innerHTML = references.length ? references.map((reference) => {
    const isRemoved = removedIds.has(reference.id);
    return `
      <button class="travel-reference-context ${isRemoved ? 'is-removed' : ''}" type="button" data-current-doc-id="${escapeHtml(reference.id)}" aria-pressed="${isRemoved ? 'true' : 'false'}">
        <span class="travel-reference-status">${isRemoved ? 'Remove on save' : 'Currently associated'}</span>
        <strong>${escapeHtml(reference.title || 'Untitled document')}</strong>
        <span>${escapeHtml(reference.id)}</span>
        ${reference.snippet ? `<p>${escapeHtml(reference.snippet)}</p>` : '<p>No context snippet available.</p>'}
      </button>
    `;
  }).join('') : '<p class="empty">No documents are currently associated with this record.</p>';
}

function toggleReferenceRemove(docId) {
  const field = document.querySelector('#referenceRemoves');
  const current = lines(field.value);
  const next = new Set(current);
  if (next.has(docId)) {
    next.delete(docId);
    status.textContent = 'Document kept.';
  } else {
    next.add(docId);
    status.textContent = 'Document marked for removal. Save to apply.';
  }
  setLines(field, [...next]);
  renderCurrentReferences(selectedRecord());
}

function selectRecord(id) {
  state.selectedId = id;
  state.isNew = false;
  renderList();
  renderEditor();
}

function newRecord() {
  state.selectedId = null;
  state.isNew = true;
  renderList();
  renderEditor();
}

async function loadAdmin() {
  const response = await fetch('/api/travel/admin');
  if (!response.ok) throw new Error('Unable to load travel admin data.');
  state.data = await response.json();
  if (!state.selectedId && records()[0]) state.selectedId = records()[0].id;
  renderDocs();
  renderList();
  renderEditor();
}

async function saveRecord(event) {
  if (event) event.preventDefault();
  const payload = {
    name: document.querySelector('#recordName').value.trim(),
    lat: document.querySelector('#recordLat').value,
    lng: document.querySelector('#recordLng').value,
    theme: document.querySelector('#recordTheme').value.trim(),
    referenceAdds: lines(document.querySelector('#referenceAdds').value),
    referenceRemoves: lines(document.querySelector('#referenceRemoves').value),
    referenceIds: lines(document.querySelector('#referenceAdds').value)
  };
  const url = state.isNew
    ? `/api/travel/admin/${state.mode}`
    : `/api/travel/admin/${state.mode}/${encodeURIComponent(state.selectedId)}`;
  const response = await fetch(url, {
    method: state.isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to save record.');
  state.data = result;
  if (state.isNew) {
    const saved = records().find((record) => record.name === payload.name);
    state.selectedId = saved?.id || records()[0]?.id || null;
  }
  state.isNew = false;
  status.textContent = 'Saved.';
  renderList();
  renderEditor();
}

async function renameSelectedPerson() {
  if (state.mode !== 'people' || state.isNew || !state.selectedId) return;
  await saveRecord();
  status.textContent = 'Person renamed.';
}

async function migrateSelectedPerson() {
  if (state.mode !== 'people' || state.isNew || !state.selectedId) return;
  const targetId = personMigrateTarget.value;
  if (!targetId) {
    status.textContent = 'Choose a target person first.';
    return;
  }

  const source = selectedRecord();
  const target = state.data.people.find((person) => person.id === targetId);
  if (!source || !target) return;
  if (!window.confirm(`Migrate ${source.name}'s document entries to ${target.name}? ${source.name} will be hidden.`)) return;

  const response = await fetch(`/api/travel/admin/people/${encodeURIComponent(state.selectedId)}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to migrate person.');
  state.data = result;
  state.selectedId = targetId;
  state.isNew = false;
  status.textContent = `Migrated entries to ${target.name}.`;
  renderList();
  renderEditor();
}

async function deleteAction(path, message) {
  const response = await fetch(path, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || message);
  state.data = result;
  state.selectedId = records()[0]?.id || null;
  state.isNew = false;
  status.textContent = message;
  renderList();
  renderEditor();
}

document.querySelector('#modePeople').addEventListener('click', () => {
  state.mode = 'people';
  state.selectedId = state.data.people[0]?.id || null;
  state.isNew = false;
  document.querySelector('#modePeople').classList.add('is-active');
  document.querySelector('#modePlaces').classList.remove('is-active');
  renderList();
  renderEditor();
});

document.querySelector('#modePlaces').addEventListener('click', () => {
  state.mode = 'locations';
  state.selectedId = state.data.locations[0]?.id || null;
  state.isNew = false;
  document.querySelector('#modePlaces').classList.add('is-active');
  document.querySelector('#modePeople').classList.remove('is-active');
  renderList();
  renderEditor();
});

list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]');
  if (button) selectRecord(button.dataset.id);
});

document.querySelector('#docList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-doc-id]');
  if (!button) return;
  const field = document.querySelector('#referenceAdds');
  const current = new Set(lines(field.value));
  current.add(button.dataset.docId);
  setLines(field, [...current]);
});

currentReferenceList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-current-doc-id]');
  if (!button) return;
  toggleReferenceRemove(button.dataset.currentDocId);
});

document.querySelector('#referenceRemoves').addEventListener('input', () => {
  renderCurrentReferences(selectedRecord());
});

search.addEventListener('input', renderList);
document.querySelector('#newRecord').addEventListener('click', newRecord);
document.querySelector('#renamePerson').addEventListener('click', () => {
  renameSelectedPerson().catch((error) => {
    status.textContent = error.message;
  });
});
document.querySelector('#migratePerson').addEventListener('click', () => {
  migrateSelectedPerson().catch((error) => {
    status.textContent = error.message;
  });
});
form.addEventListener('submit', (event) => {
  saveRecord(event).catch((error) => {
    status.textContent = error.message;
  });
});
document.querySelector('#hideRecord').addEventListener('click', () => {
  if (!state.selectedId) return;
  deleteAction(`/api/travel/admin/${state.mode}/${encodeURIComponent(state.selectedId)}`, 'Hidden.').catch((error) => {
    status.textContent = error.message;
  });
});
document.querySelector('#resetOverride').addEventListener('click', () => {
  if (!state.selectedId) return;
  deleteAction(`/api/travel/admin/${state.mode}/${encodeURIComponent(state.selectedId)}/override`, 'Reset.').catch((error) => {
    status.textContent = error.message;
  });
});

loadAdmin().catch((error) => {
  status.textContent = error.message;
});
