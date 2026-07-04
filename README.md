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

## Verification

```bash
npm run verify
npm run snapshot:tree-layout
npm run snapshot:tree-layout:all
npm run snapshot:tree-layout:json
npm run snapshot:tree-layout:svg
```

The default verification command guards the Bennett branch ordering used by the family tree view and refreshes the reference layout artifact bundle.
That includes the Clara/Musser/Dan-Amy/Caroline grouping shown in the reference layout.
The snapshot command prints the reference branch coordinates and parent-child alignment deltas without running the failure gate.
The all-in-one snapshot command refreshes the JSON, SVG, and HTML artifacts together.
The JSON snapshot writes the same coordinate evidence to `artifacts/tree-layout-snapshot.json`.
The SVG snapshot writes a compact visual preview to `artifacts/tree-layout-snapshot.svg` and a browser-friendly wrapper at `artifacts/tree-layout-snapshot.html`.

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
GET  /api/family/tree
POST /api/family/tree
POST /api/family/tree/:id/links
DELETE /api/family/tree/:id
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
