import fs from 'fs';
import path from 'path';

const archiveRoot = path.join(process.cwd(), 'local-archive', 'drive');
const manifestPath = path.join(archiveRoot, 'manifest.json');
const textRoot = path.join(archiveRoot, 'text');
const familyTreePath = path.join(process.cwd(), 'data', 'family-tree.json');
const overridesPath = path.join(process.cwd(), 'data', 'travel-overrides.json');
const excludedDocIds = new Set([
  '1czXnp5EJXRv_DJrr9x6CFZnsm4vHog9LFzPPOTDOJ-c'
]);

const locations = [
  { id: 'las-vegas', name: 'Las Vegas, Nevada', lat: 36.1716, lng: -115.1391, theme: 'cyberpunk', aliases: ['Las Vegas', 'Vegas', 'DEF CON', 'DaveCon'] },
  { id: 'st-louis', name: 'St. Louis, Missouri', lat: 38.627, lng: -90.1994, aliases: ['St. Louis', 'Saint Louis', 'Archon', 'Soulard', 'Urban Chestnut', 'Schlafly', 'Trailhead', 'Lemmons', "Harry's", "BB's", 'Maifest', 'Brewers Heritage Festival', 'MST3K'] },
  { id: 'creve-coeur', name: 'Creve Coeur, Missouri', lat: 38.6609, lng: -90.4226, aliases: ['Creve Coeur', 'Creve Coeur, Missouri'] },
  { id: 'des-peres', name: 'Des Peres, Missouri', lat: 38.6009, lng: -90.4329, aliases: ['Des Peres', 'Des Peres, Missouri'] },
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
  { id: 'mermet-springs', name: 'Mermet Springs, Belknap, Illinois', lat: 37.3145, lng: -88.9381, aliases: ['Mermet Springs', 'Belknap'] },
  { id: 'columbus', name: 'Columbus, Ohio', lat: 39.9612, lng: -82.9988, aliases: ['Columbus'] },
  { id: 'peoria', name: 'Peoria, Illinois', lat: 40.6936, lng: -89.589, aliases: ['Peoria'] },
  { id: 'galesburg', name: 'Galesburg, Illinois', lat: 40.9478, lng: -90.3712, aliases: ['Galesburg', 'Knox'] },
  { id: 'new-orleans', name: 'New Orleans, Louisiana', lat: 29.9511, lng: -90.0715, aliases: ['New Orleans', 'Mardi Gras'] },
  { id: 'nashville', name: 'Nashville, Tennessee', lat: 36.1627, lng: -86.7816, aliases: ['Nashville', 'PhreakNIC'] }
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
    .filter((file) => file.status === 'cached' && file.archivePath && !excludedDocIds.has(file.id))
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

function defaultOverrides() {
  return {
    people: {},
    locations: {},
    addedPeople: [],
    addedLocations: []
  };
}

function loadOverrides() {
  if (!fs.existsSync(overridesPath)) return defaultOverrides();
  return { ...defaultOverrides(), ...JSON.parse(fs.readFileSync(overridesPath, 'utf8')) };
}

function saveOverrides(overrides) {
  fs.mkdirSync(path.dirname(overridesPath), { recursive: true });
  fs.writeFileSync(overridesPath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');
  cachedArchive = null;
  return loadOverrides();
}

function cleanManualId(value, prefix) {
  const id = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return id || `${prefix}-${Date.now()}`;
}

function docReferenceFromId(docId, docsById, fallback = {}) {
  const doc = docsById[docId];
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    folder: doc.folder,
    url: doc.url,
    modifiedTime: doc.modifiedTime,
    hits: Number(fallback.hits) || 1,
    snippet: fallback.snippet || ''
  };
}

function applyReferenceOverrides(entity, override, docsById) {
  const removeIds = new Set(Array.isArray(override?.referenceRemoves) ? override.referenceRemoves : []);
  const existingRefs = entity.references.filter((reference) => !removeIds.has(reference.id));
  const existingIds = new Set(existingRefs.map((reference) => reference.id));
  const addedRefs = (Array.isArray(override?.referenceAdds) ? override.referenceAdds : [])
    .filter((docId) => !removeIds.has(docId))
    .filter((docId) => !existingIds.has(docId))
    .map((docId) => docReferenceFromId(docId, docsById))
    .filter(Boolean);
  const references = [...existingRefs, ...addedRefs]
    .sort((a, b) => b.hits - a.hits || a.title.localeCompare(b.title));
  return {
    ...entity,
    references,
    referenceCount: references.length,
    totalHits: references.reduce((total, ref) => total + ref.hits, 0)
  };
}

function applyLocationOverrides(extractedLocations, overrides, docsById) {
  const edited = extractedLocations
    .map((location) => {
      const override = overrides.locations?.[location.id];
      if (override?.hidden) return null;
      const updated = {
        ...location,
        ...(override?.name ? { name: override.name } : {}),
        ...(Number.isFinite(Number(override?.lat)) ? { lat: Number(override.lat) } : {}),
        ...(Number.isFinite(Number(override?.lng)) ? { lng: Number(override.lng) } : {}),
        ...(override?.theme !== undefined ? { theme: override.theme } : {})
      };
      return applyReferenceOverrides(updated, override, docsById);
    })
    .filter((location) => location && location.referenceCount > 0);

  const added = (overrides.addedLocations || [])
    .filter((location) => !location.hidden)
    .map((location) => {
      const references = (location.referenceIds || [])
        .map((docId) => docReferenceFromId(docId, docsById))
        .filter(Boolean);
      return {
        id: location.id,
        name: location.name,
        lat: Number(location.lat) || 0,
        lng: Number(location.lng) || 0,
        theme: location.theme || '',
        aliases: [],
        references,
        referenceCount: references.length,
        totalHits: references.reduce((total, ref) => total + ref.hits, 0),
        manual: true
      };
    })
    .filter((location) => location.name && location.referenceCount > 0);

  return [...edited, ...added].sort((a, b) => b.referenceCount - a.referenceCount || a.name.localeCompare(b.name));
}

function applyPeopleOverrides(extractedPeople, overrides, docsById) {
  const edited = extractedPeople
    .map((person) => {
      const override = overrides.people?.[person.id];
      if (override?.hidden) return null;
      const updated = {
        ...person,
        ...(override?.name ? { name: override.name } : {})
      };
      return applyReferenceOverrides(updated, override, docsById);
    })
    .filter((person) => person && person.referenceCount > 0);

  const added = (overrides.addedPeople || [])
    .filter((person) => !person.hidden)
    .map((person) => {
      const references = (person.referenceIds || [])
        .map((docId) => docReferenceFromId(docId, docsById))
        .filter(Boolean);
      return {
        id: person.id,
        name: person.name,
        treePerson: person.treePerson || null,
        references,
        referenceCount: references.length,
        totalHits: references.reduce((total, ref) => total + ref.hits, 0),
        manual: true
      };
    })
    .filter((person) => person.name && person.referenceCount > 0);

  return [...edited, ...added].sort((a, b) => b.referenceCount - a.referenceCount || a.name.localeCompare(b.name));
}

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
    'Sunday Morning', 'Creve Coeur', 'Mermet Springs', 'Des Peres'
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

function buildPeopleLinks(people) {
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

  return [...linkWeights.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('|');
      return { source, target, weight };
    })
    .filter((link) => link.weight >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 260);
}

