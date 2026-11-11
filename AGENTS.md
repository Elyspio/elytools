# AGENTS.md

Rules for every coding agent working in this repository (Claude Code also reads `CLAUDE.md`, which imports this file).

## Development builds

- After pushing a change to the desktop app (`desktop/`), always publish a development build: `cd desktop && pnpm release:dev`. Skip it only when the thread explicitly asks not to.
- `pnpm release:dev` needs a clean working tree and the branch pushed to its remote; it publishes `X.Y.Z-dev.N` as a GitHub prerelease (followed by the "Dev" update channel). Give the release URL in your reply.
- Stable releases (`pnpm release`, from `main`) are only made when asked.
