#!/bin/zsh
# Asks for each secret in turn and stores it straight in Cloudflare / GitHub.
# Paste the value when asked (it is hidden), press Enter. Nothing is saved on disk.
# Run from anywhere:  zsh ~/Desktop/Claude\ Code/tote/bot/scripts/set-secrets.sh
set -e
cd "${0:A:h}/.."

ask() { # $1 name, $2 hint
  echo
  echo "── $1  ($2)"
  echo "   Paste it, then press Enter. Leave empty and press Enter to skip."
  read -rs "val?   > "
  echo
  if [[ -n "$val" ]]; then
    printf '%s' "$val" | npx wrangler secret put "$1" >/dev/null && echo "   ✓ saved"
  else
    echo "   – skipped"
  fi
  unset val
}


ask WHATSAPP_TOKEN       "the NEW never-expiring System user token from Meta"
ask META_APP_SECRET      "Meta app → Settings → Basic → App secret"
ask ANTHROPIC_API_KEY    "console.anthropic.com → API Keys"
ask ADMIN_NUMBER         "YOUR personal WhatsApp, digits only, e.g. 573001234567"
ask PAYMENT_NEQUI        "your Nequi number, e.g. 300 123 4567"
ask PAYMENT_BANCOLOMBIA  "only if you have one; otherwise just press Enter"
ask PAYMENT_HOLDER_NAME  "account holder name exactly as the bank shows it"

echo
echo "Done. Stored secrets:"
npx wrangler secret list
