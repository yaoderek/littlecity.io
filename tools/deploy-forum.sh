#!/bin/sh
# Put a new version of Global Village (the town forum server) up: build the one file, copy it to the
# server, restart the service, and check /health answers with this build's codec fingerprint. If it
# doesn't, the previous version is put back and restarted. By hand, after Derek's yes, like the site.
# Run from the repo root. Owner: Forum. Runbook: server/README.md.
#
#   FORUM_HOST=deploy@<server address> FORUM_URL=https://towns.littlecity.io tools/deploy-forum.sh
#
#   FORUM_HOST      the ssh target (the deploy user, key sign-in)
#   FORUM_URL       the forum's public address, for the /health check
#   FORUM_SSH_PORT  optional, default 22
#
# After a release that changes the town code (a new kind, a new section), run this before
# tools/deploy-pages.sh: that one refuses to publish until the server reads the new towns.
set -eu
HOST=${FORUM_HOST:?set FORUM_HOST to the ssh target, e.g. deploy@203.0.113.7}
URL=${FORUM_URL:?set FORUM_URL to the forum address, e.g. https://towns.littlecity.io}
URL=${URL%/}
PORT=${FORUM_SSH_PORT:-22}
DIR=/opt/forum

npm run --silent build:forum >/dev/null
WANT=$(node --disable-warning=ExperimentalWarning server/dist/forum.mjs --codec)
SHA=$(git rev-parse --short HEAD)
echo "built forum $SHA (codec $WANT)"

scp -q -P "$PORT" server/dist/forum.mjs server/ops/backup.sh "$HOST:$DIR/incoming/"
ssh -p "$PORT" "$HOST" "set -e
  cd $DIR
  [ -f forum.mjs ] && cp forum.mjs forum.mjs.previous
  mv incoming/forum.mjs forum.mjs.new && mv forum.mjs.new forum.mjs
  mv incoming/backup.sh backup.sh && chmod 755 backup.sh
  echo $SHA > VERSION
  sudo systemctl restart forum"

healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    HAVE=$(curl -fsS --max-time 10 "$URL/health" 2>/dev/null | node -e 'let d="";process.stdin.on("data",(c)=>(d+=c)).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.ok===true?String(j.codec):"")}catch{}})') || HAVE=""
    [ "$HAVE" = "$WANT" ] && return 0
  done
  return 1
}

if healthy; then
  echo "forum $SHA is up at $URL (codec $WANT)"
else
  echo "forum $SHA did not answer /health with codec $WANT: putting the previous version back" >&2
  ssh -p "$PORT" "$HOST" "set -e; cd $DIR; [ -f forum.mjs.previous ] && cp forum.mjs.previous forum.mjs; sudo systemctl restart forum"
  echo "previous version restarted; look at the log: ssh $HOST journalctl -u forum -n 100" >&2
  exit 1
fi
