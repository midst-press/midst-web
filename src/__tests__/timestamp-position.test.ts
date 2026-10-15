import { clampLabelCentre } from '../components/MidstPlayer/timestamp-position';

describe('clampLabelCentre', () => {
  // These are arithmetic tests of the clamping formula. They do NOT test the ResizeObserver
  // wiring or re-measurement — that requires a browser test (see e2e/).

  it('keeps the label centred in the middle', () => {
    expect(clampLabelCentre(50, 10)).toBe(50);
  });

  it('clamps the centre at the left edge (label width 10%)', () => {
    // Centre must be at least labelWidth/2 = 5 so the label's left edge is at 0.
    expect(clampLabelCentre(0, 10)).toBe(5);
    expect(clampLabelCentre(3, 10)).toBe(5);
    expect(clampLabelCentre(-5, 10)).toBe(5);
  });

  it('clamps the centre at the right edge (label width 10%)', () => {
    // Centre must be at most 100 - labelWidth/2 = 95 so the label's right edge is at 100.
    expect(clampLabelCentre(100, 10)).toBe(95);
    expect(clampLabelCentre(95, 10)).toBe(95);
    expect(clampLabelCentre(99, 10)).toBe(95);
  });

  it('handles a wide label that nearly fills the container', () => {
    expect(clampLabelCentre(50, 95)).toBe(50);
    expect(clampLabelCentre(0, 95)).toBe(47.5);
    expect(clampLabelCentre(100, 95)).toBe(52.5);
  });

  it('handles a label wider than the container', () => {
    // 100 - 60 = 40, so the range is [60, 40] — empty; result is labelWidth/2.
    expect(clampLabelCentre(50, 120)).toBe(60);
  });

  it('stale-width arithmetic: fresh measurement produces a different clamp', () => {
    // This documents the arithmetic difference between stale and fresh widths.
    // It does NOT test that re-measurement happens — see the comment at the top.
    const stalePct = 12;
    const freshPct = 49;
    expect(clampLabelCentre(100, stalePct)).toBe(94); // stale: centre at 94, label 88–100
    expect(clampLabelCentre(100, freshPct)).toBe(75.5); // fresh: centre at 75.5, label 51–100
  });
});
