# sls — backend for the /master dashboard

One DynamoDB table and two Lambdas behind an HTTP API, deployed by the
Serverless Framework. It stores the analytics dashboard at
`landing/master/` (see `../MASTER_DASHBOARD.md`) and counts the mobile
app's cohort pings. The app still keeps every byte of health data on-device;
the ping is a bare counter with no identifier attached (see below).

```
POST https://api.autonomic.care/api/master
Authorization: Bearer <Cognito id token>
{ "action": "LOAD" | "SYNC" | "REPLACE_ALL" | "PINGS" | "LINKS_REPUBLISH", ... }

GET  https://api.autonomic.care/ping/open/D082126I    (public, no auth)
GET  https://api.autonomic.care/ping/sub/D082126I
GET  https://api.autonomic.care/ping/act/D082126IB
GET  https://api.autonomic.care/ping/cap/D082126IG   (a reading started)
GET  https://api.autonomic.care/ping/hrv/D082126IG   (...and completed)
GET  https://api.autonomic.care/ping/pay/D082126IR
GET  https://api.autonomic.care/ping/not/D082126IM   (notification turned on)
GET  https://api.autonomic.care/ping/pot/D082126IT   (POTS capture finished)
GET  https://api.autonomic.care/ping/see/D082126II   (gated view opened)
GET  https://api.autonomic.care/ping/err/D082126I    (a failure; once per install)
GET  https://api.autonomic.care/ping/osh/D082126IA   (offer shown)
GET  https://api.autonomic.care/ping/odm/D082126IA   (...dismissed)
GET  https://api.autonomic.care/ping/oac/D082126IA   (...accepted)
GET  https://api.autonomic.care/ping/report?key=...&since=2026-08-01

GET  https://api.autonomic.care/fault/D082126I-TP-V1.26.0?t=health.check&m=timeout+after+%3Cn%3Ems
     (a FAULT REPORT, not a counter — carries a call site and a redacted message)

     ...each of which may carry a tagged tail: D082126IG-TP-V1.26.0
```

## Authorization is two checks, not one

The HTTP API's JWT authorizer validates tokens against **DiscoveryMark's user
pool** (`us-west-2_0YCieUoYt`), which is shared across the account. Every
DiscoveryMark customer can obtain a valid token for it. Passing the authorizer
therefore means "you are someone", not "you may read Autonomic's numbers".

The second check is `ALLOWED_EMAILS` in `provider.environment`, enforced at the
top of the handler against the `email` claim. **That is the actual access
control.** Removing it would expose the dashboard to ~60 unrelated accounts.

## Data model

Single table, one partition per user, one item per entry — rather than one blob
per user, which would eventually meet DynamoDB's 400KB item ceiling.

| PK | SK | Holds |
|---|---|---|
| `DASH#<email>` | `ENTRY#<date>#<platform>` | one day of store metrics |
| `DASH#<email>` | `EVENT#<id>` | a recorded release / campaign / store change |
| `DASH#<email>` | `AD#<id>` | an advertising campaign (name, channel, dates) |
| `DASH#<email>` | `COST#<id>` | a dated cost, optionally attributed to an ad |
| `DASH#<email>` | `SALE#<id>` | one purchase: plan, price, and the buyer's install date |
| `DASH#<email>` | `LINK#<slug>` | a campaign download link, and the page published from it |
| `DASH#<email>` | `SETTINGS` | trial/wall lengths, currency, store commission |
| `DASH#<email>` | `UI` | view and filter preferences |
| `PING#OPEN` | `<day>` | that day's opens, counted per cohort |
| `PING#SUB` | `<day>` | that day's new subscribers, counted per cohort |
| `PING#ACT` | `<day>` | that day's activations (first HRV reading), per cohort+method |
| `PING#HRV` | `<day>` | that day's measuring installs (any HRV reading), per cohort+method |
| `PING#CAP` | `<day>` | that day's installs that STARTED a reading, per cohort+sensor |
| `PING#PAY` | `<day>` | that day's installs that met the paywall, per cohort+surface |
| `PING#NOT` | `<day>` | notifications turned on, per cohort+letter (per-letter cap) |
| `PING#POT` | `<day>` | POTS captures finished, per cohort+letter (per-letter cap) |
| `PING#SEE` | `<day>` | gated views opened, per cohort+letter (per-letter cap) |
| `PING#ERR` | `<day>` | installs reporting a first failure — once per install, ever |
| `FAULT` | `<day>#<tag>#<hash>` | one distinct failure on one day: count, message, platform / version / tier splits. **Expires** (`expiresAt`, 120 days) |
| `PING#OSH` / `#ODM` / `#OAC` | `<day>` | an offer shown · dismissed · accepted, per cohort+offer |
| `STORE#VERSIONS` | `latest` | what each store is serving, cached (see below) |
| `PUSH#<email>` | `SUB#<endpointHash>` | one device registered for background alerts |
| `PUSH#STATE` | `WATERMARK` | what the hourly push job has already announced |

