import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudEntity } from './entities/solicitud.entity';
import { UsuarioEntity } from 'src/usuarios/entities/usuario.entity';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesListadosService } from './solicitudes-listados.service';
import { SolicitudesRespuestasService } from './solicitudes-respuestas.service';
import { SolicitudesWorkflowService } from './solicitudes-workflow.service';
import { SolicitudesDocumentosService } from './solicitudes-documentos.service';
import { FormularioRenderizableService } from './formulario-renderizable.service';
import { SolicitudesController } from './solicitudes.controller';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { ClienteEntity } from 'src/clientes/entities/clientes.entity';
import { FormularioRespuestaEntity } from './entities/solicitud-respuesta.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowService } from './workflow.service';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudEntity]),
    AuthModule,
    MailModule,
    NotificacionesModule,
    WorkflowModule,
    StorageModule,
  ],
  controllers: [SolicitudesController], // <-- esto es clave
  providers: [
    SolicitudesService,
    SolicitudesListadosService,
    SolicitudesRespuestasService,
    SolicitudesWorkflowService,
    SolicitudesDocumentosService,
    FormularioRenderizableService,
    WorkflowService,
  ],
  exports: [
    SolicitudesService,
    SolicitudesListadosService,
    SolicitudesRespuestasService,
    SolicitudesWorkflowService,
    SolicitudesDocumentosService,
    FormularioRenderizableService,
  ],
})
export class SolicitudesModule {}
