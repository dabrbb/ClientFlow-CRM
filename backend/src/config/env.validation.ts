import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// A unit is required: jsonwebtoken parses expiresIn with "ms", which treats a
// bare numeric string as milliseconds, so "3600" would mean 3.6 seconds.
const DURATION_REGEX = /^\d+(ms|s|m|h|d|w|y)$/;

export class EnvironmentVariables {
  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must start with postgresql:// or postgres://',
  })
  DATABASE_URL!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv;

  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @Matches(DURATION_REGEX, {
    message: 'JWT_ACCESS_EXPIRES must look like 15m, 1h or 7d',
  })
  JWT_ACCESS_EXPIRES!: string;

  @Matches(DURATION_REGEX, {
    message: 'JWT_REFRESH_EXPIRES must look like 15m, 1h or 7d',
  })
  JWT_REFRESH_EXPIRES!: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    // Env values are always strings; implicit conversion uses the declared TS
    // type to turn PORT into a number before @IsInt() runs.
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    const details = errors
      .map((error) => `- ${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return validatedConfig;
}
