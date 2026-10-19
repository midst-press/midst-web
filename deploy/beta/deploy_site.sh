#!/bin/bash
# deploy_site.sh -- build midst-web at a chosen commit and publish it to the site stack's bucket.
#
# Usage:
#   deploy_site.sh --web-repo PATH --key-scheme legacy|canonical --poem-list bundled|published [--ref REF] [--tag TAG] [--stack NAME | --site BUCKET DISTRIBUTION POEMS_URL SITE_URL] [--dry-run] [--no-smoke]
#
#   --web-repo  a clone of midst-web (any remote layout; REF must resolve in it after a fetch)
#   --key-scheme  which object names the site asks the poems bucket for (midst-web #41). Required, and
#               there is no default: it is built into the site and must match what the bucket holds,
#               or every poem shows as not found. "legacy" is the author-and-title names;
#               "canonical" is <id>/timelapse.midst.zip. Step 4 checks the choice against the bucket.
#   --poem-list where the site gets its list of poems (midst-web #110). Required, and there is no default:
#               "bundled" is the list built into the site; "published" is poems/published.json under the
#               poems URL, fetched when the site starts. Step 4 checks whichever list the site will read:
#               the canary for "bundled", check_published_list.py for "published".
#   --ref       what to deploy; default origin/main. Resolved to a full SHA before anything runs.
#   --tag       the release tag being deployed. It must name the same commit as REF, or nothing runs.
#               Without it, the tag is the one REF's commit carries exactly (git describe --tags
#               --exact-match), or none; never the nearest older tag.
#   --stack     the CloudFormation stack made from site.yaml; default midst-press-beta-site
#   --site      the four values below given directly instead of read from the stack, for an identity
#               that may write the site but not read CloudFormation (beta/github-deploy.yaml grants
#               no CloudFormation access). All four or none; with --site, --stack is not used.
#   --dry-run   build, then print what would be uploaded and invalidated; write nothing to AWS
#   --no-smoke  skip the browser check at the end
#
# Credentials: NONE are read or stored here. The script uses whatever the AWS CLI finds in its
# standard environment (AWS_PROFILE, AWS_REGION, AWS_SHARED_CREDENTIALS_FILE, an SSO session, an
# instance role). It prints the identity it is about to act as before writing anything.
#
# Everything account-specific comes from the stack, so another AWS account needs only its own
# stack made from site.yaml and its own credentials:
#   site bucket       the stack's SiteBucket resource
#   distribution id   the stack's DistributionId output
#   poems URL         the stack's PoemsUrl output (baked into the build as MIDST_POEMS_URL)
#   site URL          the stack's SiteUrl output (used by the smoke check)
#
# Steps, in order (follow them by hand if you would rather write your own):
#   1. resolve REF to a SHA and check it out in a temporary worktree
#   2. npm ci --legacy-peer-deps --ignore-scripts   (the same install CI uses)
#   3. MIDST_POEMS_URL=<PoemsUrl> MIDST_KEY_SCHEME=<scheme> npm run build      (output in dist/)
#      with the build inputs the About page shows (midst-web src/build-info.ts, midst-infra #30):
#      MIDST_BUILD_TAG (the tag, or empty), MIDST_BUILD_COMMIT (short SHA), MIDST_BUILD_DATE (the
#      commit's own date, %cI). A worktree with changes in it is refused rather than labelled -dirty:
#      a deploy is exactly one commit.
#   4. ask the poems URL for every published poem under that scheme (midst-web's own
#      tools/poem-canary.mjs, HEAD requests, no credentials); if a timelapse is unreachable, stop
#      before anything is uploaded
#   5. sync dist/ to the site bucket, index.html last and uncached, so a visitor never gets a
#      new index.html pointing at assets that are not uploaded yet. Files whose names carry Parcel's
#      content hash (name.<8 hex>.ext, and their .map) go first, every one re-sent, with Cache-Control
#      "public, max-age=31536000, immutable": a changed file gets a new name (midst-infra #75). Every
#      other file keeps the bucket's default. A build with no hashed file is refused.
#   6. upload site-extra/ (robots.txt, .well-known/tdmrep.json: the AI-training opt-out)
#   7. upload deployed.json: the midst-web SHA, the tag, the key scheme and the time, so "what is deployed?" has an answer
#   8. invalidate the distribution and wait for it
#   9. smoke check: every published poem's page mounts the player with text (smoke_site.cjs);
#      fonts are not checked, see that file
#
# Requires: git, node/npm, aws (v2), python3. Exit 0 deployed (and smoke passed), 1 failed before upload,
#   2 deployed but smoke check failed (previous SHA printed for rollback).
set -euo pipefail

