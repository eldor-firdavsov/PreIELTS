# IELTS Full Mock & AI Analysis Platform — Product Brief

We are building a modern IELTS preparation platform for students preparing for
the IELTS exam. The product must feel like a serious commercial SaaS product,
not a generic AI-generated dashboard.

The core product is a complete IELTS testing and analysis system covering:
Reading, Listening, Full IELTS mock tests, detailed results,
AI-powered mistake analysis, test history, long-term statistics, and
personalized improvement recommendations.

The application should be designed to eventually support real users, real test
content, and real progress tracking.

---

## 1. Tech stack

React, TypeScript, Vite, Tailwind CSS, React Router, Zustand where client state
is actually necessary, TanStack Query for server state, Supabase, PostgreSQL,
Supabase Auth, Supabase Storage where necessary.

Keep the architecture modular and production-oriented. Do not introduce
unnecessary libraries.

## 2. Design direction

Clean, modern, minimal visual language throughout.

- Background: white, very light gray where appropriate
- Brand color: red — used for primary actions, active states, important
  indicators, selected elements, progress, branding
- Black / dark gray for primary text, subtle gray borders

The interface should feel like modern SaaS, a premium education platform, clean
examination software: professional, focused, calm.

Do NOT create: excessive gradients, excessive glassmorphism, childish
educational graphics, huge decorative illustrations, excessive shadows,
excessive rounded cards, unnecessary animations.

Prioritize usability over decoration.

## 3. Core navigation

Dashboard · Tests · History · Analysis

The user should always be able to understand: their current IELTS level, what
they have recently done, their weaknesses, and what they should do next.

## 4. Dashboard

A professional IELTS progress dashboard.

- **Overall estimated band** as a large primary score (e.g. `6.5`)
- Per-section cards for Reading and Listening, each showing
  current estimated band, previous score, trend, and number of completed tests
- **Progress**: a clean progress chart over time, based on actual stored results
- **Weaknesses**: AI-detected, e.g. Reading → True/False/Not Given, Matching
  Headings; Listening → Section 3, multiple choice
- **Recent activity**: latest tests with test type, section, date, score,
  improvement indicator
- **Recommended next action**, e.g. "Your Reading is already around Band 7.
  Listening Section 3 is currently limiting your overall score. Sit a listening
  paper next."

## 5. Tests page

Clear test selection page. Main option is **Full Mock** (complete IELTS-style
mock examination), then individual Reading and Listening tests. Each card
shows estimated duration, number of questions, the
user's previous best, latest score, and a Start button.

## 6. Test engine

Build a reusable test engine. Do NOT hardcode every section independently.
Create reusable concepts for: test, section, question, question group, answer,
timer, navigation, submission, scoring, results.

The engine must support countdown timer, question navigation,
answered/unanswered states, persistent answers, auto-save, section navigation,
submit confirmation, and result generation. New tests must be addable later
without rewriting the engine.

## 7. Reading

IELTS-style Reading interface. Left: reading passage. Right: question. Bottom:
question navigation. Include countdown timer, passage navigation, question
navigation, answer state, selected answer, next/previous controls, submit.

Support: Multiple Choice, True/False/Not Given, Yes/No/Not Given, Matching
Headings, Matching Information, Sentence Completion, Summary Completion, Short
Answer.

Should feel like a professional computer-based examination environment. Do not
copy proprietary IELTS branding or copyrighted UI assets.

## 8. Reading results

After submission show raw score, percentage, estimated band, total time,
average question time, accuracy by question type, accuracy by passage.

Then show every incorrect question with: question, user's answer, correct
answer, result, question type, time spent.

Add **"Why was I wrong?"**, opening AI analysis that explains: what the passage
actually says, where the answer can be found, why the correct answer is
correct, why the user's answer is wrong, what reasoning mistake likely
occurred, and how to avoid it in future.

Add **"Show answer in passage"** — highlights the relevant sentence or paragraph.

## 9. Time analysis

Track time spent on each question, each passage, each section. Display it
(e.g. `Question 14 — Time: 02:31`) and then analyse it, e.g. "You spent
significantly longer than your average on this question and still selected the
incorrect answer." The goal is to help students understand time-management
problems, not merely show numbers.

## 10. Listening

