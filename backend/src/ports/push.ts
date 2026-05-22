/** T022 — 푸시 알림 어댑터 포트 (mock | FCM | APNs) */

export interface PushMessage {
  userId: number;
  storeId?: number;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushAdapter {
  readonly name: string;
  send(msg: PushMessage): Promise<{ messageId: string; channel: 'console' | 'fcm' | 'apns' }>;
}
