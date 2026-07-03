# Family Gathering Planner

Small Node/Express skeleton for a family gathering planning site.

It uses:

- Upstash Redis when `USE_REDIS` is defined
- Local JSON files in `data/` otherwise


## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Without Redis env vars, votes/comments are written to local JSON files.

## Render environment variables

Set these in Render:

```text
USE_REDIS=true
REDIS_URL=your-upstash-rest-url
REDIS_TOKEN=your-upstash-rest-token
```

## API

```text
GET  /api/health
GET  /api/family/bootstrap
GET  /api/family/proposals
POST /api/family/proposals
POST /api/family/proposals/:id/vote
POST /api/family/proposals/:id/comments
GET  /api/family/households
```

## Notes

- Redis keys are namespaced under `family-planner:*`.
- On Redis startup, the app merges Redis data with the local JSON files, then stores the combined content in Redis.
- Browser JavaScript never sees Redis credentials.
