#!/usr/bin/env python3
"""Exercise real Auth, PostgREST, permissions and posting on an explicit localhost Supabase.

Creates synthetic users/companies only on localhost; never accepts a hosted URL.
Session output contains local test credentials and must remain under ignored work/.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', required=True, type=Path)
parser.add_argument('--state-out', type=Path, default=Path('work/banking-local-api-session.json'))
parser.add_argument('--reverse', action='store_true', help='Verify reversals for an existing synthetic session.')
args = parser.parse_args()
values = dict(line.split('=', 1) for line in args.env_file.read_text().splitlines() if '=' in line)
values = {key: value.strip().strip('"') for key, value in values.items()}
base = values.get('API_URL', '').rstrip('/')
url = urllib.parse.urlparse(base)
if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.port != 54321:
    raise SystemExit('Refusing any target except the explicit local Supabase HTTP endpoint on port 54321')
if not args.state_out.resolve().is_relative_to(Path(__file__).resolve().parents[1] / 'work'):
    raise SystemExit('Session state must remain inside an ignored work/ directory')
assertions = []
fixture_date = datetime.now(timezone.utc).date().isoformat()

def check(value, label):
    if not value:
        raise AssertionError(label)
    assertions.append(label)


def request(path, method='GET', data=None, token=None, privileged=False, expected=200):
    headers = {'apikey': values['ANON_KEY'], 'Content-Type': 'application/json'}
    if privileged:
        headers['Authorization'] = 'Bearer ' + values['SERVICE_ROLE_KEY']
    elif token:
        headers['Authorization'] = 'Bearer ' + token
    if method in ('POST', 'PATCH'):
        headers['Prefer'] = 'return=representation'
    req = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            raw = response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    if status != expected:
        try:
            message = json.loads(raw).get('message', json.loads(raw).get('msg', 'request failed'))
        except Exception:
            message = 'request failed'
        raise AssertionError(f'{method} {path.split("?")[0]} returned {status}, expected {expected}: {str(message)[:220]}')
    return json.loads(raw) if raw else None


def rpc(name, payload, token, expected=200):
    return request('/rest/v1/rpc/' + name, 'POST', payload, token=token, expected=expected)


def sign_in(email, password):
    return request('/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': password})


def create_user():
    email = 'readiness-' + uuid.uuid4().hex + '@example.invalid'
    password = secrets.token_urlsafe(30) + 'aA1!'
    user = request('/auth/v1/admin/users', 'POST', {'email': email, 'password': password, 'email_confirm': True, 'user_metadata': {'full_name': 'Isolated Readiness Fixture'}}, privileged=True)
    session = sign_in(email, password)
    check(session.get('user', {}).get('id') == user['id'], 'Real Auth password session created')
    return {'email': email, 'password': password, 'id': user['id'], 'access_token': session['access_token'], 'refresh_token': session['refresh_token']}


if args.reverse:
    state = json.loads(args.state_out.read_text())
    check(state['api_url'] == base, 'Reversal remains on the same local endpoint')
    owner = state['owner']
    token = sign_in(owner['email'], owner['password'])['access_token']
    for transaction_id in state['transaction_ids']:
        journals = request('/rest/v1/journals?' + urllib.parse.urlencode({'company_id': 'eq.' + state['company_id'], 'source_id': 'eq.' + transaction_id, 'source_type': 'eq.bank_transaction', 'select': 'id,reversed_by_journal_id'}), token=token)
        for journal in journals:
            if journal['reversed_by_journal_id'] is None:
                rpc('reverse_journal', {'_journal_id': journal['id'], '_idempotency_key': 'local-readiness-reverse:' + journal['id']}, token)
    memory = rpc('get_bank_coding_memory', {'_company_id': state['company_id'], '_bank_transaction_id': state['transaction_ids'][1]}, token)
    check(memory == [], 'Authoritative reversals remove all fixture precedents')
    events = request('/rest/v1/bank_coding_events?company_id=eq.' + state['company_id'] + '&select=id', token=token)
    check(len(events) >= 1, 'Reversal retains immutable learning evidence')
else:
    owner, other = create_user(), create_user()
    token = owner['access_token']
    company = rpc('create_company', {'_name': 'Isolated Coding Memory Readiness', '_country_code': 'GB', '_base_currency': 'GBP', '_fy_end_month': 3, '_fy_end_day': 31, '_timezone': 'UTC', '_legal_name': 'Synthetic test data'}, token)
    check(isinstance(company, str), 'Canonical company creation returned a company identity')
    accounts = request('/rest/v1/accounts?' + urllib.parse.urlencode({'company_id': 'eq.' + company, 'select': 'id,code,account_type,is_postable,is_control,is_active', 'limit': 1000}), token=token)
    bank_gl = next(a['id'] for a in accounts if a['account_type'] == 'asset' and a['is_active'] and a['is_postable'])
    offset = next(a['id'] for a in accounts if a['account_type'] == 'expense' and a['is_active'] and a['is_postable'] and not a['is_control'])
    bank_id = str(uuid.uuid4())
    request('/rest/v1/bank_accounts', 'POST', {'id': bank_id, 'company_id': company, 'name': 'Readiness fixture bank', 'currency_code': 'GBP', 'gl_account_id': bank_gl}, token=token, expected=201)
    transactions = [str(uuid.uuid4()), str(uuid.uuid4())]
    for index, transaction in enumerate(transactions):
        request('/rest/v1/bank_transactions', 'POST', {'id': transaction, 'company_id': company, 'bank_account_id': bank_id, 'txn_date': fixture_date, 'amount_minor': -10000 - index * 1000, 'description': 'Readiness Cloud Hosting', 'external_id': 'readiness-' + transaction}, token=token, expected=201)
    payload = {'company_id': company, 'journal_date': fixture_date, 'currency_code': 'GBP', 'fx_rate_to_base': 1, 'source_type': 'bank_transaction', 'source_id': transactions[0], 'idempotency_key': 'local-readiness:' + transactions[0], 'lines': [{'account_id': bank_gl, 'debit_minor': 0, 'credit_minor': 10000}, {'account_id': offset, 'debit_minor': 10000, 'credit_minor': 0}]}
    journal = rpc('post_journal', {'payload': payload}, token)
    check(rpc('post_journal', {'payload': payload}, token) == journal, 'Authoritative posting retries reuse the same journal')
    lines = request('/rest/v1/journal_lines?' + urllib.parse.urlencode({'journal_id': 'eq.' + journal, 'select': 'id,account_id,debit_minor,credit_minor'}), token=token)
    check(sum(int(line['debit_minor']) - int(line['credit_minor']) for line in lines) == 0, 'Authoritative journal is balanced')
    line = next(line for line in lines if line['account_id'] == bank_gl)
    request('/rest/v1/reconciliation_links', 'POST', {'company_id': company, 'bank_transaction_id': transactions[0], 'journal_line_id': line['id']}, token=token, expected=201)
    request('/rest/v1/bank_transactions?id=eq.' + transactions[0], 'PATCH', {'status': 'matched'}, token=token)
    identity = {'_company_id': company, '_bank_transaction_id': transactions[1]}
    memory = rpc('get_bank_coding_memory', identity, token)
    check(len(memory) == 1 and memory[0]['times_used'] == 1, 'Linked approved posting becomes exactly one recommendation')
    history_id = memory[0]['history_id']
    feedback = {**identity, '_history_id': history_id, '_state': 'rejected', '_request_id': str(uuid.uuid4())}
    check(rpc('record_bank_coding_feedback', feedback, token) == rpc('record_bank_coding_feedback', feedback, token), 'Real API feedback retries deduplicate')
    check(rpc('get_bank_coding_memory', identity, token)[0]['times_used'] == 1, 'Rejected feedback adds no learning')
    for enabled in [False, True]:
        rpc('set_bank_coding_memory_preference', {**identity, '_history_id': history_id, '_enabled': enabled}, token)
        check(rpc('get_bank_coding_memory', identity, token)[0]['enabled'] is enabled, 'Preference ' + str(enabled) + ' persists through the real API')
    rpc('get_bank_coding_memory', identity, other['access_token'], expected=403)
    check(request('/rest/v1/bank_coding_events?company_id=eq.' + company + '&select=id', token=other['access_token']) == [], 'Real RLS hides another company learning evidence')
    request('/rest/v1/bank_coding_events', 'POST', {'company_id': company}, token=token, expected=403)
    check(True, 'Direct learning-event forgery is denied')
    state = {'api_url': base, 'anon_key': values['ANON_KEY'], 'company_id': company, 'bank_id': bank_id, 'bank_gl_id': bank_gl, 'offset_account_id': offset, 'journal_id': journal, 'transaction_ids': transactions, 'owner': owner, 'other': other}
    args.state_out.parent.mkdir(parents=True, exist_ok=True)
    args.state_out.write_text(json.dumps(state))
    os.chmod(args.state_out, 0o600)
print(json.dumps({'target': 'isolated localhost Supabase; real Auth and RLS', 'passed': len(assertions), 'assertions': assertions}))
