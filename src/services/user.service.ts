// ============================================================
// src/services/user.service.ts — User profile API service
// ============================================================

import { apiFetch } from '@/lib/apiClient';
import type { UserResponse } from '@/src/types/api';

export const UserService = {
  getProfile: (): Promise<UserResponse> =>
    apiFetch<UserResponse>('/api/user/profile'),

  updateProfile: (patch: Partial<UserResponse>): Promise<UserResponse> =>
    apiFetch<UserResponse>('/api/user/profile', {
      method: 'PATCH',
      body:   JSON.stringify(patch),
    }),
};
