# SEC-001b: vol_notify JWT verification (2026-11-05)

## Problem
`api/vol_notify.py` accepted any Bearer string (`lib.member_phone.check` returns None when
`MEMBER_REQUIRE_VERIFIED_PHONE` is off) and sent mail to `body.email` -> arbitrary-recipient mail relay.

## Fix
- New `_verify_user_email(token)`: calls `{SUPABASE_URL}/auth/v1/user` (apikey=SUPABASE_ANON_KEY).
- Missing/invalid token or missing Supabase config -> 401; user without confirmed email
  (`email` + `email_confirmed_at`) -> 403.
- Recipient = verified user email only; `body.email` is ignored.
- `lib.member_phone.check` still runs after JWT verification.
- Unhandled exceptions -> 500 `{"error":"internal error"}` (no traceback).
- Tests: `tests/test_vol_notify_auth.py` (all mocked, no mail, no Supabase).

## Rollback
`git revert <commit>` or drop branch `sec/vol-notify` / worktree.

## Deploy notes
No new env vars. Requires existing SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY.
Frontend must send the user's Supabase access token; users without a confirmed email now get 403.
