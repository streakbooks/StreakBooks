-- Reuses the synthetic sessions and actual platform permission helpers from the support fixture.
INSERT INTO public.profiles(id,full_name,email) VALUES('00000000-0000-4000-8000-000000000001','Alex Example','fixture1@example.invalid');
INSERT INTO public.firms(id,name) VALUES('70000000-0000-4000-8000-000000000001','Example Firm');
INSERT INTO public.firm_members(firm_id,user_id,role) VALUES('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','owner');
INSERT INTO public.firm_client_links(firm_id,company_id,access_level) VALUES('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','view');
INSERT INTO public.companies(name) SELECT 'Paged Company '||lpad(n::text,2,'0') FROM generate_series(1,40) n;
INSERT INTO public.companies(name) VALUES('Literal'||chr(37)||chr(95)||chr(92)||'client');
UPDATE public.platform_custom_roles SET permissions=permissions||ARRAY['firms.view'] WHERE id='60000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT fixture.login(1);
DO $$ DECLARE hits jsonb; found jsonb; BEGIN
 hits:=public.platform_global_search('Paged Company');
 IF jsonb_array_length(hits)<>20 OR hits->0->>'label'<>'Paged Company 01' OR hits->19->>'label'<>'Paged Company 20' THEN RAISE EXCEPTION 'Search cap or ordering failed'; END IF;
 hits:=public.platform_global_search(chr(37)||chr(95)||chr(92));
 IF jsonb_array_length(hits)<>1 THEN RAISE EXCEPTION 'Search wildcard escaping failed: %',hits; END IF;
 hits:=public.platform_global_search('fixture1@example.invalid');
 IF jsonb_array_length(hits)<>1 OR hits->0->>'label'<>'Alex Example' THEN RAISE EXCEPTION 'Search must match email even when display name exists'; END IF;
 hits:=public.platform_global_search('70000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(hits)<>1 OR hits->0->>'kind'<>'firm' THEN RAISE EXCEPTION 'Firm ID search failed'; END IF;
 IF public.platform_global_search(' x ')<>'[]'::jsonb THEN RAISE EXCEPTION 'Short search should be empty'; END IF;
 found:=public.platform_record('businesses','20000000-0000-4000-8000-000000000001');
 IF found->'record'->>'id'<>'20000000-0000-4000-8000-000000000001' OR NOT(found->'related' ? 'members') THEN RAISE EXCEPTION 'Exact business lookup failed'; END IF;
 found:=public.platform_record('users','00000000-0000-4000-8000-000000000001');
 IF found->'record'->>'full_name'<>'Alex Example' OR NOT(found->'related' ? 'businesses') THEN RAISE EXCEPTION 'Exact user lookup failed'; END IF;
 found:=public.platform_record('firms','70000000-0000-4000-8000-000000000001');
 IF found->'record'->>'name'<>'Example Firm' OR jsonb_array_length(found->'related'->'clients')<>1 THEN RAISE EXCEPTION 'Exact firm lookup failed'; END IF;
END $$;
SELECT fixture.denied($q$SELECT public.platform_record('businesses','20000000-0000-4000-8000-000000000099')$q$,'not found');
SELECT fixture.denied($q$SELECT public.platform_record('journals','20000000-0000-4000-8000-000000000001')$q$,'Choose a business');
SELECT fixture.denied($q$SELECT public.platform_global_search(repeat('x',161))$q$,'at most 160');
SELECT fixture.login(6);
DO $$ DECLARE hits jsonb; BEGIN
 hits:=public.platform_global_search('Example');
 IF jsonb_array_length(hits)<>1 OR hits->0->>'kind'<>'firm' THEN RAISE EXCEPTION 'Firm-only role leaked another resource'; END IF;
 PERFORM public.platform_record('firms','70000000-0000-4000-8000-000000000001');
END $$;
SELECT fixture.denied($q$SELECT public.platform_record('businesses','20000000-0000-4000-8000-000000000001')$q$,'Platform permission');
SELECT fixture.denied($q$SELECT public.platform_record('users','00000000-0000-4000-8000-000000000001')$q$,'Platform permission');
SELECT fixture.login(4);
SELECT fixture.denied($q$SELECT public.platform_global_search('Example')$q$,'Platform permission');
SELECT fixture.denied($q$SELECT public.platform_record('businesses','20000000-0000-4000-8000-000000000001')$q$,'Platform permission');
SELECT fixture.login(1,'aal1');
SELECT fixture.denied($q$SELECT public.platform_global_search('Example')$q$,'Platform permission');
SELECT fixture.denied($q$SELECT public.platform_record('businesses','20000000-0000-4000-8000-000000000001')$q$,'Platform permission');
SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_global_search('Example')$q$,'Platform permission');
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.platform_global_search(text)','EXECUTE') OR has_function_privilege('anon','public.platform_record(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous execution leaked'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_audit WHERE action='search' AND (reason<>'Platform search' OR after_state - 'rows'<>'{}'::jsonb OR before_state IS NOT NULL)) THEN RAISE EXCEPTION 'Audit captured query or search labels'; END IF;
 IF (SELECT count(*) FROM public.platform_audit WHERE action='record.view')<>4 THEN RAISE EXCEPTION 'Record view audit count incorrect'; END IF;
END $$;
-- Check the real rate limiter, not a stub. A failed rate-limit transaction retains no read event.
UPDATE private.platform_request_buckets SET requests=300 WHERE user_id='00000000-0000-4000-8000-000000000001' AND minute=date_trunc('minute',now());
SET ROLE authenticated; SELECT fixture.login(1);
SELECT fixture.denied($q$SELECT public.platform_global_search('Example')$q$,'Too many platform requests');
RESET ROLE;
