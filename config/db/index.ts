

import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: "./config/.env" });

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
  max: 20, 
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 5000,
});