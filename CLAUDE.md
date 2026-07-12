# FinalWhistle

A social prediction app for the 2026 World Cup: friend Groups stake real USDC into shared parimutuel Pools on a match and get paid automatically when a TxLINE Score Proof settles the Pool trustlessly. See [`CONTEXT.md`](./CONTEXT.md) for the domain language and [`docs/adr/`](./docs/adr) for the key decisions.

## Design Context

Before any frontend/design work, read [`PRODUCT.md`](./PRODUCT.md) — it is the source of truth for who this is for and how it should feel.

- **Register:** product (the app the fan is in a task on). The marketing/pitch landing is a per-task **brand** surface. **Platform:** web.
- **Personality:** social-first and fun — matchday group-chat energy (BeReal/Discord more than a betting site), playful and a little irreverent, with serious provable trust underneath. **Feel:** playful social hype.
- **Anti-references:** not a cold trading terminal, not generic SaaS.
- **Principles:** crypto is invisible · fun on top, proof underneath · the Proof Receipt is the hero · the Group is first-class · earn trust on every money move.
- **Accessibility:** WCAG AA + honor `prefers-reduced-motion`; Pool state is never signalled by color alone.

Design tooling: the `impeccable` skill is set up (`/impeccable <command>`). `DESIGN.md` is not yet written — run `/impeccable document` to capture the current visual system.
