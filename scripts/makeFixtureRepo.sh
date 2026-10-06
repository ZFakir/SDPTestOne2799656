#!/usr/bin/env bash
#
# makeFixtureRepo.sh — deterministic fixture repository for RAT verification.
#
# Builds a mini git repository that exercises every metric edge case:
#   - multiple authors + email/name variants normalised via .mailmap
#   - rename without edits (0/0 numstat row)
#   - rename with edits (attributed to the new path)
#   - file deletion (0/N row on the deleted path)
#   - binary file (git reports `-` and the row is dropped)
#   - nested directories
#   - an empty commit (counts toward |H|)
#   - a merge commit (must NOT appear in any metric)
#
# Usage:
#   scripts/makeFixtureRepo.sh [dest-dir] [zip-path]
#
# Defaults: dest = storage/fixture-repo (relative to the repository root),
#           no zip. When zip-path is given the whole repo (including .git)
#           is zipped for upload through POST /api/repositories/upload.
#
# The script prints the expected metric values it was designed around so the
# output can be compared directly against the API.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEST="${1:-$REPO_ROOT/storage/fixture-repo}"
ZIP_PATH="${2:-}"

if [ -z "$DEST" ] || [ "$DEST" = "/" ]; then
  echo "refusing to use '$DEST' as the destination" >&2
  exit 1
fi

# Resolve the zip path to an absolute location BEFORE cd-ing into DEST (the
# archive must not land inside the repository directory).
if [ -n "$ZIP_PATH" ]; then
  mkdir -p "$(dirname "$ZIP_PATH")"
  ZIP_PATH="$(cd "$(dirname "$ZIP_PATH")" && pwd)/$(basename "$ZIP_PATH")"
fi

# Deterministic environment: no user/system git configuration, no GPG.
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export LC_ALL=C

rm -rf "$DEST"
mkdir -p "$DEST"
cd "$DEST"

git init -q -b main .
git config user.name "Fixture Builder"
git config user.email "fixture@example.invalid"
git config commit.gpgsign false
git config core.autocrlf false

ALICE="Alice Smith"
ALICE_EMAIL="alice@example.com"
ALICE_VARIANT_NAME="Alice"
ALICE_VARIANT_EMAIL="alice@wits.ac.za"
BOB="Bob Beta"
BOB_EMAIL="bob@example.com"

DAY=0

# commit <name> <email> <message> [extra git-commit args...]
commit() {
  local name="$1" email="$2" message="$3"
  shift 3
  local when
  when="$(date -u -d "2023-01-01 12:00:00 UTC +${DAY} days" '+%Y-%m-%dT%H:%M:%S+00:00')"
  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
  GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
  GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" \
  git commit -q -m "$message" "$@"
  DAY=$((DAY + 1))
}

# ---- C1 (Alice): skeleton: .mailmap + README.md + src/main.c  -> +13/-0
cat > .mailmap <<'EOF'
Alice Smith <alice@example.com> <alice@wits.ac.za>
Alice Smith <alice@example.com> Alice <alice@example.com>
EOF
cat > README.md <<'EOF'
# Fixture repository

Deterministic repository used to verify RAT metrics.
EOF
mkdir -p src
cat > src/main.c <<'EOF'
#include <stdio.h>

int main(void) {
    printf("fixture\n");
    return 0;
}
/* tweak: alpha */
/* end */
EOF
git add -A
commit "$ALICE" "$ALICE_EMAIL" "Add project skeleton, mailmap and main.c"

# ---- C2 (Bob): src/util.c -> +5/-0
cat > src/util.c <<'EOF'
/* util.c */
// trimmed helpers
int mul(int a, int b) {
    return a * b;
}
EOF
git add -A
commit "$BOB" "$BOB_EMAIL" "Add util helpers"

# ---- C3 (Alice, variant ident): edit main.c -> +2/-1
cat > src/main.c <<'EOF'
#include <stdio.h>

int main(void) {
    printf("fixture\n");
    return 0;
}
/* tweak: beta */
/* tweak: gamma */
/* end */
EOF
git add -A
commit "$ALICE_VARIANT_NAME" "$ALICE_VARIANT_EMAIL" "Tweak main output"

# ---- C4 (Bob): docs/readme.md + docs/api/ref.md -> +6/-0
mkdir -p docs/api
cat > docs/readme.md <<'EOF'
# Documentation

Fixture docs live here.
See docs/api for the reference.
EOF
cat > docs/api/ref.md <<'EOF'
# API reference
Reference notes for the fixture API.
EOF
git add -A
commit "$BOB" "$BOB_EMAIL" "Add documentation"

