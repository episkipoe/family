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
    const title = cleanString(req.body.title, 120);
    const location = cleanString(req.body.location, 120);
    const startDate = cleanString(req.body.startDate, 20);
    const endDate = cleanString(req.body.endDate, 20);
    const year = Number(req.body.year || new Date(startDate).getFullYear() || new Date().getFullYear());

    if (!title || !location || !startDate || !endDate) {
      return res.status(400).json({ error: 'title, location, startDate, and endDate are required.' });
    }

    const now = new Date().toISOString();
    const proposal = {
      id: req.body.id ? cleanString(req.body.id, 100) : nanoid(12),
      year,
      title,
      location,
      startDate,
      endDate,
      status: cleanString(req.body.status || 'active', 40),
      summary: cleanString(req.body.summary, 1000),
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
