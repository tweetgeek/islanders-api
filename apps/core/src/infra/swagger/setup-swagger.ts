import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Dokumentuje kontrakt, nie definiuje go: kształt JSON-a dyktuje klient, a sprawdzają testy e2e. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Islanders API')
    .setDescription(
      'Backend gry Islanders. Wszystkie trasy poza /auth/* i /health wymagają Bearer JWT.',
    )
    .setVersion('1')
    .addBearerAuth()
    .addTag('health')
    .addTag('auth')
    .addTag('worlds')
    .addTag('settlements')
    .addTag('fleets')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
