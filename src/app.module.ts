// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
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
import { TiposVigenciaModule } from './parametrizacion/tipos-vigencia/tipos-vigencia.module';
import { EstadosModule } from './parametrizacion/estados/estados.module';
import { NotificacionesParamModule } from './parametrizacion/notificaciones/notificaciones.module';
import { CorreosPorRolModule } from './parametrizacion/correos-por-rol/correos-por-rol.module';
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
import { PedidosModule } from './pedidos/pedidos.module';
import { RemisionesModule } from './remisiones/remisiones.module';
import { FacturasModule } from './facturas/facturas.module';
import { ExistenciasModule } from './existencias/existencias.module';
import { CarteraModule } from './cartera/cartera.module';
import { UnoModule } from './integraciones/uno/uno.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // carga .env
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
    FormularioPreguntasModule,
    FormulariosModule,
    FormularioSeccionesModule,
    FormularioTiposPreguntaModule,
    TiposDocumentosModule,
    TiposVigenciaModule,
    EstadosModule,
    NotificacionesParamModule,
    CorreosPorRolModule,
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
    PedidosModule,
    RemisionesModule,
    FacturasModule,
    ExistenciasModule,
    CarteraModule,
    UnoModule,
  ],
})
export class AppModule {}
