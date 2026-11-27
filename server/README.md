# Global Village: the town forum server

The server behind Global Village, the game's forum of players' towns (design:
`docs/superpowers/specs/2026-11-27-town-forum-design.md`). One Node 24 program with no dependencies
beyond Node (`node:http`, `node:sqlite`), built to one file, `server/dist/forum.mjs`, with the game's
own town decoder inside. Owner: Forum.

| What | Where |
|---|---|
| The program | `/opt/forum/forum.mjs` (and `forum.mjs.previous`, the version before) |
| The data, all of it | `/var/lib/forum/data/`: `forum.db` (SQLite) and `pics/<post id>.jpg`. Moving the server is copying this folder. |
| The admin password | `/etc/forum.env` (`ADMIN_PASSWORD=...`, root only) |
| HTTPS | Caddy, `/etc/caddy/Caddyfile` (from `server/ops/Caddyfile`) |
| The service | `forum` (`server/ops/forum.service`), backups `forum-backup.timer` |
| Addresses | `https://towns.littlecity.io`: `/v1` the API, `/p/<id>` a post's link, `/pics` pictures, `/admin` Derek's page, `/health` |

## Locally

```sh
npm run forum          # builds and serves on http://localhost:8791, data in .context/forum-data
npm run forum:seed     # (another terminal) about 30 sample posts, likes and comments
```

The local admin page is `http://localhost:8791/admin`, password `admin` (or `ADMIN_PASSWORD=... npm run forum`).
The sample towns are real grown towns; their pictures are placeholders (`server/seed/*.jpg`).

The program also has these commands (on the server, prefix `sudo -u forum env FORUM_DATA=/var/lib/forum/data node /opt/forum/forum.mjs`):

| | |
|---|---|
| `--codec` | prints the codec fingerprint this build reads |
| `--backup <file>` | a consistent copy of `forum.db`, safe while the server runs |
| `--block <player or post id>`, `--unblock <...>` | as the admin page's Block / Unblock |
| `--delete-post <post id>` | as the admin page's Delete |

## First setup, from an empty machine

An Alibaba Cloud (international) Simple Application Server in Hong Kong, Ubuntu 24.04, 2 GB memory.

