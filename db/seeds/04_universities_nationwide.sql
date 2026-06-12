-- 04 — 전국 대학 캘린더 확장 (마이그레이션 012, 016)
-- 03_campus.sql 의 7개(수도권 인근) 대학에 더해, 대한민국 전국의 4년제 일반대학과
-- 전문대학을 지역(시·도)별로 적재한다. 화면은 점포 인근(store_university 연계)만이 아니라
-- 전국 대학을 모두 표시하며, 각 대학의 축제·시험(중간/기말)·방학 학사일정을 자동 생성한다.
-- 주소(address)는 시·군·구·동 단위까지 채우고, region(시·도)은 주소 시·도와 동기화한다.
-- 멱등: 대학은 INSERT IGNORE(name UNIQUE), 자동 학사일정은 university_id>7 분을 DELETE 후 재생성,
--       주소/region 은 매 실행 시 UPDATE 로 재적용.

-- ── 서울 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('서울대학교', '서울대', '서울'),
  ('고려대학교', '고려대', '서울'),
  ('성균관대학교', '성대', '서울'),
  ('경희대학교', '경희대', '서울'),
  ('한국외국어대학교', '한국외대', '서울'),
  ('서울시립대학교', '시립대', '서울'),
  ('건국대학교', '건대', '서울'),
  ('동국대학교', '동국대', '서울'),
  ('숙명여자대학교', '숙대', '서울'),
  ('성신여자대학교', '성신여대', '서울'),
  ('세종대학교', '세종대', '서울'),
  ('광운대학교', '광운대', '서울'),
  ('국민대학교', '국민대', '서울'),
  ('숭실대학교', '숭실대', '서울'),
  ('서울과학기술대학교', '서울과기대', '서울'),
  ('가톨릭대학교', '가대', '서울'),
  ('삼육대학교', '삼육대', '서울'),
  ('서경대학교', '서경대', '서울'),
  ('한성대학교', '한성대', '서울'),
  ('상명대학교', '상명대', '서울'),
  ('덕성여자대학교', '덕성여대', '서울'),
  ('동덕여자대학교', '동덕여대', '서울'),
  ('서울여자대학교', '서울여대', '서울'),
  ('명지대학교', '명지대', '서울'),
  ('추계예술대학교', '추계예대', '서울'),
  ('한국체육대학교', '한체대', '서울'),
  ('서울교육대학교', '서울교대', '서울'),
  ('총신대학교', NULL, '서울'),
  ('한국방송통신대학교', '방송대', '서울'),
  ('명지전문대학', NULL, '서울'),
  ('인덕대학교', NULL, '서울'),
  ('동양미래대학교', NULL, '서울'),
  ('서일대학교', NULL, '서울'),
  ('배화여자대학교', NULL, '서울'),
  ('한양여자대학교', NULL, '서울'),
  ('삼육보건대학교', NULL, '서울'),
  ('숭의여자대학교', NULL, '서울'),
  ('백석예술대학교', NULL, '서울'),
  ('정화예술대학교', NULL, '서울');

-- ── 경기 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('아주대학교', '아주대', '경기'),
  ('경기대학교', '경기대', '경기'),
  ('단국대학교', '단국대', '경기'),
  ('대진대학교', '대진대', '경기'),
  ('신한대학교', '신한대', '경기'),
  ('을지대학교', '을지대', '경기'),
  ('평택대학교', '평택대', '경기'),
  ('수원대학교', '수원대', '경기'),
  ('협성대학교', '협성대', '경기'),
  ('안양대학교', '안양대', '경기'),
  ('강남대학교', '강남대', '경기'),
  ('용인대학교', '용인대', '경기'),
  ('한경국립대학교', '한경대', '경기'),
  ('한신대학교', '한신대', '경기'),
  ('차의과학대학교', '차의과대', '경기'),
  ('한세대학교', '한세대', '경기'),
  ('한국항공대학교', '항공대', '경기'),
  ('서울장신대학교', NULL, '경기'),
  ('루터대학교', NULL, '경기'),
  ('칼빈대학교', NULL, '경기'),
  ('경복대학교', NULL, '경기'),
  ('경기과학기술대학교', NULL, '경기'),
  ('경민대학교', NULL, '경기'),
  ('계원예술대학교', NULL, '경기'),
  ('국제대학교', NULL, '경기'),
  ('김포대학교', NULL, '경기'),
  ('농협대학교', NULL, '경기'),
  ('동남보건대학교', NULL, '경기'),
  ('동서울대학교', NULL, '경기'),
  ('두원공과대학교', NULL, '경기'),
  ('부천대학교', NULL, '경기'),
  ('수원과학대학교', NULL, '경기'),
  ('수원여자대학교', NULL, '경기'),
  ('신구대학교', NULL, '경기'),
  ('안산대학교', NULL, '경기'),
  ('여주대학교', NULL, '경기'),
  ('연성대학교', NULL, '경기'),
  ('오산대학교', NULL, '경기'),
  ('유한대학교', NULL, '경기'),
  ('장안대학교', NULL, '경기'),
  ('청강문화산업대학교', NULL, '경기'),
  ('한국관광대학교', NULL, '경기');

-- ── 인천 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('인천대학교', '인천대', '인천'),
  ('인하대학교', '인하대', '인천'),
  ('경인교육대학교', '경인교대', '인천'),
  ('인천가톨릭대학교', NULL, '인천'),
  ('인천재능대학교', NULL, '인천'),
  ('경인여자대학교', NULL, '인천'),
  ('인하공업전문대학', NULL, '인천');

