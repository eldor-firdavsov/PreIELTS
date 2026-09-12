# IELTS Platform — non-negotiables

Read `docs/ARCHITECTURE.md` for the full picture. These rules are the ones that
are expensive to undo, so they hold even when a shortcut looks harmless.

## Security

- **Never expose `questions.correct_answer` to the client.** Clients read the
  `questions_public` view. There is deliberately no select policy on `questions`.
- **Scoring runs in `score_session()`** (security definer), never in the browser.
  `test_results`, `section_results`, `mistakes` and `user_progress` have no client
  insert/update policies on purpose — the function is the only writer.
- **No model API key in the browser.** AI calls run in three Supabase Edge
  Functions (`ai-analyze-reading`, `ai-analyze-listening` and `ai-study-plan`,
  all on Gemini) and write to `ai_analyses` under the caller's `auth.uid()`.
  The key lives in the function
  environment (`GEMINI_API_KEY`), never in a table: a secrets table is only a
  worse copy of the platform's secret store, and one more place to leak from.
- **One model call site: `supabase/functions/_shared/gemini.ts`.** The fallback
  chain, the retry ladder and the wording of "busy" against "refused" are
  decided once, because a student meeting the same outage on two screens should
  not be told two different things. `_shared/` also holds the CORS and JSON
  envelope, the caller-identification split between the anon and service-role
  clients, and the `ai_analyses` cache read and write.
- **A retired model is a reason to try the next model, never to fail.** Google
  retires one by answering 404 "no longer available to new users" — a permanent
  no from that model and a perfectly good request. `dispositionFor()` sorts a
  failed status into retry, next-model or stop for exactly this reason: one
  stale entry in `MODELS` once took every AI feature on the platform down at
  once, silently. The chain is maintained by hand and spans four capacity
  pools; check it when marking starts failing everywhere at the same time.
- **A band is never a number the client sent.** Reading and listening are marked
  by `score_session`, the only writer of a band anywhere in the product. There
  is no other path: a skill with no answer key would need a different mechanism
  for the same guarantee, and rather than build one, the product marks only what
  it can mark. Migration 0017 withdrew writing and speaking for this reason
  among others.
- `ai_analyses` is cached on `(scope, subject_id, prompt_version)`. Bump
  `prompt_version` when a prompt changes; never mutate a cached row. The scopes
  are `mistake`, `listening_mistake` and `study_plan`.
- **The study plan's subject is a fingerprint, not a row id.** A mistake or an
  essay never changes, so its analysis is keyed by its own id. A study plan is
  right until the next paper is marked and wrong afterwards, so it is keyed by a
  digest of the counts it was written from, taken over the caller's id and the
  inputs. Unchanged data returns the stored plan without a model call; one more
  result is a new fingerprint and a new plan, and the old row is kept beside the
  numbers it was given for. The caller's id is in the digest so two students
  with identical statistics can never collide onto one row.

## Layer boundaries

- **Data access only in `features/*/services/`.** No `supabase-js` import in a
  component, page, or hook body. Hooks wrap services; components call hooks.
  Where two features need the same read, each writes its own small select. A
  duplicated ten-line query is cheaper than a cross-feature import, which is the
  thing this rule exists to prevent.
- **No feature imports another feature.** Promote the shared thing to `lib/`,
  `types/`, `design-system/`, or `features/engine/`. The question renderers and
  the exam chrome (`ExamSurface`, countdown, save status, question nav) went to
  `features/engine/` for exactly this reason: reading and listening both need
  them. A feature now supplies only its stimulus pane and its renderer
  registry.
- **Both skills share `ExamChrome`.** One header, one row of part tabs, two
  panes, one optional footer, one submit dialog. Reading and listening reach it
  through `ExamSurface`, which adds the question-shaped layer on top. The
  copies of this layout had already drifted — some had a footer and some did
  not, and the submit dialogs disagreed about their buttons — which asked a
  student to relearn the furniture on every skill.
- **`src/lib/scoring/` is pure functions.** No React, no Supabase, no I/O. This is
  the unit-tested part, because a wrong band estimate destroys trust.
- The engine (`features/engine/`) is content-agnostic. It knows question types,
  not passages or audio. Adding a question type = one renderer + one case in
  `QuestionRenderer`.
