# sls — backend for the /master dashboard

One DynamoDB table and two Lambdas behind an HTTP API, deployed by the
Serverless Framework. It stores the analytics dashboard at
`landing/master/` (see `../MASTER_DASHBOARD.md`) and counts the mobile
app's cohort pings. The app still keeps every byte of health data on-device;
the ping is a bare counter with no identifier attached (see below).

```
POST https://api.autonomic.care/api/master
Authorization: Bearer <Cognito id token>
{ "action": "LOAD" | "SYNC" | "REPLACE_ALL" | "PINGS", "payload": { ... } }

GET  https://api.autonomic.care/ping/open/D082126I    (public, no auth)
GET  https://api.autonomic.care/ping/sub/D082126I
GET  https://api.autonomic.care/ping/act/D082126IB
GET  https://api.autonomic.care/ping/hrv/D082126I
GET  https://api.autonomic.care/ping/report?key=...&since=2026-08-01
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
| `DASH#<email>` | `SETTINGS` | trial/wall lengths, currency, store commission |
| `DASH#<email>` | `UI` | view and filter preferences |
| `PING#OPEN` | `<day>` | that day's opens, counted per cohort |
| `PING#SUB` | `<day>` | that day's new subscribers, counted per cohort |
| `PING#ACT` | `<day>` | that day's activations (first HRV reading), per cohort+method |
| `PING#HRV` | `<day>` | that day's measuring installs (any HRV reading), per cohort |
| `STORE#VERSIONS` | `latest` | what each store is serving, cached (see below) |

`LOAD` queries the whole partition. `SYNC` applies the client's diff — entries
as `upserts` / `deletes`, and the four id-keyed collections as
`eventUpserts` / `eventDeletes`, `adUpserts` / `adDeletes`,
`costUpserts` / `costDeletes`, `saleUpserts` / `saleDeletes` — plus `settings`
and `ui`. Each cleaner in the
Lambda has a twin in `landing/master/sync.js`; **if the two shapes disagree,
every diff reports every row as changed forever.** `REPLACE_ALL` wipes the ENTRIES and
rewrites them — it does not touch events, ads, costs or sales, matching a button that
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

`/ping/hrv/<code>` says an install saved an HRV reading today. It carries
exactly what `/ping/open` carries — cohort date and platform letter, **no sensor
letter** — and it is capped at one per install per Eastern day by the same
client rule, bucketed on the same boundary. That symmetry is the whole point:
because both count the same kind of thing over the same population, `hrv[day] /
open[day]` is a **share of people**, not of pings. Opening the app is not using
it, and the open counter alone cannot tell an install that measures every
morning apart from one that launches the app to look at yesterday's number and
never gains a new one.

Two consequences for anything reading these rows:

- **Nothing may be added to one of the two that is not added to the other.** A
  second sensor letter on the HRV route, a different day boundary, a second ping
  per day — any of them breaks the ratio silently, since the numbers still
  divide.
- **Days before the route shipped are unknown, not zero.** There is no start
  date stored anywhere (the endpoint keeps counts), so a reader has to take the
  first day an `hrv` row exists as the counter's birthday and answer null for
  everything before it. `landing/master/analytics.js` does exactly that
  (`hrvFirst` / `hrvKnown`), and reads it off the UNFILTERED rows, because
  Android shipped the route in its own release.

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

Both answer `{ since, open: [...], sub: [...], act: [...], hrv: [...] }`, each row
`{ day, total, cohorts: [{ key, cohortDate, cohort, platform, method, count }] }`.
Rows stored before the platform marker existed report `platform: "U"`. `method`
is the sensor an activation used — `W` watch, `B` Bluetooth strap, `F` finger on
the camera — and is `null` on every row of the other three kinds, which carry no
method at all. A consumer written before the `hrv` key existed ignores it; one
written after must treat a missing `hrv` row as "the counter was not running",
not as "nobody measured".

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

## Deploying

Runs automatically from CodePipeline on push to `main` (see `../buildspec.yml`);
the licence key comes from the SSM parameter `/autonomic/serverless-access-key`.

Manually:

```bash
npm ci
SERVERLESS_ACCESS_KEY=... npx serverless deploy --stage prod --region us-west-2
npm run logs        # tail the api function
```

The custom domain, its ACM certificate and the Route53 alias are all in
`serverless.yml`, so the first deploy into a fresh account provisions HTTPS on
`api.autonomic.care` without any manual step. Certificate validation adds a few
minutes to that first deploy only.
