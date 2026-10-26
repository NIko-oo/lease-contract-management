import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { authzPermissions, authzRolePermissions } from '@server/database/schema';
import { eq, and, inArray } from 'drizzle-orm';

@Controller('api/permissions')
export class PermissionController {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  // 权限点/角色映射为登录用户渲染导航所需（权限点本身非敏感），仅需登录即可读
  @NeedLogin()
  @Get()
  async listPermissions() {
    return this.db.select().from(authzPermissions);
  }

  @NeedLogin()
  @Get('role-mappings')
  async listRoleMappings() {
    return this.db.select().from(authzRolePermissions);
  }

  // 写操作仍要求 manage:Permission
  @NeedLogin()
  @Can('manage', 'Permission')
  @Post('role-mappings/batch')
  async batchUpdateRoleMappings(
    @Body() dto: { roleKey: string; add: string[]; remove: string[] },
  ) {
    await this.db.transaction(async (tx) => {
      if (dto.remove.length > 0) {
        await tx.delete(authzRolePermissions).where(
          and(
            eq(authzRolePermissions.roleKey, dto.roleKey),
            inArray(authzRolePermissions.permissionId, dto.remove),
          ),
        );
      }
      if (dto.add.length > 0) {
        await tx.insert(authzRolePermissions).values(
          dto.add.map((permissionId) => ({ roleKey: dto.roleKey, permissionId })),
        );
      }
    });
    return { success: true };
  }
}
