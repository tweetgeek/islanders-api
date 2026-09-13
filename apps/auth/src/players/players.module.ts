import { Module } from '@nestjs/common';
import { PlayersRepository } from './players.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PlayersAdmin } from './players-admin.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { ToolsAuthController } from './tools-auth.controller.js';

@Module({
  controllers: [AuthController, ToolsAuthController],
  providers: [PlayersRepository, RefreshTokensRepository, AuthService, PlayersAdmin],
  exports: [PlayersRepository, RefreshTokensRepository, AuthService, PlayersAdmin],
})
export class PlayersModule {}
