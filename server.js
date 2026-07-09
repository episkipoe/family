import express from 'express';
import http from 'http';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';
import { getData, initStorage, setData, storageMode } from './storage.js';
import * as pirateVoyage from './utils/pirates/pirateVoyage.js';
import * as resolveSignal from './utils/resolveSignal.js';
import * as treasureHold from './utils/treasure-hold/treasureHold.js';
import {
  addTravelAdminEntity,
  getDefconWriteups,
  getTravelAdminData,
  getTravelArchive,
  getTravelLocation,
  getTravelPerson,
  hideTravelAdminEntity,
  migrateTravelAdminPerson,
  removeTravelAdminEntity,
  saveTravelAdminEntity,
  searchTravelDocuments
} from './utils/travelArchive.js';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;
const FAMILY_PLACE_ID = 'family';
const FAMILY_PLACE = {
  id: FAMILY_PLACE_ID,
  name: 'Family Game Table',
  lat: 0,
  lng: 0
};
const gameUsers = {};
const gamePlaces = {
  [FAMILY_PLACE_ID]: FAMILY_PLACE
};

app.use(express.json({ limit: '200kb' }));
app.get(['/index.html', '/planner.html'], (req, res) => res.redirect(301, '/planning/'));
app.get('/archive.html', (req, res) => res.redirect(301, '/planning/archive.html'));
app.get('/meal-planning.html', (req, res) => res.redirect(301, '/planning/meal-planning.html'));
app.get('/recipes.html', (req, res) => res.redirect(301, '/planning/recipes.html'));
app.get('/admin.html', (req, res) => res.redirect(301, '/planning/admin.html'));
app.use(express.static('public'));
app.use('/tree', express.static('tree'));

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function gameUserFromSocket(socket) {
  const userId = cleanString(socket.handshake.auth?.userId || socket.id, 100);
  const name = cleanString(socket.handshake.auth?.userName || 'Player', 80) || 'Player';

  gameUsers[userId] = {
    ...(gameUsers[userId] || {}),
    userId,
    name,
    lat: 0,
    lng: 0,
    visible: true,
    lastActiveAt: Date.now()
  };

  return gameUsers[userId];
}

function logGameEvent(message) {
  console.log(`[games] ${message}`);
}

function normalizeUserName(value) {
  return cleanString(value, 80).replace(/\s+/g, ' ');
}

function voteIdentityKey(userId, voteEntry) {
  const userName = typeof voteEntry === 'string' ? '' : normalizeUserName(voteEntry?.userName);
  return userName ? `name:${userName.toLowerCase()}` : `id:${userId}`;
}

function voteValue(voteEntry) {
  return typeof voteEntry === 'string' ? voteEntry : voteEntry?.vote;
}

function canonicalVotes(votesByProposal, proposalId) {
  const votes = votesByProposal[proposalId] || {};
  const votesByIdentity = new Map();

  Object.entries(votes).forEach(([userId, voteEntry]) => {
    const vote = voteValue(voteEntry);
    if (!['yes', 'maybe', 'no'].includes(vote)) return;
    const userName = typeof voteEntry === 'string'
      ? 'Unknown voter'
      : normalizeUserName(voteEntry?.userName || 'Unknown voter');

    votesByIdentity.set(voteIdentityKey(userId, voteEntry), {
      userId,
      userName,
      vote
    });
  });

  return [...votesByIdentity.values()];
}

function summarizeVotes(votesByProposal, proposalId) {
  return canonicalVotes(votesByProposal, proposalId).reduce((acc, voteEntry) => {
    const vote = voteEntry.vote;
    if (!['yes', 'maybe', 'no'].includes(vote)) return acc;
    acc[vote] = (acc[vote] || 0) + 1;
    return acc;
  }, { yes: 0, maybe: 0, no: 0 });
}

function voteDetails(votesByProposal, proposalId) {
  return canonicalVotes(votesByProposal, proposalId)
    .sort((a, b) => a.userName.localeCompare(b.userName));
}

function cleanSubEvents(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((event) => ({
      title: cleanString(event?.title, 120),
      date: cleanString(event?.date, 20),
      time: cleanString(event?.time, 10)
    }))
    .filter((event) => event.title);
}

