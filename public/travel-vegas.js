function terminalLine(reference, index) {
  const row = document.createElement('a');
  row.className = 'vegas-row';
  row.href = reference.url;
  row.innerHTML = `
    <span>${yearFor(reference.title) || String(index + 1).padStart(2, '0')}</span>
    <strong>${reference.title}</strong>
    <em>write-up</em>
  `;
  return row;
}

function yearFor(title) {
  return title.match(/\b(20\d{2}|19\d{2})\b/)?.[1] || '';
}

function defconNumber(title) {
  return Number(title.match(/DEF CON\s+(\d+)/i)?.[1] || 0);
}

function chronologicalDefconRefs(references) {
  return references
    .filter((reference) => /\bDEF CON\b/i.test(reference.title))
    .sort((a, b) => {
      const yearDiff = Number(yearFor(a.title) || 0) - Number(yearFor(b.title) || 0);
      if (yearDiff) return yearDiff;
      return defconNumber(a.title) - defconNumber(b.title) || a.title.localeCompare(b.title);
    });
}

async function loadVegas() {
  const response = await fetch('/api/travel/defcon-writeups');
  if (!response.ok) throw new Error('Signal lost.');
  return response.json();
}

loadVegas()
  .then(({ writeups }) => {
    writeups = chronologicalDefconRefs(writeups);
    document.querySelector('#vegasSummary').textContent = `${writeups.length} DEF CON write-ups in chronological order.`;
    const refs = document.querySelector('#vegasRefs');
    writeups.forEach((reference, index) => refs.append(terminalLine(reference, index)));
  })
  .catch((error) => {
    document.querySelector('#vegasSummary').textContent = error.message;
  });
