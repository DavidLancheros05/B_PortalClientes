// backend/src/main.ts
import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import cookieParser from 'cookie-parser';
import { LogExceptionsFilter } from './common/filters/log-exceptions.filter';

async function bootstrap() {
  const expressApp = express();
  expressApp.use(cookieParser());
  expressApp.use(express.json({ limit: '25mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // 🔵 MIDDLEWARE GLOBAL: Log todas las solicitudes - ACTIVADO para debugging
  expressApp.use((req, res, next) => {
    console.log(
      `\n🔵 [MIDDLEWARE] ${new Date().toISOString()} ${req.method} ${req.url}`,
    );
    console.log(`🔵 [MIDDLEWARE] Query params:`, req.query);
    console.log(`🔵 [MIDDLEWARE] Headers:`, {
      authorization: req.headers.authorization ? '✓ Present' : '✗ Missing',
      'content-type': req.headers['content-type'],
    });
    console.log(`🔵 [MIDDLEWARE] Body:`, JSON.stringify(req.body, null, 2));
    next();
  });

  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new LogExceptionsFilter(httpAdapter));

  const port = process.env.PORT || 3001;

  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  await app.listen(port);
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
