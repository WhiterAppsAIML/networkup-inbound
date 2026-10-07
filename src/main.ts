import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { PinoLogger } from './common/logger';

async function bootstrap() {
  const logger = new PinoLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(logger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');
  app.use(new CorrelationIdMiddleware().use);

  const config = new DocumentBuilder()
    .setTitle('Inbound Automation API')
    .setDescription('LinkedIn engagement-triggered outreach automation API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'Health check endpoints')
    .addTag('Sender Accounts', 'LinkedIn sender account management')
    .addTag('Automations', '5-step builder automation configuration')
    .addTag('Leads', 'Lead lifecycle management')
    .addTag('Event Log', 'Audit trail for lead events')
    .addTag('Webhooks', 'LinkedIn webhook handlers')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();