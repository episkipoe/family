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
const locationOptions = document.querySelector('#locationOptions');
const yearFilters = document.querySelector('#yearFilters');
const sortButtons = document.querySelectorAll('[data-sort-direction]');
const subEventRows = document.querySelector('#subEventRows');
const addSubEventButton = document.querySelector('[data-add-subevent]');
const linkRows = document.querySelector('#linkRows');
const addLinkButton = document.querySelector('[data-add-link]');

const USER_ID_KEY = 'familyPlanner.userId';
const USER_NAME_KEY = 'familyPlanner.userName';
const DEFAULT_LOCATIONS = [
  "Dave's House (1003 Trianon Ln, Ballwin, MO)",
  "Mnke's House (605 Taylor St, Energy, IL)",
  "Ryan's House (4912 Westhaven Rd, Arlington, TX)",
  "Parent's House (37436 Granada Blvd, Lake Villa, IL)",
  "Outdoor Resorts (65821 Overseas Hwy, Layton, FL)"
];
const eventView = document.body.dataset.eventView || 'upcoming';

let proposals = [];
let user = loadUser();
let editingProposalId = null;
let selectedYear = 'all';
let sortDirection = 'asc';

function todayDateValue() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
}

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

function formatSingleDate(date) {
  if (!date) return 'TBD';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatEventDateTime(date, time) {
  const formattedDate = formatSingleDate(date);
  if (!date || !time) return formattedDate;

  return `${formattedDate}, ${new Date(`${date}T${time}`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}

function normalizeUrl(url) {
  const cleaned = String(url || '').trim();
  if (!cleaned) return '';
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDate(dateValue) {
  return String(dateValue || '').replaceAll('-', '');
}

function calendarDateFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('');
}

function calendarDateTime(dateValue, timeValue) {
  return `${calendarDate(dateValue)}T${String(timeValue || '00:00').replace(':', '')}00`;
}

function locationAddress(location) {
  return String(location || '').match(/\(([^()]+)\)\s*$/)?.[1] || String(location || '');
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

function isPastProposal(proposal) {
  const eventEndDate = proposal.endDate || proposal.startDate;
  return Boolean(eventEndDate && eventEndDate < todayDateValue());
}

function proposalsForCurrentView() {
  return proposals.filter((proposal) => {
    const isPast = isPastProposal(proposal);
    return eventView === 'archive' ? isPast : !isPast;
  });
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

function renderComments(container, comments, proposalId) {
  if (!comments.length) {
    container.innerHTML = '<p class="meta">No comments yet.</p>';
    return;
  }

  container.innerHTML = comments.map((comment) => `
    <div class="comment" data-comment-id="${escapeHtml(comment.id)}">
      <div class="comment-topline">
        <div>
          <strong>${escapeHtml(comment.author)}</strong>
          <time>${new Date(comment.createdAt).toLocaleString()}${comment.updatedAt ? ' · edited' : ''}</time>
        </div>
        ${comment.userId === user.id ? `
          <div class="comment-actions">
            <button type="button" data-edit-comment>Edit</button>
            <button type="button" data-delete-comment>Delete</button>
          </div>
        ` : ''}
      </div>
      <p data-comment-text>${escapeHtml(comment.text)}</p>
      <form class="comment-edit-form" hidden>
        <input name="text" value="${escapeHtml(comment.text)}" required />
        <button type="submit">Save</button>
        <button type="button" data-cancel-comment-edit>Cancel</button>
      </form>
    </div>
  `).join('');

  container.querySelectorAll('[data-edit-comment]').forEach((button) => {
    button.addEventListener('click', () => {
      const commentNode = button.closest('.comment');
      commentNode.querySelector('[data-comment-text]').hidden = true;
      commentNode.querySelector('.comment-edit-form').hidden = false;
    });
  });

  container.querySelectorAll('[data-cancel-comment-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const commentNode = button.closest('.comment');
      commentNode.querySelector('.comment-edit-form').reset();
      commentNode.querySelector('[data-comment-text]').hidden = false;
      commentNode.querySelector('.comment-edit-form').hidden = true;
    });
  });

  container.querySelectorAll('.comment-edit-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const commentNode = form.closest('.comment');
      const data = new FormData(form);

      try {
        await api(`/api/family/proposals/${proposalId}/comments/${commentNode.dataset.commentId}`, {
          method: 'PUT',
          body: JSON.stringify({
            userId: user.id,
            text: data.get('text')
          })
        });
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll('[data-delete-comment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const commentNode = button.closest('.comment');

      if (!confirm('Delete this comment?')) return;

      try {
        await api(`/api/family/proposals/${proposalId}/comments/${commentNode.dataset.commentId}`, {
          method: 'DELETE',
          body: JSON.stringify({ userId: user.id })
        });
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function addSubEventRow(event = {}) {
  const row = document.createElement('div');
  row.className = 'subevent-row';
  row.innerHTML = `
    <label>
      Event
      <input name="subEventTitle" maxlength="120" placeholder="e.g. Beach day" value="${escapeHtml(event.title || '')}" />
    </label>
    <label>
      Date
      <input name="subEventDate" type="date" value="${escapeHtml(event.date || '')}" />
    </label>
    <label>
      Time
      <input name="subEventTime" type="time" value="${escapeHtml(event.time || '')}" />
    </label>
    <button type="button" data-remove-subevent>Remove</button>
  `;

  row.querySelector('[data-remove-subevent]').addEventListener('click', () => {
    row.remove();
  });

  subEventRows.appendChild(row);
}

function renderSubEvents(container, subEvents = [], proposal = {}) {
  const events = subEvents.filter((event) => event?.title);

  container.innerHTML = `
    <div class="section-heading">
      <h3>Sub-events</h3>
      <button class="inline-add-button" type="button" data-add-card-subevent aria-label="Add sub-event">+</button>
    </div>
    <div class="subevent-list">
      ${events.length ? events.map((event) => {
        const calendarUrl = googleCalendarUrl(proposal, event);
        const content = `
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(formatEventDateTime(event.date, event.time))}</span>
        `;

        return calendarUrl
          ? `<a class="subevent-pill" href="${escapeHtml(calendarUrl)}" target="_blank" rel="noreferrer">${content}</a>`
          : `<div class="subevent-pill">${content}</div>`;
      }).join('') : '<p class="meta inline-empty">No sub-events yet.</p>'}
    </div>
  `;
}

function collectSubEvents() {
  return [...subEventRows.querySelectorAll('.subevent-row')]
    .map((row) => ({
      title: row.querySelector('[name="subEventTitle"]').value.trim(),
      date: row.querySelector('[name="subEventDate"]').value,
      time: row.querySelector('[name="subEventTime"]').value
    }))
    .filter((event) => event.title);
}

function addLinkRow(link = {}) {
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `
    <label>
      Display text
      <input name="linkText" maxlength="120" placeholder="e.g. Rental house" value="${escapeHtml(link.text || '')}" />
    </label>
    <label>
      Destination URL
      <input name="linkUrl" type="url" maxlength="500" placeholder="https://..." value="${escapeHtml(link.url || '')}" />
    </label>
    <button type="button" data-remove-link>Remove</button>
  `;

  row.querySelector('[data-remove-link]').addEventListener('click', () => {
    row.remove();
  });

  linkRows.appendChild(row);
}

function renderLinks(container, links = []) {
  const proposalLinks = links.filter((link) => link?.text && link?.url);

  container.innerHTML = `
    <div class="section-heading">
      <h3>Links</h3>
      <button class="inline-add-button" type="button" data-add-card-link aria-label="Add link">+</button>
    </div>
    <div class="proposal-link-list">
      ${proposalLinks.length ? proposalLinks.map((link) => `
        <a href="${escapeHtml(normalizeUrl(link.url))}" target="_blank" rel="noreferrer">${escapeHtml(link.text)}</a>
      `).join('') : '<p class="meta inline-empty">No links yet.</p>'}
    </div>
  `;
}

function mealTypeLabel(value) {
  return String(value || '').replace(/^\w/, (letter) => letter.toUpperCase());
}

function renderEventMeals(container, mealPlans = []) {
  const meals = mealPlans
    .filter((plan) => plan?.date)
    .sort((a, b) => `${a.date}-${a.mealType}`.localeCompare(`${b.date}-${b.mealType}`));

  container.innerHTML = `
    <details class="event-meals-panel">
      <summary>
        <span>Meals during this gathering</span>
        <strong>${meals.length}</strong>
      </summary>
      <div class="event-meal-list">
        ${meals.length ? meals.map((plan) => {
          const recipe = plan.recipe || {};
          const title = recipe.title || 'Untitled meal';
          const titleHtml = recipe.link
            ? `<a href="${escapeHtml(normalizeUrl(recipe.link))}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
            : escapeHtml(title);

          return `
            <article class="event-meal">
              <div>
                <p class="year">${escapeHtml(mealTypeLabel(plan.mealType))}</p>
                <h3>${titleHtml}</h3>
                ${plan.notes ? `<p class="meta">${escapeHtml(plan.notes)}</p>` : ''}
              </div>
              <time>${escapeHtml(formatSingleDate(plan.date))}</time>
            </article>
          `;
        }).join('') : '<p class="meta inline-empty">No meals scheduled during these dates.</p>'}
      </div>
      <a class="calendar-action event-meal-link" href="/meal-planning.html">Plan meals</a>
    </details>
  `;
}

function voteLabel(value) {
  return {
    yes: 'Yes',
    maybe: 'Maybe',
    no: 'No'
  }[value] || value;
}

function renderVoteDetails(container, votes = []) {
  const details = container.closest('.vote-details');
  const total = details.querySelector('.vote-total');
  const validVotes = votes.filter((vote) => ['yes', 'maybe', 'no'].includes(vote?.vote));

  total.textContent = validVotes.length;

  if (!validVotes.length) {
    container.innerHTML = '<p class="meta inline-empty">No votes yet.</p>';
    return;
  }

  container.innerHTML = ['yes', 'maybe', 'no'].map((voteValue) => {
    const voters = validVotes.filter((vote) => vote.vote === voteValue);
    return `
      <section class="vote-detail-group">
        <h4>${voteLabel(voteValue)}</h4>
        ${voters.length ? `
          <ul>
            ${voters.map((vote) => `<li>${escapeHtml(vote.userName || 'Unknown voter')}</li>`).join('')}
          </ul>
        ` : '<p class="meta inline-empty">No one yet.</p>'}
      </section>
    `;
  }).join('');
}

function collectLinks() {
  return [...linkRows.querySelectorAll('.link-row')]
    .map((row) => ({
      text: row.querySelector('[name="linkText"]').value.trim(),
      url: normalizeUrl(row.querySelector('[name="linkUrl"]').value)
    }))
    .filter((link) => link.text && link.url);
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
  const address = locationAddress(location);
  const query = encodeURIComponent(address);
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

function googleCalendarDates(startDate, endDate, time = '') {
  if (!startDate || !endDate) return '';
  if (!time) return `${calendarDate(startDate)}/${calendarDate(addDays(endDate, 1))}`;

  const endTime = new Date(`${startDate}T${time}`);
  endTime.setHours(endTime.getHours() + 1);
  return [
    calendarDateTime(startDate, time),
    `${calendarDateFromDate(endTime)}T${String(endTime.getHours()).padStart(2, '0')}${String(endTime.getMinutes()).padStart(2, '0')}00`
  ].join('/');
}

function googleCalendarUrl(proposal, subEvent = null) {
  const startDate = subEvent?.date || proposal.startDate;
  const endDate = subEvent?.date || proposal.endDate;
  const time = subEvent?.time || '';
  if (!startDate || !endDate) return '';

  const linkText = (proposal.links || [])
    .filter((link) => link?.text && link?.url)
    .map((link) => `${link.text}: ${normalizeUrl(link.url)}`);
  const subEventText = (proposal.subEvents || [])
    .filter((event) => event?.title)
    .map((event) => `${event.title}${event.date ? ` (${formatEventDateTime(event.date, event.time)})` : ''}`);
  const details = [
    subEvent ? `Part of ${proposal.title || 'Family gathering'}.` : '',
    proposal.summary || '',
    !subEvent && subEventText.length ? `Sub-events:\n${subEventText.join('\n')}` : '',
    linkText.length ? `Links:\n${linkText.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: subEvent?.title || proposal.title || 'Family gathering',
    dates: googleCalendarDates(startDate, endDate, time),
    location: locationAddress(proposal.location),
    details
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function openProposalDialog(proposal = null, options = {}) {
  editingProposalId = proposal?.id || null;
  proposalForm.reset();
  subEventRows.innerHTML = '';
  linkRows.innerHTML = '';
  proposalDialogTitle.textContent = proposal ? 'Edit event' : 'Add event';

  if (proposal) {
    proposalForm.elements.title.value = proposal.title || '';
    proposalForm.elements.location.value = proposal.location || '';
    proposalForm.elements.year.value = proposal.year || '';
    proposalForm.elements.startDate.value = proposal.startDate || '';
    proposalForm.elements.endDate.value = proposal.endDate || '';
    proposalForm.elements.summary.value = proposal.summary || '';
    (proposal.subEvents || []).forEach(addSubEventRow);
    (proposal.links || []).forEach(addLinkRow);
  }

  if (options.addSubEvent) addSubEventRow();
  if (options.addLink) addLinkRow();

  if (typeof proposalDialog.showModal === 'function') {
    proposalDialog.showModal();
  }
}

function renderProposals() {
  proposalList.innerHTML = '';

  const visibleProposals = proposalsForCurrentView()
    .slice()
    .filter((proposal) => selectedYear === 'all' || proposalYear(proposal) === selectedYear)
    .sort(compareProposalDates);

  if (!visibleProposals.length) {
    const emptyText = eventView === 'archive'
      ? 'No archived events match those filters.'
      : 'No upcoming events match those filters.';
    proposalList.innerHTML = `<p class="panel empty-state">${emptyText}</p>`;
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
      renderSubEvents(node.querySelector('.subevents'), proposal.subEvents || [], proposal);
      renderEventMeals(node.querySelector('.event-meals'), proposal.mealPlans || []);
      renderLinks(node.querySelector('.proposal-links'), proposal.links || []);
      renderMiniCalendar(node.querySelector('.mini-calendar'), proposal.startDate, proposal.endDate);
      renderMiniMap(node.querySelector('.mini-map'), proposal.location);
      const calendarLink = node.querySelector('[data-calendar-link]');
      const calendarUrl = googleCalendarUrl(proposal);
      if (calendarUrl) {
        calendarLink.href = calendarUrl;
      } else {
        calendarLink.remove();
      }
      node.querySelector('.yes-count').textContent = proposal.voteSummary?.yes || 0;
      node.querySelector('.maybe-count').textContent = proposal.voteSummary?.maybe || 0;
      node.querySelector('.no-count').textContent = proposal.voteSummary?.no || 0;
      renderVoteDetails(node.querySelector('.vote-detail-list'), proposal.votes || []);

      node.querySelector('[data-edit-proposal]').addEventListener('click', () => {
        openProposalDialog(proposal);
      });

      node.querySelector('[data-add-card-subevent]').addEventListener('click', () => {
        openProposalDialog(proposal, { addSubEvent: true });
      });

      node.querySelector('[data-add-card-link]').addEventListener('click', () => {
        openProposalDialog(proposal, { addLink: true });
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
      renderComments(commentList, proposal.comments || [], proposal.id);

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
  const years = [...new Set(proposalsForCurrentView().map(proposalYear))].sort((a, b) => a.localeCompare(b));

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

function renderLocationOptions() {
  const savedLocations = proposals
    .map((proposal) => String(proposal.location || '').trim())
    .filter(Boolean);
  const locations = [...new Set([...DEFAULT_LOCATIONS, ...savedLocations])];

  locationOptions.innerHTML = locations
    .map((location) => `<option value="${escapeHtml(location)}"></option>`)
    .join('');
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
  renderLocationOptions();
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

addSubEventButton.addEventListener('click', () => {
  addSubEventRow();
});

addLinkButton.addEventListener('click', () => {
  addLinkRow();
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
        summary: data.get('summary'),
        subEvents: collectSubEvents(),
        links: collectLinks()
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
