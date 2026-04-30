# Implementation Report: Geospatial Bridge Hardships

**Date:** 2026-04-29
**Project:** Zon Terras In Gent
**Topic:** Challenges in EPSG:31370 (Lambert 72) Integration

## Floating-Point Jitter (Three.js Limitation)
While the math was correct, implementing it for 3D rendering presented a conceptual hurdle. 
- **The Hardship:** Standard Lambert 72 coordinates (e.g., 104860) are too large for Three.js. Using these values directly causes "vertex jitter" because 32-bit floats lose precision at large distances from the origin (0,0,0).
- **The Solution:** I implemented the `getRelativePosition` utility. This allows the system to calculate offsets relative to the specific 1km x 1km building tile (the "anchor"). By centering the 3D scene on a local anchor (e.g., X=104000), we keep the coordinate values small and the rendering smooth.
