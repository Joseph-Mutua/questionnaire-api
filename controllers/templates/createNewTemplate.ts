import { Pool } from "pg";
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
import HttpError from "../../utils/httpError";
import asyncHandler from "../../utils/asyncHandler";
import { pool } from "../../config/db";

interface CreateTemplateDetails {
  title: string;
  description: string;
  category_id: number;
}

export const createTemplate = async (
  pool: Pool,
  user_id: number,
  templateDetails: CreateTemplateDetails
) => {
  const { title, description, category_id } = templateDetails;

  if (!user_id) throw new HttpError("User must be logged in.", 403);

  await pool.query("BEGIN");
  try {
    const templateResult = await pool.query<{ template_id: number }>(
      `INSERT INTO templates (owner_id, title, description, category_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING template_id`,
      [user_id, title, description, category_id]
    );
    const template_id = templateResult.rows[0].template_id;

    // Create initial revision for the template
    const versionResult = await pool.query<{ revision_id: number }>(
      "INSERT INTO form_versions (form_id, is_active) VALUES ($1, TRUE) RETURNING revision_id",
      [template_id]
    );
    const revision_id = versionResult.rows[0].revision_id;

    await pool.query(
      "UPDATE templates SET active_version_id = $1 WHERE template_id = $2",
      [revision_id, template_id]
    );

    await pool.query("COMMIT");

    const template = await fetchFormDetails(pool, template_id);

    return {
      message: "Template created successfully.",
      template: template,
    };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

const router = Router();

// Create Template
router.post(
  "/",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description, category_id } = req.body as {
      title: string;
      description: string;
      category_id: number;
    };

    try {
      const result = await createTemplate(pool, user_id!, {
        title,
        description,
        category_id,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
