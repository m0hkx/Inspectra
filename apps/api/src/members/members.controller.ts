import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { changeRoleSchema, inviteMemberSchema, type Member } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** Everyone can read names and roles; assignments and history show them. */
  @Get()
  list(): Promise<Member[]> {
    return this.members.list();
  }

  @Post()
  @RequirePermission('manage:members')
  invite(@Body(new ZodValidationPipe(inviteMemberSchema)) input: z.output<typeof inviteMemberSchema>): Promise<Member> {
    return this.members.invite(input);
  }

  @Patch(':userId')
  @RequirePermission('manage:members')
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: z.output<typeof changeRoleSchema>,
  ): Promise<Member> {
    return this.members.changeRole(userId, body.role);
  }
}
