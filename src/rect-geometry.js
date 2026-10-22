'use strict';

// Self-contained for serialization into the upstream document script. Preserve
// empty native boxes and make sizes agree with their floating-point edges.
function noisyRectGeometry(rect, positionNoise, sizeNoise) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height, positionNoise, sizeNoise].every(Number.isFinite)) return rect;
  if (rect.width === 0 && rect.height === 0) return rect;
  const x = rect.x + positionNoise, y = rect.y + positionNoise;
  const requestedWidth = rect.width === 0 ? 0 : Math.max(0, rect.width + sizeNoise);
  const requestedHeight = rect.height === 0 ? 0 : Math.max(0, rect.height + sizeNoise);
  const width = (x + requestedWidth) - x;
  const height = (y + requestedHeight) - y;
  if (![x, y, width, height].every(Number.isFinite)) return rect;
  return {x, y, width, height};
}

module.exports = {noisyRectGeometry};
