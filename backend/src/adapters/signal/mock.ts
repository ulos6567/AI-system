import type { SignalAdapter, ExternalSignal } from '../../ports/signal';

const adapter: SignalAdapter = {
  name: 'signal-mock',
  signalType: 'weather',
  async poll(opts): Promise<ExternalSignal[]> {
    return [
      {
        regionCode: opts.regionCode ?? '11000',
        storeId: opts.storeId,
        signalType: 'weather',
        occurredAt: new Date(),
        payload: { temp_c: 22.5, humidity: 60, rain_mm: 0, condition: 'mock' },
        source: 'mock',
      },
    ];
  },
};

export default adapter;
