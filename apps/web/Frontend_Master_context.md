# GROUNDGUARD FRONTEND — MASTER DESIGN + IMPLEMENTATION INSTRUCTION

You are helping me build the production frontend for an existing product called GroundGuard.

This is NOT a quick dashboard, hackathon UI, generic RAG chatbot, or ChatGPT clone.

Treat this as a real product being prepared for launch.

==================================================
1. SOURCE OF TRUTH
==================================================

The existing repository is the source of truth.

Before changing anything:
- inspect apps/web
- inspect package.json
- inspect current Next.js structure
- inspect existing components
- inspect global styles
- inspect Tailwind/shadcn setup
- inspect existing API/types/contracts where relevant

Do NOT invent paths, APIs, backend capabilities, types, or already-installed dependencies.

Do NOT redesign backend contracts merely because a frontend idea would be easier.

Browser communicates ONLY with M3/backend.

Do not directly call:
- M2
- M1
- PostgreSQL
- Redis
- Qdrant
- Tantivy
- NetworkX

==================================================
2. PRODUCT DESIGN GOAL
==================================================

GroundGuard should feel:

- calm
- precise
- high-trust
- modern
- highly polished
- technically credible
- professional
- interactive
- distinctive
- pleasant to use for long sessions
- minimal where simplicity helps
- detailed where detail is actually useful

The UI must satisfy human needs first.

Do NOT crowd the interface just because the backend exposes lots of information.

Design principle:

CALM ON THE SURFACE.
POWERFUL UNDERNEATH.

A normal user should easily understand:

Ask
→ Answer
→ Source
→ Trust

A technical/developer user should be able to drill deeper:

Claim
→ Evidence
→ Verification
→ Recovery
→ Scores
→ Models
→ Trace
→ Latency

Use progressive disclosure.

Never dump advanced metadata into the default experience.

==================================================
3. REFERENCE PRODUCTS
==================================================

Study these products for interaction/design patterns.

Do NOT clone their exact UI.

LINEAR
Reference for:
- application shell
- sidebar
- information density
- command palette
- keyboard-first UX
- contextual panels
- subtle motion
- visual hierarchy
- calm professional surfaces

VERCEL
Reference for:
- project-oriented product navigation
- status presentation
- developer-friendly details
- logs/runtime-like information
- clean typography
- restrained layouts

PERPLEXITY
Reference for:
- answer-first interaction
- inline citations
- source exploration
- conversational research
- clean answer readability

ARIZE PHOENIX
Reference for:
- traces
- evaluations
- failure investigation
- AI observability
- detailed technical drill-downs
- experiment-style interfaces

LANGSMITH
Reference for:
- execution timelines
- runtime states
- nested operations
- recovery/debug flows
- developer inspection

ACETERNITY UI
Use selectively for:
- landing-page visual experiences
- subtle grids
- spotlight effects
- animated borders
- premium interactive visuals

Do NOT make the actual product workspace look like an Aceternity showcase.

SHADCN/UI
Use as the accessible functional component foundation.

FRAMER MOTION
Use as the primary motion/state-transition system.

==================================================
4. VISUAL RULES
==================================================

DO NOT use the generic AI visual language.

Avoid:
- purple AI gradients
- giant gradient blobs
- neon cyberpunk appearance
- meaningless particles
- random floating icons
- excessive glassmorphism
- excessive shadows
- emojis as interface icons
- overly rounded everything
- visual effects with no UX purpose
- excessive cards everywhere

Preferred visual direction:

- graphite
- charcoal
- slate
- warm/off-white surfaces
- restrained borders
- strong typography
- subtle depth
- mono typography for technical metadata
- semantic status colors

Brand color and semantic state colors must remain separate.

Canonical states include:

pending
verified
recovered
flagged
needs_review

Status must never rely on color alone.

==================================================
5. MOTION PHILOSOPHY
==================================================

Motion is a first-class part of the product.

But motion must communicate:

- state
- hierarchy
- continuity
- causality
- progress
- interaction

Not decoration.

Use Framer Motion.

Rough timing language:

Micro interactions:
120–180ms

Normal UI transitions:
180–260ms

Meaningful state transitions:
260–420ms

Narrative/scroll animation:
landing page only where appropriate

Product workspace:
mostly restrained.

Landing page:
more expressive.

Always support prefers-reduced-motion.

==================================================
6. LANDING PAGE MOTION IDEAS — DO NOT FORGET
==================================================

The landing page should eventually contain:

A. LIVE TYPE / BACKSPACE HERO

Text types naturally:
→ pauses
→ backspaces
→ types a different question

Not generic:
"AI for your business"

Use questions that communicate GroundGuard's purpose, e.g.:

Can I trust this answer?
Where did this claim come from?
What happens when the evidence disagrees?
Can AI correct itself before I see the error?

The typing experience may eventually transition into the interactive product demonstration.

B. CURSOR-REACTIVE EVIDENCE FIELD

