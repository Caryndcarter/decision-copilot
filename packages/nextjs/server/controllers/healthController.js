import database from "../config/database.js";

export const healthCheck = (req, res) => {
  res.json({ status: "ok" });
};

export const dbStatus = async (req, res) => {
  try {
    const db = database.getDb();
    await db.command({ ping: 1 });

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Database status error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
