import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FindAuditDto } from './dto/find-audit.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // GET /api/audit?page&limit&entityType&action&user&from&to — solo admin.
  // Devuelve { data, meta } paginado.
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() dto: FindAuditDto) {
    return this.auditService.findAll(dto);
  }
}
