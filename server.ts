import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./config/db";
import { runMigrations } from "./config/db/migration";

//Routes
import userRoutes from "./routes/userRoutes";
import formRoutes from "./routes/formRoutes";

if (process.env.NODE_ENV !== "PRODUCTION") {
  dotenv.config({
    path: "config/.env",
  });
}

const app: Express = express();

const port = process.env.PORT || 3000;
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/forms", formRoutes);

async function initializeApp() {
  try {
    await runMigrations();
    console.log("Database migrations completed successfully.");
    await connectDB();
    console.log("Database connection established successfully.");

    app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize the application:", error);
    process.exit(1);
  }
}

initializeApp()
  .then(() => {
    console.log("Application initialized successfully.");
  })
  .catch((err) => {
    console.error("Failed to initialize the application:", err);
  });
