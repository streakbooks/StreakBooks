#!/usr/bin/env bash
# Apply LinkBooks Supabase Auth settings through the Management API.
#
# Always applies: site URL, redirect allow-list, password policy, email sign-in code template.
# Optional blocks apply only when their credentials are present in the providers file
# (default ~/.config/linkbooks/auth-providers.env — keep it outside the repo):
#
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
#   AZURE_CLIENT_ID / AZURE_CLIENT_SECRET [/ AZURE_URL=https://login.microsoftonline.com/<tenant>]
#   APPLE_CLIENT_ID / APPLE_SECRET
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
#   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
#   CAPTCHA_PROVIDER=turnstile|hcaptcha / CAPTCHA_SECRET
#   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID (Twilio Verify, preferred)
#     or TWILIO_MESSAGE_SERVICE_SID (Programmable Messaging)
#   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SENDER_EMAIL [/ SMTP_SENDER_NAME]
#   EXTRA_REDIRECT_URLS (comma-separated, e.g. preview deployment URL patterns)
#
# OAuth callback URL to register with each provider:
#   https://<project-ref>.supabase.co/auth/v1/callback
#
# Turn CAPTCHA on here only after the app is deployed with VITE_CAPTCHA_PROVIDER and
# VITE_CAPTCHA_SITE_KEY, otherwise every sign-in is rejected.
#
# Usage: scripts/configure-supabase-auth.sh [--dry-run]
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-ipxflpzfcqwtenodbxwc}"
APP_URL="${LINKBOOKS_APP_URL:-https://linkbooks-navy.vercel.app}"
CLI_ENV="${LINKBOOKS_CLI_ENV:-$HOME/.config/linkbooks/cli.env}"
PROVIDERS_ENV="${LINKBOOKS_AUTH_ENV:-$HOME/.config/linkbooks/auth-providers.env}"
DRY_RUN="${1:-}"

[[ -f "$CLI_ENV" ]] && set -a && source "$CLI_ENV" && set +a
[[ -f "$PROVIDERS_ENV" ]] && set -a && source "$PROVIDERS_ENV" && set +a

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is not set (expected in $CLI_ENV)." >&2
  exit 1
fi

export APP_URL
PAYLOAD="$(python3 - <<'PY'
import json, os

e = os.environ.get
app = e("APP_URL").rstrip("/")
cfg = {
    "site_url": app,
    "uri_allow_list": ",".join([
        f"{app}/**",
        "http://localhost:8080/**",
        "http://localhost:8081/**",
        "http://127.0.0.1:8080/**",
        # e.g. preview deployment patterns, comma-separated
        *[u.strip() for u in (e("EXTRA_REDIRECT_URLS") or "").split(",") if u.strip()],
    ]),
    "password_min_length": 8,
    "password_required_characters": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
    "mfa_totp_enroll_enabled": True,
    "mfa_totp_verify_enabled": True,
}

def oauth(name, cid, secret, extra=None):
    if e(cid) and e(secret):
        cfg[f"external_{name}_enabled"] = True
        cfg[f"external_{name}_client_id"] = e(cid)
        cfg[f"external_{name}_secret"] = e(secret)
        cfg.update(extra or {})

oauth("google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
oauth("azure", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
      {"external_azure_url": e("AZURE_URL")} if e("AZURE_URL") else None)
oauth("apple", "APPLE_CLIENT_ID", "APPLE_SECRET")
oauth("github", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET")
oauth("linkedin_oidc", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET")

if e("CAPTCHA_PROVIDER") in ("turnstile", "hcaptcha") and e("CAPTCHA_SECRET"):
    cfg["security_captcha_enabled"] = True
    cfg["security_captcha_provider"] = e("CAPTCHA_PROVIDER")
    cfg["security_captcha_secret"] = e("CAPTCHA_SECRET")

if e("TWILIO_ACCOUNT_SID") and e("TWILIO_AUTH_TOKEN") and e("TWILIO_VERIFY_SERVICE_SID"):
    cfg.update({
        "external_phone_enabled": True,
        "sms_provider": "twilio_verify",
        "sms_twilio_verify_account_sid": e("TWILIO_ACCOUNT_SID"),
        "sms_twilio_verify_auth_token": e("TWILIO_AUTH_TOKEN"),
        "sms_twilio_verify_message_service_sid": e("TWILIO_VERIFY_SERVICE_SID"),
    })
elif e("TWILIO_ACCOUNT_SID") and e("TWILIO_AUTH_TOKEN") and e("TWILIO_MESSAGE_SERVICE_SID"):
    cfg.update({
        "external_phone_enabled": True,
        "sms_provider": "twilio",
        "sms_twilio_account_sid": e("TWILIO_ACCOUNT_SID"),
        "sms_twilio_auth_token": e("TWILIO_AUTH_TOKEN"),
        "sms_twilio_message_service_sid": e("TWILIO_MESSAGE_SERVICE_SID"),
        "sms_template": "Your LinkBooks code is {{ .Code }}",
    })

if all(e(k) for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SENDER_EMAIL")):
    cfg.update({
        "smtp_host": e("SMTP_HOST"),
        "smtp_port": e("SMTP_PORT"),
        "smtp_user": e("SMTP_USER"),
        "smtp_pass": e("SMTP_PASS"),
        "smtp_admin_email": e("SMTP_SENDER_EMAIL"),
        "smtp_sender_name": e("SMTP_SENDER_NAME") or "LinkBooks",
        "rate_limit_email_sent": 100,
        # Templates are editable only with custom SMTP on the free plan.
        # Pair with VITE_AUTH_EMAIL_OTP_LENGTH=6 so the app asks for the emailed code.
        "mailer_otp_length": 6,
        "mailer_subjects_magic_link": "Your LinkBooks sign-in code",
        "mailer_templates_magic_link_content": (
            "<h2>Sign in to LinkBooks</h2>"
            "<p>Your sign-in code is:</p>"
            "<p style=\"font-size:24px;font-weight:600;letter-spacing:4px\">{{ .Token }}</p>"
            "<p>Or <a href=\"{{ .ConfirmationURL }}\">click here to sign in</a>.</p>"
            "<p>If you didn't request this, you can ignore this email.</p>"
        ),
        "mailer_notifications_password_changed_enabled": True,
        "mailer_notifications_mfa_factor_enrolled_enabled": True,
        "mailer_notifications_mfa_factor_unenrolled_enabled": True,
    })

print(json.dumps(cfg))
PY
)"

echo "Settings to apply to project $PROJECT_REF:"
python3 -c 'import json,sys
cfg = json.loads(sys.argv[1])
for k in sorted(cfg):
    secret = k.endswith(("secret", "_pass", "_token"))
    shown = "***" if secret else cfg[k]
    print(f"  {k} = {shown}")' "$PAYLOAD"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "Dry run: nothing applied."
  exit 0
fi

STATUS="$(curl -sS -o /tmp/linkbooks-auth-config.json -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -d "$PAYLOAD")"
if [[ "$STATUS" != "200" ]]; then
  echo "Supabase rejected the update (HTTP $STATUS):" >&2
  cat /tmp/linkbooks-auth-config.json >&2
  rm -f /tmp/linkbooks-auth-config.json
  exit 1
fi
rm -f /tmp/linkbooks-auth-config.json
echo "Applied."
