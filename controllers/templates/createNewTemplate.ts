/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router,  Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

const router = Router();

// Create Template
router.post(
  "/templates",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { category_id, title, description, is_public } = req.body as {
      category_id: number;
      title: string;
      description: string;
      is_public: boolean;
    };
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      const infoResult = await pool.query<{ info_id: number }>(
        "INSERT INTO form_info (title, description) VALUES ($1, $2) RETURNING info_id",
        [title, description]
      );
      const info_id = infoResult.rows[0].info_id;

      const settingsResult = await pool.query<{ settings_id: number }>(
        "INSERT INTO form_settings DEFAULT VALUES RETURNING settings_id"
      );
      const settings_id = settingsResult.rows[0].settings_id;

      const templateResult = await pool.query<{ template_id: number }>(
        "INSERT INTO templates (category_id, owner_id, info_id, settings_id, is_public) VALUES ($1, $2, $3, $4, $5) RETURNING template_id",
        [category_id, user_id, info_id, settings_id, is_public]
      );
      const template_id = templateResult.rows[0].template_id;

      await pool.query("COMMIT");

      res
        .status(201)
        .json({ message: "Template created successfully.", template_id });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);


export default router;