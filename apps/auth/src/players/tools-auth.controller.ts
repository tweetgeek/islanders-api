import { Body, Controller, ForbiddenException, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '@islanders/platform';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { LoginDto, ToolsTokenDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('v1/auth/tools')
@UseGuards(RateLimitGuard)
@RateLimit('ip')
export class ToolsAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly issuer: TokenIssuer,
  ) {}

  /** Token panelu admina: bez refresh tokenu, po godzinie logowanie od nowa. */
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: ToolsTokenDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async login(@Body() dto: LoginDto): Promise<ToolsTokenDto> {
    const player = await this.auth.verifyCredentials(dto);
    if (!player.roles.includes('admin')) {
      throw new ForbiddenException('Wymagana rola admin');
    }
    const { token, expiresAt } = await this.issuer.tools(player);
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }
}
