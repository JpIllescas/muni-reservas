import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // GET /api/audit?limit=50&offset=0 - Solo Administradores pueden ver esto
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = limit ? parseInt(limit, 10) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;
    return this.auditService.findAll(take, skip);
  }
}
