# Intensity convergence

How `intensity` is computed, why every endpoint must use the same path, and
the bug that forced us to enforce it.

## The bug

Four places in the frontend show a sun-intensity number for the same terras:

1. The **map popup** when you click a pin.
2. The **leaderboard** in the top-right of the map ("Sunniest right now").
3. The **Discover** grid (`/discover`) and its featured hero.
4. The **terras detail page** (`/terrasen/:id`) IntensityRing.

For the same terras at the same time, they all returned different numbers.

## Root causes

### 1. Two different backend formulas

| Endpoint | Used by | How it computed intensity |
|---|---|---|
| `GET /api/search/terrasen?time=X` | leaderboard, Discover, marker list | `recomputeIntensities()`: bulk-load weather → haversine-nearest cloud factor → `round(sin(altitude) * 100 * (1 - cf/100) * shadowScore)` at the **exact** requested time |
| `GET /api/sun/terras/:id?time=X` | map popup, detail page | `getOrCreateCache()`: **hour-bucketed** SunData lookup → if fresh (<15 min), return the stored value; if stale, recompute via `getCloudFactor()` (single `$near` query) and write back |

Same input, different output by design. If you hit `/sun/terras/:id?time=14:05`,
the result was computed at 14:05 and stored under the bucket key `14:00`. The
next request at 14:14 read that same stored value — even though the sun had
moved meaningfully. Meanwhile `/search/terrasen?time=14:14` recomputed at the
exact minute and returned a different number.

### 2. The detail page read the stale DB field

`TerrasDetailPage` rendered `terras?.intensity` from `getTerrasById()`. That
field is only refreshed by the hourly weather cron, so it could be up to
60 minutes stale. The same page's sun-position numbers came from the live
`/sun/terras/:id` endpoint — so the page disagreed with **itself**.

### 3. Time quantization drift

`useTerrasSunData` rounded `selectedTime` to the minute before sending.
`TerrasDetailPage` sent the raw `selectedTime` (with seconds and ms) directly
to its `fetchSunForTerras` call. Two visits within the same minute could hit
different cache buckets on the backend.

### 4. Map markers ignored the timeline

`useTerrasData` called `searchTerras({ limit: 500 })` with no `time` parameter
— the backend defaulted to `new Date()`. Scrub the timeline forward three
hours and the popup updated, but the marker pins stayed the colour they were
when the page loaded.

### 5. Inconsistent night handling

`recomputeIntensities` explicitly set `intensity = 0` when altitude ≤ 0. The
sun endpoint relied on `sin(negative)` clamping. The math agrees, but the
cached path could hold a daytime value past sunset until something
invalidated the cache row.

## The fix

### Backend — one formula, one primitive

`services/intensityRefresher.ts` now exports `computeIntensity()` as the
single source of truth:

```ts
export function computeIntensity(
  weatherPoints: WeatherPoint[],
  lat: number,
  lng: number,
  when: Date,
  shadowScore: number = 1.0,
): {
  intensity: number;
  shadowScore: number;
  cloudFactor: number | undefined;
  isNight: boolean;
  sun: ReturnType<typeof calculateSunData>;
}
```

Formula: `round(sin(altitude) * 100 * (1 - cloudFactor/100) * shadowScore)`,
clamped to `0` when `altitude <= 0`.

Every endpoint that returns `intensity` to the frontend now routes through
this primitive:

- `searchController.searchTerrasen` / `searchRestaurants` — via the existing
  `recomputeIntensities()` wrapper, which now delegates to
  `computeIntensity()`.
- `sunDataController.createGetSunForEntity` — calls `loadRecentWeather()` +
  `computeIntensity()` directly. The hour-bucketed `getOrCreateCache()`
  still runs as a side-effect (so the SunData collection keeps accumulating
  rows for JSON-LD/timeline use), but the **response intensity** is the
  live calc, not the cached value.
- `terrasController.getTerrasById` / `restaurantController.getRestaurantById`
  / `eventController.getEventById` — now accept an optional `?time=` and
  call `recomputeIntensities([entity], when)` before responding, so the
  detail page never sees a stale DB field.