`LOAD` queries the whole partition. `SYNC` applies the client's diff — entries
as `upserts` / `deletes`, and the four id-keyed collections as
`eventUpserts` / `eventDeletes`, `adUpserts` / `adDeletes`,
`costUpserts` / `costDeletes`, `saleUpserts` / `saleDeletes`, and campaign links
as `linkUpserts` / `linkDeletes` — plus `settings` and `ui`. Each cleaner in the
Lambda has a twin in `landing/master/sync.js`; **if the two shapes disagree,
every diff reports every row as changed forever.** `REPLACE_ALL` wipes the ENTRIES and
rewrites them — it does not touch events, ads, costs, sales or campaign links,
matching a button that
says "delete every entry" — and is what "Delete all data" uses — a wipe is worth stating
outright rather than trusting a diff to enumerate every deletion. ("Delete all
data" additionally clears the sales ledger through the ordinary diff: sales left
behind by a wipe would come back as revenue with no downloads under it.)

`SALE#` items are the one collection that arrived by **migration** rather than
by being typed. Sales used to be two numeric columns on an entry, `sales` and
`revenue`; `cleanEntry` still reads them so an unmigrated account can be loaded
and converted, but the client strips them on its first push and never writes
them again. A sale carries `plan` (`monthly` / `annual` / `lifetime` /
`unknown`), a `price`, a `qty`, and optionally the buyer's install date as
`cohort` — which the Lambda refuses on any row with `qty > 1`, since an
aggregate of four buyers does not share one. `unknown` is a real value, not a
missing one: those rows are money of an unknown term and must never reach MRR.
See `MASTER_DASHBOARD.md` for the arithmetic that depends on it.

The table is `DeletionPolicy: Retain` with point-in-time recovery on. A
`sls remove` will not take the data with it.

## Campaign download links (`LINK#`)

The one thing this API writes outside DynamoDB. A `LINK#<slug>` row is a
campaign download link — `autonomic.care/download/facebook` — with up to three
destinations (iPhone, Android, everything else), and saving one **publishes a
real HTML page into the site bucket** with those URLs already baked in.

Why a written object rather than a lookup: the site is a static bucket behind
CloudFront with an OAC origin, so a path with no object behind it is a 403 —
there is nothing a client-side router could rescue, and the destinations are
typed into the dashboard and cannot be known at build time. The published page
therefore costs one request, never touches this API, and keeps working when this
API does not.

`lambdas/api/links.js` holds the whole of it, and the reasoning at length. The
parts to know:

* **The slug is the identity.** It is the URL, so editing it is a delete and a
  create, which is exactly what the diff reports and exactly what has to happen
  in the bucket. `SLUG_RE` refuses anything that would need encoding rather than
  escaping it — the link gets typed into a video description by hand.
* **A destination is an http(s) URL or it is dropped.** The page assigns it to
  `location.replace`, so a `javascript:` destination typed into the dashboard
  would run on autonomic.care's own origin.
* **Both keys are written** — `download/<slug>/index.html` and the extensionless
  `download/<slug>` — because the distribution's directory handling is
  out-of-band configuration this repo does not own.
* **The page measures itself, and waits for the send before it leaves.** A
  campaign page inherits nothing from the site's build, so it carries its own
  copy of the GA tag and of the `aj-cookie-consent` opt-out (same origin, so a
  visitor who blocked tracking on the site is redirected immediately with
  nothing sent). The wait is the load-bearing part: `location.replace` aborts
  the document load along with the still-loading tag, so a redirect page that
  fires and goes records nothing at all and a printed campaign reads as though
  nobody ever scanned it. It fires `app_store_redirect` / `play_store_redirect`
  / `site_redirect` plus a pooled `download_redirect` carrying `platform`,
  `destination` and the campaign slug, then goes on gtag's `event_callback` —
  capped at one second, because a blocked tag never calls back and a signpost
  must never become a dead end. `/download` implements the same contract from
  the shell's tag; the two must agree or GA splits every report in two.
* **Publishing runs after the row is stored and is allowed to throw.** The
  dashboard's push retries with backoff and only adopts its snapshot on success,
  so a transient S3 failure re-publishes on the next attempt rather than leaving
  a campaign the dashboard believes is live and is not.
* **`LINKS_REPUBLISH` rewrites every page from what is stored.** Always safe:
  the rows are the record and the objects are a rendering of them. It is the
  repair path for a lost object, and how a change to the page template reaches
  campaigns nobody has edited since.
