import express, { Express, Request, Response } from "express";
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

app.use("/api/v1/user", userRoutes);
app.use("/api/v1/form", formRoutes);

runMigrations();
connectDB()
  .then(() => {
    app.get("/", (req: Request, res: Response) => {
      res.send("Express + TypeScript Server");
    });

    app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to the database!", error);
  });
