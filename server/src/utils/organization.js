/**
 * Organization scoping. A missing `organization` means the original organization (data from before registration
 * existed), and MongoDB's `{ organization: null }` matches documents without the field, so it needs no migration.
 */

/** Filter for documents in the same organization as `user`. */
export const sameOrganization = (user) => ({ organization: user.organization ?? null });

/** Fields that put a new document in `user`'s organization. */
export const inOrganization = (user) => (user.organization ? { organization: user.organization } : {});
