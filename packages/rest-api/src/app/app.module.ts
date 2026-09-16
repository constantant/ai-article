import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppsModule } from './apps/apps.module.js';
import { ArticlesModule } from './articles/articles.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [AppsModule, ArticlesModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
