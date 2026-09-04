/**
 * 개인정보처리방침 / 이용약관 버전.
 *
 * YYYYMMDD 정수. 방침 내용을 실질적으로 바꿀 때 이 값을 올린다.
 * 그러면 사용자에게 1회 고지된다:
 *  - 다음 슬래시 명령 실행 시 ephemeral 안내 (`src/bot/index.ts`)
 *  - 다음 북마클릿/확장 동기화 시 오버레이 상단 안내 (`src/web/bookmarklet.ts`)
 * 두 경로 중 먼저 닿는 쪽에서 `sessions.policy_ack` 를 이 값으로 올리고, 이후엔 안 뜬다.
 */
export const POLICY_VERSION = 20260901;

/** 고지 문구 (디스코드 ephemeral 용). */
export function policyNoticeText(baseUrl: string): string {
  return [
    "**carol 개인정보처리방침이 업데이트되었습니다** (2026년 9월)",
    "비공식 크롬 확장(캐롤익스텐션)을 통한 프로필 동기화 경로가 추가되었습니다. " +
      "확장은 선택 사항이며 직접 설치하고 동기화를 켠 경우에만 동작합니다. " +
      "전송되는 데이터의 종류·목적은 기존 북마클릿과 동일합니다.",
    `${baseUrl}/privacy`,
  ].join("\n");
}
