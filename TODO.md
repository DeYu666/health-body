# TODO

## OCR/AI health document pipeline

- [x] Add `POST /api/v1/documents/import` to create `health_documents` and `document_files` from uploaded files or natural-language notes.
- [x] Add synchronous fallback analysis that stores `ocr_results`, `ai_analyses`, review tasks, and a legacy `reports` record for current archive UI compatibility.
- [x] Add SenseNova OpenAI-compatible client configuration with safe fallback when `SENSENOVA_API_KEY` is unavailable.
- [x] Switch the frontend import page to upload files first, then call `documents/import`.
- [x] Add a PaddleOCR HTTP worker for uploaded images/PDFs and persist OCR text/layout into `ocr_results`.
- Add async processing jobs for OCR, AI classification, AI extraction, review task generation, and observation trend sync.
- Persist extracted lab/vital observations into `extracted_observations`.
- Persist structured summary, risks, recommendations, and source citations into `ai_analyses`.
- Expand low-confidence confirmation items in `review_tasks`.
- Add UI for processing status, source highlighting, and confirmation workflow.

## Deployment hygiene

- Keep production secrets only in server-side `.env.production`.
- Keep old `phr` database on `immich_postgres` until a deliberate migration plan exists.
- Remove old `deyu666/phr-*` images only after new containers pass smoke checks.
