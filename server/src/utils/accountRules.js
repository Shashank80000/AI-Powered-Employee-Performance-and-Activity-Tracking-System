import { z } from 'zod';

// Shared by every form that creates an account or sets a password, so the rules and messages match.
export const nameField = z.string().trim().min(2, 'Enter a name of at least 2 characters').max(80, 'Keep the name under 80 characters');
export const emailField = z.string().trim().toLowerCase().email('Enter a valid email address, like name@company.com');
export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters for the password')
  .max(128, 'Keep the password under 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter in the password')
  .regex(/\d/, 'Include at least one number in the password');
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
