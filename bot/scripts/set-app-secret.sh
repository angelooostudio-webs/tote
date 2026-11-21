#!/bin/zsh
# Saves the Meta App secret once, checking it looks right (32 letters/numbers).
cd "${0:A:h}/.."
echo
echo "Meta → your app → App settings → Basic → App secret → Show → copy it."
echo "Paste it ONCE here, then press Enter. (Nothing shows while you paste — normal.)"
read -rs "val?> "
echo
val="${val//[[:space:]]/}"
if [[ ! "$val" =~ '^[0-9a-fA-F]{32}$' ]]; then
  echo "✗ That isn't one App secret (it should be exactly 32 letters/numbers; got ${#val}). Run this again."
  exit 1
fi
printf '%s' "$val" | npx wrangler secret put META_APP_SECRET >/dev/null && echo "✓ Saved. Close this window and tell Claude 'done'."
unset val
