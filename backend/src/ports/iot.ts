/** 002 (T006) — IoT 센서 스트림 포트 (1차 시뮬레이션) */

export interface DeviceReadingSignal {
  deviceId: number;
  temperature?: number;
  powerWatt?: number;
  readingAt: Date;
}

export interface IotAdapter {
  readonly name: string;
  /** 등록된 장비들의 최신 센서 측정값을 1회 폴링 (sim: 생성, real: 게이트웨이 조회) */
  poll(storeId: number): Promise<DeviceReadingSignal[]>;
}
