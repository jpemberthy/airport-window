import { vi } from 'vitest';
vi.mock('../airport.config', async () => {
  const { boston } = await import('../airports/boston');
  return { default: boston };
});
