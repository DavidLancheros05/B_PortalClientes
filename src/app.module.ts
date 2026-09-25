// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsModule } from './permissions/permissions.module';
import { ModulePermissionGuard } from './permissions/module-permission.guard';
import { UsuarioModule } from './usuarios/usuario.module';
import { UsuarioEntity } from './usuarios/entities/usuario.entity';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { ClientesModule } from './clientes/clientes.module';
import { MotivosRechazoModule } from './motivos-rechazo/motivos-rechazo.module';
import { DiasRespuestaModule } from './parametrizacion/dias-respuesta/dias-respuesta.module';
import { FormularioPreguntasModule } from './parametrizacion/formulario-preguntas/formulario-preguntas.module';
import { FormulariosModule } from './parametrizacion/formularios/formularios.module';
import { FormularioSeccionesModule } from './parametrizacion/formulario-secciones/formulario-secciones.module';
import { FormularioTiposPreguntaModule } from './parametrizacion/formulario-tipos-pregunta/formulario-tipos-pregunta.module';
import { TiposDocumentosModule } from './parametrizacion/tipos-documentos/tipos-documentos.module';
import { VariablesPlantillaModule } from './parametrizacion/variables-plantilla/variables-plantilla.module';
import { TiposVigenciaModule } from './parametrizacion/tipos-vigencia/tipos-vigencia.module';
import { TiposIdentificacionModule } from './tipos-identificacion/tipos-identificacion.module';
import { IndicadoresModule } from './indicadores/indicadores.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PqrsModule } from './pqrs/pqrs.module';
import { CondicionesFinancierasModule } from './condiciones-financieras/condiciones-financieras.module';
import { MaestrosModule } from './maestros/maestros.module';
import { FormularioModule } from './formulario/formulario.module';
import { CentrosOperacionModule } from './centros-operacion/centros-operacion.module';
import { ModulosModule } from './modulos/modulos.module';
import { SeguridadModule } from './seguridad/seguridad.module';
import { UsuarioRolesModule } from './usuario-roles/usuario-roles.module';
import { ConsecutivosModule } from './consecutivos/consecutivos.module';
import { AmpliacionCupoModule } from './ampliacion-cupo/ampliacion-cupo.module';
import { ClienteArchivoModule } from './cliente-archivo/cliente-archivo.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { RemisionesModule } from './remisiones/remisiones.module';
import { FacturasModule } from './facturas/facturas.module';
import { ExistenciasModule } from './existencias/existencias.module';
import { CarteraModule } from './cartera/cartera.module';
import { UnoModule } from './integraciones/uno/uno.module';

const resolveDbConfig = () => {
  const appEnv = (process.env.APP_ENV || 'development').toLowerCase();

  const envKey =
    {
      development: 'DEV',
      test: 'TEST',
      production: 'PROD',
    }[appEnv] ?? 'DEV';

  const dbHost = process.env[`DB_HOST_${envKey}`] ?? process.env.DB_HOST;
  const dbPort = process.env[`DB_PORT_${envKey}`] ?? process.env.DB_PORT;
  const dbUser = process.env[`DB_USER_${envKey}`] ?? process.env.DB_USER;
  const dbPassword =
    process.env[`DB_PASSWORD_${envKey}`] ?? process.env.DB_PASSWORD;
  const dbName = process.env[`DB_NAME_${envKey}`] ?? process.env.DB_NAME;

  return {
    host: dbHost,
    port: dbPort ? Number(dbPort) : undefined,
    username: dbUser,
    password: dbPassword,
    database: dbName,
  };
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development', '.env.test', '.env.production'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const dbConfig = resolveDbConfig();

        if (
          !dbConfig.host ||
          !dbConfig.username ||
          !dbConfig.password ||
          !dbConfig.database
        ) {
          throw new Error(
            `Falta configuración de la base de datos para APP_ENV=${process.env.APP_ENV || 'development'}. ` +
              'Define DB_HOST_DEV/DB_USER_DEV/DB_PASSWORD_DEV/DB_NAME_DEV o DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.',
          );
        }

        return {
          type: 'mssql',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          options: {
            encrypt: true,
            trustServerCertificate: true,
          },
          pool: {
            // Conexiones simultáneas a la BD: es el techo de peticiones por
            // segundo del backend (ver documentacion/Portal Clientes/mejoras/
            // escalabilidad-rendimiento.md, prueba de carga). Subirlo solo
            // hasta donde el servidor de BD lo permita.
            max: Number(process.env.DB_POOL_MAX) || 10,
            min: 1,
            idleTimeoutMillis: 300000,
          },
        };
      },
    }),

    UsuarioModule,
    AuthModule,
    SolicitudesModule,
    ClientesModule,
    MotivosRechazoModule,
    DiasRespuestaModule,
    VariablesPlantillaModule,
    FormularioPreguntasModule,
    FormulariosModule,
    FormularioSeccionesModule,
    FormularioTiposPreguntaModule,
    TiposDocumentosModule,
    TiposVigenciaModule,
    TiposIdentificacionModule,
    IndicadoresModule,
    NotificacionesModule,
    PqrsModule,
    CondicionesFinancierasModule,
    MaestrosModule,
    FormularioModule,
    CentrosOperacionModule,
    ModulosModule,
    SeguridadModule,
    UsuarioRolesModule,
    ConsecutivosModule,
    AmpliacionCupoModule,
    ClienteArchivoModule,
    PedidosModule,
    RemisionesModule,
    FacturasModule,
    ExistenciasModule,
    CarteraModule,
    UnoModule,
    PermissionsModule,
  ],
  providers: [
    // Ola 1 de documentacion/plan-solucion-autorizacion-endpoints.md:
    // antes no había NINGÚN guard global — cada controller dependía de
    // acordarse de poner @UseGuards(JwtAuthGuard) a mano (varios no lo
    // tenían, ver auditoria-permisos-endpoints-backend.md). Ahora aplica a
    // toda la app por defecto; @Public() (auth/public.decorator.ts) es la
    // única forma de excluir un endpoint a propósito.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Ola 2: permisos finos por rol×módulo×acción, consultando
    // pc_rol_modulo (antes solo alimentaba el menú, nunca protegía nada).
    // Debe ir DESPUÉS del guard de arriba — necesita request.user ya
    // puesto. Es "opt-in": un endpoint sin @RequierePermiso(...) sigue
    // pasando igual que antes, así que activar esto no rompe nada hasta
    // que se empiece a decorar (ver ModulePermissionGuard).
    { provide: APP_GUARD, useClass: ModulePermissionGuard },
  ],
})
export class AppModule {}