STACK=midst-press-beta-site
GIVEN=0
REF=origin/main
TAG=""
WEB=""
SCHEME=""
POEM_LIST=""
DRY=0
SMOKE=1
while [ $# -gt 0 ]; do
  case "$1" in
    --web-repo) [ $# -ge 2 ] || { echo "--web-repo requires a value" >&2; exit 1; }; WEB="$2"; shift 2 ;;
    --key-scheme) [ $# -ge 2 ] || { echo "--key-scheme requires a value: legacy or canonical" >&2; exit 1; }; SCHEME="$2"; shift 2 ;;
    --poem-list) [ $# -ge 2 ] || { echo "--poem-list requires a value: bundled or published" >&2; exit 1; }; POEM_LIST="$2"; shift 2 ;;
    --ref) [ $# -ge 2 ] || { echo "--ref requires a value" >&2; exit 1; }; REF="$2"; shift 2 ;;
    --tag) [ $# -ge 2 ] || { echo "--tag requires a value" >&2; exit 1; }; TAG="$2"; shift 2 ;;
    --stack) [ $# -ge 2 ] || { echo "--stack requires a value" >&2; exit 1; }; STACK="$2"; shift 2 ;;
    --site) [ $# -ge 5 ] || { echo "--site takes four values: BUCKET DISTRIBUTION POEMS_URL SITE_URL" >&2; exit 1; }
            # A missing value would otherwise take the next option as a value: "--dry-run" as SITE_URL.
            for x in "$2" "$3" "$4" "$5"; do
              case "$x" in ""|-*) echo "--site takes four values: BUCKET DISTRIBUTION POEMS_URL SITE_URL; got '$x'" >&2; exit 1 ;; esac
            done
            BUCKET="$2"; DIST="$3"; POEMS_URL="$4"; SITE_URL="$5"; GIVEN=1; shift 5 ;;
    --dry-run) DRY=1; shift ;;
    --no-smoke) SMOKE=0; shift ;;
    -h|--help) sed -n '2,53p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done
[ -n "$WEB" ] || { echo "--web-repo is required" >&2; exit 1; }
case "$SCHEME" in
  legacy|canonical) ;;
  "") echo "--key-scheme is required: legacy or canonical. There is no default." >&2; exit 1 ;;
  *) echo "--key-scheme must be legacy or canonical, not '$SCHEME'" >&2; exit 1 ;;
esac
case "$POEM_LIST" in
  bundled|published) ;;
  "") echo "--poem-list is required: bundled or published. There is no default." >&2; exit 1 ;;
  *) echo "--poem-list must be bundled or published, not '$POEM_LIST'" >&2; exit 1 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
EXTRA="$HERE/site-extra"

out() { aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
if [ $GIVEN = 0 ]; then
  DIST="$(out DistributionId)"
  POEMS_URL="$(out PoemsUrl)"
  SITE_URL="$(out SiteUrl)"
  BUCKET="$(aws cloudformation describe-stack-resource --stack-name "$STACK" --logical-resource-id SiteBucket \
    --query StackResourceDetail.PhysicalResourceId --output text)"
  SOURCE="stack $STACK"
else
  SOURCE="--site"
fi
for v in DIST POEMS_URL SITE_URL BUCKET; do
  case "${!v}" in ""|None) echo "$SOURCE has no value for $v" >&2; exit 1 ;; esac
done

git -C "$WEB" fetch -q --all
SHA="$(git -C "$WEB" rev-parse --verify "$REF^{commit}")"
if [ -n "$TAG" ]; then
  TAG_SHA="$(git -C "$WEB" rev-parse --verify -q "refs/tags/$TAG^{commit}")" \
    || { echo "tag $TAG does not exist in $WEB" >&2; exit 1; }
  [ "$TAG_SHA" = "$SHA" ] || { echo "tag $TAG is commit $TAG_SHA, not $SHA ($REF); nothing deployed" >&2; exit 1; }
else
  TAGS=()
  while IFS= read -r t; do [ -n "$t" ] && TAGS+=("$t"); done < <(git -C "$WEB" tag --points-at "$SHA")
  if [ "${#TAGS[@]}" -eq 0 ]; then
    TAG=""
  elif [ "${#TAGS[@]}" -eq 1 ]; then
    TAG="${TAGS[0]}"
  else
    echo "commit $SHA carries ${#TAGS[@]} tags: ${TAGS[*]}. Pass --tag to choose one." >&2
    exit 1
  fi
