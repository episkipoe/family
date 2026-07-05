const params = new URLSearchParams(window.location.search);
const id = params.get('id') || 'las-vegas';

function terminalLine(reference, index) {
  const row = document.createElement('a');
  row.className = 'vegas-row';
  row.href = reference.url;
  row.innerHTML = `
    <span>${String(index + 1).padStart(2, '0')}</span>
    <strong>${reference.title}</strong>
    <em>${reference.hits} hits</em>
  `;
  return row;
}

async function loadVegas() {
  const response = await fetch(`/api/travel/locations/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Signal lost.');
  return response.json();
}

loadVegas()
  .then(({ location }) => {
    document.querySelector('#vegasSummary').textContent = `${location.referenceCount} archived docs routed through ${location.name}.`;
    const refs = document.querySelector('#vegasRefs');
    location.references.forEach((reference, index) => refs.append(terminalLine(reference, index)));
  })
  .catch((error) => {
    document.querySelector('#vegasSummary').textContent = error.message;
  });
