# Agent Note: Pad header and archive links to 44 px

Status: rejected — the owner saw the extra space and called it wrong

## Problem

Header links and archive rows are shorter than the 44 px touch target stated for interactive controls. A review treated that gap as a defect.

## Proposal

Give each header link a 44 px box, and give each archive row a 44 px minimum height with the padding inside the box. Measure both at 390 px and 1280 px, in light and dark.

## Alternatives considered

**Leave the text spacing.** This is what remains. The padded layout was built, and the owner rejected it after seeing the archive and header: the extra space looked wrong. Contents and back-to-top still use the 44 px target.