fi
COMMITTED_AT="$(git -C "$WEB" show -s --format=%cI "$SHA")"
WHO="$(aws sts get-caller-identity --query Arn --output text)"
echo "deploy midst-web $SHA ($REF), tag ${TAG:-none}, committed $COMMITTED_AT"
echo "  as     $WHO"
echo "  site   ($SOURCE) bucket $BUCKET, distribution $DIST"
echo "  poems  $POEMS_URL (key scheme: $SCHEME, poem list: $POEM_LIST)"
[ $DRY = 1 ] && echo "  DRY RUN: nothing will be written to AWS"

WT="$(mktemp -d)/midst-web"
# shellcheck disable=SC2329  # invoked by trap on EXIT
cleanup() { git -C "$WEB" worktree remove --force "$WT" 2>/dev/null || true; git -C "$WEB" worktree prune; }
trap cleanup EXIT
git -C "$WEB" worktree add -q --detach "$WT" "$SHA"
# Measured before npm writes anything into the worktree; its own logs would otherwise count.
[ -z "$(git -C "$WT" status --porcelain)" ] || { echo "the worktree for $SHA has changes in it; nothing deployed" >&2; exit 1; }
SHORT="$(git -C "$WT" rev-parse --short "$SHA")"

# A commit from before midst-web had key schemes builds legacy names whatever it is told.
if [ "$SCHEME" != legacy ] && [ ! -f "$WT/src/poems/key-scheme.js" ]; then
  echo "midst-web $SHA predates key schemes and can only be deployed with --key-scheme legacy" >&2; exit 1
fi

# A commit from before the poem list was a build input would ignore the choice.
if [ "$POEM_LIST" != bundled ] && [ ! -f "$WT/src/poems/poem-list.js" ]; then
  echo "midst-web $SHA predates the published poem list and can only be deployed with --poem-list bundled" >&2; exit 1
fi

( cd "$WT" && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund > npm.log 2>&1 ) \
  || { echo "npm ci failed; last lines of its log:" >&2; tail -20 "$WT/npm.log" >&2; exit 1; }
( cd "$WT" && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    MIDST_POEMS_URL="$POEMS_URL" MIDST_KEY_SCHEME="$SCHEME" MIDST_POEM_LIST="$POEM_LIST" \
    MIDST_BUILD_TAG="$TAG" MIDST_BUILD_COMMIT="$SHORT" MIDST_BUILD_DATE="$COMMITTED_AT" npm run build > build.log 2>&1 ) \
  || { echo "build failed; last lines of its log:" >&2; tail -20 "$WT/build.log" >&2; exit 1; }
[ -s "$WT/dist/index.html" ] || { echo "build produced no dist/index.html" >&2; exit 1; }
echo "built: $(find "$WT/dist" -type f | wc -l | tr -d ' ') files"

# The scheme is now inside the bundle. Before it goes anywhere, ask the bucket the same question the
# site will: is every published poem there under these names? The canary prints poem numbers and
# status codes only. It reads no credentials, and it runs on a dry run too.
if [ "$POEM_LIST" = published ]; then
  # The canary checks the bundled list. A published site reads published.json and its recorded keys instead.
  python3 "$HERE/check_published_list.py" "$POEMS_URL" \
    || { echo "the published list at $POEMS_URL cannot be read, or not every poem on it is reachable; nothing uploaded." >&2
         exit 1; }
else
( cd "$WT" && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    MIDST_ASSETS_URL="$POEMS_URL" MIDST_KEY_SCHEME="$SCHEME" node tools/poem-canary.mjs > canary.log 2>&1 ) \
  || { echo "the poems at $POEMS_URL are not all reachable under key scheme '$SCHEME'; nothing uploaded." >&2
       tail -20 "$WT/canary.log" >&2; exit 1; }
echo "poems reachable under '$SCHEME': $(grep -m1 '^timelapses reachable' "$WT/canary.log" | cut -d' ' -f3)"
fi

python3 -c 'import json,sys,datetime; print(json.dumps({"midst-web": sys.argv[1], "tag": sys.argv[3] or None,
  "key_scheme": sys.argv[2], "poem_list": sys.argv[4], "deployed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}))' \
  "$SHA" "$SCHEME" "$TAG" "$POEM_LIST" > "$WT/deployed.json"

