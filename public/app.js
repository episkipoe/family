const proposalList = document.querySelector('#proposalList');
const template = document.querySelector('#proposalTemplate');
const currentUserName = document.querySelector('#currentUserName');
const changeNameButton = document.querySelector('#changeNameButton');
const nameDialog = document.querySelector('#nameDialog');
const nameForm = document.querySelector('#nameForm');
const nameInput = document.querySelector('#nameInput');
const addProposalButton = document.querySelector('#addProposalButton');
const proposalDialog = document.querySelector('#proposalDialog');
const proposalForm = document.querySelector('#proposalForm');
const proposalDialogTitle = document.querySelector('#proposalDialogTitle');
const yearFilters = document.querySelector('#yearFilters');
const sortButtons = document.querySelectorAll('[data-sort-direction]');

const USER_ID_KEY = 'familyPlanner.userId';
const USER_NAME_KEY = 'familyPlanner.userName';

let proposals = [];
let user = loadUser();
let editingProposalId = null;
let selectedYear = 'all';
let sortDirection = 'asc';

function loadUser() {
  let id = localStorage.getItem(USER_ID_KEY);
  const name = localStorage.getItem(USER_NAME_KEY) || '';

  if (!id) {
    id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(USER_ID_KEY, id);
  }

  return { id, name };
}

function saveUserName(name) {
  const cleaned = String(name || '').trim().slice(0, 80);
  if (!cleaned) return false;
  user = { ...user, name: cleaned };
  localStorage.setItem(USER_NAME_KEY, cleaned);
  renderIdentity();
  return true;
}

function ensureUserName() {
  if (user.name) return true;
  openNameDialog();
  return false;
}

function openNameDialog() {
  nameInput.value = user.name || '';
  if (typeof nameDialog.showModal === 'function') {
    nameDialog.showModal();
  } else {
    const name = prompt('What name should we use for your votes and comments?');
    saveUserName(name);
  }
}

function renderIdentity() {
  currentUserName.textContent = user.name || 'Not set';
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return 'TBD';
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function sortDateValue(proposal) {
  return proposal.startDate || '9999-12-31';
}

function proposalYear(proposal) {
  return String(proposal.year || 'TBD');
}

function compareProposalDates(a, b) {
  const aHasDate = Boolean(a.startDate);
  const bHasDate = Boolean(b.startDate);

  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;

  const order = sortDateValue(a).localeCompare(sortDateValue(b));
  return sortDirection === 'asc' ? order : -order;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function renderComments(container, comments) {
  if (!comments.length) {
    container.innerHTML = '<p class="meta">No comments yet.</p>';
    return;
  }

  container.innerHTML = comments.map((comment) => `
    <div class="comment">
      <strong>${escapeHtml(comment.author)}</strong>
      <time>${new Date(comment.createdAt).toLocaleString()}</time>
      <p>${escapeHtml(comment.text)}</p>
    </div>
  `).join('');
}

function renderMiniCalendar(container, startDate, endDate) {
  if (!startDate || !endDate) {
    container.remove();
    return;
  }

  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const firstGridDate = new Date(monthStart);
  firstGridDate.setDate(monthStart.getDate() - monthStart.getDay());

  const days = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    const inMonth = date.getMonth() === start.getMonth();
    const inRange = date >= start && date <= end;
    const isStart = date.toDateString() === start.toDateString();
    const isEnd = date.toDateString() === end.toDateString();
    const classes = [
      inMonth ? '' : 'muted-day',
      inRange ? 'selected-day' : '',
      isStart ? 'range-start' : '',
      isEnd ? 'range-end' : ''
    ].filter(Boolean).join(' ');

    return `<span class="${classes}">${date.getDate()}</span>`;
  }).join('');

  container.innerHTML = `
    <div class="mini-heading">
      <strong>${start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
      <span>${formatDateRange(startDate, endDate)}</span>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
    </div>
    <div class="calendar-grid">${days}</div>
  `;
}

function renderMiniMap(container, location) {
  const query = encodeURIComponent(location);
  container.innerHTML = `
    <iframe
      title="Map of ${escapeHtml(location)}"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?q=${query}&output=embed">
    </iframe>
    <a href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" rel="noreferrer">Open map</a>
  `;
}

function openProposalDialog(proposal = null) {
  editingProposalId = proposal?.id || null;
  proposalForm.reset();
  proposalDialogTitle.textContent = proposal ? 'Edit proposal' : 'Add proposal';

  if (proposal) {
    proposalForm.elements.title.value = proposal.title || '';
    proposalForm.elements.location.value = proposal.location || '';
    proposalForm.elements.year.value = proposal.year || '';
    proposalForm.elements.startDate.value = proposal.startDate || '';
    proposalForm.elements.endDate.value = proposal.endDate || '';
    proposalForm.elements.summary.value = proposal.summary || '';
  }

  if (typeof proposalDialog.showModal === 'function') {
    proposalDialog.showModal();
  }
}

