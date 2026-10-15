/**
 * Clamp a label's centre position (as a percentage) so the label stays within its container.
 *
 * The caller applies `translateX(-50%)` to centre the label on `left`, so `left` is the
 * label's CENTRE, not its left edge. This function bounds that centre between
 * `labelWidthPct / 2` and `100 - labelWidthPct / 2`, keeping the entire label inside.
 *
 * @param playheadPercent - Where the playhead sits, 0–100.
 * @param labelWidthPct - The label's width as a percentage of the container.
 * @returns A percentage suitable for `left`, with `translateX(-50%)` applied.
 */
export const clampLabelCentre = (playheadPercent: number, labelWidthPct: number): number =>
  Math.max(labelWidthPct / 2, Math.min(playheadPercent, 100 - labelWidthPct / 2));
