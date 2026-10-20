# Screen calendar — prepared shared contract

PREPARED ONLY: member-screen-calendar.sql has not been applied live; explicit shared-database approval is required. No extra API Function. Existing research JSON and historical logs remain unchanged, with legacy records labelled as editable old-format records rather than verified new records.

RPCs member_screen_calendar(month) and save_member_screen_record(request,date,strategies,conditions,stocks,note) use auth.uid(), server Taipei date, account-scoped reads and request idempotency. New records are insert-only through the RPC; members have no INSERT/UPDATE/DELETE permission. Multiple runs in the same day append rather than replace. Past/future records are rejected and midnight retries return an already committed receipt without creating a new record. Server controls saved time and date; optional notes are frozen with the snapshot for this version.

The stored strategies/conditions/stocks are a client-submitted research snapshot, not a cryptographic attestation of the screening algorithm or exchange prices. UI freezes them when the screening result is produced; a later form edit invalidates saving until rerun. Server prevents later edits and backdating but does not recompute the whole screener. No claims of market-performance certification. No point issuance or reward eligibility is derived from this table in this change.

PGlite validates server-day constraints, all selected strategies, retry idempotency, immutable direct writes, own-user RLS and anonymous denial. Migration preserves all existing free/member/admin functionality and does not activate campaigns. Website must fail closed for new saves until the RPC is deployed.
