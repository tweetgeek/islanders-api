import { Module } from '@nestjs/common';
import { PlayersRepository } from './players.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

@Module({
  controllers: [AuthController],
  providers: [PlayersRepository, RefreshTokensRepository, AuthService],
  exports: [PlayersRepository, RefreshTokensRepository, AuthService],
})
export class PlayersModule {}
