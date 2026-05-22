/**
 * T023 — 어댑터 팩토리 (env ADAPTER_* 기준 mock/real 분기)
 *   - 1차 구현은 모든 real 분기를 NotImplemented로 둔다.
 *   - real 구현이 추가될 때마다 import 후 case 분기에 등록.
 */
import { config } from '../config';
import type { PosAdapter } from '../ports/pos';
import type { ForecastAdapter } from '../ports/forecast';
import type { PushAdapter } from '../ports/push';
import type { EslAdapter } from '../ports/esl';
import type { LogisticsAdapter } from '../ports/logistics';
import type { SignalAdapter } from '../ports/signal';
import type { VisionAdapter } from '../ports/vision';

function notImplemented(label: string): never {
  throw new Error(`[adapter-factory] ${label} adapter not implemented yet`);
}

export function getPosAdapter(): PosAdapter {
  switch (config.adapters.pos) {
    case 'mock':
      // 지연 로드 — 순환 의존 방지
      return require('./pos/mock').default as PosAdapter;
    default:
      return notImplemented(`pos=${config.adapters.pos}`);
  }
}

export function getForecastAdapter(): ForecastAdapter {
  switch (config.adapters.forecast) {
    case 'baseline':
      return require('./forecast/baseline').default as ForecastAdapter;
    default:
      return notImplemented(`forecast=${config.adapters.forecast}`);
  }
}

export function getPushAdapter(): PushAdapter {
  switch (config.adapters.push) {
    case 'mock':
      return require('./push/mock').default as PushAdapter;
    default:
      return notImplemented(`push=${config.adapters.push}`);
  }
}

export function getEslAdapter(): EslAdapter {
  switch (config.adapters.esl) {
    case 'mock':
      return require('./esl/mock').default as EslAdapter;
    default:
      return notImplemented(`esl=${config.adapters.esl}`);
  }
}

export function getLogisticsAdapter(): LogisticsAdapter {
  switch (config.adapters.logistics) {
    case 'mock':
      return require('./logistics/mock').default as LogisticsAdapter;
    default:
      return notImplemented(`logistics=${config.adapters.logistics}`);
  }
}

export function getSignalAdapter(): SignalAdapter {
  switch (config.adapters.signal) {
    case 'mock':
      return require('./signal/mock').default as SignalAdapter;
    default:
      return notImplemented(`signal=${config.adapters.signal}`);
  }
}

export function getVisionAdapter(): VisionAdapter {
  switch (config.adapters.vision) {
    case 'mock':
      return require('./vision/mock').default as VisionAdapter;
    default:
      return notImplemented(`vision=${config.adapters.vision}`);
  }
}
