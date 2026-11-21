#!/bin/zsh
# Saves the WhatsApp token once, checking it was pasted exactly one time.
cd "${0:A:h}/.."
echo
echo "Paste the NEW WhatsApp token ONCE, then press Enter."
echo "(Nothing shows while you paste — that's normal. Paste one time only.)"
read -rs "val?> "
echo
val="${val//[[:space:]]/}"
count=$(printf '%s' "$val" | grep -o 'EAA' | wc -l | tr -d ' ')
if [[ "$val" != EAA* || "$count" -ne 1 ]]; then
  echo "✗ That doesn't look like one token (it was empty, or pasted more than once). Run this again."
  exit 1
fi
printf '%s' "$val" | npx wrangler secret put WHATSAPP_TOKEN >/dev/null && echo "✓ Saved. You can close this window and tell Claude 'done'."
unset val
