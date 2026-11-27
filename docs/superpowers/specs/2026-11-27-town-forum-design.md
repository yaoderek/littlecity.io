# Global Village (the town forum) — Design

Approved: pending (Derek). A project: a new server, and a new screen in the game.

## Intent

Players publish their towns to a server Derek runs, and anyone in the game can browse everyone's towns, like them, comment on them, visit them and take a copy to build on. Derek's model is Sandspiel's community: a feed of posts, each a picture and a tweet-length caption, with comments and "open a copy".

Why: growth and return visits through people making and showing their own things. PostHog, 2026-11-27: about 96% of players never come back, about 4% ever share a town, and the best-playing arrivals are people who came to see something somebody made (GitHub, chat links). People already build on the game outside it (about 30 Chinese-speaking players run their own copies). A feed gives sharing somewhere to go and gives a player a reason to open the game again (somebody liked their town).

## Goals

Decided by Derek unless marked "(my call)".

1. **A prominent, dedicated button** in the game that opens the forum. Not inside the menu.
2. **A feed of posts.** A post is: a picture of the town, a caption of up to 140 characters, the poster's name, when, and three counts (likes, comments, copies).
3. **Two tabs, Top and New**, opening on Top. A third tab, **Mine**, lists the player's own posts (my call: the like count on the button needs somewhere to land).
4. **On a post** a player can: like it (one like per person per post, can be taken back); read and write comments (one flat list, no replies to replies); **Visit** it (the town opens live, they can look and fly around); **Make a copy** (the town becomes a new town of theirs).
5. **Copies credit the original.** A post made from a copy says "built on {name}'s town" and links to that post. The original shows how many copies were made.
6. **No sign-up.** The first time a player posts or comments they pick a name; the browser remembers who they are.
7. **No content checking and no cap on posting.** People post whatever they like, as often as they like. Derek deals with bad posts himself, from a private admin page (my call: the page).
8. **One feed for every language**, posts mixed. Captions and comments are shown as written.
9. **A like count on the forum button**, the way Instagram shows new likes: the number of new likes on the player's posts since they last opened the forum.
10. **Players can delete their own posts and comments.**
11. **Posting**: from the forum screen (posts the town on screen) and from each card in My towns. Posting the same town again later makes a new post; the old one stays.
12. **It works from mainland China** without a VPN (half of the Chinese-speaking players now connect from the mainland).
13. **A link to a post** that opens the game on that town and shows the town's picture and caption when pasted into X, Discord, Telegram and the like (my call: this is how posts travel outside the game). In a WeChat chat it is a plain link: a picture card there needs a verified WeChat Official Account, which is out of scope.

## Non-goals

- Live building together in one town.
- Accounts, sign-in, email, or moving an identity to another device (a later project).
- Automatic moderation, a report button, pre-approval.
- Following people, profiles, private messages, notifications outside the game.
- Translating captions or comments. A language filter.
- Search, tags, contests.
- A mainland China server or ICP licence.

## Anti-goals (a failure even if it works)

- **Losing or changing a player's town.** Visiting or copying another town never writes over a town of the player's. The town code format (src/world/save.ts) does not change. Nothing the forum stores locally is part of a town.
- **A slower or heavier start.** Nothing of the forum is downloaded, parsed or requested before the town is on screen. The start bundle grows by the button only.
- **The game depending on the server.** With the server down, slow or blocked, the game plays exactly as today; only the forum screen says it cannot be reached.
- **A post that breaks the people who open it.** Every town on the server opens in the game at littlecity.io. (A copy of the game on an older build may meet a town it cannot read: it says "This town needs a newer Little City." and stays where it was.)
- **Player text run as code.** Names, captions and comments are only ever put on the page as text.

## Constraints

- The game stays a static site on GitHub Pages. The forum is one separate server.
- Plain TypeScript, the repo's `el()` helper, no framework, no new runtime dependency in the game.
- Every line the player reads goes through `t()` with all nine languages in the same change (src/i18n; `npm run translate`), and the guide gets an entry.
- Nothing goes live without Derek trying it on a local preview (on his phone too) and saying yes. That covers the game change and the server going up.
- Copies of the game (forks) keep working and keep reporting to PostHog. The forum's address sits in `.env.production` like the PostHog key, so a copy that keeps it joins the same forum (my call; see Approaches).
- Other chats edit src/ui and src/app at the same time: new code goes in new files; changes to existing files are small hooks.

## Approaches

Where the forum's server lives. Derek asked how; these are the three considered.

