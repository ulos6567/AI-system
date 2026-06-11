-- 014 — AI 어시스턴트 답변에 근거 데이터(facts) 동반 표시
-- 기존 sources_json(근거 출처 메타)에 더해, 실제 조회된 집계 데이터 라인(facts)을
-- 메시지에 함께 저장하여 답변과 함께 화면에 노출한다.

ALTER TABLE assistant_message ADD COLUMN facts_json JSON NULL AFTER sources_json;