# ---- C5 (Alice): rename-only -> 0/0 (stored as nothing)
git mv src/util.c src/helper.c
commit "$ALICE" "$ALICE_EMAIL" "Rename util.c to helper.c (no content change)"

# ---- C6 (Bob): rename + edit -> +2/-0 on src/core/helper.c
mkdir -p src/core
git mv src/helper.c src/core/helper.c
cat >> src/core/helper.c <<'EOF'
/* added during rename: 1 */
/* added during rename: 2 */
EOF
git add -A
commit "$BOB" "$BOB_EMAIL" "Move helper into core and extend"

# ---- C7 (Alice): binary file -> numstat `-` (no rows)
mkdir -p assets
printf '\x89PNG\r\n\x1a\n\x00\x00binary-payload\xff\xfe' > assets/logo.bin
git add -A
commit "$ALICE" "$ALICE_EMAIL" "Add binary logo"

# ---- C8 (Bob): deletion -> 0/4 on docs/readme.md
git rm -q docs/readme.md
commit "$BOB" "$BOB_EMAIL" "Remove docs/readme.md"

# ---- C9 (Alice): empty commit -> no rows, still counts in |H|
commit "$ALICE" "$ALICE_EMAIL" "Empty commit (no file changes)" --allow-empty

# ---- C10 (Bob): README.md edit -> +2/-1
cat > README.md <<'EOF'
# Fixture repository

Deterministic repository used to verify RAT metrics (fixture).
See .mailmap for author normalisation.
EOF
git add -A
commit "$BOB" "$BOB_EMAIL" "Document mailmap usage"

# ---- C11 (Alice, on branch feat): src/feat.c -> +3/-0
git checkout -q -b feat
cat > src/feat.c <<'EOF'
/* feature */
int feat(void) { return 1; }
/* end feature */
EOF
git add -A
commit "$ALICE" "$ALICE_EMAIL" "Add feature file"
git checkout -q main

# ---- C12 (Bob, on main): docs/notes.txt -> +2/-0
cat > docs/notes.txt <<'EOF'
Notes for the fixture repository.
Do not edit.
EOF
git add -A
commit "$BOB" "$BOB_EMAIL" "Add notes"

# ---- C13: merge commit (must be excluded from every metric)
GIT_AUTHOR_NAME="$BOB" GIT_AUTHOR_EMAIL="$BOB_EMAIL" \
GIT_COMMITTER_NAME="$BOB" GIT_COMMITTER_EMAIL="$BOB_EMAIL" \
GIT_AUTHOR_DATE="$(date -u -d "2023-01-01 12:00:00 UTC +${DAY} days" '+%Y-%m-%dT%H:%M:%S+00:00')" \
GIT_COMMITTER_DATE="$(date -u -d "2023-01-01 12:00:00 UTC +${DAY} days" '+%Y-%m-%dT%H:%M:%S+00:00')" \
git merge -q --no-ff feat -m "Merge feat into main"

TOTAL="$(git rev-list --count HEAD)"
NON_MERGE="$(git rev-list --count --no-merges HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"

if [ "$NON_MERGE" != "12" ]; then
  echo "fixture invariant broken: expected 12 non-merge commits, got $NON_MERGE" >&2
  exit 1
fi

if [ -n "$ZIP_PATH" ]; then
  rm -f "$ZIP_PATH"
  # `zip -r .` includes dotfiles, so the archive carries the .git directory.
  zip -q -r "$ZIP_PATH" . -x '*.DS_Store'
  echo "zip written:  $ZIP_PATH"
fi

cat <<EOF

fixture repository: $DEST
head sha:           $HEAD_SHA
commits (all):      $TOTAL
commits (no merge): $NON_MERGE   <-- |H| denominator for "all commits"

expected values with no filters:
  repository:  added=35 removed=6 growth=29 churn=41
               modifications=9  frequency=0.75  churnRate=41/12
  authors:     Alice Smith <alice@example.com>  commits=6 churn=19 idents=2
               Bob Beta    <bob@example.com>    commits=6 churn=22 idents=1
  files:       README.md +5/-1   src/main.c +10/-1   src/util.c +5/-0
               docs/readme.md +4/-4   docs/api/ref.md +2/-0
               src/core/helper.c +2/-0   docs/notes.txt +2/-0
               src/feat.c +3/-0   .mailmap +2/-0
  dirs:        src  +20/-1 (5 commits)   src/core +2/-0 (1)
               docs +8/-4 (3)            docs/api +2/-0 (1)
EOF
