import { Body, Controller, HttpCode, Inject, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '@islanders/platform';
import { ZodPipe } from '../common/zod.pipe.js';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { SERVICE_CLIENTS, type ServiceClients } from './service-clients.js';

const credentialsSchema = z.strictObject({
  clientId: z.string().min(1).max(64),
  clientSecret: z.string().min(1).max(256),
});
// Nazwany alias, nie `z.output<typeof credentialsSchema>` wprost w sygnaturze: `emitDecoratorMetadata`
// serializuje wyrażenie `typeof credentialsSchema` na samo `credentialsSchema` jako metatyp
// parametru, więc globalny `ValidationPipe` próbuje przepuścić przez nie surowe ciało przez
// class-transformer i wybucha na wewnętrznej strukturze Zoda.
type Credentials = z.output<typeof credentialsSchema>;

@ApiTags('internal')
@Controller('internal/v1')
export class InternalTokenController {
  constructor(
    @Inject(SERVICE_CLIENTS) private readonly clients: ServiceClients,
    private readonly issuer: TokenIssuer,
  ) {}

  @Post('token')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit('ip')
  async token(
    @Body(new ZodPipe(credentialsSchema)) body: Credentials,
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const client = this.clients.authenticate(body.clientId, body.clientSecret);
    if (!client) {
      throw new UnauthorizedException('Błędne dane klienta');
    }
    const { token, expiresAt } = await this.issuer.service(client.worldSlug);
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }
}
