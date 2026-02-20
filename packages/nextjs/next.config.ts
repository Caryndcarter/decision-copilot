import type { NextConfig } from "next";
import path from "path";

// Load monorepo root .env so MONGODB_URI is available to API routes (Next only loads from packages/nextjs by default)
import { config } from "dotenv";
config({ path: path.join(__dirname, "../../.env") });
config({ path: path.join(__dirname, "../../.env.local") });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
