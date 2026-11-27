#!/bin/sh
# Build the game for https://littlecity.io/ and publish the built files (only)
# to the gh-pages branch of yaoderek/littlecity.io, the repo that serves the
# domain (its CNAME file is part of the build). Run from the repo root.
#
# The old address, https://yaoderek.github.io/littlecity/, is this repo's own
# gh-pages: a forwarding page that brings each player's towns along
# (tools/bridge, published once by tools/publish-bridge.sh). Do not publish
# the game there again: players' towns would stay behind at the old address.
set -e
ROOT=$(pwd)
OUT="$ROOT/.context/pages-dist"
SHA=$(git rev-parse --short HEAD)
SITE=yaoderek/littlecity.io
# Global Village (server/README.md): a build with a forum address must not publish towns its forum
# server can't read. The address is VITE_FORUM_URL as the build sees it (the shell's, else
# .env.production's). When it is set, the server's codec fingerprint (/health) must equal this
# commit's; when it is empty there is no forum and nothing here runs.
if [ -n "${VITE_FORUM_URL+set}" ]; then
  FORUM=$VITE_FORUM_URL
else
  FORUM=$(sed -n "s/^VITE_FORUM_URL=//p" .env.production 2>/dev/null | tail -n 1 | tr -d "\"' ")
fi
if [ -n "$FORUM" ]; then
  npm run --silent build:forum >/dev/null
  WANT=$(node --disable-warning=ExperimentalWarning server/dist/forum.mjs --codec)
  HAVE=$(curl -fsS --max-time 20 "${FORUM%/}/health" 2>/dev/null | node -e 'let d="";process.stdin.on("data",(c)=>(d+=c)).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).codec??""))}catch{}})') || HAVE=""
  if [ "$HAVE" != "$WANT" ]; then
    echo "The forum server at $FORUM reads town codec ${HAVE:-(no answer)}; this commit's is $WANT."
    echo "put the forum server up first: tools/deploy-forum.sh"
    exit 1
  fi
fi
rm -rf "$OUT"
VITE_BUILD="$SHA" npx vite build --base=/ --outDir "$OUT" --emptyOutDir >/dev/null
# The pages search engines read: /about/, /guide/<id>/, the sitemap (tools/seo/site.ts).
node tools/seo.mjs "$OUT"
touch "$OUT/.nojekyll"
echo littlecity.io > "$OUT/CNAME"
# The site's repo has the same README (with its pictures) and license as this one; every publish
# replaces the whole branch, so they go along each time.
cp "$ROOT/README.md" "$ROOT/LICENSE" "$OUT/"
mkdir -p "$OUT/docs/readme"
cp "$ROOT"/docs/readme/*.jpg "$OUT/docs/readme/"
cd "$OUT"
git init -q -b gh-pages
git add -A
git commit -q -m "Publish Little City build from $SHA"
git push -q -f "https://github.com/$SITE.git" gh-pages
rm -rf "$OUT/.git"
# A forced push does not always start a Pages build; ask for one.
gh api -X POST "repos/$SITE/pages/builds" >/dev/null 2>&1 || true
echo "published $SHA to https://littlecity.io/"
