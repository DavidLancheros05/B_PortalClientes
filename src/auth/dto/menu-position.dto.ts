import { IsIn } from 'class-validator';

export class MenuPositionDto {
  @IsIn(['top', 'left'])
  position: 'top' | 'left';
}
