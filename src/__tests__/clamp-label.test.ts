import { clampLabelLeft } from '../components/MidstPlayer/helpers';

describe('clampLabelLeft', () => {
  it('keeps the label centered in the middle', () => {
    expect(clampLabelLeft(50, 10)).toBe(50);
  });

  it('clamps at the left edge', () => {
    expect(clampLabelLeft(0, 10)).toBe(0);
    expect(clampLabelLeft(3, 10)).toBe(3);
    expect(clampLabelLeft(-5, 10)).toBe(0);
  });

  it('clamps at the right edge', () => {
    expect(clampLabelLeft(100, 10)).toBe(90);
    expect(clampLabelLeft(95, 10)).toBe(90);
    expect(clampLabelLeft(99, 10)).toBe(90);
  });

  it('handles a wide label that nearly fills the container', () => {
    expect(clampLabelLeft(50, 95)).toBe(5);
    expect(clampLabelLeft(0, 95)).toBe(0);
    expect(clampLabelLeft(100, 95)).toBe(5);
  });

  it('handles a label wider than the container', () => {
    // 100 - 120 = -20, so the result is 0 (left-aligned, unavoidable overflow).
    expect(clampLabelLeft(50, 120)).toBe(0);
  });

  it('is the paused-resize regression: stale width must still clamp correctly', () => {
    // Wide viewport: label is 12% of container, playhead at 100%.
    // After resize to narrow: label is now 49% of container.
    // Without re-measurement the stale 12% would let left=100% through,
    // placing half the label outside. With the fresh 49%, it clamps to 51%.
    const stalePct = 12;
    const freshPct = 49;
    expect(clampLabelLeft(100, stalePct)).toBe(88); // stale: label extends past edge
    expect(clampLabelLeft(100, freshPct)).toBe(51); // fresh: label stays inside
  });
});
