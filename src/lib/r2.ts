import { S3Client } from '@aws-sdk/client-s3'

// Singleton R2 client. Cloudflare R2 is S3-compatible; region must be 'auto'.
// Endpoint format: https://<account-id>.r2.cloudflarestorage.com
export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? 'slatesuite'
