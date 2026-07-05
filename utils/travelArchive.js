import fs from 'fs';
import path from 'path';

const archiveRoot = path.join(process.cwd(), 'local-archive', 'drive');
const manifestPath = path.join(archiveRoot, 'manifest.json');
const textRoot = path.join(archiveRoot, 'text');
const familyTreePath = path.join(process.cwd(), 'data', 'family-tree.json');

const locations = [
  { id: 'las-vegas', name: 'Las Vegas, Nevada', lat: 36.1716, lng: -115.1391, theme: 'cyberpunk', aliases: ['Las Vegas', 'Vegas', 'DEF CON', 'DaveCon'] },
  { id: 'st-louis', name: 'St. Louis, Missouri', lat: 38.627, lng: -90.1994, aliases: ['St. Louis', 'Saint Louis', 'Archon', 'Soulard', 'Urban Chestnut', 'Schlafly', 'Trailhead', 'Lemmons', "Harry's", "BB's", 'Maifest', 'Brewers Heritage Festival', 'MST3K'] },
  { id: 'memphis', name: 'Memphis, Tennessee', lat: 35.1495, lng: -90.049, aliases: ['Memphis', 'BB King'] },
  { id: 'boston', name: 'Boston, Massachusetts', lat: 42.3601, lng: -71.0589, aliases: ['Boston'] },
  { id: 'ireland', name: 'Ireland', lat: 53.4129, lng: -8.2439, aliases: ['Ireland', 'Dublin', 'Galway', 'Cork', 'Belfast'] },
  { id: 'istanbul', name: 'Istanbul, Turkey', lat: 41.0082, lng: 28.9784, aliases: ['Istanbul', 'Turkey'] },
  { id: 'texas', name: 'Texas', lat: 31.9686, lng: -99.9018, aliases: ['Texas', 'Austin', 'Dallas', 'Houston', 'San Antonio'] },
  { id: 'galapagos', name: 'Galapagos Islands, Ecuador', lat: -0.9538, lng: -90.9656, aliases: ['Galapagos', 'Galápagos'] },
  { id: 'germany', name: 'Germany', lat: 51.1657, lng: 10.4515, aliases: ['Germany', 'Berlin', 'Munich'] },
  { id: 'greece', name: 'Greece', lat: 39.0742, lng: 21.8243, aliases: ['Greece', 'Athens'] },
  { id: 'scotland', name: 'Scotland', lat: 56.4907, lng: -4.2026, aliases: ['Scotland', 'Edinburgh', 'Glasgow'] },
  { id: 'florida-keys', name: 'Florida Keys, Florida', lat: 24.5551, lng: -81.78, aliases: ['Florida Keys', 'Key West', 'Keys'] },
  { id: 'turks-caicos', name: 'Turks and Caicos', lat: 21.694, lng: -71.7979, aliases: ['Turks and Caicos'] },
  { id: 'roatan', name: 'Roatan, Honduras', lat: 16.3244, lng: -86.5366, aliases: ['Roatan', 'Roatán'] },
  { id: 'dominica', name: 'Dominica', lat: 15.415, lng: -61.371, aliases: ['Dominica'] },
  { id: 'australia', name: 'Australia', lat: -25.2744, lng: 133.7751, aliases: ['Australia', 'Sydney', 'Melbourne'] },
  { id: 'france', name: 'France', lat: 46.2276, lng: 2.2137, aliases: ['France', 'Paris'] },
  { id: 'seattle', name: 'Seattle, Washington', lat: 47.6062, lng: -122.3321, aliases: ['Seattle', 'Penny Arcade'] },
  { id: 'wyoming', name: 'Wyoming', lat: 43.076, lng: -107.2903, aliases: ['Wyoming'] },
  { id: 'georgia', name: 'Georgia', lat: 32.1656, lng: -82.9001, aliases: ['Georgia'] },
  { id: 'indiana', name: 'Indiana', lat: 40.2672, lng: -86.1349, aliases: ['Indiana'] },
  { id: 'columbus', name: 'Columbus, Ohio', lat: 39.9612, lng: -82.9988, aliases: ['Columbus'] },
  { id: 'peoria', name: 'Peoria, Illinois', lat: 40.6936, lng: -89.589, aliases: ['Peoria'] },
  { id: 'knoxville', name: 'Knoxville, Tennessee', lat: 35.9606, lng: -83.9207, aliases: ['Knox', 'Knoxville'] },
  { id: 'new-orleans', name: 'New Orleans, Louisiana', lat: 29.9511, lng: -90.0715, aliases: ['New Orleans', 'Mardi Gras'] },
  { id: 'nashville', name: 'Nashville, Tennessee', lat: 36.1627, lng: -86.7816, aliases: ['Nashville', 'PhreakNIC'] },
  { id: 'walla-walla', name: 'Walla Walla, Washington', lat: 46.0646, lng: -118.343, aliases: ['Walla'] }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionCount(haystack, alias) {
  const boundary = /^[a-z0-9]/i.test(alias) && /[a-z0-9]$/i.test(alias) ? '\\b' : '';
  const pattern = new RegExp(`${boundary}${escapeRegExp(alias)}${boundary}`, 'gi');
  return (haystack.match(pattern) || []).length;
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function loadDocs() {
  const manifest = loadManifest();
  return manifest.files
    .filter((file) => file.status === 'cached' && file.archivePath)
    .map((file) => {
      const id = file.id;
      const textPath = path.join(textRoot, `${id}.txt`);
      const body = fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8') : '';
      return {
        id,
        title: file.title,
        folder: file.folder,
        url: file.url,
        modifiedTime: file.modifiedTime,
        body
      };
    });
}

function loadFamilyTree() {
  if (!fs.existsSync(familyTreePath)) return [];
  return JSON.parse(fs.readFileSync(familyTreePath, 'utf8'));
}

function snippetFor(body, aliases) {
  const lowerBody = body.toLowerCase();
  const alias = aliases.find((candidate) => lowerBody.includes(candidate.toLowerCase()));
  if (!alias) return '';
  const index = lowerBody.indexOf(alias.toLowerCase());
  const start = Math.max(0, index - 90);
  return body.slice(start, index + alias.length + 140).replace(/\s+/g, ' ').trim();
}

let cachedArchive;

function normalizePersonName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function personIdForName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function firstNamesForTreePeople(treePeople) {
  const counts = new Map();
  treePeople.forEach((person) => {
    const first = normalizePersonName(person.name).split(' ')[0];
    if (first && first.length > 2) counts.set(first.toLowerCase(), (counts.get(first.toLowerCase()) || 0) + 1);
  });
  return counts;
}

function treeCandidates(treePeople) {
  const firstNameCounts = firstNamesForTreePeople(treePeople);
  return treePeople.map((person) => {
    const name = normalizePersonName(person.name);
    const first = name.split(' ')[0];
    const aliases = [name];
    if (first && firstNameCounts.get(first.toLowerCase()) === 1) aliases.push(first);
    return {
      id: `tree-${person.id}`,
      name,
      aliases,
      treePerson: {
        id: person.id,
        name: person.name,
        family: person.family
      }
    };
  });
}

function extractedNameCandidates(docs, existingNames) {
  const ignored = new Set([
    'Google Docs', 'Family Hub', 'DEF CON', 'Dave Con', 'Las Vegas', 'New Orleans',
    'St Louis', 'Saint Louis', 'Florida Keys', 'Turks Caicos', 'United States',
    'Labor Day', 'Memorial Day', 'Columbus Day', 'Presidents Day', 'Mardi Gras',
    'Hacker Jeopardy', 'Red Bull', 'Hot Dogs', 'Jack Daniels', 'Secret Pizza',
    'Sunday Morning'
  ].map((name) => name.toLowerCase()));
  const blockedNameWords = new Set([
    'The', 'And', 'Aunt', 'Uncle', 'Grandma', 'Grandpa', 'Mom', 'Dad', 'Internet',
    'Con', 'Way', 'Day', 'Island', 'Festival', 'Wedding', 'Appendices', 'Revenge',
    'Return', 'Rise', 'Machines', 'Standard', 'Deviation', 'Hotel', 'Airport',
    'Street', 'Road', 'Room', 'Badge', 'Badges', 'Beer', 'Dogs', 'Bull',
    'Video', 'Games', 'Irish', 'Pub', 'Happy', 'Hour', 'Star', 'Trek', 'Fist',
    'Bump', 'Coffee', 'House', 'Escape', 'Breakfast', 'Lunch', 'Dinner',
    'New', 'York', 'With', 'Fuck', 'You'
  ]);
  const seenByName = new Map();
  const namePattern = /\b([A-Z][a-z]{2,}(?:\s+(?:and|&)\s+[A-Z][a-z]{2,}|(?:\s+[A-Z][a-z]{2,}){1,2}))\b/g;

  docs.forEach((doc) => {
    const haystack = `${doc.title}\n${doc.body}`;
    const namesInDoc = new Set();
    for (const match of haystack.matchAll(namePattern)) {
      const name = normalizePersonName(match[1].replace(/\s+and\s+/i, ' '));
      const key = name.toLowerCase();
      if (ignored.has(key) || existingNames.has(key)) continue;
      const words = name.split(' ');
      if (words.some((word) => blockedNameWords.has(word))) continue;
      namesInDoc.add(name);
    }
    namesInDoc.forEach((name) => {
      const key = name.toLowerCase();
      if (!seenByName.has(key)) seenByName.set(key, { name, docs: new Set() });
      seenByName.get(key).docs.add(doc.id);
    });
  });

  return [...seenByName.values()]
    .filter((entry) => entry.docs.size >= 2)
    .map((entry) => ({
      id: `name-${personIdForName(entry.name)}`,
      name: entry.name,
      aliases: [entry.name],
      treePerson: null
    }));
}

function buildPeople(docs) {
  const treePeople = loadFamilyTree();
  const tree = treeCandidates(treePeople);
  const existingNames = new Set(tree.map((person) => person.name.toLowerCase()));
  const candidates = [...tree, ...extractedNameCandidates(docs, existingNames)];

  const people = candidates.map((candidate) => {
    const references = docs
      .map((doc) => {
        const haystack = `${doc.title}\n${doc.body}`;
        const hits = candidate.aliases.reduce((total, alias) => total + mentionCount(haystack, alias), 0);
        if (!hits) return null;
        return {
          id: doc.id,
          title: doc.title,
          folder: doc.folder,
          url: doc.url,
          modifiedTime: doc.modifiedTime,
          hits,
          snippet: snippetFor(doc.body, candidate.aliases)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits || a.title.localeCompare(b.title));

    return {
      id: candidate.id,
      name: candidate.name,
      treePerson: candidate.treePerson,
      references,
      referenceCount: references.length,
      totalHits: references.reduce((total, ref) => total + ref.hits, 0)
    };
  }).filter((person) => person.referenceCount > 0);

  const docToPeople = new Map();
  people.forEach((person) => {
    person.references.forEach((reference) => {
      if (!docToPeople.has(reference.id)) docToPeople.set(reference.id, []);
      docToPeople.get(reference.id).push(person.id);
    });
  });

  const linkWeights = new Map();
  docToPeople.forEach((ids) => {
    const uniqueIds = [...new Set(ids)].sort();
    for (let i = 0; i < uniqueIds.length; i += 1) {
      for (let j = i + 1; j < uniqueIds.length; j += 1) {
        const key = `${uniqueIds[i]}|${uniqueIds[j]}`;
        linkWeights.set(key, (linkWeights.get(key) || 0) + 1);
      }
    }
  });

  const links = [...linkWeights.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('|');
      return { source, target, weight };
    })
    .filter((link) => link.weight >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 260);

  return {
    people: people.sort((a, b) => b.referenceCount - a.referenceCount || a.name.localeCompare(b.name)),
    links
  };
}

export function getTravelArchive() {
  if (cachedArchive) return cachedArchive;

  const docs = loadDocs();
  const docsById = Object.fromEntries(docs.map(({ body, ...doc }) => [doc.id, doc]));
  const markerLocations = locations.map((location) => {
    const refs = docs
      .map((doc) => {
        const haystack = `${doc.title}\n${doc.body}`;
        const hits = location.aliases.reduce((total, alias) => total + mentionCount(haystack, alias), 0);
        if (!hits) return null;
        return {
          id: doc.id,
          title: doc.title,
          folder: doc.folder,
          url: doc.url,
          modifiedTime: doc.modifiedTime,
          hits,
          snippet: snippetFor(doc.body, location.aliases)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits || a.title.localeCompare(b.title));

    return {
      ...location,
      references: refs,
      referenceCount: refs.length,
      totalHits: refs.reduce((total, ref) => total + ref.hits, 0)
    };
  }).filter((location) => location.referenceCount > 0);

  const peopleArchive = buildPeople(docs);

  cachedArchive = {
    generatedAt: loadManifest().generatedAt,
    docs: docsById,
    locations: markerLocations,
    people: peopleArchive.people,
    peopleLinks: peopleArchive.links
  };
  return cachedArchive;
}

export function getTravelLocation(id) {
  return getTravelArchive().locations.find((location) => location.id === id);
}

export function getTravelPerson(id) {
  return getTravelArchive().people.find((person) => person.id === id);
}
