# DESIGN.md — Design System & Tokens

## Aesthetic Direction
**Tactile Warm Family Keepsake Album**: Inspired by linen-bound family photo books, warm cotton rag paper, and children's picture-book typography. Warm, natural, and gently playful without any generic dashboard/SaaS patterns.

## Color Palette (OKLCH — Tinted Warm Neutrals + Persimmon & Sage)
- `--bg-paper`: `oklch(97.4% 0.011 78)` (Warm archival linen cream)
- `--bg-card`: `oklch(98.7% 0.007 80)` (Soft cotton rag sheet)
- `--bg-inset`: `oklch(94.8% 0.016 75)` (Tinted warm sand well)
- `--bg-sticky-note`: `oklch(95.5% 0.045 92)` (Warm Post-it butter yellow for tactile story notes)
- `--ink-primary`: `oklch(23% 0.022 52)` (Deep warm espresso ink — never `#000`)
- `--ink-secondary`: `oklch(42% 0.024 55)` (Warm walnut body prose)
- `--ink-muted`: `oklch(56% 0.020 58)` (Soft sepia caption & metadata ink)
- `--accent-terracotta`: `oklch(58% 0.145 40)` (Warm persimmon / terracotta — primary story accent)
- `--accent-citrus`: `oklch(72% 0.145 68)` (Fresh orange-juice amber for Story 02)
- `--accent-sage`: `oklch(52% 0.075 155)` (Gentle botanical leaf green for Story 03)
- `--border-hairline`: `oklch(88% 0.016 74)` (1px warm paper border)

## Typography
- **Display & Story Titles**: `'Fraunces'`, `'Noto Serif SC'`, Georgia, serif — warm, literary, expressive optical size with gentle curves.
- **Body Prose & UI**: `'Plus Jakarta Sans'`, `'Noto Sans SC'`, sans-serif — clear, generous legibility capped at `65ch`.
- **Marginalia & Labels**: `'JetBrains Mono'` / humanist small-caps tracking for archival story numbers (`01`, `02`, `03`) and media timestamps.

## Layout & Anti-Bans
- **No side-stripe borders** (`border-left > 1px` is strictly banned). Quotes use full-frame archival index cards with subtle corner marks and top/bottom hairlines.
- **No identical card grids**: Each story has a bespoke editorial composition matching its narrative arc:
  - *Story 01 (Monkey King)*: Split literary spread with an inset "Book of Life & Death" verbatim quote card and cultural footnote badge.
  - *Story 02 (Toys to Orange Juice)*: 5-step horizontal/vertical narrative journey strip (`Pretend Shop → Prep & Poster → First Stand → Second Stand → Popsicles with Friends`) paired with media frames.
  - *Story 03 (Big Brother)*: Dialogue-led sibling vignette featuring the `"妹妹, trade with me!"` swap card and everyday role-model moments.