| | Good | Bad |
|---|---|---|
| **A. One small rented server in Hong Kong (Alibaba Cloud)**: one program, one database file, pictures on its disk | No ICP licence needed; the usual route for reaching the mainland from outside; about $5 to $15 a month; everything in one place | A machine to look after (updates, backups, restarts); a little slower from the US and Europe; mainland speed must be measured, Alibaba publishes none |
| B. Cloudflare Workers + D1 + R2 | Nothing to look after; free at this size; fast worldwide | Cloudflare's own documentation says custom domains are not supported inside mainland China without an ICP licence: it may work one day and not the next |
| C. Supabase or Firebase | Fastest to build | Firebase is Google (blocked in China); Supabase was blocked at network level in India and the UAE in 2026 and is reported slow in China |

**Picked: A.** Derek leaned to it ("if I do a Hong Kong server it will play in China, right"); the Chinese-speaking audience is the best-playing and fastest-growing one, and B and C put exactly that audience at risk. The server is written so that moving it is copying one folder (see The server).

How the game talks to it: plain HTTPS requests with JSON (no live connection: nothing here needs to arrive instantly, and plain requests survive poor connections best).

## The words

| What | English text |
|---|---|
| The feature, the screen's title, the button's label | Global Village (Derek's name; Chinese 地球村, the everyday phrase) |
| Tabs | Top · New · Mine |
| Buttons | Post my town · Visit · Make a copy · Like · Share · Delete |

(My call. Derek sees them on the preview.)

## What the player sees

### The button

- Top centre of the screen, a pill: an icon of two little houses and the label "Global Village". On a window narrower than 520 px the label is dropped and it is a round icon button the size of the menu button, still top centre.
- Hidden in fly mode, under the loading drawing, and in scenarios.
- **The like count**: when the player has new likes on their posts, the button carries a heart and the number ("♥ 12"; 100 or more shows "99+"). New comments on their posts count into the same number (my call: one number, like a phone's app badge; the Mine tab says which is which). The number clears when the forum is opened (any tab).
- Toasts and the visit banner sit at top centre today (`.lc-toasts`): they move to just below the button.
- The first time ever, the button has a red dot under the existing dots rules (src/ui/dots-state.ts gains the id `forum`).

### The forum screen

A full-window sheet built like My towns (src/ui/towns.ts): same card look, same close behaviour (the X, Escape, a click outside).

```
┌────────────────────────────────────────────────────────────┐
│ Global Village        [ Top ] [ New ] [ Mine ]        ✕  │
│                                            [ Post my town ]│
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│ │   picture     │ │   picture     │ │   picture     │      │
│ │ a harbour     │ │ 我的小镇       │ │ castle on a   │      │
│ │ town where…   │ │               │ │ cliff         │      │
│ │ mira · 2 h    │ │ 小林 · 5 h     │ │ tom · 1 d     │      │
│ │ ♥ 42  💬 7  ⧉ 3│ │ ♥ 18  💬 2  ⧉ 0│ │ ♥ 9  💬 0  ⧉ 1 │      │
│ └───────────────┘ └───────────────┘ └───────────────┘      │
│                      ( more as you scroll )                │
└────────────────────────────────────────────────────────────┘
```

- Cards in a grid, 3 or more across on a desktop, 1 across on a phone. 24 posts a page; the next page loads when the player scrolls near the end.
- A card shows: the picture (8:5), the caption (two lines, then "…"), the poster's name and how long ago (`whenText` from src/ui/towns.ts), and the three counts. The heart on a card is a button (like / take back) and is filled when the player has liked it.
- **Top**: posts of the last 7 days, most liked first (ties: newer first); after them, every older post, most liked first. So the top keeps changing and the list never runs out. (My call for what "Top" means.)
- **New**: newest first.
- **Mine**: the player's own posts, newest first. Each card also shows what is new since they last opened the Mine tab ("+5 ♥", "2 new comments"). Two separate marks: the button's number counts from the last time the forum was opened; a card's "new" counts from the last time Mine was opened, so opening the forum on Top does not wipe what Mine has to show. Empty: "You haven't posted a town yet." and the Post my town button.
- An empty Top or New: "No towns yet. Post the first one."
- The server cannot be reached (no answer in 10 seconds, or an error): "Global Village can't be reached right now." and a Try again button. Nothing else in the game changes.
- Clicking a card opens the post.

### A post

Over the feed (a phone: full window), with a back arrow to the feed where the player was.

```
┌──────────────────────────────────────────────┐
│ ←                                         ✕  │
│ ┌──────────────────────────────────────────┐ │
│ │                picture                   │ │
│ └──────────────────────────────────────────┘ │
│ a harbour town where the lighthouse keeper   │
│ lives                                        │
│ mira · 2 hours ago · built on tom's town     │
│ [ Visit ] [ Make a copy ]   ♥ 42   [ Share ] │
│ ──────────────────────────────────────────── │
│ 小林   好可爱!                       1 h      │
│ sam    how did you do the bridge?   20 min   │
│ ┌──────────────────────────────┐ [ Send ]    │
│ │ Say something…               │             │
│ └──────────────────────────────┘             │
└──────────────────────────────────────────────┘
```

- "built on {name}'s town" shows only for a post made from a copy, and opens that post. If the original was deleted it reads "built on a town that is gone" and is not a link.
- Comments: oldest first, all of them (up to 200; older ones behind "Earlier comments"). A comment is up to 280 characters. The player's own comments have a small Delete.
- The player's own post has Delete (asks once: "Delete this post? The town itself stays in My towns."). Deleting a post removes its comments and likes; posts built on it stay.
- **Share** copies the post's link (`https://towns.littlecity.io/p/<id>`) and says "Link copied" (falls back to the copy-by-hand box the share link already uses).

### Visit

- The player's own town is saved and its picture taken first (the existing `leaving()` in src/app/main.ts), the forum closes, and the post's town opens in the existing visiting mode (src/app/main.ts `visiting`: shown, autosave off, nothing of the player's written over).
- A banner (the existing `feedback.banner`): "This is {name}'s town." with **Make a copy** (primary) and **Back to my town**.
- The player may fly, look and even build; nothing is kept unless they make a copy.
- **Back to my town** reopens their own town, then reopens the forum on the post they came from. The player's own world is held in memory during the visit and reopened from there (the existing share-link "Back to my town" re-reads it from storage, which would lose the town of a player whose browser refuses storage).
- Unlike a share link today, a forum visit is always visiting mode, also for a player with no town of their own (Back then gives them their fresh island).

### Make a copy

From the post, or from the banner while visiting. The town becomes a new town in My towns (the existing "Keep it as mine" path: `keeper.detach()`, autosave on), named "{name}'s town" in the player's language, and it remembers the post it came from. The player is now in it and can build. The post's copies count goes up by one (once per person per post; making a copy creates the player's identity silently if they have none, as liking does). If they were visiting and had built something, the copy includes what they built.

### Posting

**Post my town** on the forum screen posts the town on screen. In My towns, each card gets a Post button: it opens that town (the existing open), then the same dialog. While visiting someone's town, Post my town is greyed out and says "Make a copy first."

```
┌──────────────────────────────────────┐
│ Post my town                      ✕  │
│ ┌──────────────────────────────────┐ │
│ │       picture, taken now         │ │
│ └──────────────────────────────────┘ │
│ Your name   [ mira               ]   │
│ Say something about it (optional)    │
│ ┌──────────────────────────────────┐ │
│ │                           0/140  │ │
│ └──────────────────────────────────┘ │
│               [ Cancel ]  [ Post ]   │
└──────────────────────────────────────┘
```

- The picture is taken when the dialog opens, from the view the player has (the existing `townPicture`, 640 px wide, JPEG). So the player frames their own shot; the dialog says "The picture is what you see now" with a Retake button that closes the dialog for 3 seconds of free camera and takes it again. (My call.)
- The name: 1 to 20 characters. Asked the first time (posting or commenting), remembered, shown filled in afterwards and changeable here. Names need not be unique. Changing it changes the name on all the player's posts and comments.
- The caption: 0 to 140 characters, counted as characters a reader sees (code points), so Chinese gets 140 too.
- Not allowed, with a plain reason: an island with nothing built on it (the existing `isTown` rule): "Build something first."; a town too big to send (see limits): "This town is too big to post."
- After posting: the forum opens on the New tab with the new post first, and "Posted" is said.
- If the town was a copy from a post, the post is marked as built on it automatically.

### The link to a post

`https://towns.littlecity.io/p/<id>` is a small page on the server with the post's picture and caption as its share card (Open Graph and Twitter card tags), which sends a person on to `https://littlecity.io/?post=<id>`. The game, opened with `?post=<id>`, loads as usual, then fetches the post and opens it as a Visit (banner and all); the `?post` is removed from the address. A post that is gone: "That town is gone." and the player's own town.

## Who a player is

- Nothing is created until the player first likes, posts, comments or makes a copy. Then the game asks the server for an identity: an id and a secret. Both are kept in `localStorage` under one key, `lc:forum` (`{ id, secret, name, posted }`), never inside a town.
- Liking needs no name. Posting and commenting ask for one.
- Clearing the browser's storage, or another device, is a new person. Accepted.
- A copy of the game on another address has its own storage, so its players are their own people on the same forum.

## The server

One program (Node 24, TypeScript, in `server/` in this repo, MIT like the rest), with no dependencies beyond Node itself: Node's built-in HTTP server and built-in SQLite (`node:sqlite`). Built to one file (`server/dist/forum.mjs`) with the bundler Vite already brings (rolldown) so it can import the game's own town decoder (`src/world/save.ts`) with its `@/` paths.

- **Data**: one folder. `forum.db` (SQLite: players, posts with the town code, comments, likes, copies) and `pics/<post id>.jpg`. Moving the server is copying this folder.
- **In front**: Caddy, for HTTPS certificates and nothing else, passing everything to the program on a local port.
- **Address**: `https://towns.littlecity.io` (the API under `/v1`, post pages under `/p`, pictures under `/pics`, the admin page under `/admin`).
- **Any origin may call it** (CORS open), so copies of the game join the same forum.

### What it checks on every post

- The town code decodes with the game's own `decodeTown` and has something built in it. A town from a modified copy with pieces this game does not know is refused: "This town can't be opened by Little City."
- Limits: town code up to 200,000 characters; picture a JPEG up to 300 KB, 640 × 400; caption up to 140 characters; name 1 to 20; comment 1 to 280. Text is trimmed, and control characters and line breaks are removed.
- No limit on how many towns a player posts (Derek, 2026-11-27: "don't cap posts"). Rate limits per player on the rest: 30 comments an hour, 300 likes an hour. Per network address: 300 new identities a day (loose on purpose: mainland mobile carriers and VPN exits put many players behind one address; this only stops a script). Over the limit: "Slow down a little. Try again in a few minutes."
- A blocked player (admin page) can read but not post, comment or like, and their posts and comments are hidden from everyone else.

### The API

All JSON. A player proves who they are with `Authorization: Bearer <secret>`; the server keeps only a hash of the secret.

| Call | Does |
|---|---|
| `POST /v1/players` | makes an identity: `{ id, secret }` |
| `PUT /v1/me` `{ name }` | sets the name |
| `GET /v1/posts?tab=top\|new\|mine&after=<cursor>` | a page of 24 posts and the next cursor |
| `GET /v1/posts/<id>` | one post with its town code and comments |
| `POST /v1/posts` `{ code, caption, picture, parent? }` | publishes; `picture` is base64 JPEG; `parent` is the post the town was copied from |
| `DELETE /v1/posts/<id>` | the poster's own |
| `PUT` / `DELETE /v1/posts/<id>/like` | like, take back |
| `POST /v1/posts/<id>/copied` | counts a copy (once per player) |
| `POST /v1/posts/<id>/comments` `{ text }` | comments |
| `DELETE /v1/comments/<id>` | the commenter's own |
| `GET /v1/me/news` | `{ likes, comments }` new on the player's posts since they last opened the forum |
| `POST /v1/me/seen` `{ what: 'forum' \| 'mine' }` | they opened the forum, or the Mine tab, now |
| `GET /pics/<id>.jpg` | the picture (cached for a year; a post's picture never changes) |
| `GET /p/<id>` | the share page |
| `GET /health` | `{ ok: true, codec: <fingerprint> }` (see Keeping the decoder in step) |

A post in a list: `{ id, name, caption, created, likes, comments, copies, liked, mine, parent: { id, name } | null, newLikes?, newComments? }` (the last two in the Mine tab only). Errors: an HTTP status and `{ error: <a fixed English line> }`; the game shows it through `t()` like the game core's refusals, so the fixed lines are in the language files.

### Keeping the decoder in step

The server reads towns with the decoder it was built with; the game is released separately and often. A game release that adds a piece or changes the town code would have every new post refused until the server is rebuilt. So:

- A **codec fingerprint**: a short hash of the list of piece, floor and edge kinds and the codec's version and section bits, computed by one function in `src/world/` that both the game's build and the server's build use.
- The server reports its fingerprint in `/health`.
- `tools/deploy-pages.sh`, when `VITE_FORUM_URL` is set, asks the server for it and **refuses to publish the site** when it differs from the fingerprint of the commit being published, saying "put the forum server up first: tools/deploy-forum.sh". The server always reads every older town, so server first, then site, is always safe.
- A release that does not touch the town code (nearly all of them) has the same fingerprint and publishes as today.

### Derek's admin page

`https://towns.littlecity.io/admin`, behind one password (an environment variable on the server). Newest posts and newest comments in two lists, each with Delete and Block this player; a list of blocked players with Unblock; totals (players, posts, comments, likes today and ever). English only, plain HTML.

### Looking after it

- Runs as a service that restarts by itself; not as root; only ports 22, 80 and 443 open; sign-in by key only.
- **Backups**: every night a consistent copy of `forum.db` and the new pictures goes to a storage bucket off the machine (Alibaba OSS, Hong Kong), 30 nights kept. A written, tested way to bring the server back from a backup onto a fresh machine.
- **Watching**: a scheduled GitHub Action asks `/health` every 15 minutes and fails (GitHub emails Derek) when there is no answer twice in a row.
- **Putting a new version up**: `tools/deploy-forum.sh` (builds the one file, copies it, restarts the service, checks `/health`). By hand, after Derek's yes, like the site.
- A runbook in `server/README.md`: first setup from an empty machine, deploy, restore, block someone by hand, what to do when the disk fills.

## How the game side is built

- **New files** (Interface owns them): `src/forum/api.ts` (the calls, a 10-second timeout, the identity), `src/forum/sheet.ts` (the screen), `src/forum/post.ts` (a post and its comments), `src/forum/publish.ts` (the dialog), `src/forum/forum.css`, and tests beside them. Everything under `src/forum/` is loaded with a dynamic `import()` the first time the button is pressed (or when `?post=` is in the address), so it is not in the start bundle.
- **Small hooks in existing files**: the button and its badge (src/ui/interface.ts); `forum` in the dots (src/ui/dots-state.ts); a Post button on My towns cards (src/ui/towns.ts); `visit`, `copy` and `?post=` in src/app/main.ts beside the share-link code, reusing `open()`, `leaving()`, `visiting`, `leaveSpecialTown()` and the banner; an optional `from?: string` (a post id) on `TownEntry` (src/app/library.ts), which old records simply lack.
- **The address**: `VITE_FORUM_URL` in `.env.production` (`https://towns.littlecity.io`). Empty means no forum: no button at all. In dev and in the existing browser tests it is empty, so other chats' work and tests see no change; `npm run forum:dev` (and the forum's own tests) start the game with it set to `http://localhost:8787`.
- **Words**: the forum's lines go in the existing language tables (a few KB per language, loaded as today). Accepted; the "start bundle grows by the button only" rule is about code.
- The button is hidden in scenarios as well as in fly mode and under the loading drawing (the menu button is not hidden in scenarios today; the forum button is).
- **The like count**: once per visit, after the town is on screen and only if `lc:forum` says the player has posted, one `GET /v1/me/news`. No answer: no number, no message.
- **Analytics** (src/app/analytics.ts list): `forum_opened {tab}`, `post_opened`, `post_visited`, `post_copied`, `post_published {caption: bool, built_on: bool}`, `post_liked`, `comment_posted`, `post_shared`, `forum_unreachable`.
- **Running it locally**: `npm run forum` starts the server on port 8787 with its data in `.context/forum-data`; `npm run forum:seed` fills it with about 30 sample posts made from the game's own grown towns, for previews and tests only.

## Tests

- Server (unit, no browser): every call, on a temporary data folder: limits, rate limits, a refused town code, likes counted once, a copy counted once, Top's order across the 7-day line, a blocked player hidden, deleting a post, the share page's tags, text with HTML in it coming back as text.
- Game (unit): the identity kept and reused; the publish dialog's limits (140 code points with Chinese and emoji); a town entry with `from` posts with `parent`.
- Browser (e2e, with a server started on a temporary folder): open the forum, post a town, see it under New and Mine; like it from a second browser and see the count and the badge; comment; visit, build, go back, and the player's own town is byte-for-byte what it was; make a copy and find it in My towns with the original untouched; the server stopped: the forum says so and the game plays; `?post=<id>` opens a visit; a 375 px wide phone in Chinese, French and German with nothing clipped.
- The start bundle's size before and after, reported.

## Going live (after Derek's yes on the preview)

Derek's part, walked through step by step when the time comes: an Alibaba Cloud (international) account, one Hong Kong server (Simple Application Server, 2 GB memory is plenty), an OSS bucket in Hong Kong, and a DNS record `towns.littlecity.io` pointing at the server.

Then, in order: set the server up from the runbook; measure it from mainland Chinese cities (17ce.com or boce.com) and from the US and Europe, and tell Derek the numbers before anything is switched on; put the game change live with `VITE_FORUM_URL` set.

Left for that day, Derek's to decide then: whether the forum opens empty or with a few towns he posts himself first.

## Left to the builder

Exact spacing, sizes and icon drawing (in the game's hand-drawn style, matching My towns); the table layout inside `forum.db`; how cursors are encoded; the in-memory caching of the feed (up to 15 seconds stale is fine); the admin page's layout; the guide entry's wording.