export function getTravelArchive() {
  if (cachedArchive) return cachedArchive;

  const docs = loadDocs();
  const docsById = Object.fromEntries(docs.map(({ body, ...doc }) => [doc.id, doc]));
  const overrides = loadOverrides();
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
  const people = applyPeopleOverrides(peopleArchive.people, overrides, docsById);

  cachedArchive = {
    generatedAt: loadManifest().generatedAt,
    docs: docsById,
    locations: applyLocationOverrides(markerLocations, overrides, docsById),
    people,
    peopleLinks: buildPeopleLinks(people),
    overrides
  };
  return cachedArchive;
}

export function getTravelLocation(id) {
  return getTravelArchive().locations.find((location) => location.id === id);
}

export function getTravelPerson(id) {
  return getTravelArchive().people.find((person) => person.id === id);
}

export function getTravelAdminData() {
  const archive = getTravelArchive();
  return {
    docs: Object.values(archive.docs).sort((a, b) => a.title.localeCompare(b.title)),
    locations: archive.locations,
    people: archive.people,
    overrides: archive.overrides
  };
}

export function getDefconWriteups() {
  const archive = getTravelArchive();
  return Object.values(archive.docs)
    .filter((doc) => /\bDEF CON\b/i.test(doc.title))
    .sort((a, b) => {
      const yearDiff = yearFromTitle(a.title) - yearFromTitle(b.title);
      if (yearDiff) return yearDiff;
      return defconFromTitle(a.title) - defconFromTitle(b.title) || a.title.localeCompare(b.title);
    });
}

function yearFromTitle(title) {
  return Number(String(title).match(/\b(20\d{2}|19\d{2})\b/)?.[1] || 0);
}

function defconFromTitle(title) {
  return Number(String(title).match(/DEF CON\s+(\d+)/i)?.[1] || 0);
}

