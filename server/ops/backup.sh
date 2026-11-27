#!/bin/sh
# Global Village's nightly backup (server/README.md, "Backups"). Owner: Forum.
#
# A consistent copy of forum.db (taken while the server runs) goes to the OSS bucket as
# db/forum-<date>.db.gz; pictures new since last night go to pics/ (a picture never changes, so
# only new ones are sent). The bucket's lifecycle rule deletes db/ copies after 30 days, so 30
# nights are kept; this script also removes any older copy it finds, in case the rule is missing.
#
# Needs: FORUM_BACKUP_BUCKET (oss://<bucket>), OSSUTIL_CONFIG (the ossutil config file with a
# key that may write to that bucket only), ossutil on the PATH. Run by forum-backup.service.
set -eu
DATA=${FORUM_DATA:-/var/lib/forum/data}
BUCKET=${FORUM_BACKUP_BUCKET:?set FORUM_BACKUP_BUCKET to oss://<bucket>}
OSS="ossutil -c ${OSSUTIL_CONFIG:?set OSSUTIL_CONFIG to the ossutil config file}"
KEEP_DAYS=30
STAMP=$(date -u +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FORUM_DATA="$DATA" node --disable-warning=ExperimentalWarning /opt/forum/forum.mjs --backup "$TMP/forum.db"
gzip -9 "$TMP/forum.db"
$OSS cp -f "$TMP/forum.db.gz" "$BUCKET/db/forum-$STAMP.db.gz"
$OSS cp -r -f -u "$DATA/pics/" "$BUCKET/pics/"

# Older than 30 nights: gone (the lifecycle rule should have done it already).
CUTOFF=$(date -u -d "$KEEP_DAYS days ago" +%Y-%m-%d)
$OSS ls -s "$BUCKET/db/" | grep -o 'forum-[0-9-]*\.db\.gz' | while read -r f; do
  day=${f#forum-}
  day=${day%.db.gz}
  if [ "$day" \< "$CUTOFF" ]; then $OSS rm -f "$BUCKET/db/$f"; fi
done
echo "backed up forum.db and new pictures to $BUCKET as of $STAMP"
