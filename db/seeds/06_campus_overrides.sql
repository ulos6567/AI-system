-- 06_campus_overrides — 특정 대학 학사일정 데모값 보정
--   04_universities_nationwide 의 여름방학은 (start = 2026-06-22 + (id%8)일) 공식으로 일괄 생성된다.
--   데모 시연을 위해 일부 대학의 여름방학 시작일을 명시적으로 덮어쓴다(멱등).
--   기준일 2026-06-12 기준: 공주대 D-6, 공주교대 D-7.
UPDATE academic_event a
  JOIN university u ON u.id = a.university_id
   SET a.start_date = '2026-06-18', a.end_date = '2026-09-01'
 WHERE u.short_name = '공주대' AND a.event_type = 'vacation';

UPDATE academic_event a
  JOIN university u ON u.id = a.university_id
   SET a.start_date = '2026-06-19', a.end_date = '2026-09-01'
 WHERE u.short_name = '공주교대' AND a.event_type = 'vacation';

-- 공주대·공주교대 1학기 기말고사: 시험 기간 2026-06-12 시작(기준일=시작일 → '진행중').
--   종료일은 공주대 06-18, 공주교대 06-19.
UPDATE academic_event a
  JOIN university u ON u.id = a.university_id
   SET a.start_date = '2026-06-12', a.end_date = '2026-06-18'
 WHERE u.short_name = '공주대' AND a.event_type = 'exam' AND a.title = '1학기 기말고사';

UPDATE academic_event a
  JOIN university u ON u.id = a.university_id
   SET a.start_date = '2026-06-12', a.end_date = '2026-06-19'
 WHERE u.short_name = '공주교대' AND a.event_type = 'exam' AND a.title = '1학기 기말고사';
