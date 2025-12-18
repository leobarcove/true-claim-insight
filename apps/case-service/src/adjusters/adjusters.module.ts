import { Module } from '@nestjs/common';
import { AdjustersController } from './adjusters.controller';
import { AdjustersService } from './adjusters.service';

@Module({
  controllers: [AdjustersController],
  providers: [AdjustersService],
  exports: [AdjustersService],
})
export class AdjustersModule {}
