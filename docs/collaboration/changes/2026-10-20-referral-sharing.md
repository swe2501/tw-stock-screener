# Referral sharing and single-attribution UX

Website-only change. No schema, API, member balance, voucher issue, live referral binding, campaign switch or 2B activation SQL changes.

- Personal referral codes and invitation URLs are separate actions: an accessible copy icon copies the code only, while the primary share button sends a URL through the native share sheet or copies it. Manual fallback is selectable; cancellation does not silently copy or award anything.
- A shared client module validates codes, builds clean same-origin links, preserves a pending suggestion across signup/login and same-tab OAuth return, and keeps the original seven-day timestamp on reload. A different incoming URL does not silently replace a retained suggestion; members can explicitly edit it before confirmation.
- Retaining or sharing a code never invokes binding, claim or reward RPCs. Members register normally and explicitly confirm their introducer. The existing server owns eligibility, unique invitee attribution and reward idempotency.
- After confirmed binding, the form is locked for that view, pending state is cleared, and only the ref query is removed while other query/hash state is preserved. Cross-account async replies cannot clear or update the new account's invitation.
- Server tests re-submit the same verified invite repeatedly: count remains three, earned groups one, and only one VIP referral voucher exists. Existing alternate-inviter rejection, point claim and wallet transaction tests pass in disposable PGlite only.

Validation: invitation helper unit tests; personal referral copy/share/cancel/fallback, confirmation and account-switch browser tests; full-site signup/login/callback retention without binding/reward writes; share/access regression in desktop/mobile light/dark; JavaScript syntax and API budget checks. No live member rewards were issued. Legacy member-signin-security.browser.cjs still fails its obsolete old-logo image assertion at line 31, identically on the unchanged 6be82e4 baseline; it was not rewritten as part of this task. The focused full-site invitation sign-in test passes.
