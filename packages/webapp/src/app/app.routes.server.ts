import { RenderMode, ServerRoute } from '@angular/ssr';

// Every route fetches live data from the REST API per request, so all of
// them render on the server per-request rather than being prerendered once
// at build time (which would bake in stale/empty data).
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
