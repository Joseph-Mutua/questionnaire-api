import { Request, Response } from "express";
import { pool } from "../config/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const insertUserText =
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email";
    const insertUserValues = [email, hashedPassword];
    const result = await client.query(insertUserText, insertUserValues);
    await client.query("COMMIT");
    const user = result.rows[0];
    const token = generateToken(user.id);
    res.status(201).send({ user, token });
  } catch (error) {
    await client.query("ROLLBACK");
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  } finally {
    client.release();
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const findUserText = "SELECT id, password FROM users WHERE email = $1";
    const findUserValues = [email];
    const result = await pool.query(findUserText, findUserValues);

    if (result.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).send("Invalid credentials");
    }

    const token = generateToken(user.id);
    res.send({ user: { id: user.id, email }, token });
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

function generateToken(userId: number) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, {
    expiresIn: "24h",
  });
}