-- ── 부산 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('부산대학교', '부산대', '부산'),
  ('부경대학교', '부경대', '부산'),
  ('동아대학교', '동아대', '부산'),
  ('동의대학교', '동의대', '부산'),
  ('경성대학교', '경성대', '부산'),
  ('신라대학교', '신라대', '부산'),
  ('부산외국어대학교', '부산외대', '부산'),
  ('동서대학교', '동서대', '부산'),
  ('고신대학교', '고신대', '부산'),
  ('부산가톨릭대학교', NULL, '부산'),
  ('한국해양대학교', '해양대', '부산'),
  ('부산교육대학교', '부산교대', '부산'),
  ('동명대학교', '동명대', '부산'),
  ('부산장신대학교', NULL, '부산'),
  ('부산과학기술대학교', NULL, '부산'),
  ('동의과학대학교', NULL, '부산'),
  ('동주대학교', NULL, '부산'),
  ('대동대학교', NULL, '부산'),
  ('경남정보대학교', NULL, '부산'),
  ('부산경상대학교', NULL, '부산'),
  ('부산여자대학교', NULL, '부산'),
  ('부산예술대학교', NULL, '부산');

-- ── 대구 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('경북대학교', '경북대', '대구'),
  ('계명대학교', '계명대', '대구'),
  ('대구가톨릭대학교', '대가대', '대구'),
  ('대구대학교', '대구대', '대구'),
  ('대구한의대학교', '대구한의대', '대구'),
  ('대구교육대학교', '대구교대', '대구'),
  ('계명문화대학교', NULL, '대구'),
  ('대구보건대학교', NULL, '대구'),
  ('영진전문대학교', NULL, '대구'),
  ('수성대학교', NULL, '대구'),
  ('대구과학대학교', NULL, '대구'),
  ('영남이공대학교', NULL, '대구'),
  ('대구공업대학교', NULL, '대구');

-- ── 광주 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('전남대학교', '전남대', '광주'),
  ('조선대학교', '조선대', '광주'),
  ('광주대학교', '광주대', '광주'),
  ('호남대학교', '호남대', '광주'),
  ('광주여자대학교', '광주여대', '광주'),
  ('남부대학교', '남부대', '광주'),
  ('송원대학교', '송원대', '광주'),
  ('광주교육대학교', '광주교대', '광주'),
  ('호남신학대학교', NULL, '광주'),
  ('동강대학교', NULL, '광주'),
  ('광주보건대학교', NULL, '광주'),
  ('서영대학교', NULL, '광주'),
  ('조선이공대학교', NULL, '광주');

-- ── 대전 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('충남대학교', '충남대', '대전'),
  ('한밭대학교', '한밭대', '대전'),
  ('한남대학교', '한남대', '대전'),
  ('배재대학교', '배재대', '대전'),
  ('목원대학교', '목원대', '대전'),
  ('대전대학교', '대전대', '대전'),
  ('우송대학교', '우송대', '대전'),
  ('침례신학대학교', NULL, '대전'),
  ('한국과학기술원', 'KAIST', '대전'),
  ('대전신학대학교', NULL, '대전'),
  ('대전보건대학교', NULL, '대전'),
  ('대덕대학교', NULL, '대전'),
  ('우송정보대학', NULL, '대전'),
  ('대전과학기술대학교', NULL, '대전');

-- ── 울산 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('울산대학교', '울산대', '울산'),
  ('울산과학기술원', 'UNIST', '울산'),
  ('울산과학대학교', NULL, '울산'),
  ('춘해보건대학교', NULL, '울산');

-- ── 세종 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('고려대학교 세종캠퍼스', '고려대(세종)', '세종'),
  ('홍익대학교 세종캠퍼스', '홍익대(세종)', '세종'),
  ('한국영상대학교', NULL, '세종');

-- ── 강원 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('강원대학교', '강원대', '강원'),
  ('강릉원주대학교', '강릉원주대', '강원'),
  ('한림대학교', '한림대', '강원'),
  ('연세대학교 미래캠퍼스', '연세대(미래)', '강원'),
  ('가톨릭관동대학교', '관동대', '강원'),
  ('상지대학교', '상지대', '강원'),
  ('한라대학교', '한라대', '강원'),
  ('경동대학교', '경동대', '강원'),
  ('춘천교육대학교', '춘천교대', '강원'),
  ('강릉영동대학교', NULL, '강원'),
  ('강원관광대학교', NULL, '강원'),
  ('한림성심대학교', NULL, '강원'),
  ('세경대학교', NULL, '강원');

-- ── 충북 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('충북대학교', '충북대', '충북'),
  ('한국교통대학교', '교통대', '충북'),
  ('청주대학교', '청주대', '충북'),
  ('서원대학교', '서원대', '충북'),
  ('세명대학교', '세명대', '충북'),
  ('극동대학교', '극동대', '충북'),
  ('중원대학교', '중원대', '충북'),
  ('청주교육대학교', '청주교대', '충북'),
  ('한국교원대학교', '교원대', '충북'),
  ('꽃동네대학교', NULL, '충북'),
  ('충북보건과학대학교', NULL, '충북'),
  ('충청대학교', NULL, '충북'),
  ('대원대학교', NULL, '충북'),
  ('강동대학교', NULL, '충북');

