/* Page zoom steps (the browser's) and the next step from a factor: dir 1 in, -1 out, 0 back to 100% */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
export const zoomStep = (f, dir) => (dir === 0 ? 1 : dir > 0 ? (ZOOM_STEPS.find(z => z > f + 0.001) ?? f) : ([...ZOOM_STEPS].reverse().find(z => z < f - 0.001) ?? f));