This replaces the generic knowledge-graph background.

Do NOT use industrial IDs like P-101A as the brand atmosphere.

Concept:

Ambient fragments of uncertain information:

"42.7%"
"Annual Report"
"Page 18"
"$12.4M"
"Policy revision"
"...increased year over year"
"effective from January"
"[ source / 04 ]"
"rev. 3"

They exist at different visual depths.

Normally:
- faint
- partially blurred
- fragmented
- disconnected

Near the user's pointer:
- sharpen
- become more visible
- reveal provenance
- reveal subtle relationships
- supporting connections strengthen
- conflicting relationships break
- alternative relationship may form

The cursor acts metaphorically as a verification/focus lens.

The environment responds to the cursor.

Do NOT make objects literally chase the cursor.

Potential layers:

Layer 0:
subtle coordinate/reasoning surface

Layer 1:
ambient information fragments

Layer 2:
evidence nodes/connections

Layer 3:
cursor verification lens

Layer 4:
hero content

Layer 5:
interactive product demonstration

Possible very subtle temporary cursor evidence path:
node → node → node
then fade.

No glowing particle trail.

C. SCROLL STORYTELLING

Do NOT merely fade every section into view.

Different major sections should have meaningful motion.

Possible interactions:

Hero
→ evidence detaches
→ retrieval visualization

Query
→ semantic / lexical / relationship paths
→ candidate evidence converges

Generated claim
→ evidence appears
→ conflict becomes visible
→ bad claim intercepted
→ corrected claim appears
→ verified

Recovery:
Original
→ failure
→ retrieval
→ replacement
→ reverification

Use sticky sections where useful.

Use spring entrance for normal section elements:
small y translation
slight scale
opacity
controlled stagger

D. MAGNETIC CTAs

Only major marketing CTAs.

Very subtle pointer attraction.

Do not make every button magnetic.

E. CONTEXTUAL CURSOR ENHANCEMENT

Do not replace the system cursor globally.

Certain interactive marketing/evidence elements may display contextual labels such as:

Inspect
Explore
Open source

Desktop/fine-pointer only.

==================================================
7. LOADING + SKELETON SYSTEM
==================================================

Do NOT rely on giant centered spinners.

Skeletons should match the actual interface.

Examples:

Answer skeleton:
include placeholders aligned to future claim/grounding indicators.

Knowledge skeleton:
realistic document rows and varying content widths.

Inspector skeleton:
Claim
Status
Evidence
Source

Use very restrained pulse/shimmer.

No aggressive sweeping light effect.

Whenever real runtime status exists, prefer meaningful progress text over a generic loader.

==================================================
8. GROUNDGUARD-SPECIFIC INTERACTIONS
==================================================

These are product identity features.

GROUNDING RAIL

A subtle vertical trust rail aligned with factual claims.

Each claim can show states like:

verified
recovered
needs review
flagged
pending

Clicking a marker opens the contextual inspector.

EVIDENCE LENS

Optional evidence inspection mode.

Can reveal:
- evidence-backed phrases
- citations
- source relationships
- recovery markers

Keep normal reading mode clean.

RECOVERY PLAYBACK

For recovered claims show:

Original claim
↓
Failure reason
↓
New evidence
↓
Candidate/revised claim
↓
Reverification
↓
Recovered

This is observable product state.

Do NOT expose hidden chain-of-thought.

TRUST SUMMARY

Compact answer-level information such as:

12 claims
9 verified
2 recovered
1 needs review

Do not overwhelm the answer.

==================================================
9. APPLICATION MOTION
==================================================

The logged-in application should be calmer than the landing page.

Use motion for:

- sidebar collapse
- inspector opening/closing
- page continuity
- citation → evidence inspector
- evidence → document transition
- pending → verified
- flagged → recovery → recovered
- command palette
- toasts
- skeleton → content
- charts

Avoid ambient cursor effects inside productivity views.

Target feeling:

80% calm
20% moments of intelligence.

==================================================
10. PRODUCT INFORMATION ARCHITECTURE
==================================================

Current main frontend structure:

PUBLIC

Landing
Login
Signup


PROJECT WORKSPACE

Overview
Ask
Knowledge
Reliability
Settings


Important subroutes:

Ask
→ conversation

Knowledge
→ document detail/viewer

Use routes for major user tasks.

Use contextual inspector/panel/drawer for deep detail.

Do NOT create separate normal-user pages for:

Claim
Evidence
Verification
Recovery
Retrieval Trace
Model Scores

These should be inspectable contextual surfaces.

==================================================
11. APPLICATION SHELL
==================================================

Desktop concept:

Sidebar
+
Main workspace
+
optional right-side Inspector

Sidebar:

GroundGuard

Overview

Ask
Knowledge

Reliability

Settings

Bottom:
Project switcher
User menu

Support collapsed mode.

Support command palette:
Cmd/Ctrl + K

Tablet:
collapsed sidebar
Inspector becomes Sheet/Drawer