export function saveTravelAdminEntity(kind, id, body) {
  const overrides = loadOverrides();
  const manualCollection = kind === 'people' ? overrides.addedPeople : overrides.addedLocations;
  const manual = manualCollection.find((entry) => entry.id === id);
  if (manual) {
    manual.name = cleanStringLocal(body.name, 120) || manual.name;
    manual.referenceIds = Array.isArray(body.referenceAdds) ? body.referenceAdds : manual.referenceIds || [];
    if (kind === 'locations') {
      manual.lat = Number(body.lat) || 0;
      manual.lng = Number(body.lng) || 0;
      manual.theme = cleanStringLocal(body.theme, 40);
    }
    return saveOverrides(overrides);
  }

  const collection = kind === 'people' ? overrides.people : overrides.locations;
  const existing = collection[id] || {};
  collection[id] = {
    ...existing,
    ...body,
    referenceAdds: Array.isArray(body.referenceAdds) ? body.referenceAdds : existing.referenceAdds || [],
    referenceRemoves: Array.isArray(body.referenceRemoves) ? body.referenceRemoves : existing.referenceRemoves || []
  };
  return saveOverrides(overrides);
}

function mergeUniqueIds(...groups) {
  const seen = new Set();
  const ids = [];
  groups.flat().forEach((id) => {
    const cleanId = cleanStringLocal(id, 120);
    if (!cleanId || seen.has(cleanId)) return;
    seen.add(cleanId);
    ids.push(cleanId);
  });
  return ids;
}

export function migrateTravelAdminPerson(sourceId, targetId) {
  const sourceKey = cleanStringLocal(sourceId, 120);
  const targetKey = cleanStringLocal(targetId, 120);
  if (!sourceKey || !targetKey || sourceKey === targetKey) {
    return { error: 'Choose two different people.' };
  }

  const archive = getTravelArchive();
  const source = archive.people.find((person) => person.id === sourceKey);
  const target = archive.people.find((person) => person.id === targetKey);
  if (!source) return { error: 'Source person was not found.' };
  if (!target) return { error: 'Target person was not found.' };

  const overrides = loadOverrides();
  const sourceOverride = overrides.people[sourceKey] || {};
  const targetOverride = overrides.people[targetKey] || {};
  const sourceManual = overrides.addedPeople.find((person) => person.id === sourceKey);
  const targetManual = overrides.addedPeople.find((person) => person.id === targetKey);
  const sourceReferenceIds = (source.references || []).map((reference) => reference.id);
  const sourceReferenceIdSet = new Set(sourceReferenceIds);
  const targetReferenceRemoves = (Array.isArray(targetOverride.referenceRemoves) ? targetOverride.referenceRemoves : [])
    .filter((id) => !sourceReferenceIdSet.has(id));

  if (targetManual) {
    targetManual.referenceIds = mergeUniqueIds(targetManual.referenceIds, sourceReferenceIds);
  } else {
    overrides.people[targetKey] = {
      ...targetOverride,
      referenceAdds: mergeUniqueIds(targetOverride.referenceAdds, sourceReferenceIds),
      referenceRemoves: targetReferenceRemoves
    };
  }

  if (sourceManual) {
    sourceManual.hidden = true;
  } else {
    overrides.people[sourceKey] = {
      ...sourceOverride,
      hidden: true,
      referenceAdds: Array.isArray(sourceOverride.referenceAdds) ? sourceOverride.referenceAdds : [],
      referenceRemoves: mergeUniqueIds(sourceOverride.referenceRemoves, sourceReferenceIds)
    };
  }

  saveOverrides(overrides);
  return { migrated: true, source, target };
}

export function hideTravelAdminEntity(kind, id) {
  const overrides = loadOverrides();
  const manualCollection = kind === 'people' ? overrides.addedPeople : overrides.addedLocations;
  const manual = manualCollection.find((entry) => entry.id === id);
  if (manual) {
    manual.hidden = true;
    return saveOverrides(overrides);
  }

  const collection = kind === 'people' ? overrides.people : overrides.locations;
  collection[id] = { ...(collection[id] || {}), hidden: true };
  return saveOverrides(overrides);
}

export function addTravelAdminEntity(kind, body) {
  const overrides = loadOverrides();
  const idPrefix = kind === 'people' ? 'manual-person' : 'manual-place';
  const entry = {
    id: cleanManualId(body.id || body.name, idPrefix),
    name: cleanStringLocal(body.name, 120),
    referenceIds: Array.isArray(body.referenceIds) ? body.referenceIds : []
  };
  if (kind === 'people') {
    overrides.addedPeople.push({
      ...entry,
      treePerson: body.treePerson || null
    });
  } else {
    overrides.addedLocations.push({
      ...entry,
      lat: Number(body.lat) || 0,
      lng: Number(body.lng) || 0,
      theme: cleanStringLocal(body.theme, 40)
    });
  }
  return saveOverrides(overrides);
}

export function removeTravelAdminEntity(kind, id) {
  const overrides = loadOverrides();
  if (kind === 'people') {
    overrides.addedPeople = overrides.addedPeople.filter((person) => person.id !== id);
    delete overrides.people[id];
  } else {
    overrides.addedLocations = overrides.addedLocations.filter((location) => location.id !== id);
    delete overrides.locations[id];
  }
  return saveOverrides(overrides);
}

function cleanStringLocal(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}
