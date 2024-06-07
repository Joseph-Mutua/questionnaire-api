
import dotenv from "dotenv";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

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

export const runMigrations = async () => {
  const client = await pool.connect();
  try {
    const migrations = fs
      .readdirSync(path.join(__dirname, "migrations"))
      .sort();
    for (const file of migrations) {
      const migration = fs.readFileSync(
        path.join(__dirname, "migrations", file),
        "utf-8"
      );
      await client.query(migration);
      console.log(`Executed migration: ${file}`);
    }
  } catch (err) {
    console.error("Migration failed.", err);
    process.exit(1);
  } finally {
    client.release();
  }
};