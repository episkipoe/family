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

async function loadPerson() {
  const response = await fetch(`/api/travel/people/${encodeURIComponent(id || '')}`);
  if (!response.ok) throw new Error('Person not found.');
  return response.json();
}

loadPerson()
  .then(({ person }) => {
    document.title = `${person.name} Travel References`;
    document.querySelector('#personTitle').textContent = person.name;
    document.querySelector('#personSummary').textContent = `${person.referenceCount} archived docs mention this name.`;
    if (person.treePerson) {
      const wrap = document.querySelector('#treeLinkWrap');
      wrap.hidden = false;
      wrap.innerHTML = `<a class="button-link" href="/tree/tree.html?id=${person.treePerson.id}">View in family tree</a>`;
    }
    const refs = document.querySelector('#personRefs');
    person.references.forEach((reference) => refs.append(referenceCard(reference)));
  })
  .catch(() => {
    document.querySelector('#personTitle').textContent = 'Person not found';
    document.querySelector('#personSummary').textContent = 'Return to the people list and choose another name.';
  });
