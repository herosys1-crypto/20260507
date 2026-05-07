# AGENTS.md

## Project

This repository is for a stock trading and analysis project.

## Collaboration Mode

Use safe-first, beginner-friendly collaboration.

- Explain important steps briefly before doing them.
- Prefer small, reviewable changes.
- Do not make destructive changes without explicit user approval.
- Do not revert user changes unless the user explicitly asks.
- Check the current project state before editing files.

## AI Roles

Claude and Codex may both be used on this project.

- Claude is mainly used for planning, requirements, long-form reasoning, and documentation drafts.
- Codex is mainly used for repository inspection, code edits, tests, browser checks, GitHub work, and implementation.
- Both agents must follow this file.

## Git Rules

- Do not push directly to `main` unless the user explicitly asks.
- Prefer feature branches for implementation work.
- Use pull requests for reviewed changes.
- Check `git status` before making edits.
- Keep commits focused on one logical change.
- Do not include secrets, API keys, database URLs, private keys, or VPS credentials in Git.

## Database Rules

The project may use Neon Postgres.

- Never run production database migrations without explicit user approval.
- Never write directly to the production database unless the user explicitly approves the exact action.
- Use migration files for schema changes.
- Prefer separate database branches or environments for local, staging, and production.
- Keep `.env.example` updated, but never commit real `.env` files.

Recommended database environments:

- `local` or `dev`: development and AI-assisted work.
- `staging`: VPS testing before production.
- `production`: real service data.

## VPS and Deployment Rules

The project may use a VPS for hosting.

- Do not deploy to production without explicit user approval.
- Do not restart production services without explicit user approval.
- Prefer Docker Compose, systemd, and nginx for a simple VPS deployment path unless the project later requires another approach.
- Keep deployment scripts in `scripts/` or infrastructure files in `infra/`.
- Do not store VPS credentials in the repository.

## Environment Variables

Use `.env.example` for required variable names only.

Common variables may include:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `NODE_ENV`
- `APP_ENV`

Real values must stay in local `.env` files, GitHub Secrets, Neon, or VPS environment files.

## Development Workflow

Before implementation:

1. Read the relevant files.
2. Understand the existing project structure.
3. Explain the intended change briefly.
4. Make the smallest useful edit.
5. Run available checks when possible.

After implementation:

1. Summarize what changed.
2. Mention tests or checks that were run.
3. Mention anything that still needs user approval, especially DB, GitHub, or VPS actions.

## Initial Commands

Fill these in after the tech stack is chosen.

- Install:
- Dev:
- Test:
- Lint:
- Build:
- Deploy:

