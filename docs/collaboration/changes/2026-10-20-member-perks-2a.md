# Member perks handoff 2A — website wiring

Scope: website only. No database statements or activity-opening SQL (handoff 2B) were executed. The database state is taken from the handoff; this change does not claim to have re-audited production counts.

- Existing journey task cards use account taskStatus rows and caps; missing rows stay closed. Contact verification is shown once in the balance section; the invite-first server task maps to the existing invite1 card.
- Member-report tasks require the existing local ready/screenReady check in addition to server eligibility. Unsupported local activity evidence remains incomplete; merely viewing a page does not enable a reward. No research text is sent to the rewards RPC.
- Daily/weekly progress, available balance, claim result and explicit refresh share one summary; no duplicated task/exchange lists.
- Existing seven ticket cards use server exchangeOptions prices/duration/availability and wallet balance. Confirmation states the debit, issued days, calendar-month activation deadline, and deferred start. No automatic activation.
- Request UUID is stored by member and product in sessionStorage before exchange. Ambiguous network outcomes keep the original UUID, including across page reloads; pending receipts remain retryable even if the balance already fell. Successful exchange navigates to gifts.
- Responses are guarded by token, mounted root and request generation; signed-out, closed, malformed and unavailable services fail closed. Birthday rewards and claim limits remain server-owned. Review-only tasks and reward videos cannot be claimed by the UI.
- Main signals, broker backtest and divine/dark lamps remain administrator-only. No API or schema changes, recharge, App changes, production push or altered deployment identity.

Validation: isolated browser tests cover server-closed/open responses, local activity gate, actual prices, period claims, cap and error messages, birthday voucher receipt, review-only tasks, confirmation/cancel, persisted retry without double debit, gifts route, changed accounts and signed-out state. Existing identity tests and 320/375/768/1440 light/dark full member journey pass. PGlite v2 tests run only in a disposable in-memory database. Static website has no npm build target; JavaScript syntax and repository collaboration/API checks are run instead.
