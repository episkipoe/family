const form = document.querySelector('#travelSearchForm');
const input = document.querySelector('#travelSearchInput');
const summary = document.querySelector('#travelSearchSummary');
const results = document.querySelector('#travelSearchResults');
const cloud = document.querySelector('#travelWordCloud');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function cloudMarkup(words) {
  if (!words.length) return '<p class="meta">No cloud terms yet.</p>';
  const max = Math.max(...words.map((entry) => entry.count));
  return words.map((entry) => {
    const size = 0.84 + (entry.count / max) * 1.1;
    return `<span style="font-size:${size.toFixed(2)}rem">${escapeHtml(entry.word)}</span>`;
  }).join('');
}

function resultMarkup(result) {
  return `
    <article class="travel-result-card">
      <div class="proposal-topline">
        <div>
          <span class="year">${escapeHtml(result.folder)}</span>
          <h2><a href="${escapeHtml(result.url)}">${escapeHtml(result.title)}</a></h2>
        </div>
        <span class="meta">${result.matchCount} matches</span>
      </div>
      <div class="travel-snippets">
        ${result.snippets.map((snippet) => `<p>${snippet}</p>`).join('')}
      </div>
    </article>
  `;
}

async function runSearch(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    summary.textContent = 'Enter a search term';
    results.innerHTML = '';
    cloud.innerHTML = cloudMarkup([]);
    return;
  }

  summary.textContent = 'Searching...';
  results.innerHTML = '';
  const response = await fetch(`/api/travel/search?q=${encodeURIComponent(cleanQuery)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Search failed.');

  summary.textContent = `${data.results.length} documents · ${data.totalMatches} matches`;
  cloud.innerHTML = cloudMarkup(data.cloud);
  results.innerHTML = data.results.length
    ? data.results.map(resultMarkup).join('')
    : '<p class="empty-state panel">No matching documents.</p>';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value;
  const params = new URLSearchParams(window.location.search);
  params.set('q', query);
  window.history.replaceState(null, '', `travel-search.html?${params}`);
  runSearch(query).catch((error) => {
    summary.textContent = 'Search unavailable';
    results.innerHTML = `<p class="empty-state panel">${escapeHtml(error.message)}</p>`;
  });
});

const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
input.value = initialQuery;
runSearch(initialQuery).catch((error) => {
  summary.textContent = 'Search unavailable';
  results.innerHTML = `<p class="empty-state panel">${escapeHtml(error.message)}</p>`;
});
