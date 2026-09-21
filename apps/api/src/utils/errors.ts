export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super('BAD_REQUEST', message, 400);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(serviceName: string) {
    super(`${serviceName.toUpperCase()}_UNAVAILABLE`, `${serviceName} service unavailable`, 503);
  }
}