- Answers: localStorage is the safety net, Postgres is the record. Zustand store
  persists on every change, flushes to Supabase on a 5s debounce and on section
  change. Never write to Supabase per keystroke.
- **A session is resumable only while its own clock still has time in it.**
  `start_or_resume_session` (migration 0016) is the only way a session begins.
  Past the paper's duration plus a 15-minute grace it marks the old session
  `abandoned` and starts a fresh one; inside the grace it hands the paper back,
  because a crash in the last minute must not cost a student their work. Before
  this, a test left open was resumed for ever: the countdown derives from
  `started_at` and came back at zero, every input was disabled, and listening
  reported a recording that had finished before the student pressed play. The
  old session is never scored on the student's behalf — `score_session` writes
  `user_progress`, and a band nobody sat would then steer the study plan.
  `expired` stays unused, reserved for a paper that runs out *and* is marked.

## Content pipeline

- **Do not hand-write test content into TS files.** Content is seeded from
  `content/normalized/*.json`, or from `content/original/*.json` for material
  authored for this product. A paper with no HTML source is authored as
  normalized JSON directly; it still goes through the same schema, the same
  `validate.ts`, and the same `seed_test`.
- **Never paste passages or question text into chat.** Ten tests is 100k+ tokens
  of prose and hand-transcription introduces silent errors. Files on disk, parsed
  by a reviewable script.
- Pipeline is `content/raw/<file>.html` → `scripts/ingest.ts` →
  `content/normalized/<id>.json` → `scripts/upload-audio.ts` →
  `scripts/repair.ts` → `content/normalized-repaired/<id>.json` →
  `scripts/validate.ts` → `scripts/seed.ts`. Validate and seed read the
  repaired file when one exists.
- **`ingest.ts` is a pure idempotent transform and never corrects its source.**
  Corrections to defective raw files live in `content/repairs/<id>.json` as an
  ordered list of typed operations, each with a reason. `repair.ts` applies
  them. An unknown or non-applying operation is an error, never a skip.
  `content/normalized/` is never mutated by the repair step.
- **Seeding is idempotent, keyed by a stable `external_id`.** Re-running seed on
  the same normalized file must update in place, never duplicate.
- Raw source format: self-contained HTML mock-test pages. The answer key is
  inline in a `<script>` as a `correctAnswers` object; text answers already carry
  accepted variants as arrays. Listening files carry an absolute `audioSource`
  URL. Parse them; do not retype them.
- **Two markup dialects appear in `content/raw/`**, from two generations of the
  same generator. They differ in class names only, never in meaning, so
  `ingest.ts` falls back rather than forking into a second parser:
  `.reading-passage`/`.passage-set`, `.question`/`.q-group`,
  `.question-prompt`/`.q-instruction`, `<strong>A</strong>`/`.para-label`.
  A file matching neither is an error, not a silently empty test.
- **A summary word bank is part of the question, not decoration.** Newer files
  mark each choice as a `.drag-item` with a `data-value` and each blank as a
  `.drop-zone`; older ones print the bank as paragraphs under a "List of words"
  heading. Both are parsed into `shared_options`, and a bank whose labels are
  not distinct is rejected rather than stored. Without this, four seeded
  questions had a letter answer key and rendered a bare text box, which no
  student could have answered.

## Content provenance

The files in `content/raw/` are third-party IELTS practice tests (they carry a
`@MINDLESS_WRITER` watermark and a Telegram attribution). **They are fine for
building and testing the engine. They cannot ship in a paid product.**

- `content/raw/` and `content/normalized/` are gitignored. Keep it that way.
- **Original material lives in `content/original/` and is committed.** It is the
  only place a `shippable: true` provenance is believed, and `validate.ts`
  decides that from the load path rather than from the field, so editing one
  word in an ingested file cannot launder third-party content into shippable
  content. Everything ingested from `content/raw/` is third-party and is not
  shippable.
- Swapping in original content must be a **data change, not a code change**: new
  raw file → ingest → validate → seed under a new `external_id`. If replacing
  content ever requires touching `src/`, the pipeline is wrong.
- Original reading and listening live in `content/original/`, and their
  recordings live in `content/audio/`. A listening paper stays
  `is_published: false` until its recording is actually in the bucket. A
  published listening test with no audio is not a test, it is an empty player.
