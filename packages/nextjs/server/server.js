import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";

import healthRoutes from "./routes/health.js";
import { initializeDatabase } from "./utils/dbUtils.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/health", healthRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  initializeDatabase().catch((error) => {
    console.error("Database initialization failed:", error);
  });
});
