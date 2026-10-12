# Design System: Sovereign Health Diagnostic Pipeline
**Project ID:** 7221245060446990275

## 1. Visual Theme & Atmosphere
Calm, editorial and evidence-led, like a well-edited business case study in a quality newspaper. Light theme on a warm paper-white canvas. Balanced density (5 of 10): generous section breathing room on narrative pages, tighter grids on the dashboard. Predictable, left-aligned layouts with a single readable column for prose and wide grids for data. Motion is restrained: no decorative animation; only state changes such as toggles and tooltips. The page must read clearly to a non-technical hiring manager who skims: big plain headline, one plain sentence per section, numbers shown as before-and-after pairs.

## 2. Color Palette & Roles
Chrome colors (interface only, never used for data):
- **Warm Paper Canvas (#f6f6f3):** page background.
- **Pure Surface White (#ffffff):** cards, tiles, chart containers.
- **Soft Linen (#f1f0eb):** secondary surfaces, table headers, track backgrounds.
- **Deep Harbor Navy (#14365d):** brand mark, primary buttons, links, active navigation.
- **Pale Harbor Wash (#e6edf5):** active nav pill, callout and "in short" backgrounds.
- **Midnight Ink (#0f1d30):** headlines and body text.
- **Slate Ink (#4a5160):** secondary text, ledes, captions.
- **Quiet Gray (#7a7e86):** eyebrows, notes, axis labels.
- **Hairline Stone (#e3e2dc):** card borders and dividers. Stronger border: #c9c7bd.

Data colors (fixed, validated for color-vision deficiency, used only for data):
- **Before / As-Is Ember Orange (#eb6834):** the old process.
- **After / To-Be Signal Blue (#2a78d6):** the redesigned process.
- **Value-Added Green (#1baf7a):** time that actually changes the sample or result.
- **Neutral Waiting Gray (#8a8f98):** waiting or non-value time.
Status colors are reserved and always paired with an icon and label: good #0ca30c (text #006300), critical #d03b3b (text #b42318).

## 3. Typography Rules
- **IBM Plex Sans** for interface, body, labels and all numbers. Weights 400, 500, 600. Body 16px, leading 1.6, prose capped at 68 characters per line.
- **IBM Plex Serif** at weight 500 for case study headlines only (hero and section titles), tight tracking (-0.01em to -0.015em). Never used on the dashboard.
- **IBM Plex Mono** for section numbers ("01 · The problem"), code excerpts and small tags.
- Eyebrows: 12px, weight 600, uppercase, 0.08em tracking, Quiet Gray.
- Big numbers: Plex Sans 600, tight tracking, tabular figures.

## 4. Component Stylings
- **Buttons:** gently rounded (8px). Primary is solid Deep Harbor Navy with white text; secondary is white with a navy hairline border and navy text. Arrow icon on the primary. No glows.
- **Cards/Containers:** white surface, 1px Hairline Stone border, softly rounded corners (10px), whisper-soft navy-tinted shadow. Cards only where grouping matters.
- **KPI tiles:** compact white tiles in an auto-fit grid. Label on top in Slate Ink, then the before and after values side by side with a small paired bar in orange and blue, then a one-line note.
- **Chart cards:** title, one-line "how to read this" caption, chart, legend below, and a small "Table" toggle in the top right.
- **Inputs/Forms:** segmented controls on a Soft Linen track with a white raised active pill; selects with 6px corners and a strong hairline border.
- **Definitions:** jargon terms get a dotted underline; on hover, focus or tap a small white tooltip card shows a plain one-sentence definition.

## 5. Layout Principles
- Max content width 1180px, 16px side gutters, single column below 760px with no horizontal scroll.
- Narrative sections are separated by hairline rules with 56px vertical padding. Each section: mono section number, serif headline that states the takeaway, one plain "in short" sentence, then detail.
- Case study has a slim sticky progress rail with four stages (Problem, Cause, Fix, Result).
- Dashboard: filter bar, KPI row, then a two-column chart grid with full-width cards for the widest charts.
- Touch targets at least 44px; visible focus ring in Signal Blue.
