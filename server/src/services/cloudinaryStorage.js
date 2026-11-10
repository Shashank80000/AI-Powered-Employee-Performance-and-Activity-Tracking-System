import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errorMiddleware.js';

// Screenshots are uploaded as "authenticated" images: Cloudinary serves them only through a signed URL that the
// server builds, so nobody can open one by guessing its address. Browsers still get the bytes from the API.
const DELIVERY = { type: 'authenticated', resource_type: 'image' };

export const cloudinaryEnabled = Boolean(env.CLOUDINARY_URL);

if (cloudinaryEnabled) {
  const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(env.CLOUDINARY_URL);
  cloudinary.config({ cloud_name: cloudName, api_key: decodeURIComponent(apiKey), api_secret: decodeURIComponent(apiSecret), secure: true });
}

/** Uploads a JPEG and returns its public id. */
export function uploadImage(publicId, buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ ...DELIVERY, public_id: `${env.CLOUDINARY_FOLDER}/${publicId}`, overwrite: false }, (error, result) => {
        if (!error) return resolve(result.public_id);
        // "Invalid image file": the body starts like a JPEG but is not one, which is the uploader's fault.
        if (/invalid image/i.test(error.message)) return reject(new HttpError(400, 'Body must be a JPEG image'));
        reject(new Error(`Cloudinary upload failed: ${error.message}`));
      })
      .end(buffer);
  });
}

/** Image bytes, or null when Cloudinary no longer has the image. */
export async function downloadImage(publicId) {
  const url = cloudinary.url(publicId, { ...DELIVERY, format: 'jpg', sign_url: true, secure: true });
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cloudinary download failed with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Deletes the image (and any cached copy on the CDN). Deleting one that is already gone is not an error. */
export async function destroyImage(publicId) {
  const result = await cloudinary.uploader.destroy(publicId, { ...DELIVERY, invalidate: true });
  if (result.result !== 'ok' && result.result !== 'not found') throw new Error(`Cloudinary delete failed: ${result.result}`);
}
