# GroundGuard — Frontend Design Decisions

## Product personality
- Calm on the surface, powerful underneath.
- Professional, modern, precise, high-trust.
- Minimal where possible, detailed when useful.
- Designed for long comfortable use.
- No generic AI aesthetic.

## Reference mapping
- Linear → shell, hierarchy, command palette, panels, density
- Vercel → project/developer UX, statuses, technical detail
- Perplexity → answer + citation/source interaction
- Arize Phoenix → evaluation, traces, observability
- LangSmith → execution/recovery timelines
- shadcn/ui → functional component foundation
- Framer Motion → motion/state transitions
- Aceternity UI → selective landing-page effects only

## Locked pages
Public:
- Landing
- Login
- Signup

Workspace:
- Overview
- Ask
- Knowledge
- Reliability
- Settings

Subroutes:
- Ask conversation
- Document viewer

Do NOT make standalone normal-user pages for:
- Claims
- Evidence
- Verification
- Recovery
- Retrieval traces

Use the Inspector instead.

## Core layout
Desktop:
Sidebar + Main + optional right Inspector

Tablet:
Collapsed sidebar + Inspector Sheet

Mobile:
Mobile navigation + bottom-sheet Inspector

## GroundGuard signature UX
1. Grounding Rail
2. Evidence Lens
3. Recovery Playback
4. Trust Summary
5. Contextual Inspector

## Landing signature
Cursor-Reactive Evidence Field:
- ambient information fragments
- subtle coordinate surface
- evidence relationships
- cursor verification/focus lens
- conflict/recovery transformations
- no random particles
- no industrial P-101A-style atmosphere

Hero typing:
- type
- pause
- backspace
- next phrase
- eventually connect into product demo

Example ideas:
- Can I trust this answer?
- Where did this claim come from?
- What happens when the evidence disagrees?
- Can AI correct itself before I see the error?

## Motion rules
- Motion communicates state, hierarchy, continuity or causality.
- Landing = expressive.
- Product = restrained.
- 120–180ms micro
- 180–260ms normal UI
- 260–420ms meaningful state
- scroll-driven storytelling only where justified
- prefers-reduced-motion always supported

Landing may use:
- cursor interaction
- scroll-linked transformations
- sticky storytelling
- spring entrances
- magnetic primary CTAs
- evidence-path animation

Product may use:
- sidebar layout animation
- Inspector transition
- page continuity
- verification-state animation
- recovery morph
- citation → evidence → document continuity
- command palette
- subtle chart animation

## Loading
No giant generic spinner.

Use content-shaped skeletons:
- Answer skeleton
- Document list skeleton
- Inspector skeleton
- Overview skeleton

Use real status/progress when backend provides it.

## Appearance
Avoid:
- AI purple gradients
- neon cyberpunk
- excessive glassmorphism
- emoji UI
- meaningless floating icons
- excessive cards
- random decorative animation

Direction:
- graphite / charcoal / slate
- warm off-white
- subtle borders
- restrained depth
- strong typography
- Geist/Geist Mono direction
- semantic status colors separate from brand accent

## UX hierarchy
Normal user:
Answer → Status → Source → Page

Advanced details:
Scores → modelVersion → requestId → retrieval route → recovery → latency

Advanced metadata is hidden behind progressive disclosure.

## Build order
F1 Foundation
F2 Landing
F3 Shell + Auth + Overview
F4 Knowledge + Upload + Document Viewer
F5 Ask + Answer + Inspector + Recovery
F6 Reliability + Production Polish

Current task:
F1 only.