// backend/src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

type CorreoOptions = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  /** "Nombre <correo@dominio.com>" -> { name, email }. Usada tanto por SMTP como por Brevo. */
  private parseFrom(from: string) {
    const match = from.match(/^(.*)<(.+)>$/);
    if (match) {
      return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
    }
    return { name: undefined, email: from.trim() };
  }

  private getSmtpConfig() {
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

  private getBrevoConfig() {
    const apiKey = String(process.env.BREVO_API_KEY || '').trim();
    const from = String(process.env.SMTP_FROM || '').trim();

    const missing: string[] = [];
    if (!apiKey) missing.push('BREVO_API_KEY');
    if (!from) missing.push('SMTP_FROM');

    if (missing.length > 0) {
      throw new Error(`Configuracion Brevo incompleta: ${missing.join(', ')}`);
    }

    return { apiKey, sender: this.parseFrom(from) };
  }

  private getTransporter() {
    if (this.transporter) return this.transporter;

    const smtp = this.getSmtpConfig();

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

  private async enviarPorSmtp(options: CorreoOptions) {
    const transporter = this.getTransporter();
    const smtp = this.getSmtpConfig();

    await transporter.sendMail({
      from: smtp.from,
      to: options.to,
      cc: options.cc,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
  }

  private async enviarPorBrevo(options: CorreoOptions) {
    const { apiKey, sender } = this.getBrevoConfig();

    await axios.post(
      BREVO_API_URL,
      {
        sender,
        to: [{ email: options.to }],
        cc: options.cc ? [{ email: options.cc }] : undefined,
        subject: options.subject,
        htmlContent: options.html,
        attachment: options.attachments?.map((a) => ({
          name: a.filename,
          content: a.content.toString('base64'),
        })),
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
  }

  async enviarCorreo(options: CorreoOptions) {
    const provider = String(process.env.MAIL_PROVIDER || 'smtp')
      .toLowerCase()
      .trim();

    try {
      if (provider === 'brevo') {
        await this.enviarPorBrevo(options);
      } else {
        await this.enviarPorSmtp(options);
      }
      this.logger.log(`Correo enviado a ${options.to} (proveedor: ${provider})`);
    } catch (error) {
      this.logger.error('Error enviando correo:', error);
      throw error;
    }
  }
}
