# Member perks 2B — activation completed

User explicitly authorized section 2B after 2A was deployed. Target: Taiwan stock2 / bruqrbvbjxntgoljxsne, shared UAT and production database.

Preflight: 34 tasks / 0 active; 7 exchanges / 0 active; 5 voucher definitions / 0 active; 4 voucher-enabled tools; excluded tasks 3 / 0 active; share campaign 1 / 0 active; legacy referral campaigns 0.

Executed only the three approved active-flag updates inside a transaction, with definition-count and exclusion guards. Editor content was copied back and compared exactly with the approved artifact before execution. No schema, permission, identity, balance or reward issuance mutations.

Postflight: tasks 34 / 31 active; exchanges 7 / 7; voucher definitions 5 / 5; tools 4 / 4. Admin-review tasks and ad-video remain 3 / 0 active. Share campaign and legacy referral campaigns remain unchanged.

Authenticated-role read-only transaction for the user's account returned 31 task rows, 7 exchange options, daily limit 30, weekly limit 150 and a readable wallet; transaction rolled back. No actual claims or exchanges were made. Five postflight checks passed: excluded tasks closed, admin tools excluded, anonymous cannot claim, anonymous cannot exchange, share campaign still closed.

Operational evidence (local task workspace): member-perks-2b-review/approved-activation.sql, activation-result.png, member-read-validation.png and security-validation.png. SQL Editor verification URL: https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/02b74949-6dff-4b39-934a-8129f3d26585

Activation is live independently of Git. Existing source migration SQL remains historical/prepared input and must not be rerun to activate or restore the database. No live claim/debit test was performed; browser and PGlite tests from 2A cover those write flows in isolation.
