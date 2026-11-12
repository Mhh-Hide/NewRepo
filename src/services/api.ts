import { mockAdapter } from '../mocks/mock-adapter';
import type { ApiAdapter } from './api-adapter';
/** Demo composition root. Production integrations require separate authorization. */
export const api: ApiAdapter = mockAdapter;
