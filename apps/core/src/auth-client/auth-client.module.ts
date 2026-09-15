import { Module } from '@nestjs/common';
import { AuthClient } from './auth-client.js';

@Module({ providers: [AuthClient], exports: [AuthClient] })
export class AuthClientModule {}
