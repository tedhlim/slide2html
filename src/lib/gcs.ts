import { Storage } from '@google-cloud/storage';

// Initialize storage client
// It automatically picks up credentials if GOOGLE_APPLICATION_CREDENTIALS is set
// or if GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY, and GCS_PROJECT_ID are passed directly
// as environment variables.
const getGCSClient = () => {
  if (process.env.GCS_PRIVATE_KEY) {
    return new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
    });
  }
  
  // Fallback to default credentials (e.g. if running in GCP environment or GOOGLE_APPLICATION_CREDENTIALS is set)
  return new Storage();
};

export const storage = getGCSClient();

export const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'slide-html-documents';
export const getBucket = () => storage.bucket(BUCKET_NAME);
