import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RateLimit } from '../../infra/http/rate-limit.guard.js';
import {
  AuthResultDto,
  ConflictFieldDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  TokenPairDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit('ip')
  @HttpCode(201)
  @ApiCreatedResponse({ type: AuthResultDto })
  @ApiConflictResponse({ type: ConflictFieldDto })
  register(@Body() dto: RegisterDto): Promise<AuthResultDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @RateLimit('ip')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse()
  login(@Body() dto: LoginDto): Promise<AuthResultDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @RateLimit('ip')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse()
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    const { accessToken, refreshToken } = await this.auth.refresh(
      dto.refreshToken,
    );
    return { accessToken, refreshToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
