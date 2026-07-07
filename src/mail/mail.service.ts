// backend/src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getRequiredEnv() {
    const config = {
      host: String(process.env.SMTP_HOST || '').trim(),
      port: Number(process.env.SMTP_PORT || 587),
      user: String(process.env.SMTP_USER || '').trim(),
      pass: String(process.env.SMTP_PASS || '').trim(),
      from: String(process.env.SMTP_FROM || '').trim(),
      secure:
        String(process.env.SMTP_SECURE || '')
          .toLowerCase()
          .trim() === 'true' ||
        String(process.env.SMTP_SECURE || '').trim() === '1',
    };

    const missing: string[] = [];
    if (!config.host) missing.push('SMTP_HOST');
    if (!Number.isFinite(config.port) || config.port <= 0)
      missing.push('SMTP_PORT');
    if (!config.user) missing.push('SMTP_USER');
    if (!config.pass) missing.push('SMTP_PASS');
    if (!config.from) missing.push('SMTP_FROM');

    if (missing.length > 0) {
      throw new Error(`Configuracion SMTP incompleta: ${missing.join(', ')}`);
    }

    return config;
  }

  private getTransporter() {
    if (this.transporter) return this.transporter;

    const smtp = this.getRequiredEnv();

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    return this.transporter;
  }

  async enviarCorreo(options: {
    to: string;
    cc?: string;
    subject: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
  }) {
    try {
      const transporter = this.getTransporter();
      const smtp = this.getRequiredEnv();

      await transporter.sendMail({
        from: smtp.from,
        to: options.to,
        cc: options.cc,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });
      this.logger.log(`Correo enviado a ${options.to}`);
    } catch (error) {
      this.logger.error('Error enviando correo:', error);
      throw error;
    }
  }
}
