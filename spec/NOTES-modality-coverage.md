# Note — modality coverage & where the language earns its keep

> **Status:** exploratory note, not a proposal. Captures a scope discussion (2026-06-28).
> Nothing here is committed; the point is to record the *decision frame* before any work.
> Cross-refs: [`PRELUDE.md`](PRELUDE.md) §1/§3/§6/§7, [`ROADMAP.md`](ROADMAP.md).

## The question

The prelude is screen-and-pointer/touch/focus complete and already anticipates TV
navigation (`input.remote`, `platform.tvos`, `browse(spatial)`, `ring`→"tv strong
highlight"). The real question is **not** "can we add atoms for smartwatch / smart-TV /
voice / XR / automotive" — that's easy. It is: **is the *rest* of the language abstract
enough that Milda has genuine leverage in those domains, or does it degenerate into a thin
wrapper (or actively fight the domain)?**

## The core insight: the language stratifies by transferability

Milda's value comes from **divergence under a shared contract**. The bigger the
per-target divergence over a *stable invariant*, the more the abstraction captures. But
the layers do not transfer equally:

**Tier 1 — modality-agnostic core (value *grows* off-screen):**
- **Behavior atoms as state machines** — the most abstract layer; it's math, not pixels.
  A `media-transport` machine (`idle/playing/buffering/seeking/ended`) is exactly as
  portable as `async-state`. A voice turn-taking machine
  (`listening/recognizing/responding/confirming`) is *also* a genuine state machine. The
  machine doesn't care whether the output is pixels, audio, or haptics. **This is the deep
  bet paying off.**
- **Contract = identity**, the `realize`/substitution *mechanism*, and the **token layer +
  context dimensions** (`platform × scheme × density × brand`). A `primary` color or a
  `duration` token is valid on a watch face, an AR panel, or as a haptic pattern length.

**Tier 2 — screen-bound surface (value *collapses* with no display):**
- **Facets** (`fill/ink/border/corner/elevation/ring/backdrop`) are resolutely
  2D-visual-surface concepts. For voice the "paint vocabulary" would be
  persona/rate/prosody/earcon — a *completely different* vocabulary. For haptics:
  sharpness/intensity/pattern. These are the **least** transferable layer.
- **Anatomy** (the `container|item|text|control|input|icon|content` part-tree) is also
  screen-shaped: it collapses for voice, and needs depth/anchor for XR.

Note the tension: Tier 2 (facets + anatomy) is exactly what is **differentiated and
monetized today** (Figma export, token import, exact style defaults). Tier 1 is the more
abstract — but also the more commoditized — half.

## The test

> Milda adds real value in a domain iff **(a)** a stable contract spans ≥2 targets in it
> with *non-trivial* divergence, **and (b)** *more than the behavior layer* transfers —
> otherwise you're competing with a plain state-machine library (XState), with no
> design-system leverage.

| Domain band | Screen? | (a) contract+divergence | (b) surface layer transfers | Verdict |
|---|---|---|---|---|
| **TV-media, smartwatch, automotive display** | yes | ✅ | ✅ full stack | **Full value.** Only missing atoms (`media-transport`) + capabilities (`rotary`). Additive *within* the architecture. |
| **XR / spatial** | half (2D panel in 3D) | ✅ | ⚠️ needs facet/anatomy depth extension | **Value, but you must earn it.** Without the extension you emit flat panels → the native XR dev rewrites by hand. |
| **Voice / headless / haptic-only** | no | ✅ | ❌ only behavior transfers | **Real but narrow, and a *different shape* of value.** |

## Verdict

- **Architecturally, the language is abstract enough** — the state-machine + token +
  contract + realize core is genuinely modality-independent. That is the defensible part.
- **But value density drops as you leave the screen**, because Tier 2 (the current
  differentiator + revenue) is what doesn't carry. In headless/voice the center of gravity
  shifts from the "design system / paint" half to the "behavior / contract" half — which is
  (i) less differentiating and (ii) detached from the design-system buyer the business
  model targets (platform team, not bottom-up dev).
- **Active risk, not just lost upside:** forcing screenless modalities into the
  anatomy/facet model would *harm* the abstraction — bolting voice/haptic into a visual
  tree where they don't belong pollutes the clean screen model that *is* the product.
  (Flag-platform-independence-risks territory.)

## Three lanes — keep them separate, do NOT treat as one continuum

1. **Now, within the architecture:** TV-media + smartwatch + automotive display. All
   *screen-based* → full stack leverage. `media-transport` atom + `input.rotary` /
   `display.always-on` capabilities. Low risk, high value, in line with the current product.
2. **Gated bet (like native generation):** XR — only against a design partner, and only if
   you commit to the spatial facet/anatomy extension; otherwise it fails on (b).
3. **A deliberate scope call, not drift:** voice/headless. The question is positioning, not
   tech: is the north star truly "*any* human-computer interaction," or honestly "any
   *screen-based* design system"? If the latter (the right focus today), **say so in the
   spec** — `input.voice` is a declared capability with *no atom that consumes it*
   (`preludeV0.ts`), so the catalog currently makes a promise it doesn't keep.

## The only "north-star" item that would unlock (b) off-screen

Generalize `anatomy` from a visual part-tree into an abstract **"interaction surface,"** of
which the visual tree is *one* realization. That would let headless modalities pass test
(b). But it's a v2 reframe that dilutes today's focused value prop — **not** an atom
addition. Not recommended now; recorded so the option is explicit.

## Loose end to close cheaply regardless of lane choice

`input.voice` consumed by nothing is a dangling capability. Either add a consumer atom or
mark it aspirational in §6 — small honesty fix, independent of the bigger scope decision.

> **Closed (2026-07-02):** marked aspirational, not consumed. `input.voice` in
> `preludeV0.ts` now carries `status: 'aspirational'` (a `CapabilityDef.status` field added
> for exactly this) plus a source comment pointing back here. No consumer atom was added —
> per lane 3 above, voice/headless is a deliberate scope call, and the catalog now says so
> instead of making a promise it doesn't keep.

## Standing guardrail (recorded 2026-07-05)

Beyond the three lanes above, more targets are plausible over time: TV/remote (already
underway), wearables (rotary/crown input), voice/headless, spatial/XR, native desktop
toolkits, screenless or non-interactive exports (print/PDF, HTML email), and others not yet
named. The lanes classify *today's* candidates; this entry fixes the rule that outlives any
one of them:

> **No single core-language decision (grammar, AST schema, atom/state-machine shape) may
> foreclose extension to a platform or modality not yet anticipated.** Divergence is always
> pushed to the *realization/capability* layer (§6, `requires`/`realization` columns per
> archetype), never baked into the core as a platform-specific assumption. `platform.{web,
> ios,android,tvos,…}` and the open-ended `input.*`/`display.*` capability namespaces (§6)
> are the enforcement mechanism — gating is by declared capability, never by platform name
> or by a fixed enum of "supported" platforms.

Practical test for any future core change: *if this were evaluated against a platform we
haven't thought of yet, would the core have to change, or only the capability/realization
mapping?* If the former, the change belongs one layer down. This does not commit to
building any of the lanes above — see the lane discipline (§ Three lanes) for that — it only
commits the *core* to staying agnostic about which ones eventually get built.