* **The pipeline must not delete them.** `buildspec.yml` excludes `download/*`
  from its `aws s3 sync --delete`, re-including only the three files the build
  owns. Move one of those two things and you must move the other.
* **Unset is safe.** With no `SITE_BUCKET` the campaign stores and syncs and is
  simply not live; the dashboard says so. Same rule as the Web Push keys. The
  role's grant is scoped to `download/*` in the site bucket, so it can publish a
  campaign link and can never touch the rest of the site.

## What is live in the stores (`STORE_VERSIONS`)

`lambdas/api/storeVersions.js`. The dashboard cannot ask either store itself —
Apple's endpoint sends no CORS headers and Google's listing is an HTML page —
so the Lambda asks, behind the same allowlist as everything else, and caches
one answer for everybody in a row that belongs to no user.

The two sources are not equivalent, and pretending otherwise is the failure
mode this file is written against:

- **iOS is an API.** `itunes.apple.com/lookup?bundleId=…` is public,
  unauthenticated and documented, and returns the live version, its release
  date, the release notes and the rating. What it says is true. The storefront
  is part of the answer (`country`), because an app can be live in one and not
  another.
- **Android is a SCRAPE.** Google publishes no equivalent; the official route
  is the Play Developer API, which needs a service account and Play Console
  grants. This reads the public listing instead, where the version survives
  inside an undocumented `AF_initDataCallback` blob that Google can restructure
  without notice and has before.

So the Android half is built to **fail rather than guess**. It narrows to the
`ds:5` payload before looking, so a version-shaped string in a review or in the
"similar apps" rail cannot reach the answer; it collects every candidate and
**refuses when two disagree** rather than picking one; and every failure comes
back as a named reason (`not-found`, `ambiguous`, `not-listed`, `http`,
`unreachable`) that the dashboard prints in full. A wrong version number is
worse than none here — the card is read to decide whether a release actually
went live, and a stale number answers that question incorrectly and with total
confidence.