- **Seeding a third-party test needs `SUPABASE_SERVICE_ROLE_KEY` or
  `DATABASE_URL`.** Not for permissions alone: a full reading paper is ~40KB of
  passage prose, and the rule against pasting passages into chat means the only
  correct transport is `scripts/seed.ts` reading the file from disk.
- **Listening audio must never stay hotlinked.** `scripts/upload-audio.ts`
  fetches each archive.org file once, stores it in the private `audio` bucket as
  `<external_id>.mp3`, and records a `set_audio_path` overlay operation.
  `validate.ts` treats a listening `audio_url` that is still an external URL as
  an error, so a hotlink cannot reach the database. A failed fetch is fatal;
  there is no fallback to the original URL.
- Seeding is guarded three ways. `validate.ts` must pass before `seed.ts` will
  write; the hotlink check is the one failure `--allow-invalid` cannot override;
  and the database itself refuses `is_published = true` on a test whose
  `source_provenance.shippable` is not true.
- **A bad file is dropped from the batch, never the batch itself.** `seed.ts`
  used to abort the whole run on the first offender, so three third-party
  listening papers that still hotlink archive.org kept every test out of the
  database — including papers with no audio at all, which were therefore simply
  missing from the product. The
  guarantee is unchanged and is now per test rather than per run: a hotlinked
  paper never reaches the database, `--allow-invalid` still cannot wave one
  through, everything skipped is named, and the run exits non-zero. One file's
  problem is not another file's problem.
- **The upsert lives in `seed_test(jsonb)`, migration 0003, not in TypeScript.**
  One function call is one transaction, so a test lands whole or not at all over
  either transport, and there is a single implementation rather than two that
  can drift. `seed.ts` uses a direct Postgres connection when `DATABASE_URL` is
  set and PostgREST otherwise. Execute is granted to `service_role` only.

## Engine and scoring

- **`score_session()` is the only scorer** (migration 0006, superseding 0005).
  Security definer, checks `auth.uid()` owns the session and that it is
  `in_progress`, marks answers, writes `test_results`, `section_results`,
  `mistakes` and `user_progress`, sets status to submitted, returns the result
  id. **Re-invoking on a submitted session raises and writes nothing.** The
  client recovers a lost response by reading `test_results` for the session,
  never by scoring again.
- Answer matching is a two-stage ladder: exact string equality first, then
  case-insensitive whitespace-normalised equality against the key and its
  accepted variants.
- **A band is computed over the whole 40-question paper**, never per section.
  `section_results.band` is always NULL for reading and listening; those rows
  carry raw counts, time and `accuracy_by_type` only. The band lives on
  `test_results.overall_band` and on `user_progress`, one row per
  `section_kind` per result.
- **`raw_to_band()` in SQL and `rawToBand()` in `src/lib/scoring/raw-to-band.ts`
  must agree.** The SQL copy is authoritative because scoring is server-side;
  the TypeScript copy is what the UI uses to explain a score.
  `src/lib/scoring/raw-to-band.test.ts` walks every raw score through both and
  fails on the first divergence. Change one table and you must change the
  other. Run it with `DATABASE_URL` set, or the parity half silently skips.
- **The engine's `Question` type has no answer field.** ARCHITECTURE.md §3
  sketches one; it is deliberately absent so no component can read it and no
  careless `select('*')` can populate it. Clients read `questions_public`.
- `questions_public` filters by readability itself, because the view runs as its
  owner and so bypasses RLS on `questions`. Without that filter it leaked the
  prompts of unpublished tests.
- Unpublished content is readable only by users in `content_testers`, which is
  writable by the service role alone. This exists because shippable-false
  content can never be published, and staff still need to run real sessions.
- The engine may not import a feature, so `QuestionRenderer` resolves types
  through a registry supplied by the feature via `RendererProvider`.
- **A renderer may branch on shape, never on content.** `summary_completion` and
  `note_completion` appear both as "write a word from the passage" and as "pick a
  letter from this list", with the same type and a different answer key.
  `BankedTextRenderer` picks a select when options exist and a text box when
  they do not, so one registry entry serves both honestly. It never invents a
  bank that the content does not carry.

## Listening

