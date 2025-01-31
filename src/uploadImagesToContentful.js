const fs = require("fs");
const path = require("path");
const contentful = require("contentful-management");

const SPACE_ID = process.env.SPACE_ID;
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const CONTENT_TYPE_ID = "tiqImageTemplate2";
const __dirname = "C:/GCP_projects/Contentful/nodeJS-POC/Knowledge-WCM_EOF-POC/DeviceImages/"
const LARGE_IMAGE_FOLDER_PATH = path.join(__dirname, "images/200");
const MEDIUM_IMAGE_FOLDER_PATH = path.join(__dirname, "images/100");
const SMALL_IMAGE_FOLDER_PATH = path.join(__dirname, "images/65");

const client = contentful.createClient({
  accessToken: ACCESS_TOKEN,
});

async function uploadImagesToContentful(imagesPath) {
  console.log("Uploading Images start...");
  try {
    const space = await client.getSpace(SPACE_ID);
    const environment = await space.getEnvironment(ENVIRONMENT_ID);

    const files = fs.readdirSync(imagesPath).filter((file) =>
      /\.(jpg|jpeg|png)$/i.test(file)
    );

    if (files.length === 0) {
      console.log("❌ No images found in the folder!");
      return;
    }

    for (const file of files) {
      console.log(`📤 Processing: ${file}`);
      const assetId = await checkAndUploadImage(environment, imagesPath, file);
      if (assetId) {
        await createOrUpdateImageContent(environment, assetId, imagesPath, file);
      }
    }

    console.log("✅ All images uploaded and entries created successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

async function checkAndUploadImage(environment, imagesPath, filePath) {
  console.log(`checkAndUploadImage --> filePath :: ${filePath}`);
  const fileName = path.basename(filePath);
  console.log(`checkAndUploadImage --> fileName :: ${fileName}`);
  let imageTitle = path.basename(fileName, path.extname(fileName));
  if (imagesPath === LARGE_IMAGE_FOLDER_PATH) {
    imageTitle = imageTitle + '-Large';
  } else if (imagesPath === MEDIUM_IMAGE_FOLDER_PATH) {
    imageTitle = imageTitle + '-Medium';
  } else if (imagesPath === SMALL_IMAGE_FOLDER_PATH) {
    imageTitle = imageTitle + '-Small';
  }
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


async function createOrUpdateImageContent(environment, assetId, imagesPath, fileName) {
  const skuCd = path.basename(fileName, path.extname(fileName));
  console.log(`Inside createOrUpdateImageContent ... with skuCd: ${skuCd}, imagesPath: ${imagesPath}`);

  try {
    // Check if entry already exists
    const entries = await environment.getEntries({ 
      content_type: CONTENT_TYPE_ID, // Ensure Content Type's skuCode is included
      "fields.skuCode[match]": skuCd 
    });
    
    let entry = entries.items.length > 0 ? entries.items[0] : null;

    if (entry) {
      console.log(`🔄 Entry already exists for ${skuCd}. Updating...`);
      console.log(`Inside createOrUpdateImageContent ... with skuCd: ${skuCd}`);
      if (imagesPath === LARGE_IMAGE_FOLDER_PATH) {
        entry.fields.largeImage["en-CA"] = { sys: { type: "Link", linkType: "Asset", id: assetId } };
      } else if (imagesPath === MEDIUM_IMAGE_FOLDER_PATH) {
        entry.fields.mediumImage["en-CA"] = { sys: { type: "Link", linkType: "Asset", id: assetId } };
      } else if (imagesPath === SMALL_IMAGE_FOLDER_PATH) {
        entry.fields.smallImage["en-CA"] = { sys: { type: "Link", linkType: "Asset", id: assetId } };
      }
      entry = await entry.update();
    } else {
      console.log(`📤 Creating new entry for ${skuCd}`);
      if (imagesPath === LARGE_IMAGE_FOLDER_PATH) {
        entry = await environment.createEntry(CONTENT_TYPE_ID, {
          fields: {
            id: { "en-CA": skuCd },
            skuCode: { "en-CA": skuCd },
            largeImage: { "en-CA": { sys: { type: "Link", linkType: "Asset", id: assetId } } },
            mediumImage: { "en-CA": { sys: { type: "Link", linkType: "Asset" } } },
            smallImage: { "en-CA": { sys: { type: "Link", linkType: "Asset"} } },
          },
        });
      } else if (imagesPath === MEDIUM_IMAGE_FOLDER_PATH) {
        entry = await environment.createEntry(CONTENT_TYPE_ID, {
          fields: {
            id: { "en-CA": skuCd },
            skuCode: { "en-CA": skuCd },
            largeImage: { "en-CA": { sys: { type: "Link", linkType: "Asset"} } },
            mediumImage: { "en-CA": { sys: { type: "Link", linkType: "Asset", id: assetId } } },
            smallImage: { "en-CA": { sys: { type: "Link", linkType: "Asset" } } },
          },
        });
      } else if (imagesPath === SMALL_IMAGE_FOLDER_PATH) {
        entry = await environment.createEntry(CONTENT_TYPE_ID, {
          fields: {
            id: { "en-CA": skuCd },
            skuCode: { "en-CA": skuCd },
            largeImage: { "en-CA": { sys: { type: "Link", linkType: "Asset"} } },
            mediumImage: { "en-CA": { sys: { type: "Link", linkType: "Asset"} } },
            smallImage: { "en-CA": { sys: { type: "Link", linkType: "Asset", id: assetId } } },
          },
        });
      }
      
    }
    console.log(`Entry: ${JSON.stringify(entry)}`)

    await entry.publish();
    console.log(`✅ Entry created & published with image: ${skuCd}`);
  } catch (error) {
    console.error(`❌ Error creating/updating entry for ${skuCd}:`, error);
  }
}

function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
  return types[ext] || "application/octet-stream";
}

const runUploadImagesProgram = async() => {
  await uploadImagesToContentful(LARGE_IMAGE_FOLDER_PATH);
  await uploadImagesToContentful(MEDIUM_IMAGE_FOLDER_PATH);
  await uploadImagesToContentful(SMALL_IMAGE_FOLDER_PATH);
}

runUploadImagesProgram();
