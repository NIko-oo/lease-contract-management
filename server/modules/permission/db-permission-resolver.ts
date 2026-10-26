import { Injectable, Inject } from '@nestjs/common';
import type { IPermissionResolver, PermissionPoint } from '@lark-apaas/fullstack-nestjs-core';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { authzRolePermissions, authzPermissions } from '@server/database/schema';
import { inArray, eq } from 'drizzle-orm';

@Injectable()
export class DbPermissionResolver implements IPermissionResolver {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async resolvePermissions(roleKeys: string[]): Promise<PermissionPoint[]> {
    if (roleKeys.length === 0) return [];
    const rows = await this.db
      .select({
        id: authzPermissions.id,
        action: authzPermissions.action,
        subject: authzPermissions.subject,
        description: authzPermissions.description,
      })
      .from(authzRolePermissions)
      .innerJoin(authzPermissions, eq(authzRolePermissions.permissionId, authzPermissions.id))
      .where(inArray(authzRolePermissions.roleKey, roleKeys));
    const seen = new Set<string>();
    return rows.filter(r => {
      const key = `${r.action}:${r.subject}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(r => ({
      id: r.id,
      action: r.action,
      subject: r.subject,
      description: r.description ?? undefined,
    }));
  }
}
