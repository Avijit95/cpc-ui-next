function moveItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  if (fromIdx === -1 || fromIdx === toIdx) return arr;
  const r = [...arr];
  const [item] = r.splice(fromIdx, 1);
  const adj = fromIdx < toIdx ? toIdx - 1 : toIdx;
  r.splice(adj, 0, item);
  return r;
}

/**
 * Reorders categories so that:
 * 1. Phone comes first
 * 2. Camera Lens sits immediately after Camera
 */
export function reorderCategories<T extends { name: string }>(cats: T[]): T[] {
  let result = cats;

  // Move Phone to front
  const phoneIdx = result.findIndex((c) => c.name.toLowerCase().includes("phone"));
  result = moveItem(result, phoneIdx, 0);

  // Move Camera Lens right after Camera
  const cameraIdx = result.findIndex((c) => {
    const n = c.name.toLowerCase();
    return n.includes("camera") && !n.includes("lens");
  });
  const lensIdx = result.findIndex((c) => c.name.toLowerCase().includes("lens"));
  if (cameraIdx !== -1 && lensIdx !== -1 && lensIdx !== cameraIdx + 1) {
    result = moveItem(result, lensIdx, cameraIdx + 1);
  }

  return result;
}

/** @deprecated Use reorderCategories instead */
export function placeCameraLensAfterCamera<T extends { name: string }>(cats: T[]): T[] {
  return reorderCategories(cats);
}