- **The recording plays once, straight through.** No pause, no rewind, no
  replay. A band computed from a paused or re-listened recording is not a band,
  and a wrong band destroys trust. `ListeningPlayer` enforces the exam's rule,
  not the browser's default: a pause seeks back to where the clock says the tape
  should be.
- **Playback position is anchored to `test_sessions.started_at`**, the same
  instant the countdown derives from. So a refresh cannot rewind the tape or
  buy a second hearing, and the clock and the tape can never disagree. After the
  initial seek the element plays freely, so a buffering stall delays the audio
  rather than silently skipping what the student never heard.
- One recording covers the whole paper: every section's stimulus carries the
  same path and the markers into it are absolute. The player is mounted above
  the section switch, so changing part does not restart it.
- **The `audio` bucket is private and stays private.** Playback uses a
  short-lived signed URL. Migration 0009 lets a student select an object only
  when the test it belongs to is readable, which is the same published-or-
  allowlisted rule that governs the content. `signAudioUrl` refuses an
  `http(s)` path outright, so a hotlink that somehow reached the database still
  cannot reach the browser.
- Listening evidence is `{kind: 'transcript', time_seconds, text}`, the
  analogue of reading's passage offset. 76 listening questions carry one. Replay
  is offered only where a timestamp is stored, never derived at render time.
  Replay after submission is deliberate: hearing it once is what made the band
  mean something, hearing it again is how the mistake gets understood.
- **A listening mistake goes to `ai-analyze-listening`, never to
  `ai-analyze-reading`.** The reading analyser reasons from a passage paragraph,
  and a listening section has none. The listening analyser reasons from the one
  stored transcript line instead, and looks for the mistakes listening actually
  produces: a distractor said before the answer, a speaker who corrected
  themselves, a paraphrase that was not recognised, a number written in a form
  the key does not accept. Each function refuses a question from the other's
  skill outright rather than answering it from evidence that does not exist.
- **The listening analyser never invents what was said.** Where a question has
  no stored marker the payload says so and the model is told to admit it. A
  guessed line is worse than no line: it teaches a student that the recording
  said something it never said.

## Results and AI analysis

- One page serves both skills. Every paper it renders was marked against an
  answer key, so every tile has a real number behind it. A tile with nothing
  behind it is omitted rather than shown as a zero, because "0 / 0" reads as a
  score and is not one.
- **The results page renders stored rows only.** Percentages, averages, the
  per-type and per-passage accuracy, and the "slower than your average" ratio
  are all computed in the `result_*` views (migrations 0007, 0008). No component
  sums, averages or converts a band. A number a student sees is a number the
  database computed once.
- The `result_*` views are security definer and each carries its own
  `user_id = auth.uid()` filter. That filter is the only thing protecting them,
  because bypassing RLS is the point: they join `questions`, which no one can
  select. Never add a column to one without checking the filter still applies.
- `avg_seconds_per_question` is derived from summed per-question recorded time,
  not from wall clock, so the §9 comparison divides like by like.
  `total_time_seconds` stays wall clock, because that is what "how long did this
  take" means.
- **"Show answer in passage" is enabled only where a stored offset exists.**
  36 reading questions across the corpus have verified offsets; the rest render
  the button disabled with a tooltip. Never derive or guess an offset at render
  time to fill the gap.
- **`ai-analyze-reading` holds the Gemini key.** The browser calls the Edge
  Function, never the API. The function checks `ai_analyses` on
  `(scope, subject_id, prompt_version)` and returns before any model call on a
  hit. It sends one passage paragraph at most, never the whole passage or the
  other passages.
- Bump `PROMPT_VERSION` in both the `src/lib/ai/*.ts` type file and the Edge
  Function whenever the prompt or the response schema changes. Old rows stay
  readable and are never overwritten.

## Long-term analysis

- **`study_plan_inputs()` is the deterministic half** (migration 0015). It
  reduces everything a student has ever done to one small jsonb document of
  counts and stored bands: per-skill progression, accuracy by question type,
  accuracy by section, and pace with slow or rushed mistakes. No passage and no
  question prompt is in it. What `ai-study-plan` sends to
  Gemini is exactly what comes out of it, and the function reads nothing else.
