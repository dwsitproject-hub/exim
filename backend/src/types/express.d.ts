/**
 * Extend Express Request with auth user (set by auth middleware).
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: string;
        permission_overrides: string[];
        effective_permissions: string[];
        must_change_password: boolean;
      };
    }
  }
}

export {};
