import { NextFunction, Request, Response } from "express";
import { pool } from "../config/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

//Error handler
import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertUserText =
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING user_id, email";
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
    const findUserText = "SELECT user_id, password FROM users WHERE email = $1";
    const findUserValues = [email];
    const result = await pool.query(findUserText, findUserValues);

    if (result.rows.length === 0) {
      return res.status(404).send("User Not Found");
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).send("Invalid Credentials");
    }

    const token = generateToken(user.user_id);
    res.send({ user: { userId: user.user_id, email }, token });
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const generateToken = (userId: string) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
};
