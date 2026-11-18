#!/usr/bin/env python3
"""Exercise real Auth, PostgREST, permissions and posting on an explicit localhost Supabase.

Creates synthetic users/companies only on localhost; never accepts a hosted URL.
Session output contains local test credentials and must remain under ignored work/.
"""
import argparse
import base64
import hashlib
import hmac
import time
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
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--reverse', action='store_true', help='Verify reversals for an existing synthetic session.')
mode.add_argument('--mfa', action='store_true', help='Verify real TOTP enrollment and AAL2 enforcement; run last.')
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


if args.mfa:
    state = json.loads(args.state_out.read_text())
    check(state['api_url'] == base, 'MFA remains on the same explicit local endpoint')
    owner = state['owner']
    token = sign_in(owner['email'], owner['password'])['access_token']
    events_path = '/rest/v1/bank_coding_events?company_id=eq.' + state['company_id'] + '&select=id'
    before = request(events_path, token=token)
    tag_id = str(uuid.uuid4())
    request('/rest/v1/document_tags', 'POST', {'id': tag_id, 'company_id': state['company_id'], 'name': 'Isolated MFA tag'}, token=token, expected=201)
    check(True, 'Normal authorised session can create its isolated document tag before enrollment')
    check(len(before) >= 1, 'Normal password session can read its fixture evidence before enrollment')
    factor = request('/auth/v1/factors', 'POST', {'factor_type': 'totp', 'friendly_name': 'Isolated readiness TOTP'}, token=token)
    factor_path = '/auth/v1/factors/' + factor['id']
    challenge = request(factor_path + '/challenge', 'POST', {}, token=token)
    secret = factor['totp']['secret']
    key = base64.b32decode(secret + '=' * ((8 - len(secret) % 8) % 8), casefold=True)
    digest = hmac.new(key, (int(time.time()) // 30).to_bytes(8, 'big'), hashlib.sha1).digest()
    offset = digest[-1] & 15
    code = str((int.from_bytes(digest[offset:offset + 4], 'big') & 0x7fffffff) % 1000000).zfill(6)
    verified = request(factor_path + '/verify', 'POST', {'challenge_id': challenge['id'], 'code': code}, token=token)
    elevated = verified['access_token']
    claim_segment = elevated.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(claim_segment + '=' * ((4 - len(claim_segment) % 4) % 4)))
    check(claims['aal'] == 'aal2', 'Real Auth enrollment and challenge return an AAL2 session')
    identity = {'_company_id': state['company_id'], '_bank_transaction_id': state['transaction_ids'][1]}
    rpc('get_bank_coding_memory', identity, token, expected=403)
    rpc('reset_bank_coding_memory_preference', {**identity, '_history_id': str(uuid.uuid4()), '_request_id': str(uuid.uuid4())}, token, expected=403)
    check(True, 'MFA protects the reset endpoint before any preference lookup')
    check(request(events_path, token=token) == [], 'Old AAL1 session cannot read evidence after verified enrollment')
    check(request(events_path, token=elevated) == before, 'Verified AAL2 session restores only its existing company evidence')
    tags_path = '/rest/v1/document_tags?id=eq.' + tag_id + '&select=id'
    check(request(tags_path, token=token) == [], 'Old AAL1 session cannot read newly merged document tags')
    check(request(tags_path, token=elevated) == [{'id': tag_id}], 'Verified AAL2 restores its isolated document tag')
    request('/rest/v1/document_tags', 'POST', {'company_id': state['company_id'], 'name': 'Denied AAL1 tag'}, token=token, expected=403)
    check(True, 'Old AAL1 session cannot write newly merged document tags')
    rpc('pos_open_session', {'_company_id': state['company_id'], '_register_id': str(uuid.uuid4()), '_operation_id': str(uuid.uuid4()), '_opening_float_minor': 0}, token, expected=403)
    check(True, 'POS definer mutation enforces MFA before register lookup')
    rpc('purge_document_from_recycle_bin', {'_company_id': state['company_id'], '_attachment_id': str(uuid.uuid4())}, token, expected=403)
    check(True, 'Files definer purge enforces MFA before attachment lookup')
    check(isinstance(rpc('get_bank_coding_memory', identity, elevated), list), 'Coding Memory RPC accepts the real AAL2 session')
    request('/rest/v1/bank_coding_events', 'POST', {'company_id': state['company_id']}, token=elevated, expected=403)
    check(True, 'AAL2 does not permit direct learning-event forgery')
    audit_args = {'_company_id': state['company_id'], '_action': 'readiness.mfa.audit', '_entity_type': 'bank_transaction'}
    rpc('record_app_audit_event', audit_args, token, expected=403)
    rpc('record_audit_event', audit_args, token, expected=403)
    check(isinstance(rpc('record_app_audit_event', audit_args, elevated), str), 'Both app and legacy audit endpoints enforce MFA while AAL2 audit writes succeed')

elif args.reverse:
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
    feedback_rows = request('/rest/v1/bank_coding_feedback?company_id=eq.' + state['company_id'] + '&journal_id=is.null&select=id,bank_transaction_id,history_id,state,request_id&limit=1', token=token)
    if feedback_rows:
        row = feedback_rows[0]
        replay = {'_company_id': state['company_id'], '_bank_transaction_id': row['bank_transaction_id'], '_history_id': row['history_id'], '_state': row['state'], '_request_id': row['request_id']}
        check(rpc('record_bank_coding_feedback', replay, token) == row['id'], 'Committed feedback retry survives authoritative reversal')
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
    audit_args = {'_company_id': company, '_action': 'readiness.audit.probe', '_entity_type': 'bank_transaction', '_entity_id': transactions[1], '_details': {'password': 'remove-me', 'token': 'remove-me', 'context': 'safe'}}
    audit_id = rpc('record_app_audit_event', audit_args, token)
    audit = request('/rest/v1/audit_events?id=eq.' + audit_id + '&select=entity_id,actor_user_id,details', token=token)[0]
    check(audit['entity_id'] == transactions[1] and audit['actor_user_id'] == owner['id'] and audit['details'] == {'context': 'safe'}, 'App audit RPC resolves UUID strings and preserves the actor while removing secret fields')
    ref_id = rpc('record_app_audit_event', {**audit_args, '_entity_id': 'fixture:external-reference'}, token)
    ref = request('/rest/v1/audit_events?id=eq.' + ref_id + '&select=entity_id,details', token=token)[0]
    check(ref['entity_id'] is None and ref['details'] == {'context': 'safe', 'entity_ref': 'fixture:external-reference'}, 'App audit RPC preserves non-UUID entity references')
    rpc('record_app_audit_event', audit_args, other['access_token'], expected=403)
    check(True, 'App audit RPC rejects another company user')
    request('/rest/v1/rpc/record_app_audit_event', 'POST', audit_args, expected=401)
    check(True, 'Anonymous app audit writes are denied')
    second_company = rpc('create_company', {'_name': 'Isolated Empty Switch Target', '_country_code': 'GB', '_base_currency': 'GBP', '_fy_end_month': 3, '_fy_end_day': 31, '_timezone': 'UTC', '_legal_name': 'Synthetic test data'}, token)
    check(isinstance(second_company, str) and second_company != company, 'Same owner has a second isolated company for real UI switching')
    request('/rest/v1/profiles?id=eq.' + owner['id'], 'PATCH', {'last_company_id': company}, token=token)
    reader = create_user()
    request('/rest/v1/company_members', 'POST', {'company_id': company, 'user_id': reader['id'], 'role': 'read_only', 'status': 'active'}, token=token, expected=201)
    check(len(rpc('get_bank_coding_memory', identity, reader['access_token'])) == 1, 'Real read-only company member can view coding memory')
    rpc('record_bank_coding_feedback', feedback, reader['access_token'], expected=403)
    check(True, 'Real read-only member cannot submit coding feedback')
    rpc('set_bank_coding_memory_preference', {**identity, '_history_id': history_id, '_enabled': False}, reader['access_token'], expected=403)
    check(True, 'Real read-only member cannot change memory preferences')
    reset = {**identity, '_history_id': history_id, '_request_id': str(uuid.uuid4())}
    rpc('reset_bank_coding_memory_preference', reset, reader['access_token'], expected=403)
    check(True, 'Real read-only member cannot reset learned preferences')
    rpc('reset_bank_coding_memory_preference', reset, other['access_token'], expected=403)
    check(True, 'Cross-company reset is denied by the real API')
    request('/rest/v1/rpc/reset_bank_coding_memory_preference', 'POST', reset, expected=401)
    check(True, 'Anonymous reset is denied')
    request('/rest/v1/bank_coding_memory_controls?company_id=eq.' + company, 'PATCH', {'reset_event_no': 0}, token=token, expected=403)
    check(True, 'Direct scoped watermark forgery is denied')
    check(request('/rest/v1/bank_coding_memory_controls?company_id=eq.' + company + '&select=history_id', token=other['access_token']) == [], 'Real RLS hides another company scoped controls')
    denied = rpc('post_journal', {'payload': {**payload, 'idempotency_key': 'local-denied:' + str(uuid.uuid4())}}, reader['access_token'], expected=400)
    check('permission to post journals' in denied.get('message', ''), 'Real read-only member cannot bypass the UI to post a journal')
    existing = request('/rest/v1/journals?company_id=eq.' + company + '&source_id=eq.' + transactions[0] + '&select=id', token=token)
    check(len(existing) == 1 and existing[0]['id'] == journal, 'Denied posting leaves the original journal unchanged')
    state = {'api_url': base, 'anon_key': values['ANON_KEY'], 'company_id': company, 'other_company_id': second_company, 'bank_id': bank_id, 'bank_gl_id': bank_gl, 'offset_account_id': offset, 'journal_id': journal, 'transaction_ids': transactions, 'owner': owner, 'other': other, 'reader': reader}
    args.state_out.parent.mkdir(parents=True, exist_ok=True)
    args.state_out.write_text(json.dumps(state))
    os.chmod(args.state_out, 0o600)
print(json.dumps({'target': 'isolated localhost Supabase; real Auth and RLS', 'passed': len(assertions), 'assertions': assertions}))
