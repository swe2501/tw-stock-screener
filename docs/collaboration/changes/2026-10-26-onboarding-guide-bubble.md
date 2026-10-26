# Onboarding guide and speech bubble

Owl now stands outside the speech bubble, raised alongside its title on desktop and above the bubble on mobile. The existing brand image layers continue flapping without a hold, on a 1.6-second loop; reduced-motion preference remains respected. Gold border, speech tail, progress bar and dark/light surfaces replace the inline logo presentation.

Guide placement clamps the complete owl/card group inside the viewport. Navigation during a visible tour does not initiate smooth home scrolling. Tour target scrolling completes immediately before geometry is measured. Pending step timers are cancelled on rerender and finish so outdated placements do not reappear. Auth, onboarding flags, route content and access rules are preserved.

Validated by actual-site Playwright regression: separate owl outside bubble, stable first-step scroll and bubble position, original logo ratio, stationary body, continuous wing keyframes, unique SVG IDs, dark/light, desktop/mobile, reduced motion, and no inference. Compatible with existing website routing and additive current-W filtering; no API/schema or App changes.
