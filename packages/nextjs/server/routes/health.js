import express from "express";
import { healthCheck, dbStatus } from "../controllers/healthController.js";

const router = express.Router();

router.get("/", healthCheck);
router.get("/db", dbStatus);

export default router;
