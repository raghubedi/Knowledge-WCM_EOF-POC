const fs = require("fs");
const path = require("path");
const { getContentfulEnvironment } = require("../contentful/ContentfulEnv");

const projectRoot = path.resolve(__dirname, '../..');
console.log(`projectRoot: ${projectRoot}`);
const SWATCH_IMAGE_FOLDER_PATH = path.join(projectRoot, 'DeviceImages/swatches');
console.log(`SWATCH_IMAGE_FOLDER_PATH: ${SWATCH_IMAGE_FOLDER_PATH}`);

async function uploadSwatchesToContentful() {
  console.log("Uploading Swatch Images start...");
  try {
    const environment = await getContentfulEnvironment();

    const files = fs.readdirSync(SWATCH_IMAGE_FOLDER_PATH).filter((file) =>
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );

    if (files.length === 0) {
      console.log("❌ No Swatch images found in the folder!");
      return;
    }

    for (const file of files) {
      console.log(`📤 Processing: ${file}`);
      await checkAndUploadImage(environment, SWATCH_IMAGE_FOLDER_PATH, file);
    }

    console.log("✅ All Swatch images uploaded and entries created successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

async function checkAndUploadImage(environment, imagesPath, filePath) {
  console.log(`checkAndUploadImage --> filePath :: ${filePath}`);
  const fileName = path.basename(filePath);
  console.log(`checkAndUploadImage --> fileName :: ${fileName}`);
  let imageTitle = path.basename(fileName, path.extname(fileName));
  console.log(`checkAndUploadImage --> imageTitle :: ${imageTitle}`);
  
  try {
    const assets = await environment.getAssets({ "fields.title[match]": imageTitle });
    let asset = assets.items.length > 0 ? assets.items[0] : null;

    if (asset) {
      console.log(`🔄 Image already exists: ${imageTitle}. Updating...`);
      
      // Check if the asset is already processed by verifying the URL
      const isProcessed = asset.fields?.file?.["en-CA"]?.url;
      
      if (!isProcessed) {
        console.log(`📤 Processing Image: ${imageTitle}`);
        asset = await environment.getAsset(asset.sys.id);
        asset.fields.file["en-CA"] = {
          contentType: getContentType(filePath),
          fileName: fileName,
          file: fs.createReadStream(path.join(imagesPath, filePath)),
        };
  
        asset = await asset.update();
        await asset.processForLocale("en-CA");
        await asset.publish();
      } else {
        console.log(`✅ Image ${imageTitle} is already processed. Skipping processing.`);
      }
      
      return asset.sys.id;
    } else {
      console.log(`📤 Uploading new Image: ${imageTitle}`);
      const fileStream = fs.createReadStream(path.join(imagesPath, filePath));
      asset = await environment.createAssetFromFiles({
        fields: {
          title: { "en-CA": imageTitle },
          file: {
            "en-CA": {
              contentType: getContentType(filePath),
              fileName: fileName,
              file: fileStream,
            }
          }
        }
      });

      await asset.processForLocale("en-CA");
      await waitForProcessing(asset, environment);
      asset = await environment.getAsset(asset.sys.id);
      await asset.publish();
    }

    console.log(`✅ Image uploaded & published: ${imageTitle} (Asset ID: ${asset.sys.id})`);
    return asset.sys.id;
  } catch (error) {
    console.error(`❌ Error uploading ${fileName}:`, error);
  }
}

async function waitForProcessing(asset, environment) {
  console.log(`Inside waitForProcessing for asset ${asset.sys.id}`);
  let maxRetries = 10;
  let retryCount = 0;
  let processed = false;

  while (retryCount < maxRetries && !processed) {
    console.log(`RetryCount: ${retryCount}, MaxRetries: ${maxRetries}, Processed: ${processed}`)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const updatedAsset = await environment.getAsset(asset.sys.id);
    if (updatedAsset.fields.file["en-CA"].url) {
      processed = true;
    }
    retryCount++;
  }

  if (!processed) {
    console.warn(`⚠️ Asset processing took too long: ${asset.sys.id}`);
  }
}

function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif"
    };
  return types[ext] || "application/octet-stream";
}

uploadSwatchesToContentful();