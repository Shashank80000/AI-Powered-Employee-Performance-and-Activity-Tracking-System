import { Activity } from '../models/Activity.js';
import { CameraObservation } from '../models/CameraObservation.js';
import { Employee } from '../models/Employee.js';

/**
 * Index changes an existing database needs, run at start-up. Idempotent. MongoDB can't change an index's options in
 * place, so an older non-unique index is replaced. Nothing is ever deleted to make an index fit: if existing records
 * already break a new rule, the old index stays and a warning says what to clean up.
 */
export const EMPLOYEE_CODE_COLLATION = { locale: 'en', strength: 2 };

async function replaceWithUnique(model, name, key, { collation, groupBy } = {}) {
  const collection = model.collection;
  const indexes = await collection.indexes().catch(() => []);
  const current = indexes.find((index) => index.name === name);
  if (current?.unique) return;

  const [duplicate] = await collection
    .aggregate([{ $group: { _id: groupBy, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }], collation ? { collation } : {})
    .toArray();
  if (duplicate) {
    console.warn(`Index ${model.modelName}.${name} not made unique: existing records share ${JSON.stringify(duplicate._id)}. Remove the duplicates and restart.`);
    return;
  }
  if (current) await collection.dropIndex(name);
  await collection.createIndex(key, { name, unique: true, ...(collation && { collation }) });
  console.log(`Index ${model.modelName}.${name} is now unique`);
}

export async function runMigrations() {
  await replaceWithUnique(Activity, 'employee_1_capturedAt_-1', { employee: 1, capturedAt: -1 }, { groupBy: { employee: '$employee', capturedAt: '$capturedAt' } });
  await replaceWithUnique(CameraObservation, 'employee_1_observedAt_-1', { employee: 1, observedAt: -1 }, { groupBy: { employee: '$employee', observedAt: '$observedAt' } });
  // Employee codes: unique within an organization, ignoring case (was: unique across every organization).
  await replaceWithUnique(Employee, 'organization_1_employeeCode_1', { organization: 1, employeeCode: 1 }, {
    collation: EMPLOYEE_CODE_COLLATION,
    groupBy: { organization: '$organization', employeeCode: '$employeeCode' }
  });
  const indexes = await Employee.collection.indexes().catch(() => []);
  const perOrganization = indexes.some((index) => index.name === 'organization_1_employeeCode_1' && index.unique);
  if (perOrganization && indexes.some((index) => index.name === 'employeeCode_1')) await Employee.collection.dropIndex('employeeCode_1');
}
