const params = new URLSearchParams(window.location.search);
const id = params.get('id');

function referenceCard(reference) {
  const card = document.createElement('a');
  card.className = 'reference-card';
  card.href = reference.url;
  card.innerHTML = `
    <span class="year">${reference.folder}</span>
    <h2>${reference.title}</h2>
    <p class="meta">${reference.hits} mentions</p>
    ${reference.snippet ? `<p>${reference.snippet}</p>` : ''}
  `;
  return card;
}

async function loadCollection() {
  const response = await fetch(`/api/travel/locations/${encodeURIComponent(id || '')}`);
  if (!response.ok) throw new Error('Collection not found.');
  return response.json();
}

loadCollection()
  .then(({ location }) => {
    document.title = `${location.name} Travel Collection`;
    document.querySelector('#collectionTitle').textContent = location.name;
    document.querySelector('#collectionSummary').textContent = `${location.referenceCount} archived docs cluster around this location.`;
    const refs = document.querySelector('#collectionRefs');
    location.references.forEach((reference) => refs.append(referenceCard(reference)));
  })
  .catch(() => {
    document.querySelector('#collectionTitle').textContent = 'Collection not found';
    document.querySelector('#collectionSummary').textContent = 'Return to the map and choose another marker.';
  });
