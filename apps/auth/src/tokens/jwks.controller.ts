import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

@ApiTags('auth')
@Controller('.well-known')
export class JwksController {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks(): SigningKeys['jwks'] {
    return this.keys.jwks;
  }
}
