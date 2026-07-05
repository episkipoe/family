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

async function loadPlace() {
  const response = await fetch(`/api/travel/locations/${encodeURIComponent(id || '')}`);
  if (!response.ok) throw new Error('Location not found.');
  return response.json();
}

loadPlace()
  .then(({ location }) => {
    document.title = `${location.name} Travel References`;
    document.querySelector('#placeTitle').textContent = location.name;
    document.querySelector('#placeSummary').textContent = `${location.referenceCount} archived docs mention this place.`;
    const refs = document.querySelector('#placeRefs');
    location.references.forEach((reference) => refs.append(referenceCard(reference)));
  })
  .catch(() => {
    document.querySelector('#placeTitle').textContent = 'Location not found';
    document.querySelector('#placeSummary').textContent = 'Return to the map and choose another marker.';
  });