# Parcel names a bundled file name.<8 hex>.ext, so a changed file is a new name and a name never changes
# content: those are cached a year as immutable (midst-infra #75). The list is made from the build itself.
IMMUTABLE='public, max-age=31536000, immutable'
python3 -c '
import os, re, sys
root = sys.argv[1]
for d, _, files in os.walk(root):
    for f in files:
        rel = os.path.relpath(os.path.join(d, f), root)
        if re.search(r"\.[0-9a-f]{8}\.[A-Za-z0-9]+(\.map)?$", rel):
            sys.stdout.write(rel + "\0")' "$WT/dist" > "$WT/hashed.list" \
  || { echo "could not list the build's files (python's error is above); nothing uploaded." >&2; exit 1; }
HASHED=()
while IFS= read -r -d '' f; do HASHED+=("$f"); done < "$WT/hashed.list"
[ "${#HASHED[@]}" -gt 0 ] || { echo "the build has no content-hashed files (name.<8 hex>.ext); nothing uploaded." >&2; exit 1; }
HASHED_ARGS=(--exclude '*')
REST_ARGS=(--exclude index.html --exclude README.md)
for f in "${HASHED[@]}"; do
  case "$f" in *[\*\?\[\]]*) echo "a hashed file name holds a glob character, so it cannot be named to aws s3 sync: $f" >&2; exit 1 ;; esac
  HASHED_ARGS+=(--include "$f"); REST_ARGS+=(--exclude "$f")
done
echo "content-hashed files, cached a year as immutable: ${#HASHED[@]}"

if [ $DRY = 1 ]; then
  aws s3 cp "$WT/dist" "s3://$BUCKET/" --recursive "${HASHED_ARGS[@]}" --cache-control "$IMMUTABLE" --dryrun | sed -n '1,20p'
  aws s3 sync "$WT/dist" "s3://$BUCKET/" "${REST_ARGS[@]}" --dryrun | sed -n '1,20p'
  echo "(dry run) then index.html, site-extra/, deployed.json, and an invalidation of /* on $DIST"
  exit 0
fi

# Read the previous deployed.json before upload, so a smoke failure has a rollback target.
PREV_SHA="unknown"
if PREV_JSON="$(aws s3 cp "s3://$BUCKET/deployed.json" - --only-show-errors 2>&1)"; then
  if PARSE_OUT="$(printf '%s' "$PREV_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("midst-web","unknown"))' 2>&1)"; then
    PREV_SHA="$PARSE_OUT"
  else
    echo "could not parse previous deployed.json: $PARSE_OUT" >&2
  fi
else
  echo "could not read previous deployed.json: $PREV_JSON" >&2
fi

# cp, not sync: sync skips a file already in the bucket at the same size and time, which would leave a bundle
# from an earlier deploy without the header. A hashed name never changes content, so re-sending is safe
# (river-2fc1630e, review of #77).
aws s3 cp "$WT/dist" "s3://$BUCKET/" --recursive "${HASHED_ARGS[@]}" --cache-control "$IMMUTABLE" --only-show-errors
aws s3 sync "$WT/dist" "s3://$BUCKET/" "${REST_ARGS[@]}" --only-show-errors
aws s3 cp "$WT/dist/index.html" "s3://$BUCKET/index.html" --cache-control no-cache --only-show-errors
aws s3 cp "$EXTRA/robots.txt" "s3://$BUCKET/robots.txt" --content-type text/plain --only-show-errors
aws s3 cp "$EXTRA/.well-known/tdmrep.json" "s3://$BUCKET/.well-known/tdmrep.json" \
  --content-type application/json --only-show-errors
aws s3 cp "$WT/deployed.json" "s3://$BUCKET/deployed.json" --content-type application/json \
  --cache-control no-cache --only-show-errors
INV="$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DIST" --id "$INV"
echo "deployed $SHA to $SITE_URL (invalidation $INV complete)"

[ $SMOKE = 1 ] || exit 0
( cd "$WT" && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN npx playwright install chromium > /dev/null 2>&1 || true )
# A rollback to a commit before /about rendered .build-info has no build-info.ts.
if [ -f "$WT/src/build-info.ts" ]; then
  SMOKE_ARGS=("$WT" "$SITE_URL" "$TAG" "$SHORT")
else
  echo "note: worktree has no src/build-info.ts (pre-build-info commit); skipping /about check"
  SMOKE_ARGS=("$WT" "$SITE_URL")
fi
if env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN node "$HERE/smoke_site.cjs" "${SMOKE_ARGS[@]}"; then
  exit 0
else
  echo "deployed $SHA to $SITE_URL, but smoke check failed. Previous SHA (rollback target): $PREV_SHA" >&2
  exit 2
fi
