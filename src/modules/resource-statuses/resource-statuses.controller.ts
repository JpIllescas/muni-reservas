import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { ResourceStatusesService } from './resource-statuses.service';
import { CreateResourceStatusDto } from './dto/create-resource-status.dto';
import { UpdateResourceStatusCatalogDto } from './dto/update-resource-status-catalog.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('resource-statuses')
export class ResourceStatusesController {
  constructor(private readonly service: ResourceStatusesService) { }

  // GET /api/resource-statuses?all=true — admin y operador 
  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all === 'true');
  }

  // POST/PATCH/DELETE — gestión del catálogo: solo admin.
  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateResourceStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.create(dto, user, ip);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceStatusCatalogDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.update(id, dto, user, ip);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.toggleActive(id, user, ip);
  }
}
