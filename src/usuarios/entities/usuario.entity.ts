// src/users/usuario.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UsuariosCentrosEntity } from './usuarios-centros.entity';

@Entity('usuarios')
export class UsuarioEntity {
  @PrimaryGeneratedColumn({ name: 'usr_id' })
  usr_id: number;

  @Column({ name: 'usr_id_usuario', type: 'varchar', length: 30 })
  usr_id_usuario: string;

  @Column({ name: 'usr_nombre', type: 'varchar', length: 150 })
  usr_nombre: string;

  @Column({ name: 'usr_correo', type: 'varchar', length: 150, nullable: true })
  usr_correo: string;

  @Column({ name: 'usr_password', type: 'varchar', length: 200 })
  usr_password: string;

  @Column({ name: 'usr_estado', type: 'varchar', length: 1 })
  usr_estado: string;

  @Column({ name: 'usr_inactivar', type: 'bit', default: false })
  usr_inactivar: boolean;

  @Column({ name: 'usr_ejecutivo', type: 'bit', default: false })
  usr_ejecutivo: boolean;

  @Column({ name: 'usr_usuario', type: 'varchar', length: 30, nullable: true })
  usr_usuario: string;

  @Column({ name: 'usr_recupera_todo', type: 'bit', default: false })
  usr_recupera_todo: boolean;

  @Column({ name: 'usr_exportacion', type: 'bit', default: false })
  usr_exportacion: boolean;

  @Column({ name: 'usr_elimina_cliente', type: 'bit', default: false })
  usr_elimina_cliente: boolean;

  @Column({ name: 'usr_acceso_portal_clientes', type: 'bit', nullable: true })
  usr_acceso_portal_clientes: boolean;

  @Column({ name: 'usr_fecha_usr', type: 'datetime' })
  usr_fecha_usr: Date;

  @Column({ name: 'ejng_id', type: 'int', nullable: true })
  ejng_id: number;

  @OneToMany(() => UsuariosCentrosEntity, (uc) => uc.uco_usr_id)
  centros: UsuariosCentrosEntity[];
}
