const { Storage } = require('@google-cloud/storage');

async function testConnection() {
  try {
    console.log('Testing GCS connection using the provided JSON key...');
    const storage = new Storage({
      keyFilename: './aif-liveai-27950ee4d9a5.json'
    });

    console.log('Fetching buckets...');
    const [buckets] = await storage.getBuckets();
    console.log('Successfully connected!');
    console.log('Buckets available:');
    buckets.forEach(bucket => {
      console.log(` - ${bucket.name}`);
    });

    if (buckets.length > 0) {
      console.log('\n✅ Connection successful! The credentials work.');
    } else {
      console.log('\n✅ Connection successful, but you have no buckets created in this project yet.');
    }
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
  }
}

testConnection();
