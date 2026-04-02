import dotenv from "dotenv";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import terrasRoutes from "./routes/terrasRoutes.js";
import restaurantRoutes from "./routes/restaurantRoutes.js";
import sunDataRoutes from "./routes/sunDataRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import weatherRoutes from "./routes/weatherRoutes.js";
import { startWeatherCron } from "./services/weatherCron.js";

dotenv.config();

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// View engine setup
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Database connection
const mongoURI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/zon-terras-db";
mongoose
  .connect(mongoURI)
  .then(() => {
    console.log("MongoDB connected to:", mongoURI);
    // Start de cron job pas nadat de database verbinding er is
    startWeatherCron();
  })
  .catch((err) => console.error("MongoDB error:", err));

// Root redirect
app.get("/", (req: Request, res: Response) => {
  res.redirect("/api");
});

// API index with content negotiation
app.get("/api", (req: Request, res: Response) => {
  const responseData = {
    message: "Zon-Terras-In-Gent API is operational",
    version: "1.0.0",
    endpoints: {
      terrasen: "/api/terrasen",
      restaurants: "/api/restaurants",
      events: "/api/events",
      sun: "/api/sun",
      search: "/api/search",
      weather: "/api/weather"
    }
  };
  res.format({
    "application/json": () => res.json(responseData),
    "text/html": () =>
      res.render("index", {
        title: "Zon-Terras-In-Gent API",
        ...responseData,
      }),
    default: () => res.status(406).send("Not Acceptable"),
  });
});

// API Routes
app.use("/api/terrasen", terrasRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/sun", sunDataRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/weather", weatherRoutes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
