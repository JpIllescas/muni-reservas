import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // GET /api/audit?page=1&limit=50 - Solo Administradores pueden ver esto
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() dto: PaginationDto) {
    return this.auditService.findAll(dto.limit, (dto.page - 1) * dto.limit);
  }
}
