import { pool } from "../db";
import fs from "fs";
import path from "path";

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