function renderProposals() {
  proposalList.innerHTML = '';

  const visibleProposals = proposals
    .slice()
    .filter((proposal) => selectedYear === 'all' || proposalYear(proposal) === selectedYear)
    .sort(compareProposalDates);

  if (!visibleProposals.length) {
    proposalList.innerHTML = '<p class="panel empty-state">No proposals match those filters.</p>';
    return;
  }

  visibleProposals
    .forEach((proposal) => {
      const node = template.content.cloneNode(true);
      const card = node.querySelector('.proposal-card');
      card.dataset.proposalId = proposal.id;

      node.querySelector('.year').textContent = proposal.year;
      node.querySelector('h2').textContent = proposal.title;
      node.querySelector('.status').textContent = proposal.status || 'active';
      node.querySelector('.meta').textContent = `${proposal.location} | ${formatDateRange(proposal.startDate, proposal.endDate)}`;
      node.querySelector('.summary').textContent = proposal.summary || '';
      renderMiniCalendar(node.querySelector('.mini-calendar'), proposal.startDate, proposal.endDate);
      renderMiniMap(node.querySelector('.mini-map'), proposal.location);
      node.querySelector('.yes-count').textContent = proposal.voteSummary?.yes || 0;
      node.querySelector('.maybe-count').textContent = proposal.voteSummary?.maybe || 0;
      node.querySelector('.no-count').textContent = proposal.voteSummary?.no || 0;

      node.querySelector('[data-edit-proposal]').addEventListener('click', () => {
        openProposalDialog(proposal);
      });

      node.querySelectorAll('[data-vote]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!ensureUserName()) return;
          try {
            await api(`/api/family/proposals/${proposal.id}/vote`, {
              method: 'POST',
              body: JSON.stringify({
                userId: user.id,
                userName: user.name,
                vote: button.dataset.vote
              })
            });
            await load();
          } catch (err) {
            alert(err.message);
          }
        });
      });

      const commentList = node.querySelector('.comment-list');
      renderComments(commentList, proposal.comments || []);

      const form = node.querySelector('.comment-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!ensureUserName()) return;
        const data = new FormData(form);
        try {
          await api(`/api/family/proposals/${proposal.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              userId: user.id,
              userName: user.name,
              text: data.get('text')
            })
          });
          form.reset();
          await load();
        } catch (err) {
          alert(err.message);
        }
      });

      proposalList.appendChild(node);
    });
}

function renderYearFilters() {
  const years = [...new Set(proposals.map(proposalYear))].sort((a, b) => a.localeCompare(b));

  if (selectedYear !== 'all' && !years.includes(selectedYear)) {
    selectedYear = 'all';
  }

  yearFilters.innerHTML = [
    `<button type="button" data-year-filter="all">All</button>`,
    ...years.map((year) => `<button type="button" data-year-filter="${escapeHtml(year)}">${escapeHtml(year)}</button>`)
  ].join('');

  yearFilters.querySelectorAll('[data-year-filter]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.yearFilter === selectedYear);
    button.addEventListener('click', () => {
      selectedYear = button.dataset.yearFilter;
      renderYearFilters();
      renderProposals();
    });
  });
}

function renderSortButtons() {
  sortButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.sortDirection === sortDirection);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function load() {
  const data = await api('/api/family/bootstrap');
  proposals = data.proposals || [];
  renderYearFilters();
  renderSortButtons();
  renderProposals();
}

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (saveUserName(nameInput.value)) {
    nameDialog.close();
  }
});

changeNameButton.addEventListener('click', openNameDialog);

sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    sortDirection = button.dataset.sortDirection;
    renderSortButtons();
    renderProposals();
  });
});

addProposalButton.addEventListener('click', () => {
  openProposalDialog();
});

proposalDialog.querySelector('[data-close-proposal]').addEventListener('click', () => {
  proposalDialog.close();
});

proposalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(proposalForm);
  const startDate = data.get('startDate');
  const endDate = data.get('endDate');

  if (startDate && endDate && endDate < startDate) {
    alert('End date should be on or after the start date.');
    return;
  }

  try {
    const path = editingProposalId ? `/api/family/proposals/${editingProposalId}` : '/api/family/proposals';
    await api(path, {
      method: editingProposalId ? 'PUT' : 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        location: data.get('location'),
        year: data.get('year'),
        startDate,
        endDate,
        summary: data.get('summary')
      })
    });
    proposalDialog.close();
    proposalForm.reset();
    editingProposalId = null;
    await load();
  } catch (err) {
    alert(err.message);
  }
});

renderIdentity();
if (!user.name) openNameDialog();

load().catch((err) => {
  proposalList.innerHTML = `<p class="panel" style="padding: 20px;">Could not load planner: ${escapeHtml(err.message)}</p>`;
});
