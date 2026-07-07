// backend/src/users/dto/update-user.dto.ts
export class UpdateUserDto {
  nombre?: string;
  email?: string;
  password?: string;
  rol_id?: number;
  activo?: boolean;
}