### Frontend — one file, one hook, one time helper

`src/services/intensitySource.ts` is the canonical entry point — the
"single file" the four surfaces all call:

```ts
export type Kind = 'terras' | 'restaurant' | 'event';

export function minuteIsoFrom(selectedTime: string): string;
export function intensityQueryKey(kind: Kind, uuid: string | null, minuteKey: string): readonly [...];
export function fetchEntityIntensity(kind: Kind, uuid: string, minuteKey: string): Promise<IntensityResult>;
```

`src/hooks/useEntityIntensity.ts` wraps it in a TanStack Query hook. The
three legacy hooks (`useTerrasSunData`, `useRestaurantSunData`,
`useEventSunData`) are now thin shims that delegate to it — so any
component still using them gets the canonical behaviour for free.

Surface-by-surface changes:

| Surface | Before | After |
|---|---|---|
| Map popup | `useTerrasSunData(uuid)` → `/sun/terras/:id` (cached path) | Same hook, now backed by `useEntityIntensity('terras', uuid)` → backend live recompute |
| Leaderboard | `searchTerras({ time, limit })` with locally-rounded minute key | Same, but minute-rounding shared via `minuteIsoFrom()` |
| Discover | `searchTerras({ time, ... })` with locally-rounded minute key | Same, shared `minuteIsoFrom()` |
| Detail page intensity | `terras?.intensity` (stale DB field) | `useEntityIntensity(kind, id).intensity` — live, time-aware |
| Map marker colours | `useTerrasData()` with **no** `time` param | `useTerrasData()` now reads `selectedTime` from context and passes `time=minuteKey` — markers track timeline scrubs |

The legacy `src/services/sunService.ts` was deleted; every caller now
imports from `intensitySource.ts`.

## Convergence test

`tests/intensityConvergence.test.ts` pins the contract:

```
/api/search/terrasen?time=X    ──┐
/api/sun/terras/:uuid?time=X   ──┼── MUST return identical intensity
/api/terrasen/:uuid?time=X     ──┘
```

Two cases:

1. **Daytime convergence** — seeds a terras and a weather point, queries all
   three endpoints at a known daytime moment, asserts the three returned
   intensities are equal.
2. **Night-time convergence** — queries all three at 02:00 UTC and asserts
   each returns `0`.

If anyone reintroduces a divergent code path, this test fails.

## Files touched

### Backend
- `services/intensityRefresher.ts` — extracted `computeIntensity()`
- `controllers/sunDataController.ts` — routes through `computeIntensity()`
- `controllers/terrasController.ts` — `getTerrasById` accepts `?time=`,
  calls `recomputeIntensities()`
- `controllers/restaurantController.ts` — same treatment
- `controllers/eventController.ts` — same treatment
- `tests/sundataController.test.ts` — updated assertion to match the new
  live-recompute contract (was pinning the old buggy behaviour)
- `tests/intensityConvergence.test.ts` — **new**, the cross-endpoint pin

### Frontend
- `src/services/intensitySource.ts` — **new**, canonical entry point
- `src/hooks/useEntityIntensity.ts` — **new**, canonical hook
- `src/hooks/useTerrasSunData.ts` / `useRestaurantSunData.ts` /
  `useEventSunData.ts` — reduced to delegating shims
- `src/hooks/useTerrasData.ts` / `useRestaurantsData.ts` — now pass
  `time=minuteKey` so markers track timeline scrubs
- `src/hooks/useSunniestTerrasen.ts` — uses shared `minuteIsoFrom()`
- `src/pages/TerrasDetailPage.tsx` / `RestaurantDetailPage.tsx` /
  `EventDetailPage.tsx` — read intensity from `useEntityIntensity`, not
  the stale entity field
- `src/pages/SearchPage.tsx` — uses shared `minuteIsoFrom()`
- `src/services/sunService.ts` — **deleted** (all callers migrated)
