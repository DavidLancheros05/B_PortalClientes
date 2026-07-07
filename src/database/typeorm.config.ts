import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UsuarioEntity } from 'src/usuarios/entities/usuario.entity';
import { RolEntity } from '../roles/entities/rol.entity';
// importa los demás entities que tengas

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'mssql',
  host: 'localhost',
  port: 1433,
  database: 'SistemaComercial',
  username: 'sa',
  password: '123456',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  entities: [UsuarioEntity, RolEntity],
  synchronize: false, // 👈 MUY IMPORTANTE
};
