# RideHero account and Friends backend

The migration in `supabase/migrations/202608120001_account_friends.sql` adds the database boundary for email, Google, and Facebook sign-in. Supabase Auth owns credentials and provider identity. RideHero stores only a public-safe profile (`user_id`, normalized handle, display name, and timestamps). It never copies email addresses into the public schema.

## Client RPC contract

All RPCs require a valid Supabase `authenticated` session. Parameters below are the exact names expected by `supabase.rpc(name, parameters)`.

| RPC | Parameters | Result |
| --- | --- | --- |
| `complete_profile` | `{ handle: string, display_name: string }` | JSON object: `{ userId, handle, displayName, createdAt, updatedAt }`. A claimed handle reports SQLSTATE `23505`. Limited to 10 attempts per hour per account. |
| `get_my_profile` | none | Zero or one row: `{ user_id, handle, display_name, created_at, updated_at }`. |
| `send_friend_request` | `{ handle: string }` | Always `{ status: "processed" }` for authenticated calls, including missing/self/duplicate/blocked/rate-limited targets. Limited to 20 attempts per hour per account. Refresh `list_friend_state` for state. |
| `respond_friend_request` | `{ id: UUID, response: "accept" | "decline" }` | `{ status: "processed" }`. Only the recipient can act. |
| `remove_friend` | `{ user_id: UUID }` | Generic `{ status: "processed" }`. |
| `block_user` | `{ user_id: UUID }` | Generic `{ status: "processed" }`; removes any friendship and cancels pending requests. |
| `unblock_user` | `{ user_id: UUID }` | Generic `{ status: "processed" }`. |
| `list_friend_state` | none | Rows with `{ state, relationship_id, friend_user_id, handle, display_name, created_at }`; `state` is `friend`, `incoming_request`, or `outgoing_request`. |
| `list_blocked_users` | none | Rows with `{ user_id, handle, display_name, blocked_at }` visible only to the blocker. |

Handles are intentional public identifiers. V1 deliberately has no standalone availability/search RPC: availability is checked only while claiming a handle through `complete_profile`. Friend-request creation uses a generic result and an independent private attempt window before target lookup. A successful request appears in the sender's relationship list because its handle is the public addressing mechanism; throttling limits but cannot remove that residual exact-handle signal. There is no RPC to look up emails, provider identities, or arbitrary profile records.

## Authorization and privacy

- Authenticated clients have no direct table privileges. Narrow RPCs are the only client read/write surface; participant-scoped RLS policies remain as defense in depth.
- Profile rows are returned only by `get_my_profile` for the owner. Other handles/display names appear only through RPC results for an existing friend, request, or block relationship.
- Friend pairs are stored in canonical UUID order and constrained against self-relationships and duplicate pending/accepted pairs.
- Handles are immutable after initial profile completion; display names can be updated by submitting the existing handle.
- Security-definer RPCs use an empty `search_path`, fully qualified objects, explicit `auth.uid()` checks, and authenticated-only execution grants.
- Blocked users cannot create or accept a relationship. Block lists are visible only to the blocker.
- No route, wait, or GPS data is added to the account schema.
- Existing device-only Friends names must not be automatically matched to accounts or uploaded. Migration should require a separate, explicit user action.

## Account deletion

Do not ship a browser-accessible service-role key and do not expose a SQL RPC that deletes arbitrary Auth users. Account deletion must run through a trusted Supabase Edge Function or equivalent authenticated server endpoint:

1. Verify the caller's access token server-side.
2. Derive the deletion target from that verified token, never from a client-supplied user ID.
3. Call the Supabase Admin Auth deletion API using a server-only secret.
4. Return a generic success response and sign the client out.

`profiles.user_id` references `auth.users(id) on delete cascade`. Friend requests, friendships, blocks, and private attempt-window records then cascade from the deleted account, so no account relationship rows remain.

## Provider configuration

Google and Facebook OAuth apps, callback URLs, production email delivery, and provider secrets are Supabase dashboard/deployment configuration. Secrets belong only in Supabase or hosting environment configuration, never in this repository.

### Passwordless email template

RideHero uses an email one-time password (OTP), not a browser-bound magic link. This lets a guest request a code in RideHero, open their email in another app or browser, and return to enter the code without losing a PKCE verifier.

In **Authentication -> Email Templates**, replace the default link-only content in both **Confirm signup** and **Magic Link** with a message containing Supabase's `{{ .Token }}` variable. Remove `{{ .ConfirmationURL }}` from the sign-in action so these templates deliver the OTP flow RideHero expects. A minimal body is:

```html
<h2>Your RideHero sign-in code</h2>
<p>Enter this one-time code in RideHero:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.16em;">{{ .Token }}</p>
<p>If you did not request this code, you can ignore this email.</p>
```

The browser verifies the code with `verifyOtp({ email, token, type: 'email' })`. The code and email must remain in memory only for the active form; never log or persist the code. Confirm the final template by requesting a code and completing sign-in from a separate browser profile.

Deployment checklist:

1. Apply `supabase/migrations/202608120001_account_friends.sql` to the production project.
2. Set the Supabase Auth **Site URL** to RideHero's exact production origin.
3. Add the exact RideHero return URL, `https://<ridehero-host>/auth/callback/`, to **Additional Redirect URLs**. Avoid production wildcards. During the trailing-slash rollout, retain the former `/auth/callback` URL temporarily for in-flight sign-ins.
4. Configure Google and Facebook to use Supabase's project callback URL, `https://<project-ref>.supabase.co/auth/v1/callback`, then enter their provider secrets only in the Supabase dashboard.
5. Confirm `js/supabase-config.js` contains only the production project URL and browser publishable key. Never place a service-role key, Google secret, Facebook secret, SMTP credential, or provider token in that file.
6. Configure the Confirm signup and Magic Link templates to send `{{ .Token }}`, then configure production SMTP and review Supabase Auth rate limits, CAPTCHA, allowed origins, and abuse controls before enabling public sign-up.
7. Verify the deployed `/auth/callback/` response is `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`. Cloudflare applies redirects before `_headers`, so this response-header behavior must be checked after deployment; use a Pages Function for the callback if the static rewrite does not retain those headers.

RideHero is connected to the `wiryzupgdfxftrvjvdzh` project with email, Google, and Facebook enabled in the browser configuration. The migration must be applied before profile setup and account-backed Friends can work.
