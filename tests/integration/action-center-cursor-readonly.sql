-- Deterministic 10,000-row simulation of the Action Center keyset pager.
-- No rows inserted into application tables. Includes a synthetic new alert
-- ahead of the cursor to prove stable pagination across concurrent inserts.
-- Does NOT measure real-data latency or replace a staging load test.
BEGIN READ ONLY;
DO $pager$
DECLARE
  total_fixture bigint;
  next_count bigint;
  missing_count bigint;
  unexpected_count bigint;
  duplicate_count bigint;
  newly_inserted_count bigint;
BEGIN
  WITH fixture AS (
    SELECT
      ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid AS id,
      (i % 4)::int AS priority_rank,
      timestamptz '2026-01-01 00:00:00+00' +
        (i / 3) * interval '1 second' AS created_at
    FROM generate_series(1,10000) AS t(i)
  ),
  ordered AS (
    SELECT *,row_number() OVER (
      ORDER BY priority_rank ASC,created_at DESC,id DESC
    ) AS row_number FROM fixture
  ),
  boundary AS (
    SELECT id,priority_rank,created_at FROM ordered WHERE row_number=100
  ),
  incoming AS (
    SELECT '00000000-0000-4000-8000-999999999999'::uuid AS id,
      0 AS priority_rank,timestamptz '2030-01-01 00:00:00+00' AS created_at
  ),
  next_page AS (
    SELECT f.id FROM (
      SELECT id,priority_rank,created_at FROM fixture
      UNION ALL
      SELECT id,priority_rank,created_at FROM incoming
    ) AS f CROSS JOIN boundary AS c
    WHERE f.priority_rank>c.priority_rank
       OR (f.priority_rank=c.priority_rank AND f.created_at<c.created_at)
       OR (f.priority_rank=c.priority_rank AND f.created_at=c.created_at
         AND f.id<c.id)
    ORDER BY f.priority_rank ASC,f.created_at DESC,f.id DESC
    LIMIT 100
  ),
  expected AS (
    SELECT id FROM ordered WHERE row_number BETWEEN 101 AND 200
  )
  SELECT
    (SELECT count(*) FROM fixture),
    (SELECT count(*) FROM next_page),
    (SELECT count(*) FROM (SELECT id FROM expected
      EXCEPT SELECT id FROM next_page) difference),
    (SELECT count(*) FROM (SELECT id FROM next_page
      EXCEPT SELECT id FROM expected) difference),
    (SELECT count(*) FROM next_page
      WHERE id IN (SELECT id FROM ordered WHERE row_number<=100)),
    (SELECT count(*) FROM next_page
      WHERE id='00000000-0000-4000-8000-999999999999'::uuid)
  INTO total_fixture,next_count,missing_count,unexpected_count,
    duplicate_count,newly_inserted_count;

  IF total_fixture<>10000 OR next_count<>100
    OR missing_count<>0 OR unexpected_count<>0 OR duplicate_count<>0
    OR newly_inserted_count<>0
  THEN
    RAISE EXCEPTION
      'Action Center cursor regression: total %, next %, missing %, unexpected %, duplicates %, inserted %',
      total_fixture,next_count,missing_count,unexpected_count,
      duplicate_count,newly_inserted_count;
  END IF;
END
$pager$;
ROLLBACK;
