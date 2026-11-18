#!/usr/bin/env python3
"""Start the Banking integration-test app against an explicit localhost Supabase.

The CLI status file contains local credentials: keep it private and outside Git.
Frontend variables receive only the anon key; the service key is server-only.
"""
import argparse
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', required=True, type=Path)
args = parser.parse_args()
values = dict(line.split('=', 1) for line in args.env_file.read_text().splitlines() if '=' in line)
values = {key: value.strip().strip('"') for key, value in values.items()}
base = values.get('API_URL', '').rstrip('/')
url = urllib.parse.urlparse(base)
if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.port != 54321:
    raise SystemExit('Refusing any target except explicit local Supabase HTTP on port 54321')
if not values.get('ANON_KEY') or not values.get('SERVICE_ROLE_KEY'):
    raise SystemExit('The private local CLI status file must supply anon and server-role keys')
req = urllib.request.Request(base + '/auth/v1/health', headers={'apikey': values['ANON_KEY']})
with urllib.request.urlopen(req, timeout=20) as response:
    if response.status != 200:
        raise SystemExit('The explicit local Auth endpoint is unavailable')
env = {
    **os.environ,
    'VITE_SUPABASE_URL': base,
    'SUPABASE_URL': base,
    'VITE_SUPABASE_PUBLISHABLE_KEY': values['ANON_KEY'],
    'SUPABASE_PUBLISHABLE_KEY': values['ANON_KEY'],
    'SUPABASE_SERVICE_ROLE_KEY': values['SERVICE_ROLE_KEY'],
    'VITE_AUTH_OAUTH_PROVIDERS': '',
    'VITE_AUTH_SSO_ENABLED': 'false',
    'VITE_CAPTCHA_PROVIDER': '',
    'VITE_CAPTCHA_SITE_KEY': '',
}
raise SystemExit(subprocess.call(
    ['npm.cmd' if os.name == 'nt' else 'npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '8098'],
    cwd=Path(__file__).resolve().parents[1], env=env,
))
