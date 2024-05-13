import { NextFunction, Response } from "express";
import { pool } from "../../config/db";
import { AuthRequest } from "../../middleware/auth";
import { sendEmail, loadEmailTemplate } from "../../utils/Mailer";
import { EmailTemplateData } from "../../types";
import HttpError from "../../utils/httpError";

export async function registerUser(email: string, password: string) {
  const { rows } = await pool.query<{ user_id: number }>(
    `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING user_id`,
    [email, password]
  );
  return rows[0].user_id;
}

export async function assignRole(
  user_id: number,
  form_id: number,
  role_id: number
) {
  await pool.query(
    `INSERT INTO form_user_roles (user_id, form_id, role_id) VALUES ($1, $2, $3)
     ON CONFLICT (form_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [user_id, form_id, role_id]
  );
}

export async function inviteUser(
  email: string,
  form_id: number,
  role_name: string
) {
  const userResult = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM users WHERE email = $1`,
    [email]
  );

  let user_id;
  let isNewUser = false;
  let password;

  if (userResult.rowCount === 0) {
    password = "123456789";
    user_id = await registerUser(email, password);
    isNewUser = true;
  } else {
    user_id = userResult.rows[0].user_id;
  }

  const roleResult = await pool.query<{ role_id: number }>(
    `SELECT role_id FROM roles WHERE name = $1`,
    [role_name]
  );

  const role_id = roleResult.rows[0].role_id;
  
  await assignRole(user_id, form_id, role_id);

  const templateData: EmailTemplateData = {
    password: isNewUser ? password : undefined,
    loginUrl: `${process.env.APP_DOMAIN_NAME}/api/v1/users/login`,
  };

  const html = loadEmailTemplate("invitation", templateData);
  await sendEmail(email, "You have been invited!", html);
}

export async function isOwner(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const user_id = req.user?.user_id;
  const { form_id } = req.body as { form_id: number };

  const { rows } = await pool.query<{ owner_id: number }>(
    `SELECT owner_id FROM forms WHERE form_id = $1`,
    [form_id]
  );

  if (rows.length === 0) {
    throw new HttpError("Form not found.", 404);
  }

  if (rows[0].owner_id !== user_id) {
    throw new HttpError("Only the owner can send invitations.", 403);
  }

  next();
}
