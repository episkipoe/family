const adminProposalList = document.querySelector('#adminProposalList');

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render(proposals) {
  if (!proposals.length) {
    adminProposalList.innerHTML = '<p class="panel empty-state">No proposals yet.</p>';
    return;
  }

  adminProposalList.innerHTML = proposals
    .slice()
    .sort((a, b) => sortDateValue(a).localeCompare(sortDateValue(b)))
    .map((proposal) => `
      <article class="admin-row" data-proposal-id="${escapeHtml(proposal.id)}">
        <div>
          <p class="year">${escapeHtml(proposal.year)}</p>
          <h2>${escapeHtml(proposal.title)}</h2>
          <p class="meta">${escapeHtml(proposal.location)} | ${escapeHtml(formatDateRange(proposal.startDate, proposal.endDate))}</p>
        </div>
        <button class="danger-action" type="button" data-delete-proposal="${escapeHtml(proposal.id)}">Delete</button>
      </article>
    `).join('');

  adminProposalList.querySelectorAll('[data-delete-proposal]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('[data-proposal-id]');
      const title = row.querySelector('h2').textContent;

      if (!confirm(`Delete "${title}"? This also removes its votes and comments.`)) {
        return;
      }

      try {
        button.disabled = true;
        await api(`/api/family/proposals/${button.dataset.deleteProposal}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        button.disabled = false;
        alert(err.message);
      }
    });
  });
}

async function load() {
  const proposals = await api('/api/family/proposals');
  render(proposals);
}

load().catch((err) => {
  adminProposalList.innerHTML = `<p class="panel empty-state">Could not load proposals: ${escapeHtml(err.message)}</p>`;
});
