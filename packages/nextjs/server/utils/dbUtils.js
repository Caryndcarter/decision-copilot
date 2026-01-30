import database from "../config/database.js";

export async function initializeDatabase() {
  try {
    await database.connect();
    console.log("Database initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}
