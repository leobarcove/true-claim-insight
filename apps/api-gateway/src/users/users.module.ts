import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http.module';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TenantsController } from './controllers/tenants.controller';
import { UserTenantsController } from './controllers/user-tenants.controller';

@Module({
  imports: [InternalHttpModule],
  controllers: [UsersController, TenantsController, UserTenantsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
