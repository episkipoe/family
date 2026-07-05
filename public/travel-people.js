const state = {
  people: [],
  links: [],
  query: ''
};

const svg = document.querySelector('#peopleViz');
const list = document.querySelector('#peopleList');
const search = document.querySelector('#peopleSearch');
const heading = document.querySelector('#peopleHeading');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function personUrl(person) {
  return `/travel-person.html?id=${encodeURIComponent(person.id)}`;
}

function renderList() {
  const query = state.query.toLowerCase();
  const visible = state.people.filter((person) => person.name.toLowerCase().includes(query));
  heading.textContent = `${visible.length} people`;
  list.innerHTML = visible.map((person) => `
    <a class="people-list-item" href="${personUrl(person)}">
      <strong>${escapeHtml(person.name)}</strong>
      <span>${person.referenceCount} docs · ${person.totalHits} mentions${person.treePerson ? ' · family tree' : ''}</span>
    </a>
  `).join('');
}

function initialNodes(people, width, height) {
  const radius = Math.min(width, height) * 0.36;
  return people.slice(0, 70).map((person, index, nodes) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
    return {
      ...person,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: Math.min(22, 7 + Math.sqrt(person.referenceCount) * 2)
    };
  });
}

function layout(nodes, links, width, height) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const activeLinks = links
    .map((link) => ({ ...link, sourceNode: nodeById.get(link.source), targetNode: nodeById.get(link.target) }))
    .filter((link) => link.sourceNode && link.targetNode);

  for (let tick = 0; tick < 240; tick += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const distSq = dx * dx + dy * dy;
        const force = 38 / distSq;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    activeLinks.forEach((link) => {
      const a = link.sourceNode;
      const b = link.targetNode;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = Math.max(46, 150 - link.weight * 12);
      const pull = (distance - target) * 0.006 * Math.min(6, link.weight);
      a.vx += (dx / distance) * pull;
      a.vy += (dy / distance) * pull;
      b.vx -= (dx / distance) * pull;
      b.vy -= (dy / distance) * pull;
    });

    nodes.forEach((node) => {
      node.vx += (width / 2 - node.x) * 0.004;
      node.vy += (height / 2 - node.y) * 0.004;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x = Math.max(28, Math.min(width - 28, node.x + node.vx));
      node.y = Math.max(28, Math.min(height - 28, node.y + node.vy));
    });
  }

  return activeLinks;
}

function renderViz() {
  const box = svg.getBoundingClientRect();
  const width = Math.max(320, box.width || 900);
  const height = Math.max(420, box.height || 560);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const nodes = initialNodes(state.people, width, height);
  const links = layout(nodes, state.links, width, height);

  svg.innerHTML = `
    <g class="people-viz-links">
      ${links.map((link) => `<line x1="${link.sourceNode.x.toFixed(1)}" y1="${link.sourceNode.y.toFixed(1)}" x2="${link.targetNode.x.toFixed(1)}" y2="${link.targetNode.y.toFixed(1)}" stroke-width="${Math.min(7, 1 + link.weight)}"></line>`).join('')}
    </g>
    <g class="people-viz-nodes">
      ${nodes.map((node) => `
        <a href="${personUrl(node)}" aria-label="${escapeHtml(node.name)}">
          <circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${node.r.toFixed(1)}" class="${node.treePerson ? 'is-tree-person' : ''}"></circle>
          <text x="${node.x.toFixed(1)}" y="${(node.y + node.r + 13).toFixed(1)}">${escapeHtml(node.name.split(' ')[0])}</text>
        </a>
      `).join('')}
    </g>
  `;
}

async function loadPeople() {
  const response = await fetch('/api/travel/people');
  if (!response.ok) throw new Error('Unable to load people.');
  return response.json();
}

search.addEventListener('input', () => {
  state.query = search.value.trim();
  renderList();
});

window.addEventListener('resize', () => renderViz());

loadPeople()
  .then(({ people, links }) => {
    state.people = people;
    state.links = links;
    renderList();
    renderViz();
  })
  .catch((error) => {
    heading.textContent = 'People unavailable';
    list.textContent = error.message;
  });
