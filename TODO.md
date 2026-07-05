# TODO

## OCR/AI health document pipeline

- Add `POST /api/v1/documents/import` to create `health_documents` and `document_files` from uploaded files or natural-language notes.
- Add async processing jobs for OCR, AI classification, AI extraction, review task generation, and observation trend sync.
- Reuse the `ai-family-menu` OCR pattern: PaddleOCR worker image, host upload/cache directories, Docker-run worker isolation.
- Reuse the `ai-family-menu` AI pattern: SenseNova OpenAI-compatible client with `SENSENOVA_API_KEY`, text model, and smart model env vars.
- Persist OCR text and layout into `ocr_results`.
- Persist extracted lab/vital observations into `extracted_observations`.
- Persist summary, risks, recommendations, and source citations into `ai_analyses`.
- Persist low-confidence confirmation items into `review_tasks`.
- Add UI for processing status, source highlighting, and confirmation workflow.

## Deployment hygiene

- Keep production secrets only in server-side `.env.production`.
- Keep old `phr` database on `immich_postgres` until a deliberate migration plan exists.
- Remove old `deyu666/phr-*` images only after new containers pass smoke checks.
