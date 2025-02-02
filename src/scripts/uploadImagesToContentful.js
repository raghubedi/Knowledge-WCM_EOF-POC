const fs = require("fs");
const path = require("path");
const { getContentfulEnvironment } = require("../contentful/ContentfulEnv");
const {productCodeToColor} = require("../constants/constants");

const CONTENT_TYPE_ID = "tiqImageTemplate";

const projectRoot = path.resolve(__dirname, '../..');
console.log(`projectRoot: ${projectRoot}`);
const LARGE_IMAGE_FOLDER_PATH = path.join(projectRoot, 'DeviceImages/200');
const MEDIUM_IMAGE_FOLDER_PATH = path.join(projectRoot, 'DeviceImages/100');
const SMALL_IMAGE_FOLDER_PATH = path.join(projectRoot, 'DeviceImages/65');

const getSizeLabel = (imagesPath) => {
  let sizeLabel;
  if (imagesPath === LARGE_IMAGE_FOLDER_PATH) {
    sizeLabel = 'large';
  } else if (imagesPath === MEDIUM_IMAGE_FOLDER_PATH) {
    sizeLabel = 'medium';
  } else if (imagesPath === SMALL_IMAGE_FOLDER_PATH) {
    sizeLabel = 'small';
  }
  return sizeLabel;
}
async function uploadImagesToContentful(imagesPath) {
  console.log("Uploading Images start...");
  const uploadFromDate = process.env.UPLOAD_FROM_DATE+'T00:00:00.000Z' || "2025-02-02T00:00:00.000Z";
  const uploadFromTimestamp = new Date(uploadFromDate).getTime();
  console.log(`Uploading Images created on or after ${uploadFromDate}`);
  console.log(`uploadFromTimestamp ${uploadFromTimestamp}`);
  try {
    const environment = await getContentfulEnvironment();

    const files = fs.readdirSync(imagesPath).filter((file) => {
      const filePath = path.join(imagesPath, file);
      const stats = fs.statSync(filePath);
      console.log(`stats : ${JSON.stringify(stats)}`)
      console.log(`stats.birthtime.getTime : ${stats.birthtime.getTime()}`)
      return (
        /\.(jpg|jpeg|png|gif)$/i.test(file) &&
        stats.birthtime.getTime() >= uploadFromTimestamp
      );
    });

    if (files.length === 0) {
      console.log(`❌ No images found after date ${uploadFromDate}`);
      return;
    }

    for (const file of files) {
      console.log(`📤 Processing: ${file}`);
      const assetId = await checkAndUploadImage(environment, imagesPath, file);
      if (assetId) {
        await createOrUpdateImageContent(environment, assetId, getSizeLabel(imagesPath), file);
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


async function createOrUpdateImageContent(environment, assetId, sizeLabel, fileName) {
  const skuCd = path.basename(fileName, path.extname(fileName));
  console.log(`Inside createOrUpdateImageContent ... with skuCd: ${skuCd}, sizeLabel: ${sizeLabel}`);

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
      
      entry.fields[`${sizeLabel}Image`] = { "en-CA": { sys: { type: "Link", linkType: "Asset", id: assetId } } };
      entry = await entry.update();
    } else {
      console.log(`📤 Creating new entry for ${skuCd}`);
      entry = await environment.createEntry(CONTENT_TYPE_ID, {
        fields: {
          id: { "en-CA": skuCd },
          skuCode: { "en-CA": skuCd },
          largeImage: { "en-CA": sizeLabel === "large" ? { sys: { type: "Link", linkType: "Asset", id: assetId } } : { sys: { type: "Link", linkType: "Asset"} } },
          mediumImage: { "en-CA": sizeLabel === "medium" ? { sys: { type: "Link", linkType: "Asset", id: assetId } } : { sys: { type: "Link", linkType: "Asset"} } },
          smallImage: { "en-CA": sizeLabel === "small" ? { sys: { type: "Link", linkType: "Asset", id: assetId } } : { sys: { type: "Link", linkType: "Asset"} } },
        },
      });
    }

    console.log(`Entry: ${JSON.stringify(entry)}`)
    if (!entry?.fields?.swatchImage) {
      console.log('SWATCH NEEDS TO BE CREATED!!');
      const swatchAsset = await getSwatchImageBySkuCode(environment, skuCd);
      if (swatchAsset) {
        console.log(`swatchAsset: ${swatchAsset?.sys?.id}`)
        entry.fields[`swatchImage`] = { "en-CA": { sys: { type: "Link", linkType: "Asset", id: swatchAsset.sys.id } } };
        entry = await entry.update();
        console.log(`✅ Swatch Created !!`);
      } else {
        console.log(`NO SWATCH ASSET`);
      }
    } else {
      console.log('SWATCH Already existing for this content!!')
    }
    await entry.publish();
    console.log(`✅ Entry created & published with image: ${skuCd}`);
  } catch (error) {
    console.error(`❌ Error creating/updating entry for ${skuCd}:`, error);
  }
}

const getSwatchImageBySkuCode = async (environment, skuCode) => {
  let productColorCode = "BK";
  
  const subCode = skuCode.slice(-2);
  console.log(`subCode: ${subCode}`)
  if (productCodeToColor.hasOwnProperty(subCode)) {
    productColorCode = subCode;
  }
  console.log(`productColorCode: ${productColorCode}`)
  const swatchImageTitle = productCodeToColor[productColorCode];
  console.log(`swatchImageTitle: ${swatchImageTitle}`)
  const assets = await environment.getAssets({ "fields.title[match]": swatchImageTitle });
  let asset = assets.items.length > 0 ? assets.items[0] : null;
  if (!asset) {
    console.log(`Swatch image doesnt exist for this Product : ${skuCode}`);
  }
  
  return asset;
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

const runUploadImagesProgram = async() => {
  await uploadImagesToContentful(LARGE_IMAGE_FOLDER_PATH);
  await uploadImagesToContentful(MEDIUM_IMAGE_FOLDER_PATH);
  await uploadImagesToContentful(SMALL_IMAGE_FOLDER_PATH);
}

runUploadImagesProgram();