function cleanLinks(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((link) => ({
      text: cleanString(link?.text, 120),
      url: cleanString(link?.url, 500)
    }))
    .filter((link) => link.text && link.url);
}

function cleanUrl(value) {
  const url = cleanString(value, 500);
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function recipeFromBody(body) {
  const title = cleanString(body.title, 120);
  const link = cleanUrl(body.link);

  if (!title) {
    return { error: 'title is required.' };
  }

  return { title, link };
}

function mealPlanFromBody(body) {
  const date = cleanString(body.date, 20);
  const mealType = cleanString(body.mealType, 20).toLowerCase();
  const recipeId = cleanString(body.recipeId, 100);
  const title = cleanString(body.title, 120);
  const link = cleanUrl(body.link);
  const notes = cleanString(body.notes, 500);

  if (!date || !['breakfast', 'lunch', 'dinner', 'other'].includes(mealType)) {
    return { error: 'date and mealType of breakfast/lunch/dinner/other are required.' };
  }

  if (!recipeId && !title) {
    return { error: 'Choose a meal or add a new meal title.' };
  }

  return { date, mealType, recipeId, title, link, notes };
}

function proposalFromBody(body, existing = {}) {
  const title = cleanString(body.title, 120);
  const location = cleanString(body.location, 120);
  const startDate = cleanString(body.startDate, 20);
  const endDate = cleanString(body.endDate, 20);
  const fallbackYear = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
  const year = Number(body.year || fallbackYear);

  if (!title || !location) {
    return { error: 'title and location are required.' };
  }

  return {
    year,
    title,
    location,
    startDate,
    endDate,
    subEvents: cleanSubEvents(body.subEvents),
    links: cleanLinks(body.links),
    status: cleanString(body.status || existing.status || 'active', 40),
    summary: cleanString(body.summary, 1000)
  };
}

function nullablePersonId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : NaN;
}

function hasPersonId(value) {
  return value !== null && value !== undefined;
}

function cleanLocations(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);
  const seen = new Set();
  const locations = [];

  values.forEach((entry) => {
    const location = cleanString(entry, 120);
    const key = location.toLowerCase();
    if (!location || seen.has(key)) return;
    seen.add(key);
    locations.push(location);
  });

  return locations;
}

function locationValueFromBody(value) {
  const locations = cleanLocations(value);
  if (locations.length > 1) return locations;
  return locations[0] || '';
}

function familyTreePersonFromBody(body, nextId) {
  const name = cleanString(body.name, 120);
  const family = cleanString(body.family, 120);
  const gender = cleanString(body.gender, 10);
  const birthDate = cleanString(body.birthDate, 40);
  const deathDate = cleanString(body.deathDate, 40);
  const marriageDate = cleanString(body.marriageDate, 40);
  const location = locationValueFromBody(body.location);
  const partnerId = nullablePersonId(body.partnerId);
  const parent1Id = nullablePersonId(body.parent1Id);
  const parent2Id = nullablePersonId(body.parent2Id);

  if (!name) return { error: 'name is required.' };
  if (!family) return { error: 'family is required.' };
  if (gender && !['F', 'M'].includes(gender)) return { error: 'gender must be F, M, or blank.' };
  if ([partnerId, parent1Id, parent2Id].some(Number.isNaN)) return { error: 'Related person ids must be zero or positive numbers.' };
  if (hasPersonId(parent1Id) && parent1Id === parent2Id) return { error: 'Parent 1 and Parent 2 must be different people.' };
  if (hasPersonId(partnerId) && [parent1Id, parent2Id].includes(partnerId)) return { error: 'Partner cannot also be a parent.' };

  return {
    id: nextId,
    name,
    ...(gender ? { gender } : {}),
    family,
    ...(birthDate ? { birthDate } : {}),
    ...(deathDate ? { deathDate } : {}),
    ...(marriageDate ? { marriageDate } : {}),
    ...(location ? { location } : {}),
    ...(hasPersonId(partnerId) ? { partnerId } : {}),
    parent1Id,
    parent2Id
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: storageMode() });
});

