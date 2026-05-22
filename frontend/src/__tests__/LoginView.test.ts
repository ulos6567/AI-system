/**
 * T072 — LoginView 컴포넌트 스모크 테스트
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(async () => ({ user: { id: 1, email: 'a@b.com', displayName: 'a', globalRole: 'STORE_USER', stores: [] } })),
    me: vi.fn(async () => { throw new Error('no'); }),
    logout: vi.fn(),
  },
}));

import LoginView from '@/views/LoginView.vue';

describe('LoginView', () => {
  it('renders email and password fields with demo defaults', () => {
    setActivePinia(createPinia());
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/orders', name: 'orders', component: { template: '<div/>' } }] });
    const wrapper = mount(LoginView, { global: { plugins: [router] } });
    const inputs = wrapper.findAll('input');
    expect(inputs.length).toBe(2);
    expect((inputs[0].element as HTMLInputElement).value).toBe('store_owner_demo@example.com');
    expect((inputs[1].element as HTMLInputElement).value).toBe('demo1234');
  });
});