Mobile:
appropriate mobile navigation
Inspector becomes bottom sheet

==================================================
12. USER VS DEVELOPER EXPERIENCE
==================================================

NORMAL USER DEFAULT:

Status
Source
Document
Page
Simple explanation

Example:

Verified
Source: Operations Manual · Page 42

ADVANCED DETAILS ON DEMAND:

entailmentScore
contradictionScore
neutralScore
groundingScore
modelVersion
requestId
generationId
retrieval route
RRF score
rerank score
recovery attempt
latency

Do not put this into the normal answer UI by default.

==================================================
13. DOCUMENT EXPERIENCE
==================================================

Documents are first-class product objects.

Need to support:

upload
processing
ready
failed
document library
document metadata
page navigation
source/evidence navigation

Very important interaction:

Claim
→ Evidence
→ Citation
→ Document
→ Exact page
→ Highlighted supporting evidence

This flow must eventually feel extremely polished.

==================================================
14. FRONTEND ARCHITECTURE
==================================================

Preferred direction:

Next.js App Router

shadcn/ui
→ functional/accessibility foundation

Framer Motion
→ transitions and state motion

Aceternity UI
→ selective landing-page experiences

TanStack Query
→ server state

Local React state / small Zustand store only where appropriate for UI state such as:

selectedClaimId
inspectorOpen
sidebarCollapsed
activeInspectorTab

Do NOT dump all application data into global state.

Frontend runtime integration should eventually support:

REST persisted state now
→ SSE runtime adapter later

Do not fake production SSE or token streaming.

==================================================
15. ACCESSIBILITY
==================================================

Must be designed in from the beginning.

Requirements include:

keyboard navigation
visible focus
semantic HTML
screen-reader labels
good contrast
no color-only statuses
reduced motion
appropriate touch targets
accessible dialogs/sheets/tooltips

Motion cannot contain information that disappears completely when reduced-motion is enabled.

==================================================
16. PERFORMANCE
==================================================

Visual sophistication must not destroy performance.

Prefer:

CSS transforms
Framer Motion
SVG

Use requestAnimationFrame only where required.

Do NOT immediately introduce Three.js/WebGL.

Only use it later if there is a genuine need and profiling supports it.

Lazy-load:
PDF viewer
large charts
heavy visualization components

Avoid unnecessary client components.

==================================================
17. HUMAN-CENTERED UX STANDARD
==================================================

This is extremely important.

Do not optimize for screenshots.

Optimize for a person using GroundGuard for hours.

Users should feel:

calm
oriented
in control
confident
comfortable

Avoid:

cognitive overload
constant animation
too many badges
too much metadata
excessive cards
excessive choices
unclear hierarchy
visual shouting

If detail is unnecessary:
keep it minimal.

If detail helps the user make a trust decision:
show it clearly.

Everything should have purpose.

==================================================
18. IMPLEMENTATION QUALITY
==================================================

Think like:

senior product designer
+
senior frontend engineer
+
accessibility-conscious UX designer

Not:

AI generating a fancy landing page.

Follow production-quality:

responsive behavior
maintainable components
consistent tokens
real states
error handling
loading handling
accessibility
performance
clean architecture

Do not overengineer abstractions before they are necessary.

==================================================
19. CURRENT BUILD ORDER
==================================================

Frontend work is divided into:

F1 — Foundation
F2 — Landing
F3 — App Shell + Auth + Overview
F4 — Knowledge + Upload + Document Viewer
F5 — Ask + Answer + Evidence/Verification/Recovery
F6 — Reliability + Production Polish

We are CURRENTLY STARTING F1 ONLY.

Do NOT build the entire frontend yet.

==================================================
20. F1 — CURRENT TASK
==================================================

First inspect the existing frontend.

Report:

1. actual apps/web structure
2. current Next.js version/setup
3. styling/Tailwind setup
4. current component library setup
5. installed dependencies
6. existing routes/pages
7. existing theme/styles
8. existing API/frontend state utilities
9. anything already implemented that we should preserve
10. conflicts between current source and this design direction

DO NOT MODIFY CODE YET.

After inspection, propose the smallest F1 implementation plan covering:

- typography
- color/theme tokens
- semantic status tokens
- spacing/layout foundation
- shadcn primitives required
- Framer Motion foundation
- motion constants
- reduced-motion support
- skeleton foundation
- app shell layout primitive
- responsive foundations
- TanStack Query/API foundation if not already present
- error/loading boundaries

Then STOP.

I will approve that plan before implementation.

==================================================
21. FINAL RULE
==================================================

Do not make GroundGuard:

"fancy AI website."

Make it:

"a calm, modern, deeply considered reliability product that happens to have exceptional visual craft."

Every animation, component, visual effect and detail should earn its place.
refer these apps Linear, Vercel, Perplexity, Arize Phoenix and LangSmith and the mapping above
study interaction principles, not reproduce layouts pixel-for-pixel.

`