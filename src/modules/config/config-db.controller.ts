import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ConfigDbService } from './config-db.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system-config')
export class ConfigDbController {
  constructor(private readonly configDbService: ConfigDbService) {}

  // GET /api/system-config - Ver todas (Admyn y Operador)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @Get()
  findAll() {
    return this.configDbService.findAll();
  }

  // GET /api/system-config/:key - ver una sola (Admin y Operador)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @Get(':key')
  findByKey(@Param('key') key: string) {
    return this.configDbService.findByKey(key);
  }

  // PATCH /api/system-cnfig/:key - actualizar valor (SOLO ADMIN)
  @Roles(Role.ADMIN)
  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
    @CurrentUser() user: any,
  ) {
    return this.configDbService.update(key, dto, user.id);
  }
}