app.get('/api/travel/locations', (req, res, next) => {
  try {
    const archive = getTravelArchive();
    res.json({
      generatedAt: archive.generatedAt,
      locations: archive.locations.map(({ aliases, references, ...location }) => ({
        ...location,
        aliases,
        references: references.slice(0, 6).map(({ snippet, ...reference }) => reference)
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/locations/:id', (req, res, next) => {
  try {
    const location = getTravelLocation(req.params.id);
    if (!location) {
      res.status(404).json({ error: 'Location not found.' });
      return;
    }
    res.json({ location });
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/people', (req, res, next) => {
  try {
    const archive = getTravelArchive();
    const people = archive.people.map(({ references, ...person }) => ({
      ...person,
      references: references.slice(0, 4).map(({ snippet, ...reference }) => reference)
    }));
    res.json({
      generatedAt: archive.generatedAt,
      people,
      links: archive.peopleLinks
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/people/:id', (req, res, next) => {
  try {
    const person = getTravelPerson(req.params.id);
    if (!person) {
      res.status(404).json({ error: 'Person not found.' });
      return;
    }
    res.json({ person });
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/defcon-writeups', (req, res, next) => {
  try {
    res.json({ writeups: getDefconWriteups() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/search', (req, res, next) => {
  try {
    res.json(searchTravelDocuments(cleanString(req.query.q, 120)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/travel/admin', (req, res, next) => {
  try {
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.post('/api/travel/admin/:kind', (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!['people', 'locations'].includes(kind)) {
      res.status(400).json({ error: 'kind must be people or locations.' });
      return;
    }
    const name = cleanString(req.body.name, 120);
    const referenceIds = Array.isArray(req.body.referenceIds)
      ? req.body.referenceIds.map((id) => cleanString(id, 120)).filter(Boolean)
      : [];
    if (!name) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }
    addTravelAdminEntity(kind, {
      ...req.body,
      name,
      referenceIds
    });
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.put('/api/travel/admin/:kind/:id', (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!['people', 'locations'].includes(kind)) {
      res.status(400).json({ error: 'kind must be people or locations.' });
      return;
    }
    saveTravelAdminEntity(kind, req.params.id, {
      name: cleanString(req.body.name, 120),
      lat: req.body.lat,
      lng: req.body.lng,
      theme: cleanString(req.body.theme, 40),
      hidden: Boolean(req.body.hidden),
      referenceAdds: Array.isArray(req.body.referenceAdds) ? req.body.referenceAdds.map((id) => cleanString(id, 120)).filter(Boolean) : [],
      referenceRemoves: Array.isArray(req.body.referenceRemoves) ? req.body.referenceRemoves.map((id) => cleanString(id, 120)).filter(Boolean) : []
    });
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.post('/api/travel/admin/people/:id/migrate', (req, res, next) => {
  try {
    const targetId = cleanString(req.body.targetId, 120);
    const result = migrateTravelAdminPerson(req.params.id, targetId);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/travel/admin/:kind/:id', (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!['people', 'locations'].includes(kind)) {
      res.status(400).json({ error: 'kind must be people or locations.' });
      return;
    }
    hideTravelAdminEntity(kind, req.params.id);
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/travel/admin/:kind/:id/override', (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!['people', 'locations'].includes(kind)) {
      res.status(400).json({ error: 'kind must be people or locations.' });
      return;
    }
    removeTravelAdminEntity(kind, req.params.id);
    res.json(getTravelAdminData());
  } catch (error) {
    next(error);
  }
});

app.get('/travel/go/:id', (req, res, next) => {
  try {
    const location = getTravelLocation(req.params.id);
    if (!location) {
      res.redirect('/travel.html');
      return;
    }
    if (location.theme === 'cyberpunk') {
      res.redirect(`/travel-vegas.html?id=${encodeURIComponent(location.id)}`);
      return;
    }
    if (location.referenceCount > 8) {
      res.redirect(`/travel-collection.html?id=${encodeURIComponent(location.id)}`);
      return;
    }
    if (location.referenceCount === 1) {
      res.redirect(location.references[0].url);
      return;
    }
    res.redirect(`/travel-place.html?id=${encodeURIComponent(location.id)}`);
  } catch (error) {
    next(error);
  }
});

app.get('/api/family/tree', async (req, res, next) => {
  try {
    res.json(await getData('familyTree'));
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/tree', async (req, res, next) => {
  try {
    const familyTree = await getData('familyTree');
    const nextId = Math.max(0, ...familyTree.map((person) => Number(person.id) || 0)) + 1;
    const person = familyTreePersonFromBody(req.body.person || req.body, nextId);
    if (person.error) return res.status(400).json({ error: person.error });

    const existingIds = new Set(familyTree.map((entry) => entry.id));
    const relationIds = [person.partnerId, person.parent1Id, person.parent2Id].filter(hasPersonId);
    const missingRelationId = relationIds.find((id) => !existingIds.has(id));
    if (missingRelationId) return res.status(400).json({ error: `Related person ${missingRelationId} was not found.` });

    const childId = nullablePersonId(req.body.childId);
    const childParentField = cleanString(req.body.childParentField, 20);
    let updatedChild = null;

    if (Number.isNaN(childId)) return res.status(400).json({ error: 'childId must be zero or a positive number.' });
    if (hasPersonId(childId)) {
      if (!['parent1Id', 'parent2Id'].includes(childParentField)) {
        return res.status(400).json({ error: 'childParentField must be parent1Id or parent2Id.' });
      }

      if (relationIds.includes(childId)) {
        return res.status(400).json({ error: "Child cannot also be selected as this person's parent or partner." });
      }

      const childIndex = familyTree.findIndex((entry) => entry.id === childId);
      if (childIndex === -1) return res.status(400).json({ error: 'Selected child was not found.' });
      const existingParentId = familyTree[childIndex][childParentField];
      if (existingParentId !== null && existingParentId !== undefined) {
        return res.status(400).json({ error: `Selected child's ${childParentField} is already set.` });
      }

      updatedChild = {
        ...familyTree[childIndex],
        [childParentField]: person.id
      };
      familyTree[childIndex] = updatedChild;
    }

    familyTree.push(person);
    await setData('familyTree', familyTree);
    res.status(201).json({ person, updatedChild, familyTree });
  } catch (err) {
    next(err);
  }
});

app.put('/api/family/tree/:id', async (req, res, next) => {
  try {
    const personId = Number(req.params.id);
    if (!Number.isInteger(personId) || personId < 0) {
      return res.status(400).json({ error: 'Person id must be a positive number.' });
    }

    const familyTree = await getData('familyTree');
    const personIndex = familyTree.findIndex((entry) => entry.id === personId);
    if (personIndex === -1) return res.status(404).json({ error: 'Person not found.' });

    const person = familyTreePersonFromBody(req.body.person || req.body, personId);
    if (person.error) return res.status(400).json({ error: person.error });

    const existingIds = new Set(familyTree.map((entry) => entry.id));
    const relationIds = [person.partnerId, person.parent1Id, person.parent2Id].filter(hasPersonId);
    if (relationIds.includes(personId)) {
      return res.status(400).json({ error: 'A person cannot be their own parent or partner.' });
    }
    const missingRelationId = relationIds.find((id) => !existingIds.has(id));
    if (missingRelationId) return res.status(400).json({ error: `Related person ${missingRelationId} was not found.` });

    const updatedPerson = {
      ...familyTree[personIndex],
      ...person
    };
    ['gender', 'birthDate', 'deathDate', 'marriageDate', 'location'].forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(person, field)) delete updatedPerson[field];
    });
    if (!Object.prototype.hasOwnProperty.call(person, 'partnerId')) updatedPerson.partnerId = null;

    familyTree[personIndex] = updatedPerson;

    await setData('familyTree', familyTree);
    res.json({ person: familyTree[personIndex], familyTree });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/family/tree/:id', async (req, res, next) => {
  try {
    const personId = Number(req.params.id);
    if (!Number.isInteger(personId) || personId < 0) {
      return res.status(400).json({ error: 'Person id must be a positive number.' });
    }

    const familyTree = await getData('familyTree');
    const person = familyTree.find((entry) => entry.id === personId);
    if (!person) return res.status(404).json({ error: 'Person not found.' });

    const nextFamilyTree = familyTree
      .filter((entry) => entry.id !== personId)
      .map((entry) => ({
        ...entry,
        ...(entry.partnerId === personId ? { partnerId: null } : {}),
        ...(entry.parent1Id === personId ? { parent1Id: null } : {}),
        ...(entry.parent2Id === personId ? { parent2Id: null } : {})
      }));

    await setData('familyTree', nextFamilyTree);
    res.json({ deleted: true, person, familyTree: nextFamilyTree });
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/tree/:id/links', async (req, res, next) => {
  try {
    const personId = Number(req.params.id);
    if (!Number.isInteger(personId) || personId < 0) {
      return res.status(400).json({ error: 'Person id must be a positive number.' });
    }

    const title = cleanString(req.body.title, 120);
    const url = cleanUrl(req.body.url);
    if (!title || !url) return res.status(400).json({ error: 'Link title and url are required.' });

    const familyTree = await getData('familyTree');
    const personIndex = familyTree.findIndex((entry) => entry.id === personId);
    if (personIndex === -1) return res.status(404).json({ error: 'Person not found.' });

    const person = familyTree[personIndex];
    const nextLinks = [
      ...(Array.isArray(person.links) ? person.links : []),
      {
        id: nanoid(12),
        title,
        url,
        createdAt: new Date().toISOString()
      }
    ];

    familyTree[personIndex] = {
      ...person,
      links: nextLinks
    };

    await setData('familyTree', familyTree);
    res.status(201).json({ person: familyTree[personIndex], familyTree });
  } catch (err) {
    next(err);
  }
});

app.get('/api/family/bootstrap', async (req, res, next) => {
  try {
    const [proposals, votes, comments, recipes, mealPlans] = await Promise.all([
      getData('proposals'),
      getData('votes'),
      getData('comments'),
      getData('recipes'),
      getData('mealPlans')
    ]);

    const recipeById = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
    const hydratedMealPlans = mealPlans.map((plan) => ({
      ...plan,
      recipe: recipeById[plan.recipeId] || null
    }));

    const proposalCards = proposals.map((proposal) => ({
      ...proposal,
      voteSummary: summarizeVotes(votes, proposal.id),
      votes: voteDetails(votes, proposal.id),
      comments: comments[proposal.id] || [],
      mealPlans: hydratedMealPlans.filter((plan) => {
        if (!proposal.startDate || !proposal.endDate || !plan.date) return false;
        return plan.date >= proposal.startDate && plan.date <= proposal.endDate;
      })
    }));

    res.json({ proposals: proposalCards, recipes, mealPlans: hydratedMealPlans });
  } catch (err) {
    next(err);
  }
});

app.get('/api/family/recipes', async (req, res, next) => {
  try {
    res.json(await getData('recipes'));
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/recipes', async (req, res, next) => {
  try {
    const recipeFields = recipeFromBody(req.body);
    if (recipeFields.error) return res.status(400).json({ error: recipeFields.error });

    const now = new Date().toISOString();
    const recipe = {
      id: req.body.id ? cleanString(req.body.id, 100) : nanoid(12),
      ...recipeFields,
      createdAt: now,
      updatedAt: now
    };

    const recipes = await getData('recipes');
    recipes.push(recipe);
    await setData('recipes', recipes);
    res.status(201).json(recipe);
  } catch (err) {
    next(err);
  }
});

app.put('/api/family/recipes/:id', async (req, res, next) => {
  try {
    const recipes = await getData('recipes');
    const index = recipes.findIndex((recipe) => recipe.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Recipe not found.' });

    const recipeFields = recipeFromBody(req.body);
    if (recipeFields.error) return res.status(400).json({ error: recipeFields.error });

    recipes[index] = {
      ...recipes[index],
      ...recipeFields,
      updatedAt: new Date().toISOString()
    };
    await setData('recipes', recipes);
    res.json(recipes[index]);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/family/recipes/:id', async (req, res, next) => {
  try {
    const recipes = await getData('recipes');
    const nextRecipes = recipes.filter((recipe) => recipe.id !== req.params.id);
    if (nextRecipes.length === recipes.length) return res.status(404).json({ error: 'Recipe not found.' });

    const mealPlans = await getData('mealPlans');
    await Promise.all([
      setData('recipes', nextRecipes),
      setData('mealPlans', mealPlans.map((plan) => (
        plan.recipeId === req.params.id ? { ...plan, recipeId: '', updatedAt: new Date().toISOString() } : plan
      )))
    ]);
    res.json({ deleted: true, recipeId: req.params.id });
  } catch (err) {
    next(err);
  }
});

app.get('/api/family/meal-plans', async (req, res, next) => {
  try {
    const [mealPlans, recipes] = await Promise.all([
      getData('mealPlans'),
      getData('recipes')
    ]);
    const recipeById = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
    res.json(mealPlans.map((plan) => ({ ...plan, recipe: recipeById[plan.recipeId] || null })));
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/meal-plans', async (req, res, next) => {
  try {
    const mealFields = mealPlanFromBody(req.body);
    if (mealFields.error) return res.status(400).json({ error: mealFields.error });

    const now = new Date().toISOString();
    const mealPlans = await getData('mealPlans');
    let recipeId = mealFields.recipeId;

    if (!recipeId && mealFields.title) {
      const recipes = await getData('recipes');
      const recipe = {
        id: nanoid(12),
        title: mealFields.title,
        link: mealFields.link,
        createdAt: now,
        updatedAt: now
      };
      recipes.push(recipe);
      await setData('recipes', recipes);
      recipeId = recipe.id;
    }

    const mealPlan = {
      id: req.body.id ? cleanString(req.body.id, 100) : nanoid(12),
      date: mealFields.date,
      mealType: mealFields.mealType,
      recipeId,
      notes: mealFields.notes,
      createdAt: now,
      updatedAt: now
    };

    mealPlans.push(mealPlan);
    await setData('mealPlans', mealPlans);
    res.status(201).json(mealPlan);
  } catch (err) {
    next(err);
  }
});

app.put('/api/family/meal-plans/:id', async (req, res, next) => {
  try {
    const mealPlans = await getData('mealPlans');
    const index = mealPlans.findIndex((plan) => plan.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Meal plan not found.' });

    const mealFields = mealPlanFromBody(req.body);
    if (mealFields.error) return res.status(400).json({ error: mealFields.error });

    let recipeId = mealFields.recipeId;

    if (!recipeId && mealFields.title) {
      const now = new Date().toISOString();
      const recipes = await getData('recipes');
      const recipe = {
        id: nanoid(12),
        title: mealFields.title,
        link: mealFields.link,
        createdAt: now,
        updatedAt: now
      };
      recipes.push(recipe);
      await setData('recipes', recipes);
      recipeId = recipe.id;
    }

    mealPlans[index] = {
      ...mealPlans[index],
      date: mealFields.date,
      mealType: mealFields.mealType,
      recipeId,
      notes: mealFields.notes,
      updatedAt: new Date().toISOString()
    };

    await setData('mealPlans', mealPlans);
    res.json(mealPlans[index]);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/family/meal-plans/:id', async (req, res, next) => {
  try {
    const mealPlans = await getData('mealPlans');
    const nextMealPlans = mealPlans.filter((plan) => plan.id !== req.params.id);
    if (nextMealPlans.length === mealPlans.length) return res.status(404).json({ error: 'Meal plan not found.' });

    await setData('mealPlans', nextMealPlans);
    res.json({ deleted: true, mealPlanId: req.params.id });
  } catch (err) {
    next(err);
  }
});

app.get('/api/family/proposals', async (req, res, next) => {
  try {
    res.json(await getData('proposals'));
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/proposals', async (req, res, next) => {
  try {
    const proposalFields = proposalFromBody(req.body);

    if (proposalFields.error) {
      return res.status(400).json({ error: proposalFields.error });
    }

    const now = new Date().toISOString();
    const proposal = {
      id: req.body.id ? cleanString(req.body.id, 100) : nanoid(12),
      ...proposalFields,
      createdAt: now,
      updatedAt: now
    };

    const proposals = await getData('proposals');
    proposals.push(proposal);
    await setData('proposals', proposals);
    res.status(201).json(proposal);
  } catch (err) {
    next(err);
  }
});

app.put('/api/family/proposals/:id', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const proposals = await getData('proposals');
    const index = proposals.findIndex((proposal) => proposal.id === proposalId);

    if (index === -1) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }

    const proposalFields = proposalFromBody(req.body, proposals[index]);

    if (proposalFields.error) {
      return res.status(400).json({ error: proposalFields.error });
    }

    const updated = {
      ...proposals[index],
      ...proposalFields,
      updatedAt: new Date().toISOString()
    };

    proposals[index] = updated;
    await setData('proposals', proposals);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/family/proposals/:id', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const proposals = await getData('proposals');
    const nextProposals = proposals.filter((proposal) => proposal.id !== proposalId);

    if (nextProposals.length === proposals.length) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }

    const [votes, comments] = await Promise.all([
      getData('votes'),
      getData('comments')
    ]);

    delete votes[proposalId];
    delete comments[proposalId];

    await Promise.all([
      setData('proposals', nextProposals),
      setData('votes', votes),
      setData('comments', comments)
    ]);

    res.json({ deleted: true, proposalId });
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/proposals/:id/vote', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const userId = cleanString(req.body.userId, 100);
    const userName = normalizeUserName(req.body.userName);
    const vote = cleanString(req.body.vote, 20).toLowerCase();

    if (!userId || !userName || !['yes', 'maybe', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'userId, userName, and vote of yes/maybe/no are required.' });
    }

    const votes = await getData('votes');
    votes[proposalId] ||= {};

    const incomingIdentity = voteIdentityKey(userId, { userName, vote });
    Object.entries(votes[proposalId]).forEach(([existingUserId, existingVote]) => {
      if (existingUserId !== userId && voteIdentityKey(existingUserId, existingVote) === incomingIdentity) {
        delete votes[proposalId][existingUserId];
      }
    });

    votes[proposalId][userId] = { userName, vote };
    await setData('votes', votes);

    res.json({ proposalId, userId, userName, vote, voteSummary: summarizeVotes(votes, proposalId), votes: voteDetails(votes, proposalId) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/family/proposals/:id/comments', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const userId = cleanString(req.body.userId, 100);
    const author = cleanString(req.body.userName, 80);
    const text = cleanString(req.body.text, 1000);

    if (!userId || !author || !text) {
      return res.status(400).json({ error: 'userId, userName, and text are required.' });
    }

    const comment = {
      id: nanoid(10),
      userId,
      author,
      text,
      createdAt: new Date().toISOString()
    };

    const comments = await getData('comments');
    comments[proposalId] ||= [];
    comments[proposalId].push(comment);
    await setData('comments', comments);

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

app.put('/api/family/proposals/:id/comments/:commentId', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const commentId = req.params.commentId;
    const userId = cleanString(req.body.userId, 100);
    const text = cleanString(req.body.text, 1000);

    if (!userId || !text) {
      return res.status(400).json({ error: 'userId and text are required.' });
    }

    const comments = await getData('comments');
    const proposalComments = comments[proposalId] || [];
    const index = proposalComments.findIndex((comment) => comment.id === commentId);

    if (index === -1) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (proposalComments[index].userId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own comments.' });
    }

    proposalComments[index] = {
      ...proposalComments[index],
      text,
      updatedAt: new Date().toISOString()
    };

    await setData('comments', comments);
    res.json(proposalComments[index]);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/family/proposals/:id/comments/:commentId', async (req, res, next) => {
  try {
    const proposalId = req.params.id;
    const commentId = req.params.commentId;
    const userId = cleanString(req.body.userId, 100);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }

    const comments = await getData('comments');
    const proposalComments = comments[proposalId] || [];
    const comment = proposalComments.find((item) => item.id === commentId);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments.' });
    }

    comments[proposalId] = proposalComments.filter((item) => item.id !== commentId);
    await setData('comments', comments);
    res.json({ deleted: true, proposalId, commentId });
  } catch (err) {
    next(err);
  }
});

io.on('connection', (socket) => {
  const user = gameUserFromSocket(socket);
  socket.userId = user.userId;

  socket.on('setGameName', (name, callback = () => {}) => {
    user.name = cleanString(name, 80) || user.name;
    user.lastActiveAt = Date.now();
    callback({ ok: true, user });
  });

  pirateVoyage.registerHandlers(socket, gameUsers, gamePlaces, io, logGameEvent);
  treasureHold.registerHandlers(socket, gameUsers, gamePlaces, io, logGameEvent);
  resolveSignal.registerHandlers(socket, gameUsers, gamePlaces, io, logGameEvent);
});


app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

await initStorage();
httpServer.listen(PORT, () => {
  console.log(`Family planner running on port ${PORT} using ${storageMode()} storage`);
});