- Security definer with its own `auth.uid()` filter, on the same terms as the
  `result_*` views. `ai-study-plan` calls it as the **caller**, not as the
  service role, so a plan is built from the student's own rows by construction
  rather than by a filter the function has to remember.
- **A plan is asked for, never generated on arrival.** The Analysis page reads
  the stored plan for the current fingerprint and offers a button when there is
  none. The dashboard shows only the `next_action` line from a plan that already
  exists, and links to Analysis when there is none: a page that spends a model
  call for being looked at is a page that costs money for being looked at.
- **An empty history is not a student with no weaknesses.** With nothing marked,
  `ai-study-plan` returns `enough_evidence: false` before any model call and the
  page says so. Generic advice wearing a student's name is worse than none.
- **The plan states its own evidence.** `evidence_caveat` is a required field:
  a plan built on one paper is a first read, and a confident plan that does not
  say so is the fastest way to send someone to practise the wrong thing.
- The dashboard reads the plan with its own two small queries rather than
  importing from `features/analysis/`. Shared types live in
  `src/lib/ai/study-plan.ts`, which is `lib/` and therefore fair game.

## Build order

Vertical slice first: Auth → Dashboard shell → Reading test → submit → score →
results → one AI explanation → persisted. Then Listening (same engine, same
deterministic scoring) — done: it reuses `score_session`, the shared
`ExamSurface` and the engine's renderers, and adds only a player and a
registry.

Writing and speaking were built and then withdrawn. Migration 0017 dropped
their tables, functions, views and bucket; the features, the evaluator Edge
Functions and their papers are gone from the tree. The product marks what it
can mark against an answer key. `ExamGate` still asks for the two fields it
reads rather than a whole `TestSession`, so a skill with its own session hook
would get the same chrome rather than a second copy of it.

Original content: one reading paper and one listening paper, both 40 questions,
seeded from `content/original/`. The listening recording carries a measured
timestamp for every one of its forty questions, because the audio is generated
segment by segment and each marker is the accumulated duration rather than an
estimate. No third-party paper in the corpus comes close to that coverage.

The dashboard, history and analysis pages are built. Analysis carries the study
plan; the dashboard carries its one-line recommendation.

What remains: the full mock flow of SPEC.md §14 (one session across all four
skills, with an overall diagnosis at the end) is not built — `tests.is_full_mock`
exists and no paper sets it. `content/original/original-listening-1.json` stays
unpublished, and now for two reasons rather than one. Its recording is not in
the `audio` bucket, which needs `SUPABASE_SERVICE_ROLE_KEY` for
`scripts/upload-audio.ts`. And the recording it would upload is 9.1 minutes long
against a 34-minute paper: the last of its forty questions is heard at 8.8
minutes, `npm run audit` now calls that an error, and because playback follows
the test clock a student who starts late hears none of it. Sections 2, 3 and 4
also carry no transcript. The paper needs a full-length render before it is
published; publishing this one would ship a listening test that is over before
section 2.

Server-side configuration this deployment still needs: `GEMINI_API_KEY` as an
Edge Function secret, without which all five AI functions answer 500 and
`src/lib/ai/errors.ts` tells the student marking is not switched on yet.

Content pipeline (ingest → validate → seed) comes before any UI. The content
format determines the engine's data shape.

## Loading, empty and error states

- **No screen may be blank while it waits.** `Table`, `CardGrid`, `Chart`,
  `Stat` and `Select` each own their loading, error and empty states, so a page
  passes `loading` and `error` down rather than reimplementing the three and
  getting one subtly wrong. That is also why moving a list between layouts goes
  `Table` to `CardGrid` and never to a hand-rolled grid, which would silently
  drop all three.
- **Table or cards is a question about the content.** A table is right when the
  reader compares values down a column: accuracy by question type, band by
  section. Cards are right when each row is a thing you act on rather than a
  number you compare, and when it has more to say than fits in a cell. Tests and
  past results are the second kind, and on a result card the band leads, because
  it is the only figure on that page anyone came for.
- **A loading state has to be visible, and has to end.** The placeholder uses
  `--skeleton`, which measures 1.27:1 against a card, because it used to borrow
  `--bg-subtle` and was therefore exactly the page canvas — invisible on every
  screen outside a `Card`. And every `Suspense` boundary has an `ErrorBoundary`
  outside it: a lazy chunk that fails to download rejects through it, so the
  fallback stops pulsing and says so. A skeleton that never resolves is the most
  dishonest screen the product can show.
