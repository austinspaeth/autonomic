/* /download — the short link printed in videos.

   It is a redirect, so it must work with nothing but the HTML the browser
   parses: `csr = false` is inherited from the root layout but restated here
   because the whole page depends on it. +page.svelte injects its sniffer as a
   literal <script> via {@html}, which only runs when the browser parses it out
   of server-rendered markup — hydration would set it as innerHTML and never
   execute it, leaving a phone sitting on a page that says it is opening the
   App Store and never does. */
export const prerender = true;
export const csr = false;
