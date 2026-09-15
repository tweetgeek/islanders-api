import { Inject, Injectable } from '@nestjs/common';
import { worldRegistrationSchema, worldSlugSchema } from '@islanders/contracts';
import { DB, type Db } from '../infra/db/db.module.js';
import { isUniqueViolation } from '../infra/db/pg-errors.js';
import { type InitWorldInput, WorldSettingsRepository, type WorldSettingsRow } from './world-settings.repository.js';

export class WorldAlreadyInitializedError extends Error {
  constructor(slug: string) {
    super(`Ta baza ma już świat ${slug}`);
    this.name = 'WorldAlreadyInitializedError';
  }
}

export class InvalidWorldInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorldInputError';
  }
}

@Injectable()
export class WorldInitService {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Świat powstaje w statusie DRAFT; otwarcie to osobna, świadoma operacja. */
  async init(input: InitWorldInput): Promise<WorldSettingsRow> {
    if (!worldSlugSchema.safeParse(input.slug).success) {
      throw new InvalidWorldInputError('slug: małe litery, cyfry i pojedyncze myślniki, 3–40 znaków');
    }
    if (!worldRegistrationSchema.shape.name.safeParse(input.name).success) {
      throw new InvalidWorldInputError('name: od 1 do 64 znaków');
    }
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2_147_483_647) {
      throw new InvalidWorldInputError('seed musi być liczbą całkowitą w [0, 2147483647]');
    }
    for (const [name, value] of [['width', input.width], ['height', input.height]] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new InvalidWorldInputError(`${name} musi być dodatnią liczbą całkowitą`);
      }
    }
    if (!Number.isFinite(input.windX) || !Number.isFinite(input.windY)) {
      throw new InvalidWorldInputError('wiatr musi mieć skończone składowe');
    }
    const existing = await this.worlds.find();
    if (existing) throw new WorldAlreadyInitializedError(existing.slug);
    try {
      return await this.worlds.insert(this.db, { ...input, status: 'DRAFT' });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new WorldAlreadyInitializedError((await this.worlds.find())?.slug ?? '?');
      }
      throw err;
    }
  }
}
