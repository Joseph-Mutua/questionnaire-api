/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Request, Response } from "express";
import { generateToken } from "../../helpers/forms/formControllerHelpers";
import { pool } from "../../config/db";
import bcrypt from "bcryptjs";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };
    const hashedPassword = await bcrypt.hash(password, 10);
    const client = await pool.connect();

    await client.query("BEGIN");

    const insertUserText =
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING user_id, email";
    const insertUserValues = [email, hashedPassword];
    const result = await pool.query<{ user_id: number; email: string }>(
      insertUserText,
      insertUserValues
    );

    await client.query("COMMIT");
    const user = result.rows[0];
    const token = generateToken(String(user.user_id));
    res.status(201).send({ user, token });
  })
);

export default router;
