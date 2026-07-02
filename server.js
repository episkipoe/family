import express from 'express';
import { nanoid } from 'nanoid';
import { getData, initStorage, setData, storageMode } from './storage.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '200kb' }));
app.use(express.static('public'));

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function summarizeVotes(votesByProposal, proposalId) {
  const votes = votesByProposal[proposalId] || {};
  return Object.values(votes).reduce((acc, vote) => {
    acc[vote] = (acc[vote] || 0) + 1;
    return acc;
  }, { yes: 0, maybe: 0, no: 0 });
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
    status: cleanString(body.status || existing.status || 'active', 40),
    summary: cleanString(body.summary, 1000)
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: storageMode() });
});

app.get('/api/family/bootstrap', async (req, res, next) => {
  try {
    const [proposals, votes, comments] = await Promise.all([
      getData('proposals'),
      getData('votes'),
      getData('comments')
    ]);

    const proposalCards = proposals.map((proposal) => ({
      ...proposal,
      voteSummary: summarizeVotes(votes, proposal.id),
      comments: comments[proposal.id] || []
    }));

    res.json({ proposals: proposalCards });
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
    const userName = cleanString(req.body.userName, 80);
    const vote = cleanString(req.body.vote, 20).toLowerCase();

    if (!userId || !userName || !['yes', 'maybe', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'userId, userName, and vote of yes/maybe/no are required.' });
    }

    const votes = await getData('votes');
    votes[proposalId] ||= {};
    votes[proposalId][userId] = vote;
    await setData('votes', votes);

    res.json({ proposalId, userId, userName, vote, voteSummary: summarizeVotes(votes, proposalId) });
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


app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

await initStorage();
app.listen(PORT, () => {
  console.log(`Family planner running on port ${PORT} using ${storageMode()} storage`);
});
