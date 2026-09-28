# Stoic Connector landing page

## Product and promise

Stoic Connector is a hosted coordination layer for the agents a person already uses. It shares a current project brief, sends bounded handoffs through a common inbox, and records progress and results. Each agent runs on its own model account and schedule. Stoic does not run models or wake an offline agent.

The brand promise is **One brief. Every agent.** The page should feel composed and confident, make the $5 monthly membership plain, and distinguish verified product behavior from integration work that is still in preview.

## Implementation boundary

Keep the existing Next.js app, routes, authentication, pricing, and dashboard links. Implement the design in the current React page and global stylesheet; do not replace the application with a static HTML site or move assets into an unrelated build. Preserve the current Stripe-backed signup flow and public legal and developer pages.

## Visual direction

- A full-bleed, muted looping video anchors a one-viewport hero. It is decorative, muted, inline, and covered by a dark overlay so text remains legible.
- The hero has three clear vertical regions: a centered header, a compact centered message, and a four-column membership/product footer. On phones the footer becomes a 2-by-2 grid.
- Use a real circular Stoic mark beside the wordmark, a white rounded navigation pill, and a restrained charcoal sign-in pill. Use a clean Inter-like sans-serif for navigation and body copy. Use the retro Bubbledot display face for the headline when its hosted font loads, with a readable local/system fallback.
- Keep the headline solid white. Use restrained entrance motion and honor reduced-motion settings.
- The first viewport should fit the header, agent cue, headline, short explanation, primary signup action, and footer across desktop and mobile sizes.
- The hero video source is the existing Stoic deployment asset:
  `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4`

## Approved copy and claims

- Brand: **Stoic Connector**
- Headline: **One brief. Every agent.**
- Hero: “Stoic gives your agents one place to share decisions, hand off work, and return results. They bring their own models. You keep the final say.”
- Primary action: **Get started · $5/month** and link to `/login`.
- Secondary action: **See how it works** and link to the product details below the hero.
- Use agent initials or names only to illustrate the intended connector paths. Do not show provider logos as endorsements or say that an integration is fully verified until it has passed a real account-based test.
- Product facts for the four footer items: **$5/month**, **no plan-based caps**, **one shared inbox**, and **your own models and accounts**. These are product facts, not invented performance statistics.
- Do not reuse the prior template's enterprise endorsement, company logos, inference time, uptime, runtime, context-window, customer-count, or scale claims. They have not been verified for Stoic.
- Explain below the hero that a receiving agent sees work at its next successful scheduled inbox check; Stoic does not provide an instant wake. Model/provider usage is billed separately by each provider.
- Pricing is one required $5/month subscription. Do not imply free service or monthly caps. State the 25 MB per-file upload maximum and that provider costs are separate where pricing details appear.

## Below-the-fold information

Keep the detailed sections available by scrolling so the short hero does not hide important decisions:

1. **Product:** a shared brief, complete handoff context, progress, results, and private files.
2. **How it works:** connect installations separately, choose the boss and delegation level, then let the worker claim and return results on its next check.
3. **Compatibility:** present Codex, Hermes, and OpenClaw as initial pilot paths, Grok as interactive pending verification, and consumer Muse as preview access pending Meta approval and testing. Avoid describing a path as live-tested unless evidence exists.
4. **Pricing:** one $5/month membership, no plan-based caps, approval controls, private file sharing, and bring-your-own models and schedules. Clarify that provider costs are separate and each upload is limited to 25 MB.
5. **Footer:** link to MCP setup, privacy, and terms.

## Interaction and accessibility

- Keep all primary actions as ordinary links. Header links navigate to real page sections.
- On small screens hide the desktop pill and show an accessible menu button. The menu closes on Escape, backdrop click, link selection, and a switch to desktop width; expose its expanded state.
- Maintain visible keyboard focus, adequate contrast, semantic heading order, descriptive page metadata, and a text equivalent for decorative video.
- Ensure the page remains usable if video or hosted fonts fail to load.
- Use no fake user testimonials, logos, uptime promises, or fabricated numeric proof.

## Acceptance checks

- At desktop and mobile widths the first viewport shows the complete hero message and footer without clipping.
- A user can reach signup, developer instructions, pricing, privacy, and terms.
- The mobile menu works with pointer, keyboard, and Escape.
- Reduced-motion preference removes the entrance effects.
- The video does not obstruct text or capture pointer events.
- All public compatibility and pricing statements match deployed product behavior.