IELTS-style Listening test supporting audio playback, question groups, multiple
choice, matching, form completion, sentence completion, note completion, and
map/label questions where appropriate.

Track answer, correctness, time, section, question type. Results show overall
score, estimated band, and per-section breakdown for Sections 1–4, then
mistake analysis.

## 11. Writing — withdrawn

## 12. Writing AI analysis — withdrawn

## 13. Speaking — withdrawn

Writing and speaking are no longer part of the product. The papers, the
submission tables, the evaluator Edge Functions and the result views were
removed in migration 0017.

These three headings are kept, empty, so the section numbers that the rest of
this brief and a good deal of the source refer to by number (§4, §8, §9, §10,
§16, §17) still mean what they say. Renumbering a spec silently invalidates
every comment that cites it.

## 14. Full mock test

Flow: Listening → Reading. Each section behaves independently but belongs to
the same mock session.

At the end calculate the Listening score, the Reading score and an overall
estimated band, then generate an AI overall diagnosis naming the question types
and sections that cost the most marks.

## 15. History

Complete test history page showing test type, section, date, score, band,
duration, improvement. Clicking a test opens its complete result. Filter by
All / Full Mock / Reading / Listening.

## 16. Analysis page

Long-term AI performance analysis: overall progression plus Reading and
Listening progression. Then strengths, weaknesses, recurring mistakes, question
types causing the most errors and time-management problems.

Add a **"What should I improve next?"** section. Recommendations must be based
on actual user data.

## 17. AI architecture

Do not send entire test histories or entire essays unnecessarily. First perform
deterministic analysis and store structured data: question ID, question type,
user answer, correct answer, correctness, time spent, section, passage.

Then send only relevant structured data to the AI, e.g.

```json
{
  "section": "reading",
  "score": 32,
  "total": 40,
  "time_seconds": 2841,
  "mistakes": [
    {
      "question": 14,
      "type": "true_false_not_given",
      "user_answer": "FALSE",
      "correct_answer": "NOT GIVEN"
    }
  ]
}
```

The AI should return structured analysis. Store the result so the same analysis
does not need to be generated repeatedly.

## 18. Database

Clean PostgreSQL schema including at minimum: users, tests, test_sessions,
sections, questions, question_groups, answers, test_results, section_results,
mistakes, ai_analyses, user_progress.

Use proper foreign keys and Row Level Security. Users must only be able to
access their own test sessions, answers, results, AI analyses, and progress.

## 19. Test content

For development, create seed/mock IELTS-style content. Do not use copyrighted
real IELTS test content. Create original sample passages, questions, listening
scripts and questions for development. Structure the
content so it can later be replaced by properly licensed content.

## 20. UX requirements

The application must feel fast. Always provide loading, skeleton, empty, error,
success and disabled states, plus confirmation dialogs where necessary. Do not
leave blank screens while data loads. Use subtle animations only where they
improve usability.

## 21. Responsiveness

Desktop is the primary experience because the actual IELTS computer-based
experience is desktop-oriented. Still make dashboard, history and analysis
responsive for tablets and mobile. The exam interface can prioritize desktop.

## 22. Code quality

Reusable components, clear folder structure, TypeScript types, validation,
error handling, a clean API/data-access layer, and separation between UI and
business logic. Avoid giant components. Avoid duplicated logic. Do not
over-engineer.

## 23. Development order

1. Project architecture, routing, design system, authentication, Supabase, database
2. Dashboard
3. Reusable test engine
4. Reading
5. Reading results + analysis
6. Listening
7. Full Mock
8. History
9. Long-term AI analysis
10. Polish and responsive design

## 24. Important development rule

Do NOT try to implement everything at once. Start with the foundation and
create a working vertical slice. The first milestone is:

Login → Dashboard → Start Reading → Complete test → Submit → Calculate score →
Results → Mistake analysis → Save to database

Only after that flow works should you expand to Listening. Do not generate
fake functionality just to make the UI look complete.
When something is not implemented, create a clean placeholder rather than
pretending it works.

## 25. First task

Create: project architecture, folder structure, design system, routing,
dashboard UI, test selection UI, Supabase database schema, reusable test engine
architecture. Do NOT build all sections yet. Make the foundation
production-quality first.
