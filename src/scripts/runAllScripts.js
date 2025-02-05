const { uploadSwatches } = require('./uploadSwatchesToContentful');
const { uploadAccessoryImages } = require('./uploadAccessoryImagesToContentful');
const { uploadDeviceImages } = require('./uploadImagesToContentful');

async function runAllScripts() {
  try {
    uploadAccessoryImages();
    await uploadSwatches();
    await uploadDeviceImages();
    console.log("All scripts completed.");
  } catch (error) {
    console.error("Error running scripts:", error);
    process.exit(1);
  }
}

runAllScripts();