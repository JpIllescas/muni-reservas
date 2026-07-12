import { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

// Simula un ExecutionContext con un usuario en la request.
function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('permite el acceso al super-admin', () => {
    expect(guard.canActivate(contextWithUser({ isSuperAdmin: true }))).toBe(
      true,
    );
  });

  it('niega el acceso a un admin/operador normal', () => {
    expect(guard.canActivate(contextWithUser({ isSuperAdmin: false }))).toBe(
      false,
    );
  });

  it('niega el acceso si no hay usuario en la request', () => {
    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });
});
