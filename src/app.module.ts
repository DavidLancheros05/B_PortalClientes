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
import { RolesModule } from './roles/roles.module';
import { UsuarioRolesModule } from './usuario-roles/usuario-roles.module';
import { ConsecutivosModule } from './consecutivos/consecutivos.module';
import { CartaPdfVinculacionModule } from './parametrizacion/carta-pdf-vinculacion/carta-pdf-vinculacion.module';
import { AmpliacionCupoModule } from './ampliacion-cupo/ampliacion-cupo.module';
import { ClienteArchivoModule } from './cliente-archivo/cliente-archivo.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { RemisionesModule } from './remisiones/remisiones.module';
import { FacturasModule } from './facturas/facturas.module';
import { ExistenciasModule } from './existencias/existencias.module';
import { CarteraModule } from './cartera/cartera.module';
import { UnoModule } from './integraciones/uno/uno.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // carga .env
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'mssql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: false, // <-- importante
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      pool: {
        max: 10,
        min: 1, // mantener al menos una conexion viva, evita reconectar (~900ms) en cada request tras inactividad
        idleTimeoutMillis: 300000,
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
    RolesModule,
    UsuarioRolesModule,
    ConsecutivosModule,
    CartaPdfVinculacionModule,
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