-- ── 충남 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('공주대학교', '공주대', '충남'),
  ('순천향대학교', '순천향대', '충남'),
  ('호서대학교', '호서대', '충남'),
  ('선문대학교', '선문대', '충남'),
  ('남서울대학교', '남서울대', '충남'),
  ('백석대학교', '백석대', '충남'),
  ('나사렛대학교', '나사렛대', '충남'),
  ('한서대학교', '한서대', '충남'),
  ('청운대학교', '청운대', '충남'),
  ('중부대학교', '중부대', '충남'),
  ('건양대학교', '건양대', '충남'),
  ('금강대학교', '금강대', '충남'),
  ('한국기술교육대학교', '한기대', '충남'),
  ('공주교육대학교', '공주교대', '충남'),
  ('신성대학교', NULL, '충남'),
  ('혜전대학교', NULL, '충남'),
  ('충남도립대학교', NULL, '충남'),
  ('백석문화대학교', NULL, '충남'),
  ('연암대학교', NULL, '충남');

-- ── 전북 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('전북대학교', '전북대', '전북'),
  ('전주대학교', '전주대', '전북'),
  ('원광대학교', '원광대', '전북'),
  ('군산대학교', '군산대', '전북'),
  ('우석대학교', '우석대', '전북'),
  ('호원대학교', '호원대', '전북'),
  ('예수대학교', NULL, '전북'),
  ('한일장신대학교', NULL, '전북'),
  ('전주교육대학교', '전주교대', '전북'),
  ('원광보건대학교', NULL, '전북'),
  ('전주비전대학교', NULL, '전북'),
  ('전북과학대학교', NULL, '전북'),
  ('군장대학교', NULL, '전북'),
  ('백제예술대학교', NULL, '전북');

-- ── 전남 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('목포대학교', '목포대', '전남'),
  ('순천대학교', '순천대', '전남'),
  ('목포해양대학교', '목포해양대', '전남'),
  ('동신대학교', '동신대', '전남'),
  ('세한대학교', '세한대', '전남'),
  ('초당대학교', '초당대', '전남'),
  ('광주가톨릭대학교', NULL, '전남'),
  ('영산선학대학교', NULL, '전남'),
  ('청암대학교', NULL, '전남'),
  ('한영대학교', NULL, '전남'),
  ('순천제일대학교', NULL, '전남'),
  ('목포과학대학교', NULL, '전남'),
  ('동아보건대학교', NULL, '전남'),
  ('전남도립대학교', NULL, '전남');

-- ── 경북 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('영남대학교', '영남대', '경북'),
  ('안동대학교', '안동대', '경북'),
  ('금오공과대학교', '금오공대', '경북'),
  ('한동대학교', '한동대', '경북'),
  ('포항공과대학교', 'POSTECH', '경북'),
  ('위덕대학교', '위덕대', '경북'),
  ('경운대학교', '경운대', '경북'),
  ('김천대학교', '김천대', '경북'),
  ('경일대학교', '경일대', '경북'),
  ('대신대학교', NULL, '경북'),
  ('경주대학교', '경주대', '경북'),
  ('동양대학교', '동양대', '경북'),
  ('가톨릭상지대학교', NULL, '경북'),
  ('구미대학교', NULL, '경북'),
  ('선린대학교', NULL, '경북'),
  ('안동과학대학교', NULL, '경북'),
  ('경북과학대학교', NULL, '경북'),
  ('호산대학교', NULL, '경북'),
  ('문경대학교', NULL, '경북'),
  ('포항대학교', NULL, '경북'),
  ('경북전문대학교', NULL, '경북');

-- ── 경남 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('경상국립대학교', '경상대', '경남'),
  ('창원대학교', '창원대', '경남'),
  ('경남대학교', '경남대', '경남'),
  ('인제대학교', '인제대', '경남'),
  ('영산대학교', '영산대', '경남'),
  ('가야대학교', '가야대', '경남'),
  ('창신대학교', '창신대', '경남'),
  ('진주교육대학교', '진주교대', '경남'),
  ('마산대학교', NULL, '경남'),
  ('창원문성대학교', NULL, '경남'),
  ('김해대학교', NULL, '경남'),
  ('거제대학교', NULL, '경남'),
  ('연암공과대학교', NULL, '경남'),
  ('동원과학기술대학교', NULL, '경남'),
  ('진주보건대학교', NULL, '경남'),
  ('한국승강기대학교', NULL, '경남');

-- ── 제주 ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO university (name, short_name, region) VALUES
  ('제주대학교', '제주대', '제주'),
  ('제주국제대학교', '제주국제대', '제주'),
  ('제주한라대학교', '한라대(제주)', '제주'),
  ('제주관광대학교', NULL, '제주');

-- ────────────────────────────────────────────────────────────────────────
-- 자동 학사일정 생성 (university_id > 7 = 전국 신규 대학). 멱등: 기존 자동분 제거 후 재생성.
-- 데모 기준일(2026-06-11) 전후로 배치: 중간고사(종료)·기말고사(진행/예정)·봄축제(종료)·여름방학(예정)
DELETE FROM academic_event WHERE university_id > 7;

