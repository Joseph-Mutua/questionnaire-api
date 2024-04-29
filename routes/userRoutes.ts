/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Request, Response } from "express";
import { generateToken } from "../helpers/forms/formControllerHelpers";

import { AuthRequest, authenticateUser } from "../middleware/auth";

import { pool } from "../config/db";
import bcrypt from "bcryptjs";
import HttpError from "../utils/httpError";
import { fetchFormDetails } from "../helpers/forms/formControllerHelpers";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
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
});

router.post(
  "/login",

  async (req: Request, res: Response) => {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    const findUserText = "SELECT user_id, password FROM users WHERE email = $1";
    const findUserValues = [email];

    const result = await pool.query<{ user_id: number; password: string }>(
      findUserText,
      findUserValues
    );

    if (result.rows.length === 0) {
      throw new HttpError("User Not Found", 404);
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      throw new HttpError("Invalid Credentials", 401);
    }

    const token = generateToken(String(user.user_id));
    res.send({ user: { userId: user.user_id, email }, token });
  }
);

router.get(
  "/:userId/forms",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    const basicFormsQuery = "SELECT form_id FROM forms WHERE owner_id = $1";
    const basicFormsResult = await pool.query<{ form_id: number }>(
      basicFormsQuery,
      [user_id]
    );

    if (basicFormsResult.rows.length === 0) {
      throw new HttpError("No forms found for this user.", 404);
    }

    const formsDetailsPromises = basicFormsResult.rows.map((row) =>
      fetchFormDetails(pool, row.form_id)
    );
    const formsDetails = await Promise.all(formsDetailsPromises);

    res.json(formsDetails);
  }
);

export default router;
