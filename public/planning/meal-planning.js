const mealPlanList = document.querySelector('#mealPlanList');
const addMealPlanButton = document.querySelector('#addMealPlanButton');
const mealPlanDialog = document.querySelector('#mealPlanDialog');
const mealPlanForm = document.querySelector('#mealPlanForm');
const mealPlanDialogTitle = document.querySelector('#mealPlanDialogTitle');
const recipeSelect = document.querySelector('#recipeSelect');
const newRecipeFields = document.querySelector('#newRecipeFields');

let recipes = [];
let mealPlans = [];
let editingMealPlanId = null;

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

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function mealLabel(value) {
  return String(value || '').replace(/^\w/, (letter) => letter.toUpperCase());
}

function recipeFor(plan) {
  return plan.recipe || recipes.find((recipe) => recipe.id === plan.recipeId) || {};
}

function renderRecipeOptions() {
  recipeSelect.innerHTML = [
    '<option value="">Choose a meal</option>',
    ...recipes
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((recipe) => `<option value="${escapeHtml(recipe.id)}">${escapeHtml(recipe.title)}</option>`),
    '<option value="__new">Add a new meal...</option>'
  ].join('');
}

function openMealPlanDialog(plan = null) {
  editingMealPlanId = plan?.id || null;
  mealPlanForm.reset();
  renderRecipeOptions();
  newRecipeFields.hidden = true;
  mealPlanDialogTitle.textContent = plan ? 'Edit meal' : 'Add meal';

  if (plan) {
    mealPlanForm.elements.date.value = plan.date || '';
    mealPlanForm.elements.mealType.value = plan.mealType || 'dinner';
    mealPlanForm.elements.recipeId.value = plan.recipeId || '';
    mealPlanForm.elements.notes.value = plan.notes || '';
  }

  if (typeof mealPlanDialog.showModal === 'function') {
    mealPlanDialog.showModal();
  }
}

function renderMealPlans() {
  if (!mealPlans.length) {
    mealPlanList.innerHTML = '<p class="panel empty-state">No meals planned yet.</p>';
    return;
  }

  const groups = mealPlans
    .slice()
    .sort((a, b) => `${a.date}-${a.mealType}`.localeCompare(`${b.date}-${b.mealType}`))
    .reduce((acc, plan) => {
      acc[plan.date] ||= [];
      acc[plan.date].push(plan);
      return acc;
    }, {});

  mealPlanList.innerHTML = Object.entries(groups).map(([date, plans]) => `
    <section class="panel meal-day">
      <h2>${escapeHtml(formatDate(date))}</h2>
      <div class="meal-items">
        ${plans.map((plan) => {
          const recipe = recipeFor(plan);
          return `
            <article class="meal-item" data-meal-plan-id="${escapeHtml(plan.id)}">
              <div>
                <p class="year">${escapeHtml(mealLabel(plan.mealType))}</p>
                <h3>${recipe.link ? `<a href="${escapeHtml(recipe.link)}" target="_blank" rel="noreferrer">${escapeHtml(recipe.title || 'Untitled meal')}</a>` : escapeHtml(recipe.title || 'Untitled meal')}</h3>
                ${plan.notes ? `<p class="meta">${escapeHtml(plan.notes)}</p>` : ''}
              </div>
              <div class="row-actions">
                <button type="button" data-edit-meal-plan>Edit</button>
                <button class="danger-action" type="button" data-delete-meal-plan>Remove</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');

  mealPlanList.querySelectorAll('[data-edit-meal-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.closest('.meal-item').dataset.mealPlanId;
      openMealPlanDialog(mealPlans.find((plan) => plan.id === id));
    });
  });

  mealPlanList.querySelectorAll('[data-delete-meal-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.closest('.meal-item').dataset.mealPlanId;
      if (!confirm('Remove this planned meal?')) return;
      try {
        await api(`/api/family/meal-plans/${id}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function load() {
  const data = await api('/api/family/bootstrap');
  recipes = data.recipes || [];
  mealPlans = data.mealPlans || [];
  renderMealPlans();
}

recipeSelect.addEventListener('change', () => {
  const isNewRecipe = recipeSelect.value === '__new';
  newRecipeFields.hidden = !isNewRecipe;
  mealPlanForm.elements.title.required = isNewRecipe;
  mealPlanForm.elements.link.required = false;
});

addMealPlanButton.addEventListener('click', () => openMealPlanDialog());

mealPlanDialog.querySelector('[data-close-meal-plan]').addEventListener('click', () => {
  mealPlanDialog.close();
});

mealPlanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(mealPlanForm);
  const isNewRecipe = data.get('recipeId') === '__new';

  try {
    const path = editingMealPlanId ? `/api/family/meal-plans/${editingMealPlanId}` : '/api/family/meal-plans';
    await api(path, {
      method: editingMealPlanId ? 'PUT' : 'POST',
      body: JSON.stringify({
        date: data.get('date'),
        mealType: data.get('mealType'),
        recipeId: isNewRecipe ? '' : data.get('recipeId'),
        title: isNewRecipe ? data.get('title') : '',
        link: isNewRecipe ? data.get('link') : '',
        notes: data.get('notes')
      })
    });
    mealPlanDialog.close();
    mealPlanForm.reset();
    editingMealPlanId = null;
    await load();
  } catch (err) {
    alert(err.message);
  }
});

load().catch((err) => {
  mealPlanList.innerHTML = `<p class="panel empty-state">Could not load meals: ${escapeHtml(err.message)}</p>`;
});
