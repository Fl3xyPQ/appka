# Two Hearts Journal Prototype

A static, private two-person social app prototype focused on emotional tone, motion, and polish.

## Run

1. Open `index.html` in a browser.
2. Add memories with the form.
3. Refresh the page to confirm local persistence via `localStorage`.

No build tools or server are required.

## Personalize Quickly

Edit `APP_CONFIG` in `app.js`:

- `people`: names shown in the hero text.
- `relationshipStartDate`: used for `Days Together` stat.
- `locale`: date formatting locale (for example `en-GB`, `cs-CZ`).
- `secretMessage`: text shown in the modal.
- `storageKey`: local key for persistence.

## What Is Included

- Hero section with private-app framing.
- Stats strip (`Memories`, `Days Together`, `Current Streak`).
- Memory composer with validation and user feedback.
- Feed rendering from local state with staggered animations.
- Secret modal with click, keyboard, and close-button support.
- Malformed storage recovery with a visible error state.
- Responsive layout and reduced-motion fallbacks.

## Caveats

- No authentication.
- No backend sync.
- No media uploads.
- Streak is a simple same-day continuity check based on saved dates.

## Extension Path

1. Move persistence from `localStorage` to Supabase/Postgres.
2. Add per-memory image attachments.
3. Add a user-facing locale toggle to switch date language live.
4. Add simple auth to lock private timeline to two accounts.
