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
    message = `Duplicate value for ${Object.keys(error.keyValue ?? {}).join(', ') || 'unique field'}`;
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
