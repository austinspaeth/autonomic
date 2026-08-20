/* The dashboard is one prerendered document with no client-side framework.

   `csr = false` is inherited from the root layout, but it is restated here
   because the whole page depends on it: +page.svelte injects the dashboard's
   scripts as literal <script> tags via {@html}, which the browser only executes
   when it parses them out of server-rendered HTML. Turn CSR on and Svelte would
   hydrate that markup instead — innerHTML never runs a script — and the page
   would render the dashboard with nothing driving it, which is exactly the
   failure this route was written to fix. */
export const prerender = true;
export const csr = false;
