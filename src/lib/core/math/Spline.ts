import * as PIXI from 'pixi.js';

/**
 * Calculates a point on a Catmull-Rom spline using the formula provided.
 * @param t - The interpolation factor, between 0 and 1.
 * @param p0 - The first control point.
 * @param p1 - The second control point (start of the segment).
 * @param p2 - The third control point (end of the segment).
 * @param p3 - The fourth control point.
 * @returns The interpolated point on the spline.
 */
export function catmullRomPoint(t: number, p0: PIXI.Point, p1: PIXI.Point, p2: PIXI.Point, p3: PIXI.Point): PIXI.Point {
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );

  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );

  return new PIXI.Point(x, y);
}

/**
 * Estimates the length of a Catmull-Rom spline segment by sampling.
 * This is useful for determining how many brush stamps to place.
 * @param p0 - The first control point.
 * @param p1 - The second control point.
 * @param p2 - The third control point.
 * @param p3 - The fourth control point.
 * @param samples - The number of samples to use for the estimation.
 * @returns The estimated length of the spline segment.
 */
export function catmullRomLength(p0: PIXI.Point, p1: PIXI.Point, p2: PIXI.Point, p3: PIXI.Point, samples = 20): number {
    let length = 0;
    let prevPoint = p1;

    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const currPoint = catmullRomPoint(t, p0, p1, p2, p3);
        length += Math.hypot(currPoint.x - prevPoint.x, currPoint.y - prevPoint.y);
        prevPoint = currPoint;
    }

    return length;
} 