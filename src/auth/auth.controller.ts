// backend/src/auth/auth.controller.ts
import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    
    console.log('Backed auth.controller : ', body);
    const { identifier, password, accessType } = body;
    this.logger.log(`Login attempt: ${identifier} (${accessType})`);

    try {
      const result = await this.authService.loginWithAccessType(
        identifier,
        password,
        accessType,
      );
      this.logger.log(`Login successful: ${identifier}`);
      return result;
    } catch (error) {
      this.logger.warn(`Login failed for ${identifier}: ${error.message}`);
      throw error;
    }
  }
}