-- 1학기 기말고사 (대학별로 시작일·기간이 다르게 — 6/8~6/17 시작, 8~12일 진행).
--   시험기간에는 기숙사 통금이 풀린다(연장 01~03시 또는 24시간 개방). 통금이 늦을수록 심야 피크도 늦어진다.
INSERT INTO academic_event (university_id, event_type, title, start_date, end_date, curfew_time, peak_hours, traffic_level, note)
SELECT u.id, 'exam', '1학기 기말고사',
       DATE_ADD('2026-06-08', INTERVAL ((u.id % 2) * 7 + (u.id % 3)) DAY),
       DATE_ADD(DATE_ADD('2026-06-08', INTERVAL ((u.id % 2) * 7 + (u.id % 3)) DAY), INTERVAL (8 + (u.id % 5)) DAY),
       CASE u.id % 4 WHEN 0 THEN '01:00:00' WHEN 1 THEN '02:00:00' WHEN 2 THEN '03:00:00' ELSE NULL END,
       CASE u.id % 4 WHEN 0 THEN '20:00-01:00' WHEN 1 THEN '20:00-02:00' WHEN 2 THEN '21:00-03:00' ELSE '19:00-24:00' END,
       'high',
       CASE u.id % 4
         WHEN 0 THEN '시험기간 통금 01시 연장 — 심야 카페인·간편식·컵라면 수요 급증 (피크 20–01시)'
         WHEN 1 THEN '시험기간 통금 02시 연장 — 심야 카페인·간편식·컵라면 수요 급증 (피크 20–02시)'
         WHEN 2 THEN '시험기간 통금 03시 연장 — 심야 카페인·간편식·컵라면 수요 급증 (피크 21–03시)'
         ELSE '시험기간 기숙사 24시간 개방(통금 해제) — 심야 학습 수요 급증 (피크 19–24시)'
       END
  FROM university u
 WHERE u.id > 7;

-- 1학기 중간고사 (종료 — 4월, 대학별 상이). 중간고사도 통금 연장/해제 적용.
INSERT INTO academic_event (university_id, event_type, title, start_date, end_date, curfew_time, peak_hours, traffic_level, note)
SELECT u.id, 'exam', '1학기 중간고사',
       DATE_ADD('2026-04-13', INTERVAL ((u.id % 2) * 7 + (u.id % 3)) DAY),
       DATE_ADD(DATE_ADD('2026-04-13', INTERVAL ((u.id % 2) * 7 + (u.id % 3)) DAY), INTERVAL (5 + (u.id % 4)) DAY),
       CASE u.id % 4 WHEN 0 THEN '01:00:00' WHEN 1 THEN '02:00:00' WHEN 2 THEN '03:00:00' ELSE NULL END,
       CASE u.id % 4 WHEN 0 THEN '20:00-01:00' WHEN 1 THEN '20:00-02:00' WHEN 2 THEN '21:00-03:00' ELSE '19:00-24:00' END,
       'high',
       CASE u.id % 4
         WHEN 3 THEN '중간고사 기간 기숙사 24시간 개방(통금 해제) — 심야 카페인·간편식 수요 증가'
         ELSE '중간고사 기간 통금 연장 — 심야 카페인·간편식 수요 증가'
       END
  FROM university u
 WHERE u.id > 7;

-- 봄 대동제 (종료 — 5월)
INSERT INTO academic_event (university_id, event_type, title, start_date, end_date, curfew_time, peak_hours, traffic_level, note)
SELECT u.id, 'festival', '봄 대동제',
       DATE_ADD('2026-05-09', INTERVAL (u.id % 21) DAY),
       DATE_ADD('2026-05-09', INTERVAL ((u.id % 21) + 2) DAY),
       NULL, '17:00-23:00', 'peak',
       '봄 축제(대동제) — 음료·스낵·주류·아이스크림 수요 급증'
  FROM university u
 WHERE u.id > 7;

-- 여름방학 (예정 — 6월 하순~8월)
INSERT INTO academic_event (university_id, event_type, title, start_date, end_date, curfew_time, peak_hours, traffic_level, note)
SELECT u.id, 'vacation', '여름방학',
       DATE_ADD('2026-06-22', INTERVAL (u.id % 8) DAY),
       '2026-08-25',
       NULL, NULL, 'low',
       '방학 — 학생 유동 감소, 신선식품(도시락·김밥류) 재고 축소 권장'
  FROM university u
 WHERE u.id > 7;

-- ────────────────────────────────────────────────────────────────────────
-- 주소(address) — 전 대학 시·군·구·동 단위. 기본값은 region, 이어서 정밀 주소로 덮어쓴다.
UPDATE university SET address = region WHERE address IS NULL;

