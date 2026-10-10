import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Plain-language messages for unique fields people fill in.
const DUPLICATE_MESSAGES = {
  email: 'An account with this email already exists. Use a different email.',
  employeeCode: 'This employee code is already in use. Choose a different code.'
};

export function notFound(request, _response, next) {
  next(new HttpError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument signature.
export function errorHandler(error, _request, response, _next) {
  let status = error.status ?? 500;
  let message = error.message;
  let details = error.details;

  if (error instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = error.issues.map(({ path, message: issue }) => ({ field: path.join('.'), message: issue }));
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${error.path}`;
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 400;
    details = Object.values(error.errors).map(({ path, message: issue }) => ({ field: path, message: issue }));
  } else if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyValue ?? {})[0];
    message = DUPLICATE_MESSAGES[field] ?? `Duplicate value for ${field ?? 'unique field'}`;
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    console.error(error);
    if (env.NODE_ENV === 'production') message = 'Internal server error';
  }

  response.status(status).json({ error: { message, ...(details && { details }) } });
}
