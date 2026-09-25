import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

// Conexión de solo consulta a la BD de SIESA (pedidos, remisiones, facturas,
// existencias, cartera). Ver documentacion/Portal Clientes/SIESA/
// conexion-siesa-consultas.md.
//
// No va en TypeOrmModule.forRoot a propósito: ese conecta al arrancar, y si
// SIESA no es alcanzable (ej. desde Render) no arrancaría el portal entero.
// Acá se conecta en la primera consulta; si falla, solo falla esa consulta.
@Injectable()
export class SiesaDbService implements OnModuleDestroy {
  private readonly logger = new Logger(SiesaDbService.name);
  private conexion: Promise<DataSource> | null = null;

  // Mismo criterio que resolveDbConfig en app.module.ts: primero la variable
  // con sufijo del entorno (SIESA_DB_HOST_DEV, ...), si no, la sin sufijo.
  private env(nombre: string): string | undefined {
    const appEnv = (process.env.APP_ENV || 'development').toLowerCase();
    const envKey =
      { development: 'DEV', test: 'TEST', production: 'PROD' }[appEnv] ??
      'DEV';
    return process.env[`${nombre}_${envKey}`] ?? process.env[nombre];
  }

  estaConfigurado(): boolean {
    return Boolean(
      this.env('SIESA_DB_HOST') &&
        this.env('SIESA_DB_USER') &&
        this.env('SIESA_DB_PASSWORD') &&
        this.env('SIESA_DB_NAME'),
    );
  }

  private obtenerConexion(): Promise<DataSource> {
    if (!this.conexion) {
      const port = this.env('SIESA_DB_PORT');
      const dataSource = new DataSource({
        type: 'mssql',
        host: this.env('SIESA_DB_HOST'),
        port: port ? Number(port) : undefined,
        username: this.env('SIESA_DB_USER'),
        password: this.env('SIESA_DB_PASSWORD'),
        database: this.env('SIESA_DB_NAME'),
        entities: [],
        synchronize: false,
        requestTimeout: Number(this.env('SIESA_DB_TIMEOUT_MS')) || 60000,
        options: { encrypt: true, trustServerCertificate: true },
        pool: {
          max: Number(this.env('SIESA_DB_POOL_MAX')) || 5,
          min: 0,
          idleTimeoutMillis: 300000,
        },
      });
      this.conexion = dataSource.initialize().catch((err) => {
        // Sin cachear el fallo: la siguiente consulta vuelve a intentar.
        this.conexion = null;
        throw err;
      });
    }
    return this.conexion;
  }

  async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.estaConfigurado()) {
      throw new ServiceUnavailableException('La conexión a SIESA no está configurada');
    }
    let dataSource: DataSource;
    try {
      dataSource = await this.obtenerConexion();
    } catch (err) {
      this.logger.error(`No se pudo conectar a SIESA: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo conectar a SIESA');
    }
    return dataSource.query(sql, params);
  }

  async onModuleDestroy() {
    if (this.conexion) {
      const dataSource = await this.conexion.catch(() => null);
      await dataSource?.destroy();
    }
  }
}
