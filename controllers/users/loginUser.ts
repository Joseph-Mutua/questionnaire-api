/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Request, Response } from "express";
import { generateToken } from "../../helpers/forms/formControllerHelpers";
import { pool } from "../../config/db";
import bcrypt from "bcryptjs";
import HttpError from "../../utils/httpError";

const router = Router();


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


export default router;