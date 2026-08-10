# sls — backend for the /master dashboard

One DynamoDB table and one Lambda behind an HTTP API, deployed by the Serverless
Framework. It exists solely to store the analytics dashboard at
`landing/static/master/` (see `../MASTER_DASHBOARD.md`); nothing else in the
Autonomic product has a backend, and this doesn't change that — the mobile app
is still entirely on-device.

```
POST https://api.autonomic.care/api/master
Authorization: Bearer <Cognito id token>
{ "action": "LOAD" | "SYNC" | "REPLACE_ALL", "payload": { ... } }
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

`LOAD` queries the whole partition. `SYNC` applies the client's diff
(`upserts` / `deletes` / `settings` / `ui`). `REPLACE_ALL` wipes the entries and
rewrites them, which is what "Delete all data" uses — a wipe is worth stating
outright rather than trusting a diff to enumerate every deletion.

The table is `DeletionPolicy: Retain` with point-in-time recovery on. A
`sls remove` will not take the data with it.

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
