# IELTS Platform — Architecture

## 1. Layer boundaries

```
UI (pages, components)      — no data fetching, no scoring logic
  ↓
hooks (feature hooks)       — TanStack Query wrappers, orchestration
  ↓
services (data access)      — the ONLY place that touches supabase-js
  ↓
Supabase (Postgres + RLS + Storage + Edge Functions)
```

Scoring, band conversion, timing math and mistake extraction live in
`src/lib/scoring/` as **pure functions** — no React, no Supabase. They are the
part that must be unit-tested, because a wrong band estimate destroys trust.

AI calls **never** happen from the browser. They run in three Supabase Edge
Functions — `ai-analyze-reading`, `ai-analyze-listening` and `ai-study-plan` —
so the Gemini key stays server-side and results are written straight to
`ai_analyses` with the caller's `auth.uid()`.

All three share `supabase/functions/_shared/`: one model call site with the
fallback chain and retry ladder, one CORS and JSON envelope, one split between
the caller's anon client and the service-role client, and one cache read and
write. A retired model answers 404, which moves the walk to the next model
rather than failing the request; five copies of that logic had already begun to
drift before they were merged into one.

## 2. Folder structure

```
src/
  app/
    router.tsx            route tree + lazy boundaries
    providers.tsx         QueryClient, Auth, Theme
    guards.tsx            RequireAuth, RequireSession
  design-system/
    tokens.css            CSS variables (colour, spacing, radius, type)
    Button.tsx Card.tsx Badge.tsx Input.tsx Select.tsx
    Dialog.tsx Tabs.tsx Table.tsx Skeleton.tsx EmptyState.tsx
    ErrorState.tsx Stat.tsx Chart.tsx
  features/
    auth/            pages/ hooks/ services/
    dashboard/       pages/ components/ hooks/ services/
    tests/           pages/ (selection) components/
    engine/          <-- the core; see §3
    reading/         renderers + passage pane + result view
    listening/       renderers + audio player + result view
    mock/            orchestrates a multi-section session
    history/         list, filters, detail route
    analysis/        long-term progression + recommendations
  lib/
    supabase/        client.ts, types.generated.ts
    scoring/         raw-to-band.ts, reading.ts, listening.ts, time.ts
    ai/              prompt payload builders (types only, no network)
    utils/           date, format, id
  types/             domain types shared across features
```

Rule: a feature folder may import from `design-system`, `lib`, `types`, and
`features/engine`. It may **not** import from another feature. Cross-feature
needs get promoted to `lib` or `engine`.

## 3. The test engine (the decision that matters most)

The engine is content-agnostic. It knows nothing about passages or audio.

```ts
type QuestionType =
  | 'multiple_choice' | 'multi_select' | 'true_false_not_given'
  | 'yes_no_not_given' | 'matching_headings' | 'matching_information'
  | 'sentence_completion' | 'summary_completion' | 'short_answer'
  | 'form_completion' | 'note_completion' | 'map_labelling';

interface Question {
  id: string;
  groupId: string;
  order: number;
  type: QuestionType;
  prompt: string;
  options?: Option[];          // present only for choice/matching types
  correctAnswer: AnswerValue;  // never sent to the client mid-test
  acceptedVariants?: string[]; // for text answers: spelling/synonym set
}

interface SectionDefinition {
  id: string;
  kind: 'reading' | 'listening';
  durationSeconds: number;
  stimulus: Stimulus;          // passage | audio
  groups: QuestionGroup[];
}
```

Engine responsibilities (in `features/engine/`):

- `useTestSession()` — timer, current position, dirty-answer buffer
- `answerStore.ts` — Zustand, keyed by questionId, persisted to
  `localStorage` on every change, flushed to Supabase on a 5s debounce and on
  section change. This is the correct split: **localStorage is the safety net,
  Postgres is the record.** Writing to Supabase on every keystroke will cost you
  rate limits and still lose data on a network drop.
- `QuestionRenderer.tsx` — one switch on `question.type` mapping to a renderer
  component. Adding a question type = adding one renderer + one case.
- `submit.ts` — freeze answers, call `score_session` RPC server-side.
- `sessionService.startOrResumeSession` — one call to the `start_or_resume_session`
  RPC. Whether a paper can still be sat is a question about its clock, not about
  whether a row exists, so the database answers it: past the paper's duration
  plus a 15-minute grace the old session becomes `abandoned` and a fresh one
  starts. The grace is there so a crash in the last minute still gives the
  student their work back to submit.

**Correct answers must not reach the browser before submission.** Fetch the
session's questions through a view that omits `correct_answer`, and score in a
Postgres function or Edge Function. Otherwise every score is trivially forged.

## 4. Data flow for a completed test

```
submit → RPC score_session(session_id)
       → writes test_results, section_results, mistakes (deterministic)
       → returns result_id
client → renders results immediately from stored rows
       → user clicks "Why was I wrong?"
       → Edge Function for that skill: reading takes one passage paragraph,
         listening takes the one stored transcript line
       → Gemini → structured JSON → insert into ai_analyses
       → cached forever, keyed by (scope, mistake_id, prompt_version)
```

`prompt_version` in the cache key is what lets you improve prompts later
without serving stale explanations or re-billing every historical mistake.

The long-term plan runs the same way with one difference in the key:

```
Analysis page → RPC study_plan_inputs()   (security definer, auth.uid())
              → counts and stored bands, plus a fingerprint of them
              → user clicks "Write my study plan"
              → ai-study-plan: cache check on the fingerprint, then Gemini
              → insert into ai_analyses, scope study_plan
dashboard     → reads next_action from that same row, generates nothing
```

The subject is a fingerprint rather than a row id because a study plan goes
stale when the next paper is marked, and a mistake analysis never does. Sit
another test and the fingerprint moves, so the stored plan stops matching and
the page offers to write a new one instead of showing advice about a paper that
is no longer the latest.

## 5. Build order (adjusted)

Vertical slice first, exactly as specified: Auth → Dashboard shell → Reading
test → submit → score → results → one AI explanation → persisted.

Two changes to the phase list:

- **Listening after Reading.** Listening reuses the same engine and the same
  deterministic scoring, so two skills run on one engine and one scorer.
- **The productive skills are out of scope.** Writing and speaking were built
  and then withdrawn in migration 0017. The product marks what it can mark
  against an answer key.

## 6. Design system tokens

```css
--bg: #ffffff;
--bg-subtle: #fafafa;
--border: #e5e5e5;
--text: #171717;
--text-muted: #737373;
--brand: #dc2626;        /* red — primary actions, active, progress */
--brand-hover: #b91c1c;
--brand-subtle: #fef2f2;
--success: #16a34a;
--warn: #d97706;
--radius: 6px;           /* small radii read as "exam software" */
```

One shadow token only (`0 1px 2px rgb(0 0 0 / 0.05)`). No gradients. Band
scores use tabular numerals. Timer is monospace so digits do not jitter.
