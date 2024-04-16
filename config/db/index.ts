import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
  max: 20, 
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 2000,
});

export const connectDB = async () => {
  try {

    await pool.connect();
    console.log("Connected to the database");

  } catch (err) {

    console.error("Database connection error", err);
    process.exit(1);

  }

};