1. **Firewall** (Alibaba console, the server's Firewall tab): allow 22, 80 and 443 only. Remove anything else.
2. **Sign in by key only.** Add your public key in the console (or `ssh-copy-id root@<address>`), then as root:
   ```sh
   adduser --disabled-password --gecos "" deploy
   mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
   printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-keys-only.conf
   systemctl restart ssh
   apt update && apt -y upgrade && apt -y install unattended-upgrades sqlite3 curl unzip
   dpkg-reconfigure -f noninteractive unattended-upgrades
   ```
3. **Node 24** (NodeSource) and **Caddy** (its own apt repository):
   ```sh
   curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt -y install nodejs
   apt -y install debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
   apt update && apt -y install caddy
   node --version   # v24.x
   ```
4. **The service's user and folders.** The program runs as `forum` (not root); `deploy` puts new versions up.
   ```sh
   adduser --system --group --home /var/lib/forum forum
   mkdir -p /var/lib/forum/data /opt/forum/incoming
   chown -R forum:forum /var/lib/forum && chmod 750 /var/lib/forum
   chown -R deploy:deploy /opt/forum
   echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart forum' > /etc/sudoers.d/forum-deploy && chmod 440 /etc/sudoers.d/forum-deploy
   umask 077 && echo "ADMIN_PASSWORD=$(openssl rand -base64 24)" > /etc/forum.env && cat /etc/forum.env   # keep it in your password manager
   ```
5. **Copy the files** from this repo (from your Mac, in the repo):
   ```sh
   scp server/ops/forum.service server/ops/forum-backup.service server/ops/forum-backup.timer root@<address>:/etc/systemd/system/
   scp server/ops/Caddyfile root@<address>:/etc/caddy/Caddyfile
   ```
   Then on the server: `systemctl daemon-reload && systemctl enable forum && systemctl reload caddy`.
6. **DNS**: an `A` record `towns.littlecity.io` → the server's address. Caddy gets the certificate by itself
   once the name points at the machine (`journalctl -u caddy -f` shows it).
7. **First deploy**, from your Mac: see Deploy. Then `curl https://towns.littlecity.io/health`
   answers `{"ok":true,"codec":"..."}`, and `https://towns.littlecity.io/admin` asks for the password.
8. **Backups** and **Watching**: below.

## Deploy

By hand, after Derek's yes, from the repo root on the commit to put up:

```sh
FORUM_HOST=deploy@<address> FORUM_URL=https://towns.littlecity.io tools/deploy-forum.sh
```

It builds the one file, copies it (and `backup.sh`) to `/opt/forum`, restarts the service and waits for
`/health` to answer with this build's codec fingerprint. If it doesn't, it puts the previous version
back and restarts that.

**The town code and the order of deploys.** The server reads towns with the decoder it was built
with. A game release that changes the town code (a new piece, floor or edge kind, a new section)
changes the codec fingerprint (`src/world/codec-fingerprint.ts`), and `tools/deploy-pages.sh`
refuses to publish the site until the forum server reports the same one ("put the forum server up
first"). So: `tools/deploy-forum.sh`, then `tools/deploy-pages.sh`. The server always reads every
older town, so server first is always safe.

## Backups

Every night (03:30 Hong Kong) `backup.sh` puts a consistent copy of `forum.db` in an OSS bucket as
`db/forum-<date>.db.gz` and copies the pictures added since (`pics/`). 30 nights of the database
are kept. Pictures are never deleted from the bucket, so every kept night restores with all its pictures.

Once:

1. **A bucket**: Alibaba OSS, region Hong Kong, private, e.g. `littlecity-forum-backup`.
   Lifecycle rule: prefix `db/`, delete objects 30 days after they were last modified.
2. **A key that can only write there**: a RAM user with an AccessKey and this policy:
   ```json
   { "Version": "1", "Statement": [{ "Effect": "Allow", "Action": ["oss:PutObject", "oss:GetObject", "oss:ListObjects", "oss:DeleteObject", "oss:GetBucketInfo"],
     "Resource": ["acs:oss:*:*:littlecity-forum-backup", "acs:oss:*:*:littlecity-forum-backup/*"] }] }
   ```
3. **ossutil** on the server (Alibaba's OSS command line tool; download the Linux build from Alibaba's
   ossutil page and put the binary at `/usr/local/bin/ossutil`), and its config, readable by `forum` only:
   ```sh
   cat > /etc/forum-ossutil.conf <<'CONF'
   [Credentials]
   language=EN
   endpoint=oss-cn-hongkong.aliyuncs.com
   accessKeyID=<the RAM user's AccessKey ID>
   accessKeySecret=<its secret>
   CONF
   chown root:forum /etc/forum-ossutil.conf && chmod 640 /etc/forum-ossutil.conf
   printf 'FORUM_BACKUP_BUCKET=oss://littlecity-forum-backup\nOSSUTIL_CONFIG=/etc/forum-ossutil.conf\n' > /etc/forum-backup.env
   systemctl enable --now forum-backup.timer
   ```
4. **Try it now** and see it arrive:
   ```sh
   systemctl start forum-backup && journalctl -u forum-backup -n 20
   ossutil -c /etc/forum-ossutil.conf ls oss://littlecity-forum-backup/db/
   ```

Check now and then: `systemctl list-timers forum-backup` (last and next run), `journalctl -u forum-backup`.

## Restore onto a fresh machine

1. Set the machine up as in First setup, steps 1 to 6 (not the deploy yet), plus Backups step 3.
2. Fetch the newest database and every picture, and put them in place:
   ```sh
   systemctl stop forum
   OSS="ossutil -c /etc/forum-ossutil.conf"
   $OSS ls -s oss://littlecity-forum-backup/db/ | sort | tail -n 3   # pick the newest
   $OSS cp oss://littlecity-forum-backup/db/forum-<date>.db.gz /tmp/
   gunzip /tmp/forum-<date>.db.gz
   sqlite3 /tmp/forum-<date>.db 'PRAGMA integrity_check; SELECT COUNT(*) FROM posts;'   # "ok" and a number
   rm -f /var/lib/forum/data/forum.db /var/lib/forum/data/forum.db-wal /var/lib/forum/data/forum.db-shm
   mv /tmp/forum-<date>.db /var/lib/forum/data/forum.db
   $OSS cp -r -u oss://littlecity-forum-backup/pics/ /var/lib/forum/data/pics/
   chown -R forum:forum /var/lib/forum/data
   ```
3. Deploy (from your Mac, `tools/deploy-forum.sh`): it starts the service and checks `/health`.
4. Point DNS at the new machine if it changed. Open a few posts and the admin page.

Moving to another machine on purpose is the same with the live folder instead of a backup:
stop the service, copy `/var/lib/forum/data` across, start.

## Block someone by hand

Normally: the admin page, Block this player (beside each post and comment), and Unblock under
Blocked players. A blocked player can still read, but not post, comment or like; their posts,
comments and likes are hidden from everyone else (their posts' pictures and links too). Feeds catch up
within 15 seconds.

Without the admin page, on the server, with a post's id (the end of its link `/p/<id>`) or a player's id:

```sh
cd /var/lib/forum
sudo -u forum env FORUM_DATA=/var/lib/forum/data node --disable-warning=ExperimentalWarning /opt/forum/forum.mjs --block <post or player id>
sudo -u forum env FORUM_DATA=/var/lib/forum/data node --disable-warning=ExperimentalWarning /opt/forum/forum.mjs --delete-post <post id>
```

To find a player's id from their name: `sqlite3 -readonly /var/lib/forum/data/forum.db "SELECT id, name, created FROM players WHERE name LIKE '%mira%'"`.

## When the disk fills

Writing stops (posts and comments are refused with "Something went wrong on the server. Try again later."),
reading keeps working. Then:

1. See what is big: `df -h /` and `du -sh /var/lib/forum/data/* /var/log/* | sort -h | tail`.
2. Logs first: `journalctl --vacuum-size=200M`; Caddy's own logs roll by themselves (`/var/log/caddy`).
3. Old system packages: `apt -y autoremove && apt clean`.
4. Pictures are most of the data (about 50 KB a post: 100,000 posts are about 5 GB). If posts are the
   cause, the lasting fix is a bigger disk: Alibaba console → the server → Disks → resize (Simple
   Application Server: upgrade the plan), then `growpart /dev/vda 1 && resize2fs /dev/vda1` if the
   file system did not grow by itself.
5. After space is back: `systemctl restart forum` and check `/health`. SQLite keeps itself consistent
   through a full disk (a write that failed is rolled back), so nothing needs repairing; to be sure,
   `sqlite3 -readonly /var/lib/forum/data/forum.db 'PRAGMA integrity_check'` says `ok`.

## Watching

The GitHub Action `forum-health` (`.github/workflows/forum-health.yml`) asks `/health` every 15
minutes and fails (GitHub emails Derek) when there is no answer twice in a row, a minute apart. It
does nothing until the repository variable `FORUM_URL` is set (Settings → Secrets and variables →
Actions → Variables → `FORUM_URL` = `https://towns.littlecity.io`). GitHub pauses scheduled
workflows in a repository with no commits for 60 days: re-enable it on the Actions tab if so.

On the machine: `systemctl status forum`, `journalctl -u forum -f` (unexpected errors are logged
there, with their details; players only ever get the fixed line).

## Limits (design, "What it checks on every post")

Town code up to 200,000 characters, decoded by the game's own decoder and with something built in
it; picture a JPEG of at most 640 × 400 and 300 KB (its header is read to check); caption up to 140
characters; name 1 to 20; comment 1 to 280 (counted in code points; text is trimmed, control characters
removed). No limit on posting. Per player: 30 comments and 300 likes an hour. Per network address:
300 new identities a day (the address is Caddy's X-Forwarded-For, trusted from this machine only).
Every refusal is an HTTP status and `{ "error": "<a fixed English line>" }`; the lines are all in
`server/errors.ts`.
