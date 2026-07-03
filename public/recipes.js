const recipeList = document.querySelector('#recipeList');
const recipeCount = document.querySelector('#recipeCount');
const addRecipeButton = document.querySelector('#addRecipeButton');
const recipeDialog = document.querySelector('#recipeDialog');
const recipeForm = document.querySelector('#recipeForm');
const recipeDialogTitle = document.querySelector('#recipeDialogTitle');

let recipes = [];
let editingRecipeId = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openRecipeDialog(recipe = null) {
  editingRecipeId = recipe?.id || null;
  recipeForm.reset();
  recipeDialogTitle.textContent = recipe ? 'Edit recipe' : 'Add recipe';

  if (recipe) {
    recipeForm.elements.title.value = recipe.title || '';
    recipeForm.elements.link.value = recipe.link || '';
  }

  if (typeof recipeDialog.showModal === 'function') {
    recipeDialog.showModal();
  }
}

function renderRecipes() {
  recipeCount.textContent = `${recipes.length} saved`;

  if (!recipes.length) {
    recipeList.innerHTML = '<p class="panel empty-state">No recipes saved yet.</p>';
    return;
  }

  recipeList.innerHTML = recipes
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((recipe) => {
      const title = recipe.link
        ? `<a href="${escapeHtml(recipe.link)}" target="_blank" rel="noreferrer">${escapeHtml(recipe.title)}</a>`
        : escapeHtml(recipe.title);

      return `
        <article class="panel recipe-row" data-recipe-id="${escapeHtml(recipe.id)}">
          <div>
            <h2>${title}</h2>
            <p class="meta">${recipe.link ? escapeHtml(recipe.link) : 'No link saved'}</p>
          </div>
          <div class="row-actions">
            <button type="button" data-edit-recipe>Edit</button>
            <button class="danger-action" type="button" data-delete-recipe>Remove</button>
          </div>
        </article>
      `;
    }).join('');

  recipeList.querySelectorAll('[data-edit-recipe]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.closest('.recipe-row').dataset.recipeId;
      openRecipeDialog(recipes.find((recipe) => recipe.id === id));
    });
  });

  recipeList.querySelectorAll('[data-delete-recipe]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.closest('.recipe-row').dataset.recipeId;
      if (!confirm('Remove this recipe? Planned meals using it will keep their date but lose the recipe link.')) return;
      try {
        await api(`/api/family/recipes/${id}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function load() {
  recipes = await api('/api/family/recipes');
  renderRecipes();
}

addRecipeButton.addEventListener('click', () => openRecipeDialog());

recipeDialog.querySelector('[data-close-recipe]').addEventListener('click', () => {
  recipeDialog.close();
});

recipeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(recipeForm);

  try {
    const path = editingRecipeId ? `/api/family/recipes/${editingRecipeId}` : '/api/family/recipes';
    await api(path, {
      method: editingRecipeId ? 'PUT' : 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        link: data.get('link')
      })
    });
    recipeDialog.close();
    recipeForm.reset();
    editingRecipeId = null;
    await load();
  } catch (err) {
    alert(err.message);
  }
});

load().catch((err) => {
  recipeList.innerHTML = `<p class="panel empty-state">Could not load recipes: ${escapeHtml(err.message)}</p>`;
});