UPDATE university u
  JOIN (
    SELECT '서울대학교' AS name, '서울 관악구 신림동' AS addr
    UNION ALL SELECT '고려대학교', '서울 성북구 안암동'
    UNION ALL SELECT '성균관대학교', '서울 종로구 명륜동'
    UNION ALL SELECT '경희대학교', '서울 동대문구 회기동'
    UNION ALL SELECT '한국외국어대학교', '서울 동대문구 이문동'
    UNION ALL SELECT '서울시립대학교', '서울 동대문구 전농동'
    UNION ALL SELECT '건국대학교', '서울 광진구 화양동'
    UNION ALL SELECT '동국대학교', '서울 중구 필동'
    UNION ALL SELECT '숙명여자대학교', '서울 용산구 청파동'
    UNION ALL SELECT '성신여자대학교', '서울 성북구 동선동'
    UNION ALL SELECT '세종대학교', '서울 광진구 군자동'
    UNION ALL SELECT '광운대학교', '서울 노원구 월계동'
    UNION ALL SELECT '국민대학교', '서울 성북구 정릉동'
    UNION ALL SELECT '숭실대학교', '서울 동작구 상도동'
    UNION ALL SELECT '서울과학기술대학교', '서울 노원구 공릉동'
    UNION ALL SELECT '가톨릭대학교', '서울 종로구 혜화동'
    UNION ALL SELECT '삼육대학교', '서울 노원구 공릉동'
    UNION ALL SELECT '서경대학교', '서울 성북구 정릉동'
    UNION ALL SELECT '한성대학교', '서울 성북구 삼선동'
    UNION ALL SELECT '상명대학교', '서울 종로구 홍지동'
    UNION ALL SELECT '덕성여자대학교', '서울 도봉구 쌍문동'
    UNION ALL SELECT '동덕여자대학교', '서울 성북구 하월곡동'
    UNION ALL SELECT '서울여자대학교', '서울 노원구 공릉동'
    UNION ALL SELECT '명지대학교', '서울 서대문구 남가좌동'
    UNION ALL SELECT '추계예술대학교', '서울 서대문구 북아현동'
    UNION ALL SELECT '한국체육대학교', '서울 송파구 오륜동'
    UNION ALL SELECT '서울교육대학교', '서울 서초구 서초동'
    UNION ALL SELECT '총신대학교', '서울 동작구 사당동'
    UNION ALL SELECT '한국방송통신대학교', '서울 종로구 동숭동'
    UNION ALL SELECT '명지전문대학', '서울 서대문구 홍은동'
    UNION ALL SELECT '인덕대학교', '서울 노원구 월계동'
    UNION ALL SELECT '동양미래대학교', '서울 구로구 고척동'
    UNION ALL SELECT '서일대학교', '서울 중랑구 면목동'
    UNION ALL SELECT '배화여자대학교', '서울 종로구 필운동'
    UNION ALL SELECT '한양여자대학교', '서울 성동구 행당동'
    UNION ALL SELECT '삼육보건대학교', '서울 동대문구 휘경동'
    UNION ALL SELECT '숭의여자대학교', '서울 중구 예장동'
    UNION ALL SELECT '백석예술대학교', '서울 서초구 방배동'
    UNION ALL SELECT '정화예술대학교', '서울 중구 장충동'
    UNION ALL SELECT '아주대학교', '경기 수원시 영통구 원천동'
    UNION ALL SELECT '경기대학교', '경기 수원시 영통구 이의동'
    UNION ALL SELECT '단국대학교', '경기 용인시 수지구 죽전동'
    UNION ALL SELECT '대진대학교', '경기 포천시 선단동'
    UNION ALL SELECT '신한대학교', '경기 의정부시 호원동'
    UNION ALL SELECT '을지대학교', '경기 성남시 수정구 양지동'
    UNION ALL SELECT '평택대학교', '경기 평택시 용이동'
    UNION ALL SELECT '수원대학교', '경기 화성시 봉담읍'
    UNION ALL SELECT '협성대학교', '경기 화성시 봉담읍'
    UNION ALL SELECT '안양대학교', '경기 안양시 만안구 안양동'
    UNION ALL SELECT '강남대학교', '경기 용인시 기흥구 구갈동'
    UNION ALL SELECT '용인대학교', '경기 용인시 처인구 삼가동'
    UNION ALL SELECT '한경국립대학교', '경기 안성시 석정동'
    UNION ALL SELECT '한신대학교', '경기 오산시 양산동'
    UNION ALL SELECT '차의과학대학교', '경기 포천시 신북면'
    UNION ALL SELECT '한세대학교', '경기 군포시 당정동'
    UNION ALL SELECT '한국항공대학교', '경기 고양시 덕양구 화전동'
    UNION ALL SELECT '서울장신대학교', '경기 광주시 경안동'
    UNION ALL SELECT '루터대학교', '경기 용인시 기흥구 신갈동'
    UNION ALL SELECT '칼빈대학교', '경기 용인시 처인구 양지면'
    UNION ALL SELECT '경복대학교', '경기 남양주시 진접읍'
    UNION ALL SELECT '경기과학기술대학교', '경기 시흥시 정왕동'
    UNION ALL SELECT '경민대학교', '경기 의정부시 가능동'
    UNION ALL SELECT '계원예술대학교', '경기 의왕시 내손동'
    UNION ALL SELECT '국제대학교', '경기 평택시 장당동'
    UNION ALL SELECT '김포대학교', '경기 김포시 월곶면'
    UNION ALL SELECT '농협대학교', '경기 고양시 덕양구 원당동'
    UNION ALL SELECT '동남보건대학교', '경기 수원시 장안구 정자동'
    UNION ALL SELECT '동서울대학교', '경기 성남시 수정구 복정동'
    UNION ALL SELECT '두원공과대학교', '경기 안성시 죽산면'
    UNION ALL SELECT '부천대학교', '경기 부천시 원미구 심곡동'
    UNION ALL SELECT '수원과학대학교', '경기 화성시 정남면'
    UNION ALL SELECT '수원여자대학교', '경기 수원시 권선구 온정동'
    UNION ALL SELECT '신구대학교', '경기 성남시 중원구 금광동'
    UNION ALL SELECT '안산대학교', '경기 안산시 상록구 일동'
    UNION ALL SELECT '여주대학교', '경기 여주시 교동'
    UNION ALL SELECT '연성대학교', '경기 안양시 만안구 안양동'
    UNION ALL SELECT '오산대학교', '경기 오산시 청학동'
    UNION ALL SELECT '유한대학교', '경기 부천시 오정구 괴안동'
    UNION ALL SELECT '장안대학교', '경기 화성시 봉담읍'
    UNION ALL SELECT '청강문화산업대학교', '경기 이천시 마장면'
    UNION ALL SELECT '한국관광대학교', '경기 이천시 신둔면'
    UNION ALL SELECT '인천대학교', '인천 연수구 송도동'
    UNION ALL SELECT '인하대학교', '인천 미추홀구 용현동'
    UNION ALL SELECT '경인교육대학교', '인천 계양구 계산동'
    UNION ALL SELECT '인천가톨릭대학교', '인천 강화군 양도면'
    UNION ALL SELECT '인천재능대학교', '인천 동구 송림동'
    UNION ALL SELECT '경인여자대학교', '인천 계양구 계산동'
    UNION ALL SELECT '인하공업전문대학', '인천 미추홀구 용현동'
    UNION ALL SELECT '부산대학교', '부산 금정구 장전동'
    UNION ALL SELECT '부경대학교', '부산 남구 대연동'
    UNION ALL SELECT '동아대학교', '부산 사하구 하단동'
    UNION ALL SELECT '동의대학교', '부산 부산진구 가야동'
    UNION ALL SELECT '경성대학교', '부산 남구 대연동'
    UNION ALL SELECT '신라대학교', '부산 사상구 괘법동'
    UNION ALL SELECT '부산외국어대학교', '부산 금정구 남산동'
    UNION ALL SELECT '동서대학교', '부산 사상구 주례동'
    UNION ALL SELECT '고신대학교', '부산 영도구 동삼동'
    UNION ALL SELECT '부산가톨릭대학교', '부산 금정구 부곡동'
    UNION ALL SELECT '한국해양대학교', '부산 영도구 동삼동'
    UNION ALL SELECT '부산교육대학교', '부산 연제구 거제동'
    UNION ALL SELECT '동명대학교', '부산 남구 용당동'
    UNION ALL SELECT '부산장신대학교', '부산 금정구 노포동'
    UNION ALL SELECT '부산과학기술대학교', '부산 북구 구포동'
    UNION ALL SELECT '동의과학대학교', '부산 부산진구 양정동'
    UNION ALL SELECT '동주대학교', '부산 사하구 괴정동'
    UNION ALL SELECT '대동대학교', '부산 금정구 청룡동'
    UNION ALL SELECT '경남정보대학교', '부산 사상구 주례동'
    UNION ALL SELECT '부산경상대학교', '부산 연제구 거제동'
    UNION ALL SELECT '부산여자대학교', '부산 부산진구 양정동'
    UNION ALL SELECT '부산예술대학교', '부산 남구 감만동'
    UNION ALL SELECT '경북대학교', '대구 북구 산격동'
    UNION ALL SELECT '계명대학교', '대구 달서구 신당동'
    UNION ALL SELECT '대구가톨릭대학교', '경북 경산시 하양읍'
    UNION ALL SELECT '대구대학교', '경북 경산시 진량읍'
    UNION ALL SELECT '대구한의대학교', '경북 경산시 유곡동'
    UNION ALL SELECT '대구교육대학교', '대구 남구 대명동'
    UNION ALL SELECT '계명문화대학교', '대구 달서구 신당동'
    UNION ALL SELECT '대구보건대학교', '대구 북구 산격동'
    UNION ALL SELECT '영진전문대학교', '대구 북구 복현동'
    UNION ALL SELECT '수성대학교', '대구 수성구 만촌동'
    UNION ALL SELECT '대구과학대학교', '대구 북구 태전동'
    UNION ALL SELECT '영남이공대학교', '대구 남구 대명동'
    UNION ALL SELECT '대구공업대학교', '대구 달서구 본리동'
    UNION ALL SELECT '전남대학교', '광주 북구 용봉동'
    UNION ALL SELECT '조선대학교', '광주 동구 서석동'
    UNION ALL SELECT '광주대학교', '광주 남구 진월동'
    UNION ALL SELECT '호남대학교', '광주 광산구 월계동'
    UNION ALL SELECT '광주여자대학교', '광주 광산구 산정동'
    UNION ALL SELECT '남부대학교', '광주 광산구 첨단동'
    UNION ALL SELECT '송원대학교', '광주 남구 송하동'
    UNION ALL SELECT '광주교육대학교', '광주 북구 풍향동'
    UNION ALL SELECT '호남신학대학교', '광주 남구 양림동'
    UNION ALL SELECT '동강대학교', '광주 북구 두암동'
    UNION ALL SELECT '광주보건대학교', '광주 광산구 신창동'
    UNION ALL SELECT '서영대학교', '광주 북구 일곡동'
    UNION ALL SELECT '조선이공대학교', '광주 동구 서석동'
    UNION ALL SELECT '충남대학교', '대전 유성구 궁동'
    UNION ALL SELECT '한밭대학교', '대전 유성구 덕명동'
    UNION ALL SELECT '한남대학교', '대전 대덕구 오정동'
    UNION ALL SELECT '배재대학교', '대전 서구 연자동'
    UNION ALL SELECT '목원대학교', '대전 서구 도안동'
    UNION ALL SELECT '대전대학교', '대전 동구 용운동'
    UNION ALL SELECT '우송대학교', '대전 동구 자양동'
    UNION ALL SELECT '침례신학대학교', '대전 유성구 하기동'
    UNION ALL SELECT '한국과학기술원', '대전 유성구 구성동'
    UNION ALL SELECT '대전신학대학교', '대전 대덕구 와동'
    UNION ALL SELECT '대전보건대학교', '대전 동구 가양동'
    UNION ALL SELECT '대덕대학교', '대전 유성구 장동'
    UNION ALL SELECT '우송정보대학', '대전 동구 자양동'
    UNION ALL SELECT '대전과학기술대학교', '대전 서구 갈마동'
    UNION ALL SELECT '울산대학교', '울산 남구 무거동'
    UNION ALL SELECT '울산과학기술원', '울산 울주군 언양읍'
    UNION ALL SELECT '울산과학대학교', '울산 동구 화정동'
    UNION ALL SELECT '춘해보건대학교', '울산 울주군 청량읍'
    UNION ALL SELECT '고려대학교 세종캠퍼스', '세종 조치원읍'
    UNION ALL SELECT '홍익대학교 세종캠퍼스', '세종 조치원읍'
    UNION ALL SELECT '한국영상대학교', '세종 장군면'
    UNION ALL SELECT '강원대학교', '강원 춘천시 효자동'
    UNION ALL SELECT '강릉원주대학교', '강원 강릉시 지변동'
    UNION ALL SELECT '한림대학교', '강원 춘천시 옥천동'
    UNION ALL SELECT '연세대학교 미래캠퍼스', '강원 원주시 흥업면'
    UNION ALL SELECT '가톨릭관동대학교', '강원 강릉시 내곡동'
    UNION ALL SELECT '상지대학교', '강원 원주시 우산동'
    UNION ALL SELECT '한라대학교', '강원 원주시 흥업면'
    UNION ALL SELECT '경동대학교', '강원 고성군 토성면'
    UNION ALL SELECT '춘천교육대학교', '강원 춘천시 석사동'
    UNION ALL SELECT '강릉영동대학교', '강원 강릉시 홍제동'
    UNION ALL SELECT '강원관광대학교', '강원 태백시 황지동'
    UNION ALL SELECT '한림성심대학교', '강원 춘천시 동면'
    UNION ALL SELECT '세경대학교', '강원 영월군 영월읍'
    UNION ALL SELECT '충북대학교', '충북 청주시 서원구 개신동'
    UNION ALL SELECT '한국교통대학교', '충북 충주시 대소원면'
    UNION ALL SELECT '청주대학교', '충북 청주시 청원구 내덕동'
    UNION ALL SELECT '서원대학교', '충북 청주시 서원구 모충동'
    UNION ALL SELECT '세명대학교', '충북 제천시 신월동'
    UNION ALL SELECT '극동대학교', '충북 음성군 감곡면'
    UNION ALL SELECT '중원대학교', '충북 괴산군 괴산읍'
    UNION ALL SELECT '청주교육대학교', '충북 청주시 서원구 수곡동'
    UNION ALL SELECT '한국교원대학교', '충북 청주시 흥덕구 강내면'
    UNION ALL SELECT '꽃동네대학교', '충북 청주시 서원구 현도면'
    UNION ALL SELECT '충북보건과학대학교', '충북 청주시 청원구 내수읍'
    UNION ALL SELECT '충청대학교', '충북 청주시 청원구 오창읍'
    UNION ALL SELECT '대원대학교', '충북 제천시 신월동'
    UNION ALL SELECT '강동대학교', '충북 음성군 감곡면'
    UNION ALL SELECT '공주대학교', '충남 공주시 신관동'
    UNION ALL SELECT '순천향대학교', '충남 아산시 신창면'
    UNION ALL SELECT '호서대학교', '충남 아산시 배방읍'
    UNION ALL SELECT '선문대학교', '충남 아산시 탕정면'
    UNION ALL SELECT '남서울대학교', '충남 천안시 서북구 성환읍'
    UNION ALL SELECT '백석대학교', '충남 천안시 동남구 안서동'
    UNION ALL SELECT '나사렛대학교', '충남 천안시 서북구 쌍용동'
    UNION ALL SELECT '한서대학교', '충남 서산시 해미면'
    UNION ALL SELECT '청운대학교', '충남 홍성군 홍성읍'
    UNION ALL SELECT '중부대학교', '충남 금산군 추부면'
    UNION ALL SELECT '건양대학교', '충남 논산시 내동'
    UNION ALL SELECT '금강대학교', '충남 논산시 상월면'
    UNION ALL SELECT '한국기술교육대학교', '충남 천안시 동남구 병천면'
    UNION ALL SELECT '공주교육대학교', '충남 공주시 봉황동'
    UNION ALL SELECT '신성대학교', '충남 당진시 정미면'
    UNION ALL SELECT '혜전대학교', '충남 홍성군 홍성읍'
    UNION ALL SELECT '충남도립대학교', '충남 청양군 청양읍'
    UNION ALL SELECT '백석문화대학교', '충남 천안시 동남구 안서동'
    UNION ALL SELECT '연암대학교', '충남 천안시 서북구 성환읍'
    UNION ALL SELECT '전북대학교', '전북 전주시 덕진구 덕진동'
    UNION ALL SELECT '전주대학교', '전북 전주시 완산구 효자동'
    UNION ALL SELECT '원광대학교', '전북 익산시 신용동'
    UNION ALL SELECT '군산대학교', '전북 군산시 미룡동'
    UNION ALL SELECT '우석대학교', '전북 완주군 삼례읍'
    UNION ALL SELECT '호원대학교', '전북 군산시 임피면'
    UNION ALL SELECT '예수대학교', '전북 전주시 완산구 중화산동'
    UNION ALL SELECT '한일장신대학교', '전북 완주군 상관면'
    UNION ALL SELECT '전주교육대학교', '전북 전주시 완산구 동서학동'
    UNION ALL SELECT '원광보건대학교', '전북 익산시 신용동'
    UNION ALL SELECT '전주비전대학교', '전북 전주시 완산구 효자동'
    UNION ALL SELECT '전북과학대학교', '전북 정읍시 시기동'
    UNION ALL SELECT '군장대학교', '전북 군산시 성산면'
    UNION ALL SELECT '백제예술대학교', '전북 완주군 봉동읍'
    UNION ALL SELECT '목포대학교', '전남 무안군 청계면'
    UNION ALL SELECT '순천대학교', '전남 순천시 석현동'
    UNION ALL SELECT '목포해양대학교', '전남 목포시 죽교동'
    UNION ALL SELECT '동신대학교', '전남 나주시 대호동'
    UNION ALL SELECT '세한대학교', '전남 영암군 삼호읍'
    UNION ALL SELECT '초당대학교', '전남 무안군 무안읍'
    UNION ALL SELECT '광주가톨릭대학교', '전남 나주시 남평읍'
    UNION ALL SELECT '영산선학대학교', '전남 영광군 백수읍'
    UNION ALL SELECT '청암대학교', '전남 순천시 덕월동'
    UNION ALL SELECT '한영대학교', '전남 여수시 둔덕동'
    UNION ALL SELECT '순천제일대학교', '전남 순천시 덕월동'
    UNION ALL SELECT '목포과학대학교', '전남 목포시 상동'
    UNION ALL SELECT '동아보건대학교', '전남 영암군 학산면'
    UNION ALL SELECT '전남도립대학교', '전남 담양군 담양읍'
    UNION ALL SELECT '영남대학교', '경북 경산시 대동'
    UNION ALL SELECT '안동대학교', '경북 안동시 송천동'
    UNION ALL SELECT '금오공과대학교', '경북 구미시 양호동'
    UNION ALL SELECT '한동대학교', '경북 포항시 북구 흥해읍'
    UNION ALL SELECT '포항공과대학교', '경북 포항시 남구 효자동'
    UNION ALL SELECT '위덕대학교', '경북 경주시 강동면'
    UNION ALL SELECT '경운대학교', '경북 구미시 산동읍'
    UNION ALL SELECT '김천대학교', '경북 김천시 삼락동'
    UNION ALL SELECT '경일대학교', '경북 경산시 하양읍'
    UNION ALL SELECT '대신대학교', '경북 경산시 진량읍'
    UNION ALL SELECT '경주대학교', '경북 경주시 효현동'
    UNION ALL SELECT '동양대학교', '경북 영주시 풍기읍'
    UNION ALL SELECT '가톨릭상지대학교', '경북 안동시 율세동'
    UNION ALL SELECT '구미대학교', '경북 구미시 부곡동'
    UNION ALL SELECT '선린대학교', '경북 포항시 북구 대신동'
    UNION ALL SELECT '안동과학대학교', '경북 안동시 서후면'
    UNION ALL SELECT '경북과학대학교', '경북 칠곡군 기산면'
    UNION ALL SELECT '호산대학교', '경북 경산시 하양읍'
    UNION ALL SELECT '문경대학교', '경북 문경시 호계면'
    UNION ALL SELECT '포항대학교', '경북 포항시 북구 흥해읍'
    UNION ALL SELECT '경북전문대학교', '경북 영주시 휴천동'
    UNION ALL SELECT '경상국립대학교', '경남 진주시 가좌동'
    UNION ALL SELECT '창원대학교', '경남 창원시 의창구 사림동'
    UNION ALL SELECT '경남대학교', '경남 창원시 마산합포구 월영동'
    UNION ALL SELECT '인제대학교', '경남 김해시 어방동'
    UNION ALL SELECT '영산대학교', '경남 양산시 주남동'
    UNION ALL SELECT '가야대학교', '경남 김해시 삼계동'
    UNION ALL SELECT '창신대학교', '경남 창원시 마산회원구 팔용동'
    UNION ALL SELECT '진주교육대학교', '경남 진주시 신안동'
    UNION ALL SELECT '마산대학교', '경남 창원시 마산회원구 내서읍'
    UNION ALL SELECT '창원문성대학교', '경남 창원시 의창구 두대동'
    UNION ALL SELECT '김해대학교', '경남 김해시 삼방동'
    UNION ALL SELECT '거제대학교', '경남 거제시 장평동'
    UNION ALL SELECT '연암공과대학교', '경남 진주시 문산읍'
    UNION ALL SELECT '동원과학기술대학교', '경남 양산시 명곡동'
    UNION ALL SELECT '진주보건대학교', '경남 진주시 상봉동'
    UNION ALL SELECT '한국승강기대학교', '경남 거창군 거창읍'
    UNION ALL SELECT '제주대학교', '제주 제주시 아라일동'
    UNION ALL SELECT '제주국제대학교', '제주 제주시 영평동'
    UNION ALL SELECT '제주한라대학교', '제주 제주시 노형동'
    UNION ALL SELECT '제주관광대학교', '제주 제주시 애월읍'
  ) m ON u.name = m.name
  SET u.address = m.addr;

-- region(시·도)을 주소의 시·도와 일치시킨다(위성 캠퍼스 등 보정). 기존 7곳(id<=7)은 유지.
UPDATE university SET region = SUBSTRING_INDEX(address, ' ', 1)
 WHERE id > 7 AND address IS NOT NULL AND address LIKE '% %';
