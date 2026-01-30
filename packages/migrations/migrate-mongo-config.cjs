const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

let databaseName = "decision-copilot-local";
if (process.env.PROJECT_KEY && process.env.PROJECT_ENV) {
  databaseName = `${process.env.PROJECT_KEY}-${process.env.PROJECT_ENV}`;
}
if (process.env.MONGODB_DATABASE) {
  databaseName = process.env.MONGODB_DATABASE;
}

const config = {
  mongodb: {
    url: process.env.MONGODB_URI || "mongodb://localhost:27447",
    databaseName,
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "esm",
};

module.exports = config;
