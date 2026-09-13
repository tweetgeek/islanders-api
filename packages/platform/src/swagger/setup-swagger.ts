import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SwaggerOptions {
  title: string;
  description: string;
  tags: string[];
  /** Ścieżka UI, np. `api/docs`; JSON leży pod `<path>-json`. */
  path: string;
}

/** Dokumentuje kontrakt, nie definiuje go: kształt JSON-a sprawdzają testy e2e. */
export function setupSwagger(app: INestApplication, options: SwaggerOptions): void {
  let builder = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion('1')
    .addBearerAuth();
  for (const tag of options.tags) builder = builder.addTag(tag);
  const document = SwaggerModule.createDocument(app, builder.build());
  SwaggerModule.setup(options.path, app, document, {
    jsonDocumentUrl: `${options.path}-json`,
  });
}
