import { Module } from '@nestjs/common';
import { ClerkService } from './clerk.service';
import { IdentityService } from './identity.service';

@Module({
  providers: [ClerkService, IdentityService],
  exports: [ClerkService, IdentityService],
})
export class AuthModule {}
