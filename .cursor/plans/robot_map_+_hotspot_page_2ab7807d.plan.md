---
name: Robot Map + Hotspot Page
overview: Add a new executive-ready map page with robot location intelligence and an interactive robot component hotspot panel (motor/camera/etc.) for maintenance risk, including last-case context. Use a new site-location CSV and extend pipeline + APX UI routes accordingly.
todos:
  - id: add-site-location-csv
    content: Create and populate eugene_site_locations.csv with site_id to lat/long mapping
    status: pending
  - id: extend-pipeline-for-location
    content: Update bronze/silver/gold notebooks to ingest and expose map/hotspot-ready fields
    status: pending
  - id: add-backend-map-endpoints
    content: Add models and API endpoints for map, watchlist, heatmap, and robot component detail
    status: pending
  - id: build-map-hotspot-ui
    content: Add new sidebar route with map + watchlist + heatmap + clickable robot hotspots
    status: pending
  - id: deploy-and-verify
    content: Deploy bundle, run workflow, and validate the new page end-to-end
    status: pending
isProject: false
---

# Robot Map + Hotspot Page

## Scope

Build a new app page that combines:

- Geographic robot usage map (by hospital/site)
- Executive robot maintenance watchlist
- Component risk heatmap
- Interactive robot diagram with clickable component hotspots (motor/camera/etc.) showing component risk and last-case context

## Data model changes

- Add a new CSV for site geolocation data (recommended source selected):
  - `[data/eugene_site_locations.csv](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/data/eugene_site_locations.csv)`
  - Columns: `site_id, site_name, latitude, longitude, region(optional)`
- Extend bronze ingestion mapping in `[src/notebooks/01_bronze_ingest.py](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/src/notebooks/01_bronze_ingest.py)` to load the new CSV.
- Extend silver transform in `[src/notebooks/02_silver_transform.py](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/src/notebooks/02_silver_transform.py)` to standardize site location fields.
- Extend gold generation in `[src/notebooks/03_gold_kpis.py](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/src/notebooks/03_gold_kpis.py)` to produce a map-ready and hotspot-ready gold table/view with:
  - `robot_id, site_id, site_name, latitude, longitude`
  - per-robot/per-component risk metrics
  - last-case timestamp + last-case procedure/context (where available)

## Backend API additions

- Add new response models in `[apx-app/src/jnj_dsp2_gold_genie/backend/models.py](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/apx-app/src/jnj_dsp2_gold_genie/backend/models.py)` for:
  - map points
  - robot watchlist
  - component heatmap matrix
  - robot component hotspot detail payload
- Add endpoints in `[apx-app/src/jnj_dsp2_gold_genie/backend/router.py](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/apx-app/src/jnj_dsp2_gold_genie/backend/router.py)`:
  - `/robot-map`
  - `/robot-watchlist`
  - `/component-heatmap`
  - `/robot-component-detail/{robot_id}`
- Keep output executive-focused (no raw table naming in returned presentation text).

## Frontend page + UX

- Add new route page (e.g., `/_sidebar/map`) in UI routes:
  - `[apx-app/src/jnj_dsp2_gold_genie/ui/routes/_sidebar/](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/apx-app/src/jnj_dsp2_gold_genie/ui/routes/_sidebar)`
- Add nav entry in sidebar route file:
  - `[apx-app/src/jnj_dsp2_gold_genie/ui/routes/_sidebar/route.tsx](/Users/robert.leach/dev/vibe/jnj-eugene-robot-predictive-maintenance/apx-app/src/jnj_dsp2_gold_genie/ui/routes/_sidebar/route.tsx)`
- On page, implement selected visuals (both requested):
  - Map panel with site points and counts
  - Executive watchlist panel (click robot to focus)
  - Component heatmap panel
  - Interactive robot component graphic panel with clickable hotspots (motor/camera/etc.)
    - Clicking hotspot shows component name, risk, and last-case info
- Use provided robot image as a side/interaction asset for hotspot overlay.

## Deployment and validation

- Run bundle deploy and app restart after changes.
- Run workflow job once to populate new gold outputs.
- Validate in app:
  - Map renders with expected points
  - Robot selection updates hotspot data
  - Hotspot click opens component detail with risk + last-case context
  - No table-centric wording on page

## Acceptance criteria

- New map page is available in sidebar.
- Location data is sourced from the new site-location CSV.
- Executive watchlist + component heatmap both present.
- Robot hotspot interaction works for maintenance components and displays risk + last-case context.
- Page language remains executive-ready (no backend table callouts).