- **Announce a waiting region once.** `Skeleton` is `aria-hidden` decoration;
  `SkeletonRegion` and `SkeletonLines` carry the `role="status"` and a label
  saying what is arriving. Four stats each announcing "Loading" is four
  interruptions to convey one fact. The pulse stops under
  `prefers-reduced-motion`.
- **Never show placeholder prose where real prose is coming.** A screen that
  renders a definition while the real sentence loads, then swaps it, has said
  two things and stood behind neither — and leaves the placeholder standing for
  ever if the read fails. Show a placeholder that is visibly a placeholder,
  state the failure with a retry, and fall back to stand-in prose only once you
  know the real prose is not coming.
- **An empty state is not a zero.** A skill never attempted shows an em dash and
  an invitation. Rendering 0.0 would be claiming a band the student did not
  earn, and one invented number makes every real one beside it untrustworthy.
- The lazy-route `Suspense` boundary sits *inside* `AppShell`, so moving between
  Dashboard, Tests, History and Analysis never blanks the navigation.
- **Migrations ship before the client that calls them.** The client's `.rpc()`
  calls are a contract with `supabase/migrations/`, so a frontend deployed ahead
  of `supabase db push` breaks every route that starts a session. This happened:
  0016 added `start_or_resume_session`, the client switched to it, the migration
  was not applied, and every test answered "Could not find the function
  public.start_or_resume_session(p_test_id) in the schema cache".
- **A missing migration is not the student's failure either.**
  `src/lib/supabase/errors.ts` rewrites PostgREST's `PGRST202` into a sentence
  that names what the student was trying to do and says the deployment is
  unfinished. Every RPC call site goes through it. Nothing is hidden: the test
  did not open either way, this only changes who the sentence is addressed to.
- **A configuration failure is not the student's failure.** `src/lib/ai/errors.ts`
  rewrites "GEMINI_API_KEY is not configured" into a sentence that says the work
  was saved and marking is not switched on yet. Everything else is passed
  through exactly as the server said it. Nothing is hidden: the evaluation did
  not happen either way, this only changes who the sentence is addressed to.

## Format conformance

- `scripts/audit.ts` (`npm run audit`) measures every test against the published
  Cambridge IELTS Academic format: section counts, question counts, timings,
  passage length, per-section question spread, marker coverage, and whether
  typed answers carry accepted variants. `validate.ts` asks whether a test is
  internally consistent; this asks whether it has the shape of the exam a
  student is actually sitting.
- The specification encoded there is structure and timing. **No Cambridge text
  is reproduced in this repository.** A format is not content.
- An audit `error` means the paper is not shaped like an IELTS test. A `warning`
  means it is unrepresentative but usable. Neither blocks a seed: this is a
  report for whoever chooses what to publish.
- **A typed answer with no accepted variants is a marking bug**, not a missing
  nicety. A student writing "16th" where the key says "sixteenth" is right, and
  the audit flags any paper that would mark them wrong.

## Design

Tokens live in `src/design-system/tokens.css` and are the only source of colour,
spacing, radius and type. No component may write a hex value.

- **Colour means one thing everywhere.** `--primary` marks interactive elements,
  calls to action and the active navigation state, and nothing else. `--danger`
  means something went wrong. They used to be the same red, so a button and an
  error message were indistinguishable by colour alone; `tone="brand"` is gone
  from `Badge` for the same reason, because a tone named after the brand invites
  use wherever it happens to look right.
- **60-30-10, warm content against a cool accent.** `--bg-canvas` is the 60,
  `--bg-surface` and the borders are the 30, `--primary` is the 10 and is the
  only saturated colour on a resting screen. The neutrals are warm and the
  accent is cool on purpose: warm grounds carry the things to read, the cool
  accent carries the things to press, and the eye sorts them after one screen.
- **`--bg-reading` is for sustained reading**, and is warmer and softer than
  `--bg-surface`. A sixty-minute paper on pure white is the harshest ground the
  product can offer. Data-dense surfaces keep the crisp white, where separation
  matters more than comfort.
