import { Pool } from "pg";
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
import HttpError from "../../utils/httpError";
import asyncHandler from "../../utils/asyncHandler";
import { pool } from "../../config/db";

interface CreateFormDetails {
  title: string;
  description: string;
}

export const createForm = async (
  pool: Pool,
  user_id: number,
  formDetails: CreateFormDetails
) => {
  const { title, description } = formDetails;

  if (!user_id) throw new HttpError("User must be logged in.", 403);

  await pool.query("BEGIN");
  try {
    const formResult = await pool.query<{ form_id: number }>(
      `INSERT INTO forms (owner_id, title, description) 
       VALUES ($1, $2, $3) 
       RETURNING form_id`,
      [user_id, title, description]
    );
    const form_id = formResult.rows[0].form_id;

    const ownerRole = "OWNER";

    const formUserRoleExist = await pool.query(
      "SELECT * FROM form_user_roles WHERE form_id = $1 AND user_id = $2 AND role = $3",
      [form_id, user_id, ownerRole]
    );

    if (formUserRoleExist.rows.length === 0) {
      await pool.query(
        "INSERT INTO form_user_roles (form_id, user_id, role) VALUES ($1, $2, $3)",
        [form_id, user_id, ownerRole]
      );
    }

    await pool.query<{ revision_id: number }>(
      "INSERT INTO form_versions (form_id, is_active) VALUES ($1, TRUE) RETURNING revision_id",
      [form_id]
    );

    await pool.query("COMMIT");

    const form = await fetchFormDetails(pool, form_id);

    return {
      message: "Form created successfully and version initialized.",
      form: form,
    };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

const router = Router();

router.post(
  "/",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description } = req.body as {
      title: string;
      description: string;
    };

    try {
      const result = await createForm(pool, user_id!, { title, description });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
