import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Wyłącza globalny JwtAuthGuard dla trasy albo całego kontrolera. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
