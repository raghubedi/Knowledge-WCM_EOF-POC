const contentful = require("contentful-management");

const SPACE_ID = process.env.SPACE_ID;
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const client = contentful.createClient({
  accessToken: ACCESS_TOKEN,
});

async function getContentfulEnvironment() {
  try {
    const space = await client.getSpace(SPACE_ID);
    const environment = await space.getEnvironment(ENVIRONMENT_ID);
    return environment;
  } catch (error) {
    console.error("❌ Error getting Contentful environment:", error);
    throw error;
  }
}

module.exports = { getContentfulEnvironment };
