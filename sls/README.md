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

GET  https://api.autonomic.care/ping/open/D082126     (public, no auth)
GET  https://api.autonomic.care/ping/sub/D082126
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
| `DASH#<email>` | `SETTINGS` | trial/wall lengths, currency |
| `DASH#<email>` | `UI` | view and filter preferences |
| `PING#OPEN` | `<day>` | that day's opens, counted per cohort |
| `PING#SUB` | `<day>` | that day's new subscribers, counted per cohort |

`LOAD` queries the whole partition. `SYNC` applies the client's diff
(`upserts` / `deletes` / `settings` / `ui`). `REPLACE_ALL` wipes the entries and
rewrites them, which is what "Delete all data" uses — a wipe is worth stating
outright rather than trusting a diff to enumerate every deletion.

The table is `DeletionPolicy: Retain` with point-in-time recovery on. A
`sls remove` will not take the data with it.

## The cohort ping

`lambdas/ping/main.js` — two public write routes, no auth, no body, `204` to
everything. The path segment is the calling install's **cohort**: the day it
first ran the app, as `D{MMDDYY}`. The server stamps the arrival day itself.

**One row per day**, holding that day's count for every cohort:

```jsonc
{ "PK": "PING#OPEN", "SK": "2026-08-21",
  "day": "2026-08-21",
  "total": 137,
  "cohorts": { "082126": 12, "080126": 4, "071526": 2 } }
```

Read as a grid, that is a retention matrix: how many installs born on cohort C
opened the app on day D. It is a DynamoDB **map** rather than a list because a
list has no addressable slot — appending would need a read-modify-write, and
two phones pinging in the same millisecond would lose a count. A map key is
addressable, so one atomic `UpdateItem` does the whole bump. It reads back as an
array of `{ cohortDate, count }`, which is the shape a chart wants.

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

### Never delete a day row

`PING#OPEN / <day>` is **everyone's** counts for that day, in one item. Deleting
it to undo your own test ping destroys every real ping that landed in it, and
the client will not re-send: an install stamps "pinged today" on success and
stays quiet until the next UTC day. This has happened once already, and was only
recoverable because the table has point-in-time recovery on.

So: do not write test pings to production. If you must, pick a cohort date you
can recognise and undo it by decrementing that one map key, never by deleting
the item:

```bash
aws dynamodb update-item --region us-west-2 --table-name Autonomic-prod \
  --key '{"PK":{"S":"PING#OPEN"},"SK":{"S":"2026-08-10"}}' \
  --update-expression "SET cohorts.#c = cohorts.#c - :one, #t = #t - :one" \
  --expression-attribute-names '{"#c":"081026","#t":"total"}' \
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

Both answer `{ since, open: [...], sub: [...] }`, each row
`{ day, total, cohorts: [{ cohortDate, count }] }`.

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
  per install per UTC day, exactly one subscribe ping per install
  (`mobile/src/store/ping.ts`). One ping == one active install that day.
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
