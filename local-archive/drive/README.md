# Local Drive archive

Text-first cache of the linked travelogue and hacker-con folders for offline search and future clue development.

- Stable source names use the Google Drive file ID: `text/<id>.txt`.
- `manifest.json` maps IDs back to titles, URLs, MIME types, source folders, and extraction status.
- Native Google Docs are cached as plain text. Extractable PDFs and the con index are attempted as text.
- Shortcuts are recorded as references because their targets are already represented elsewhere when available.
- Audio is metadata-only.
- Refresh intentionally requires an explicit Drive read; ordinary future queries should search this directory locally first.

