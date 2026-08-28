import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 500, isOperational = true, errors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: unknown;
  stack?: string;
}

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError || process.env.NODE_ENV !== 'production' 
    ? err.message 
    : 'Internal Server Error';

  const isDevelopment = process.env.NODE_ENV === 'development';

  const responsePayload: ErrorResponse = {
    success: false,
    statusCode,
    message,
    ...(isAppError && err.errors ? { errors: err.errors } : {}),
    ...(isDevelopment && { stack: err.stack }),
  };

  res.status(statusCode).json(responsePayload);
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};
