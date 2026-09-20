# Design language

An editorial design language for the web: flat parchment, ink blue, and expressive serif typography. Adapt layout and density to the content and viewport while preserving this identity.

## Hierarchy

- Give each composition one focal idea. Make supporting context visibly subordinate through scale, weight, and placement.
- Establish hierarchy with typography, spacing, and alignment. Add color or surfaces only when those relationships need further emphasis.
- Preserve content meaning and legibility when they conflict with visual uniformity. Recompose dense material rather than hiding qualifiers or shrinking text to fit.

## Color

Use warm neutrals for the canvas and most content. Reserve ink blue for actions, links, selection, and focal emphasis; keep it a small fraction of the composition.

| Role | Light | Dark |
|---|---|---|
| Canvas | Parchment `#f5f4ed` | Charcoal `#141413` |
| Primary text | Near black `#141413` | Ivory `#faf9f5` |
| Body text | Warm gray `#3d3d3a` | Pale gray `#d4d3cd` |
| Secondary text | Stone `#6b6a64` | Warm silver `#b0aea5` |
| Accent | Ink blue `#1b365d` | Light ink blue `#94b4d4` |
| Quiet surface | Sand `#f0eee6` | Raised charcoal `#252523` |
| Subtle rule | Pale sand `#e8e6dc` | Deep gray `#3d3d3a` |

Select colors by role; a composition need not use every swatch. Keep neutral tones warm rather than blue-gray, and canvases softer than pure white or black. In dark compositions, use the lighter accent and preserve the same foreground hierarchy.

Photographs and product screenshots retain their original colors. Data and status may use additional colors only when the existing palette cannot communicate a necessary distinction. Pair each such distinction with a label, shape, or pattern.

## Typography

Use one primary family for headings and prose within a language:

| Role | Preferred character and family |
|---|---|
| Chinese | Soft, handwritten strokes: Tsanger JinKai 02 |
| English | Readable editorial serif: Charter |
| Japanese | Literary Mincho: Yu Mincho |
| Code and literal identifiers | Clear monospace: JetBrains Mono |

Choose licensed, available substitutes with similar proportions. Keep mixed-language text optically balanced with a consistent fallback strategy. A complementary sans serif may serve dense interface controls; retain the primary family for editorial content.

Use regular body text and medium headings or emphasis, normally real weights 400 and 500. Keep CJK text upright and body tracking near its natural spacing. Heavy or synthetic bold should not carry the hierarchy.

Use a small type scale: display, title, section heading, body, and caption. Equivalent elements share size, weight, and leading even when one string is longer. Headlines have tighter leading than prose; sustained reading and dense CJK glyphs need more breathing room. Start near 60 to 70 Latin characters or 30 to 40 CJK characters per line, then adjust to the typeface.

Allow natural wrapping. Reflow before reducing type, and change wording only when content editing is authorized. All text, including captions and chart labels, must remain legible at the intended display size and reading distance.

## Composition and spacing

Choose the reading order and focal object before the grid. Use a reading column for continuity, aligned alternatives for comparison, and wider fields for images or evidence. Equal cells suit true peers; give unequal material space proportional to its importance. The first viewport establishes identity and purpose through text, an image, evidence, or a working tool.

Align related elements to shared edges and baselines. Repeated groups share internal alignment as well as outer dimensions. Keep label-to-value and heading-to-passage gaps close, gaps between groups larger, and major transitions largest. Maintain clear gutters even when adjacent text wraps.

Open space frames the focal object. Merge or recompose underfilled groups; preserve spaciousness when a complete statement or image earns it. Vary density and layout as the content changes while retaining the same type roles and spacing rhythm.

Keep headings with the content they introduce, captions with their figures, and qualifications near the evidence they explain. Preserve these relationships when content reflows.

## Surfaces and boundaries

Start with a continuous, flat canvas. Use a quiet fill to group independent content and a boundary to define a control or state. Prefer one grouping cue over stacked fills, borders, and shadows. Keep corners modest and consistent; stronger emphasis comes from the content's hierarchy.

Section headings use type and space; quotations use indentation and breathing room. Reserve rules for actual separation, table rows, chart axes, connectors, and state indicators. Remove a rule if meaning, grouping, navigation, and state remain clear without it.

Keep ordinary metadata as plain text. Use badges only for meaningful categories or states. The paper character comes from color and typography, not texture, distressed edges, gradients, glass, glows, or ornamental shadows.

## Tables and charts

Tables use neutral text, generous row spacing, and light horizontal rules. Left-align text and right-align comparable numbers, with headers matching their columns. Use tabular numerals and consistent units and precision for numerical comparisons. Distinguish totals through weight and placement. Add neutral striping only when readers otherwise lose their row; compress spacing only for genuinely dense lookup.

Charts use ink blue for the focal series and warm neutrals for context. Share scales across comparable marks, label units and bases, and prefer direct labels where they remain clear. Keep annotations outside data marks and text unobstructed. Captions state the useful finding or limitation. Provide a text or table alternative for material data.

## Images and diagrams

Choose an image's job before its frame: demonstrate a product, identify a subject, explain a relationship, or supply evidence. Size the image for that job. Use real assets for logos and product screenshots; label conceptual reconstructions as illustrations.

Fit screenshots, logos, and document pages without losing meaningful content. Use neutral padding or split dense screenshots into readable details when proportions differ. Crop photographs around their subject while preserving relevant context. Keep captions about the subject, not image-generation or crop instructions.

Diagrams use simple geometric forms, consistent thin strokes, warm neutrals, and selective ink blue. Connectors express relationships and stay clear of labels. Use icons only when they improve recognition, with one consistent icon style.

## Interaction and access

Keep links distinguishable from prose, keyboard focus visible, and control states recognizable. Separate selected, disabled, loading, and error states wherever they exist. Meet WCAG AA contrast for text and controls; secondary text must remain readable, and color alone must not carry meaning.

Within an action group, give the primary action the strongest emphasis and secondary actions quieter treatments. Navigation makes the current location clear. Form labels remain visible when fields contain values; place errors beside the affected fields and preserve entered content.

Default to stillness. Motion explains a state change or confirms an action, respects reduced-motion preferences, and leaves the complete reading experience available without animation or hover.

On narrow screens, reflow in reading order while preserving readable type, labels, and touch targets. Tables and code may scroll locally when their structure matters; the page itself stays within the viewport. Preserve keyboard access, meaningful text alternatives, and usability with enlarged text. Essential content and actions remain available on touch devices without hover.