- **Serif is the paper, sans is the software.** `--font-serif` (Source Serif 4)
  sets passages, task prompts, cue cards, the student's own essay and passage
  evidence, through the `.reading-prose` utility. `--font-sans` (Source Sans 3)
  sets everything the product says in its own voice. They are one superfamily,
  drawn to the same skeleton, which is why they sit together. A student learns
  the distinction in one session and then knows at a glance which half of the
  screen is the test.
- **A named face must actually be loaded.** The stack once named Inter and
  loaded nothing, so every screen silently rendered in system-ui. Fonts come
  from the Google Fonts link in `index.html`, with `display=swap`.
- **Every pair is measured, not eyeballed.** Text clears 4.5:1 and control edges
  clear 3:1, in both themes. `--border` groups; `--border-strong` draws anything
  a student operates and is the one that has to clear 3:1. Run the contrast
  function in `.claude/skills/ux-accessibility-review/SKILL.md` before adding a
  colour.
- **Three themes, not two.** An explicit choice stamps `data-theme` on the root;
  the default stamps nothing and resolves through `prefers-color-scheme`. So
  dark is declared twice, and no colour may have its only declaration inside a
  media or `[data-theme]` block. `initTheme()` runs before React mounts so a
  student who chose dark never sees a white flash.
- **Elevation by role.** `--shadow-rest` for resting surfaces, `--shadow-lift`
  for things that lift on hover, `--shadow-float` for things over the page. One
  shadow stamped on everything flattens the hierarchy it is meant to create.
- Band scores use tabular numerals; the timer is monospace so digits do not
  jitter.

## Exam-room parity

The student is preparing for the computer-delivered IELTS, so the tools they
practise with should be the tools they meet on the day. Anything the real test
gives a candidate is a gap here until it exists.

- **Flag for review.** The real test flags questions and surfaces the flagged
  ones in the strip along the bottom. `FlagToggle` sits beside every question
  and `QuestionNav` marks them with a corner, not colour alone. Flags are
  session-local: they persist to localStorage with the answers, never enter the
  dirty set, and never reach Postgres, because a flag is a note to yourself
  during the paper and means nothing once it is marked.
- **Say what is being left behind.** The submit dialog counts unanswered and
  flagged questions before the student confirms. The flag promises they can come
  back; submitting without the count is where that promise breaks.
- **Text size.** The real test offers three sizes before the paper starts.
  `TextSizeControl` lives in the exam header, because a passage becomes
  uncomfortable halfway through, not in account settings. It scales the root
  font size so the whole `rem`-based type scale moves together.
- Still missing against the real test: passage highlighting and the notes panel.

**Gamification is not on the table.** Streaks, XP, gems, leagues and
loss-aversion wagers are what consumer language apps use, and they work there.
This product issues band scores. A score is worth something because nothing
about it is designed to keep you opening the app, and a paper you sat to protect
a streak is a paper whose band means less. Borrow the decision-fatigue and
progress-salience findings; leave the reward loop alone.

## Responsive

- **`ExamChrome` is the layout all four skills share, and it has three widths.**
  Below `lg` one pane at a time behind a switcher; at `lg` side by side; on a
  very wide display the pair is capped and centred and each pane caps its own
  measure. It was previously an unconditional split, so a 390px phone got two
  190px columns and a reading passage four words wide.
- **Hide a responsive pane by class, never by the `hidden` attribute.**
  Assistive technology honours that attribute whatever the CSS says, so a
  `hidden` prop with a `lg:block` override shows the passage on a desktop and
  hides it from a screen reader on the same screen.
- **The app shell grows with the viewport.** The `.shell` utility in
  `index.css` is fluid to `--shell-max`; the old fixed 1152px left two thirds of
  an ultrawide display empty. Prose still caps at `--measure`, because a longer
  line is harder to read, not more generous.
- **Two navigation shapes.** Inline in the header from `sm` up, a fixed bottom
  bar below it. A phone header cannot hold four links, an email address, a theme
  control and a sign-out button.
- Tab rows and the question strip scroll rather than wrap. A wrapped row changes
  the height of the exam furniture, which shifts the passage under the reader.
- Text inputs are 16px below `sm`, because iOS zooms the viewport on focus for
  anything smaller.