`parsePlay` is pure and is pinned by `landing/tests/store-versions.test.mjs`
(the AWS SDK is required inside the cache helpers rather than at the top of the
file, so testing the parse does not need the Lambda's `node_modules`).
`landing/tests/master-stores.test.mjs` drives the card itself.

The cache is 30 minutes. The dashboard refreshes every five minutes on every
open device, and the stores publish a few times a month; only the card's
"Check now" button passes `force`.

## The cohort ping

`lambdas/ping/main.js` — four public write routes, no auth, no body, `204` to
everything. The path segment is the calling install's **cohort** — the day it
first ran the app, as `D{MMDDYY}` — followed by **one letter for the platform**:
`I` for iOS, `A` for Android, `U` for unknown. A missing letter also reads as
`U`, which is what builds that shipped before the marker send. The server stamps
the arrival day itself.

**Days here are US Eastern days**, not UTC ones, so the counters line up with
the calendar the numbers are read against; DST is handled (`easternDay`). The
client dedupes against the same boundary, which is what keeps one install to one
count per row — change one side and you must change the other.

**One row per day**, holding that day's count for every cohort+platform:

```jsonc
{ "PK": "PING#OPEN", "SK": "2026-08-21",
  "day": "2026-08-21",
  "total": 137,
  "cohorts": { "082126I": 12, "082126A": 3, "080126I": 4, "071526": 2 } }
```

Read as a grid, that is a retention matrix: how many installs born on cohort C
opened the app on day D. Platform lives in the key rather than in a counter of
its own so that every question the matrix answers — retention, conversion, day N
— can also be asked per store. It is a DynamoDB **map** rather than a list
because a list has no addressable slot — appending would need a read-modify-write,
and two phones pinging in the same millisecond would lose a count. A map key is
addressable, so one atomic `UpdateItem` does the whole bump. It reads back as an
array of `{ key, cohortDate, cohort, platform, count }`, which is the shape a
chart wants.

Two details that are easy to get wrong when editing `bump()`: the increment is
`SET x = if_not_exists(x, 0) + 1`, not `ADD x 1`, because **`ADD` only works on
top-level attributes** and the per-cohort counter is nested; and the first ping
of a day has no map to write into, which raises `ValidationException` — caught,
the map created, the bump retried once.

### Why this is not "collecting data", and what keeps it that way

Apple defines collection as *transmitting data off the device and storing it in
a readable form for longer than the time it takes to service the request*. This
endpoint services the request by adding one to a counter and dropping
everything else, so what survives is a population statistic, not a record: no
row here can say whether any particular install pinged. That is what lets the
app keep a "Data Not Collected" privacy label — but only for as long as all
four of these stay true:

1. **No access logging on the HTTP API.** It is off (nothing in
   `serverless.yml` enables it) and must stay off — access logs record the
   client IP against the request, which is exactly the readable per-request
   record the definition is about.
2. **Nothing per-request in the Lambda logs.** The failure path logs the error
   and the kind, deliberately *not* the cohort. Don't add it back while
   debugging.
3. **Counters only.** No item may ever gain a list of requests, a last-seen
   timestamp, or anything else with one entry per ping.
4. **No identifier in the request.** No id, no body, no header the app sets.
   The moment one exists, everything above stops mattering.

Point 4 is also why the client, not the server, enforces one ping per day: with
nothing to de-duplicate on, the server *cannot* do it, and that is the
property, not a limitation.

### The reading counter is the open counter's twin

`/ping/hrv/<code>` says an install saved an HRV reading today. It carries what
`/ping/open` carries — cohort date and platform letter — plus the **sensor
letter** the activation route carries, and it is capped at one per install per
Eastern day by the same client rule, bucketed on the same boundary. That
symmetry is the whole point:
because both count the same kind of thing over the same population, `hrv[day] /
open[day]` is a **share of people**, not of pings. Opening the app is not using
it, and the open counter alone cannot tell an install that measures every
morning apart from one that launches the app to look at yesterday's number and
never gains a new one.

Two consequences for anything reading these rows:

- **Nothing may be added to one of the two that CHANGES WHAT A COUNT MEANS in
  one and not the other.** A different day boundary, a second ping per day, a
  different trigger than "the app was used" — any of them breaks the ratio
  silently, since the numbers still divide. The sensor letter is not one of
  those things: it splits the KEY a count lands under, not the count, so a day's
  HRV rows still sum to one per install and a consumer that ignores the letter
  reads the number it always read. What the letter cannot claim is a person's
  whole day — the daily cap means it names whichever reading came FIRST — and
  the dashboard says so.
- **The sensor letter has its own birthday, later than the route's.** The HRV
  route shipped anonymous as to sensor and gained the letter afterwards, so rows
  from between the two carry `method: null`. That is "we were not asking", NOT
  "a sensor we could not read", and a reader must gate on it separately
  (`hrvMethodFirst` / `hrvMethodKnown` in `landing/master/analytics.js`) or the
  history fills with an "unknown sensor" band that is really a gap.
- **Days before the route shipped are unknown, not zero.** There is no start
  date stored anywhere (the endpoint keeps counts), so a reader has to take the
  first day an `hrv` row exists as the counter's birthday and answer null for
  everything before it. `landing/master/analytics.js` does exactly that
  (`hrvFirst` / `hrvKnown`), and reads it off the UNFILTERED rows, because
  Android shipped the route in its own release.

### Capture is two counters, and neither is the save

`/ping/cap` fires when a reading STARTS and `/ping/hrv` when one COMPLETES.
Separate routes rather than one route with a phase letter, because they are read
AGAINST each other and a route is the one distinction a consumer cannot
accidentally pool away.

Neither fires on Save, and that is the correction that created the pair. The
measurement is the event; whether the results card survived long enough to be
tapped is a different fact about a different moment. Counting the save
undercounted every completed reading that was discarded, backgrounded or lost to
a closing sheet stack — and could not see an abandoned session at all, which is
the failure worth seeing. Five minutes is a long time to sit still, and a start
with no completion is the specific shape of the app asking for something the
person could not give it.

Both carry the sensor letter, so `hrv / cap` is a completion rate **per sensor**.
That is the form of the number that implies an action; pooled, it is only ever a
figure to worry about.

### The paywall counter is the third daily one

`/ping/pay/<code>` says a locked surface raised the paywall for this install
today. Capped at one per install per Eastern day like the two above, and capped
for the same reason: uncapped it would count TAPS, and one user tapping a locked
range four times would read as four people meeting a wall. Capped, `pay[day] /
open[day]` is a share of people, and it is the number that says how hard the app
is pushing.

Its letter rides in the same slot the sensor letter uses — a route only ever
speaks one alphabet, so the two can never be confused, and the handler validates
the letter against the alphabet the route actually speaks (a letter appended to
an `open` ping is dropped, or one cohort's opens would split across keys nobody
knows to re-add). The surfaces are `R` a locked Progress range, `I` the Insights
tab, `P` a POTS capture, `O`/`M`/`N` the Outlook, metric and Insights AI reports,
and `S` the Upgrade button in Settings.

`S` is the one that needs saying out loud: it is **not a wall**. Somebody who
opened Settings and tapped Upgrade went looking for the paywall, which is the
opposite signal from somebody who walked into a lock, and a "top wall" ranking
with it in would answer neither question. The dashboard names it separately.
Like the sensor letter, the daily cap means the surface is the day's FIRST wall,
so these rows rank front doors and not lock frequency.

### Two shapes of daily cap, and the difference is load-bearing

`open`, `cap`, `hrv` and `pay` are capped once per install per Eastern day for
the WHOLE route. A day's rows therefore sum to a headcount, which is what makes
`hrv[day] / open[day]` a share of people — and it is also why the letter on those
routes can only ever describe the FIRST event of the day.

`not`, `pot`, `see`, `osh`, `odm` and `oac` are capped per LETTER. Their letters
are choices the user made between real alternatives: a stand test is not an
episode, Insights is not Progress, the morning reminder is not the crash warning.
A whole-route cap would have silently dropped whichever came second, which on a
bad day is exactly the one worth knowing about. The trade is that those routes'
daily TOTALS are not headcounts; each letter's count still is, which is the
number anyone actually wants. Anything reading these rows must not add the
letters of a per-letter route together and call the result people.

`err` is neither. It fires once per install EVER and carries no letter, so a
day's count is new installs joining a population and the running total is the
population itself. It carries no tag and no message either: a tag is a string
this app chose and a message is a string it did not, and neither belongs in a
counter with no identifier. It says how many phones are having a bad time, and
the support dump — from the user's own device, with their consent — is where one
is diagnosed.

### The offer funnel counts a tap, not a purchase

`osh` / `odm` / `oac` are three routes over one alphabet (`A` the half-off annual
window, `F` founding member), so `oac / osh` is that offer's conversion.

**Accepted means the card's own buy button was tapped.** Whether the purchase
then went through is `/ping/sub`'s question, and the gap between the two is the
store sheet being abandoned or the payment declining. Keeping them apart is what
makes that gap visible instead of silently folded into the offer's conversion
rate, so nothing downstream may rename this to "converted". The third outcome is
the common one: an offer neither accepted nor dismissed was ignored, and the
dashboard counts it rather than leaving it implied.

### Every route carries a tier and a version

Behind the fixed head, a ping may append `-T{F|T|P}` (what the install could do
at that instant) and `-V1.26.0` (the build). They are TAGGED rather than
positional because the head cannot be extended: `[A-Z]?[A-Z]?` cannot tell a
missing sensor from a tier letter sitting in the sensor's place, so one more
bare letter would have made `D082126IP` ambiguous forever. A tag says what a
token is whatever else is present, so the next field costs a letter and breaks
nothing — and a build sending no tokens writes exactly the code and exactly the
key it always did.

Where they land is not symmetric, and the asymmetry is deliberate:

- **Tier goes into the cohort key** (`082126IG-P`), so every question the matrix
  already answers can also be asked per tier — including conversion, which is
  simply a cohort's rows drifting from `F` to `P` over time.
- **Version goes into a second map** on the same row (`builds`, keyed
  platform+tier+version). The cohort map gains an entry per combination seen that
  day and cohorts accumulate forever; multiplying it by the live builds too walks
  a busy row toward DynamoDB's 400KB item ceiling, at which point the day stops
  counting rather than failing loudly. The cost is the three-way question ("pro
  share of the day-30 cohort on 1.26"), which nothing asks.

`builds` is a **complete partition**: missing parts are stored as `?` rather than
omitted, so every ping lands in exactly one build key and the map sums to the
day's total. That is what lets a reader say "68% of today's opens came from
builds too old to name themselves" instead of reporting 32% adoption as though
the rest were on something else. The same rule governs the tier: `?` is never
folded into free, because "we did not ask" and "they had not paid" are different
facts and only one of them is about the user.

An unrecognised letter is dropped rather than refused, in both fields and in the
slot, so a new sensor, surface or tier can ship on the client before this
endpoint learns its name. It lands as unknown, never as a lost count.

**Deploy this endpoint BEFORE shipping a client that sends the tail.** The
leniency above is about LETTERS, not about the shape: a decoder that predates
the tagged tail matches the whole segment against a fixed-width pattern, so
`D082126IG-TP-V1.26.0` does not decode as "cohort plus something I don't know",
it fails outright and the ping is silently dropped — 204, no count, no log. It
is the one ordering constraint here, it fails in the direction that looks like
nobody opened the app, and it is invisible from the phone. `sls deploy` first,
then release the build.

### `/fault` is not a ping, and that is the whole design

Every route above is a **counter**: a fixed alphabet, no free text, and a number
at the end of it that means "how many people". `/ping/err` is one of them — it
fires **once per install, ever**, carries no tag and no message, and answers
exactly one question: how many phones have had something go wrong.

It cannot answer the next one, and never will. Firing once means an install that
hiccuped in March has spent its ping and is silent through every bug shipped
since; carrying no tag means the answer to "what broke" was always "ask that
user for a support dump", which needs a user who wrote in. A release that broke
Health imports for every Android install would not move that counter by one.

`/fault` is the answer to the next question, and it lives under its own path
prefix so nothing reads the two the same way.

```
GET /fault/D082126I-TP-V1.26.0?t=health.check&m=timeout+after+%3Cn%3Ems&f=1
```

The path is the **same install code every ping sends**, so cohort day, platform,
tier and build version arrive with no second decoder. `t` is a **tag** naming the
call site — a stable dotted key the app chose (`store.persist`, `health.check`,
`uncaught.fatal`) — and `m` is a **short redacted message**. `f=1` marks an
uncaught error, i.e. the app went down. The variable-length parts ride in the
query string because an error string is full of slashes and an encoded slash in
a path parameter is a fight with API Gateway nobody wins.

**Stored by signature, not by event.** One row per `(day, call site, failure)`:

```jsonc
{ "PK": "FAULT", "SK": "2026-08-30#health.check#3fa21b0c",
  "day": "2026-08-30", "tag": "health.check", "msg": "timeout after <n>ms",
  "fatal": false, "count": 9,
  "firstAt": "...", "lastAt": "...",
  "platforms": { "I": 6, "A": 3 },
  "versions":  { "1.26.0": 7, "?": 2 },
  "tiers":     { "F": 8, "P": 1 },
  "expiresAt": 1780000000 }
```

So the table grows with the number of **bugs**, not with the number of crashes:
a thousand phones hitting one failure is one row, and the row carries the only
three splits a fix is decided from. The day leads the sort key, so reading a
range is one query.

Four rules hold it in place, and each is load-bearing:

1. **A count is INSTALL-DAYS, not occurrences.** The client sends one report per
   signature per install per Eastern day, so a phone stuck in a retry loop
   contributes 1. That is the number worth having — how many phones are affected
   — and how often it happened on one phone is what the support dump is for. It
   is not a phone count either: there is no identifier anywhere in this system,
   so nine install-days may be nine phones once each or one phone for nine days.
   The dashboard says exactly that.
2. **Every distinct failure is reported, every day it is still happening.** The
   dedupe key is the failure's own signature, not the install, which is the
   whole difference from `/ping/err`. A phone that breaks in a new way tomorrow
   says so tomorrow.
3. **The message is redacted twice** — on the client
   (`mobile/src/lib/errorReport.ts`) and again in `redactFault` here before
   anything is written. Not belt and braces: the client's pass is a promise
   about builds we shipped, and this one is the promise about what can ever be
   **written**, which has to hold for an old build, a modified client and
   somebody curling the URL. Emails, URLs down to their host, paths down to a
   basename, anything id-shaped, and any digit run of four or more all go. That
   last rule also does the grouping: `timeout after 3012ms` and `timeout after
   4188ms` are one signature.
4. **Rows expire** (`expiresAt`, `FAULT_TTL_DAYS` = 120, TTL enabled on the
   table). These are diagnostic, not a series — and this is the one public route
   that **creates** a row rather than incrementing one, so an expiry is what
   bounds what a prober can leave behind. Only fault rows carry the attribute;
   every ping counter and every dashboard record is written without it and is
   untouched by TTL.

The cohort date is decoded for its platform, tier and version and then **thrown
away**. Adding it to the key would fragment one bug across every install age
that hit it, turning the one number that decides a hotfix into a scatter — and
it is the one field here with no bearing on a fix.

It reads back on the same `/ping/report` and `PINGS` calls, under `faults`, and
is drawn by the dashboard's **Failures** tab.

### Never delete a day row

`PING#OPEN / <day>` is **everyone's** counts for that day, in one item. Deleting
it to undo your own test ping destroys every real ping that landed in it, and
the client will not re-send: an install stamps "pinged today" on success and
stays quiet until the next Eastern day. This has happened once already, and was only
recoverable because the table has point-in-time recovery on.

So: do not write test pings to production. If you must, pick a cohort date you
can recognise and undo it by decrementing that one map key, never by deleting
the item:

```bash
aws dynamodb update-item --region us-west-2 --table-name Autonomic-prod \
  --key '{"PK":{"S":"PING#OPEN"},"SK":{"S":"2026-08-10"}}' \
  --update-expression "SET cohorts.#c = cohorts.#c - :one, #t = #t - :one" \
  --expression-attribute-names '{"#c":"081026I","#t":"total"}' \
  --expression-attribute-values '{":one":{"N":"1"}}'
```

If a row does get destroyed, PITR can restore the table to a moment before it
(`restore-table-to-point-in-time` into a **new** table name, read the row, write
it back to the live table with `--condition-expression "attribute_not_exists(PK)"`
so a newer row cannot be clobbered, then delete the temporary table).

### Reading it back

Two doors onto the same function, because they have different callers:

- `GET /ping/report?key=<PING_REPORT_KEY>&since=<ISO date>` — for curl and
  scripts. The key may also travel as an `x-ping-key` header. **`PING_REPORT_KEY`
  is unset by default and an unset key refuses everyone**, so the route is dead
  until the SSM parameter below exists.
- `POST /api/master` with `{"action":"PINGS","payload":{"since":"..."}}` — for
  the dashboard, which already holds a Cognito token and shouldn't also carry
  the shared key. The email allowlist guards it like everything else there.

Both answer one key per route — `{ since, open, sub, act, cap, hrv, pay, not,
pot, see, err, osh, odm, oac }` — each row

```jsonc
{
  day: '2026-08-21',
  total: 137,
  cohorts: [{ key, cohortDate, cohort, platform, slot, method, surface, tier, count }],
  builds:  [{ key, platform, tier, version, count }]
}
```

Rows stored before the platform marker existed report `platform: "U"`. The 8th
character of a cohort key is reported three ways so a consumer never has to know
which kind it is holding: `slot` is it raw, `method` is it on the two reading
kinds and `null` elsewhere, `surface` is it on `pay` and `null` elsewhere.
Sensors are `W` Apple Watch, `B` Bluetooth strap, `F` finger on the camera, `G`
Garmin watch; surfaces are `R`/`I`/`P`/`O`/`M`/`N`/`S` as above; the rest are
`M`/`C` notifications, `T`/`E` POTS, `I`/`P` views, `A`/`F` offers. Every row also
carries `label`, the letter resolved to a name by the route's own alphabet, so a
consumer can print it without holding a copy of every table. `tier` is `F`,
`T`, `P` or `null`, and `version` is a dotted number or `null` — in both cases
`null` means the ping predates the field or the endpoint did not recognise it,
which is never the same as a named value.

A consumer written before a key existed ignores it; one written after must treat
a missing row as "the counter was not running", not as "nobody did the thing".
That applies to `hrv` and `pay` as counters, and one level down to `tier` and
`version` as fields.

Set the key once before the first deploy (any random string):

```bash
aws ssm put-parameter --region us-west-2 --name /autonomic/ping-report-key \
  --type SecureString --value "$(openssl rand -hex 24)" --overwrite
```

The design constraint is that **the request carries no identifier** — no device
or install id, no session, no body, no health data, nothing about what the user
did. A cohort date is shared by every install born that day, so it names a day,
not a person. Two consequences follow and neither is a bug:

- **The server cannot de-duplicate**, so the client does: at most one open ping
  and one reading ping per install per Eastern day, exactly one subscribe ping
  and one activation ping per install, ever (`mobile/src/store/ping.ts`). One
  open ping == one active install that day; one reading ping == one install that
  measured that day.
- **Counts are trusted, not verified.** Anyone can curl the URL and inflate a
  number. The alternative is an identifier, which is the thing being refused.
  If it is ever abused, the answer is a WAF rate limit on the route, not a
  token.

The subscribe ping is skipped in builds whose Pro status comes from the
dev/TestFlight/sideload paywall bypass — nobody paid there. Dev builds send
nothing at all.

## Background alerts (Web Push)

A notification on the phone when a sale or a new install lands, **with the
dashboard closed**. `lambdas/push/` owns it: `news.js` is pure and is what
`tests/news.test.mjs` pins, `main.js` is the shell.

### The hour is kept here, and it has to be

The obvious design — have the service worker check every hour — is the one
thing that cannot be built. A service worker runs when its page is open, when a
fetch it controls happens, or when a **push** arrives, and is killed within
seconds either way; no timer inside it survives. Periodic Background Sync would
be the API to lend it one and iOS does not implement it (where it does exist it
is gated behind engagement heuristics a private dashboard will never satisfy).
An hourly `setInterval` in a worker is not a feature that works badly, it is a
feature that silently never fires.

So the hour is an EventBridge schedule on the `push` function, and the worker's
job is the half it can do: receive. iOS 16.4+ delivers Web Push to a PWA that
has been **added to the home screen** — a Safari tab cannot receive it, and the
settings card says so rather than offering a button that cannot work.

### What it will and will not tell you

Two events, and they are the two the counter hears **on its own**: a *download*
(an open ping whose cohort key is the day it arrived — a first run) and a *sale*
(a subscribe ping). Store CSV downloads and the sales ledger are deliberately
not read: both are typed in by hand, so a push about them would be a push about
your own typing. That is the same rule `landing/master/alerts.js` states for the
confetti, and the two must not be allowed to disagree — they answer the same
question for two audiences, and a reader who saw them differ has no way to tell
which is right.

Four rules keep it honest, all in `news.js`:

- **A delta is never negative.** The report is a sliding window; a count can
  fall as the calendar turns. A drop is not an event.
- **Day by day, not total against total.** A run that missed an hour has new
  days in front of it and possibly one that fell off the back; as totals those
  cancel and the hour you missed announces itself as silence.
- **A missing watermark seeds in SILENCE.** The first run has nothing to compare
  against, and "everything ever recorded" is not news — announcing the back
  catalogue is how a new channel gets switched off on day one.
- **Only the last `WINDOW_DAYS` are compared.** A correction to a three-month-old
  row is a correction, not an arrival.

One notification per run, never one per event: an hour that found six installs
is one banner. The watermark is written **whether or not the send succeeded** —
a run that found news, failed to deliver it and left the watermark alone would
find the same news next hour, and a phone offline for a morning would come back
to one arrival announced six times.

### Turning it on

The feature ships **dark**. With no keypair, `PUSH_KEY` reports
`configured: false`, the settings card says exactly that, nothing can subscribe
and the hourly job returns having sent nothing. Everything below can therefore
be done long after the code is deployed.

The keys are read at **run** time from one SSM SecureString, not injected at
build time. That is deliberate: a `PARAMETER_STORE` CodeBuild variable is
resolved at build *start*, so a parameter that does not exist yet fails the
whole build — landing site included. (The note beside `PingReportKeyParameter`
in `infrastructure/pipeline.yml` describes that trap; this avoids it, and
needs no pipeline change at all.)

```bash
# 1. Generate a keypair. It is yours; it never goes in the repo.
npx web-push generate-vapid-keys

# 2. Store both halves plus a contact address as ONE SecureString.
aws ssm put-parameter --region us-west-2 \
  --name /autonomic/vapid --type SecureString --overwrite \
  --value '{"publicKey":"...","privateKey":"...","subject":"mailto:austinspaeth@msn.com"}'
```

`subject` is required by RFC 8292 — Apple rejects a VAPID JWT without a contact
it can use if the sender starts misbehaving.

No redeploy is needed: the next cold start picks the parameter up. Then, on the
phone: open `/master/` in Safari, **Share → Add to Home Screen**, open it from
the home screen, and use *Edit data → Notifications → Background alerts*. Each
device subscribes separately — a subscription is a device, not an account.

**Rotating the keypair invalidates every subscription.** The stored endpoints
were negotiated against the old public key, so after a rotation every device has
to be turned on again; the sends fail with 410 and the job deletes the dead rows
on its own, so the only symptom is silence until you re-subscribe.

### Actions

| Action | Does |
|---|---|
| `PUSH_KEY` | `{ configured, publicKey }` — the browser needs the public half before it can subscribe |
| `PUSH_SUBSCRIBE` | stores `{ endpoint, keys }` under `PUSH#<email>` |
| `PUSH_UNSUBSCRIBE` | forgets one endpoint |
| `PUSH_TEST` | sends one now, through the real encrypted path |

`PUSH_TEST` goes all the way through the sender on purpose. A local
notification proves the permission and nothing else; the failure worth catching
is a keypair that does not match the stored subscription, and only a real
encrypted send surfaces that.

A subscription the push service rejects as gone (404 / 410) is **deleted**
rather than retried — an endpoint is revoked when the PWA is deleted or its
permission withdrawn, and a job that kept retrying would spend every hour
failing against a device that no longer wants to hear from it.

`web-push` is the one dependency here that is not the AWS SDK. It does the
RFC 8291 payload encryption and the RFC 8292 VAPID signature, and it is here
rather than hand-rolled on `node:crypto` because ECDH + HKDF + AES-128-GCM
written from the spec fails *silently* when it is wrong: Apple returns the same
201 for a payload it cannot decrypt as for one it can.

## Deploying

Runs automatically from CodePipeline on push to `main` (see `../buildspec.yml`);
the licence key comes from the SSM parameter `/autonomic/serverless-access-key`.

Manually:

```bash
npm ci
npm test            # the push job's arithmetic (pure, no AWS)
SERVERLESS_ACCESS_KEY=... npx serverless deploy --stage prod --region us-west-2
npm run logs        # tail the api function
```

The custom domain, its ACM certificate and the Route53 alias are all in
`serverless.yml`, so the first deploy into a fresh account provisions HTTPS on
`api.autonomic.care` without any manual step. Certificate validation adds a few
minutes to that first deploy only.
