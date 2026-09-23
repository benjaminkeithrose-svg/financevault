#!/bin/bash
# Updating Financial Vault: run this from the NEW copy's folder. It copies
# your records, documents and settings from the OLD copy into this one.
# The old copy is only read from, never changed or deleted.

cd "$(dirname "$0")"
echo "Copy your data into this new copy of Financial Vault"
echo "----------------------------------------------------"
echo "Before you start, close Financial Vault if it's running."
echo
read -r -p "Drag the OLD Financial Vault folder into this window, then press Enter: " OLD

# Dragging a folder in types its path with \ before spaces; undo that.
OLD="$(printf '%s' "$OLD" | sed -e 's/[[:space:]]*$//' -e "s/^'//" -e "s/'$//" -e 's/\\\(.\)/\1/g')"
OLD="${OLD%/}"
# Allow the folder that holds it, too.
if [ ! -f "$OLD/server/prisma/dev.db" ] && [ -f "$OLD/financevault/server/prisma/dev.db" ]; then
  OLD="$OLD/financevault"
fi

if [ ! -f "$OLD/server/prisma/dev.db" ]; then
  echo
  echo "No Financial Vault records were found in:"
  echo "  $OLD"
  echo "Nothing was copied. Check you dragged in the OLD folder (the one with the"
  echo "\"Start Financial Vault\" file in it) and try again."
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if [ "$(cd "$OLD" && pwd)" = "$(pwd)" ]; then
  echo
  echo "That's this same folder. Drag in the OLD copy instead. Nothing was copied."
  read -r -p "Press Enter to close this window..."
  exit 1
fi

mkdir -p server/prisma
# If this copy was already started, keep its (empty) records aside rather than deleting them.
if [ -f server/prisma/dev.db ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  mv server/prisma/dev.db "server/prisma/dev.db.before-copy-$STAMP"
  rm -f server/prisma/dev.db-journal server/prisma/dev.db-wal server/prisma/dev.db-shm
fi

echo
echo "Copying your records..."
cp -p "$OLD"/server/prisma/dev.db* server/prisma/ || { echo "Copying failed — nothing else was changed."; read -r -p "Press Enter to close..."; exit 1; }

if [ -d "$OLD/server/storage" ]; then
  echo "Copying your documents (this can take a while if there are many)..."
  mkdir -p server/storage
  cp -Rp "$OLD/server/storage/." server/storage/
fi

if [ -f "$OLD/server/.env" ]; then
  cp -p "$OLD/server/.env" server/.env
fi

echo
echo "Done. Your records and documents are in this copy now."
echo "Next: double-click \"Start Financial Vault\" in this folder and unlock with your usual passcode."
echo "Keep the old folder until you've checked everything is there."
read -r -p "Press Enter to close this window..."
