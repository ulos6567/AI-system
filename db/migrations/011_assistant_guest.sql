-- 011 — 비로그인 게스트도 AI 비서에 질의할 수 있도록 대화 소유자를 선택값으로 변경
--   게스트 질의는 user_id = NULL 로 저장된다(소유 사용자 없음).
--   기존 FK(fk_ac_user)는 NULL 을 허용하므로 그대로 두고 컬럼만 NULL 허용으로 변경한다.
ALTER TABLE assistant_conversation MODIFY user_id BIGINT UNSIGNED NULL;
