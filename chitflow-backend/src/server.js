require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    data: {
      service: "ChitFlow API",
      status: "running",
      environment: process.env.NODE_ENV || "development"
    }
  });
});

app.use("/api/auth", authRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
    code: "NOT_FOUND"
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Internal server error.",
    code: "SERVER_ERROR"
  });
});

app.listen(PORT, () => {
  console.log(`ChitFlow API running on http://localhost:${PORT}`);
});
