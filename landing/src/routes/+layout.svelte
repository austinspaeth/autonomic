<!-- Root layout: deliberately empty.

     Everything that makes a page look like the marketing site — app.css, the
     nav and the footer — lives in the `(site)` group's layout instead. The
     /master dashboard is a page on the same origin that shares none of it: it
     ships its own dark theme whose `body`, `.btn` and `.card` rules collide
     head-on with app.css, and a stylesheet imported here would be linked into
     every page in the graph regardless of any runtime condition. A page cannot
     escape the root layout, so the root layout is the one that has to stay
     neutral. -->
<slot />
