# Voice Note deployment

The PAUD page uses no child accounts. It sends recordings and the name already
entered in the check-in to the `voice-notes` Edge Function. That function uses
the Supabase service role only on the server and keeps the bucket private.

## Deploy the function

Deploy `functions/voice-notes/index.ts` as the Supabase Edge Function named
`voice-notes`, with JWT verification disabled for this function only. The code
validates its own short-lived admin session for `admin-notes`; child uploads
are anonymous and limited to 10 MB and 60 seconds.

Set these Edge Function secrets in Supabase Function Secrets (never in browser
JavaScript):

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` (the project's service role key)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the Edge Function
by Supabase. The custom session signing key is derived server-side from the
service role key. Do not add admin secrets to `.env`, HTML, or
`supabase-config.js`.

## Database

Run `supabase-setup.sql` once. It preserves existing rows, adds `child_name`,
and allows new rows with `child_id = NULL`. Row Level Security stays enabled;
no child-auth policies remain. Anonymous clients cannot read/write the table or bucket directly; the Edge Function uses the service role and validates admin sessions. Keep Storage private.

Admin page: `admin.html`.
