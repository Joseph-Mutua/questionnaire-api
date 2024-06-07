/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Request, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { checkSuperAdmin } from "../../utils/checkSuperAdmin";
import {
  handleItem,
  handleSection,
  updateOrCreateSettings,
} from "../../helpers/forms/formControllerHelpers";
import { QuizSettings, Section } from "../../types";

const router = Router();

// Create Template
router.post(
  "/",
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

      const templateDetails = await pool.query<{ template_id: number }>(
        `SELECT t.template_id, t.category_id, t.owner_id, t.info_id, t.settings_id, t.is_public,
                fi.title AS form_title, fi.description AS form_description, 
                fs.response_update_window, fs.wants_email_updates, 
                c.name AS category_name
         FROM templates t
         JOIN form_info fi ON t.info_id = fi.info_id
         JOIN form_settings fs ON t.settings_id = fs.settings_id
         JOIN template_categories c ON t.category_id = c.category_id
         WHERE t.template_id = $1`,
        [template_id]
      );

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Template created successfully.",
        template: templateDetails.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

router.post(
  "/",
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

      const templateDetails = await pool.query<{ template_id: number }>(
        `SELECT t.template_id, t.category_id, t.owner_id, t.info_id, t.settings_id, t.is_public,
                fi.title AS form_title, fi.description AS form_description, 
                fs.response_update_window, fs.wants_email_updates, 
                c.name AS category_name
         FROM templates t
         JOIN form_info fi ON t.info_id = fi.info_id
         JOIN form_settings fs ON t.settings_id = fs.settings_id
         JOIN template_categories c ON t.category_id = c.category_id
         WHERE t.template_id = $1`,
        [template_id]
      );

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Template created successfully.",
        template: templateDetails.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

//Delete template
router.delete(
  "/templates/:template_id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      await pool.query(
        "DELETE FROM templates WHERE template_id = $1 AND owner_id = $2",
        [template_id, user_id]
      );

      await pool.query("COMMIT");

      res.status(200).json({ message: "Template deleted successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

// Delete Template Category
router.delete(
  "/categories/:id",
  authenticateUser,
  checkSuperAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
      await pool.query("BEGIN");
      await pool.query<{ category_id: number }>(
        "DELETE FROM template_categories WHERE category_id = $1 RETURNING category_id",
        [id]
      );
      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Category deleted successfully.",
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

// Update Template Category
router.put(
  "/categories/:id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { name, description } = req.body as {
      name: string;
      description: string;
    };
    try {
      await pool.query("BEGIN");
      const result = await pool.query<{ category_id: number }>(
        "UPDATE template_categories SET name = $1, description = $2 WHERE category_id = $3 RETURNING category_id, name, description",
        [name, description, id]
      );
      await pool.query("COMMIT");
      res.status(200).json({
        message: "Category updated successfully.",
        category: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

// Fetch all template categories
router.get(
  "/template-categories",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        "SELECT * FROM template_categories ORDER BY name"
      );
      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

//Get all templates
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
      `);

    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/templates/:template_id/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    const { template_id } = req.params;

    try {
      const result = await pool.query(
        `
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description, fs.*
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
        JOIN form_settings fs ON t.settings_id = fs.settings_id
        WHERE t.template_id = $1
      `,
        [template_id]
      );

      if (result.rows.length === 0) {
        throw new HttpError("Template not found.", 404);
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

//Get user templates
router.get(
  "/my_templates",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      const result = await pool.query(
        `
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
        WHERE t.owner_id = $1
      `,
        [user_id]
      );

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:template_id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.params;
    const { category_id, title, description, is_public, settings, sections } =
      req.body as {
        category_id: number;
        title: string;
        description: string;
        is_public: boolean;
        settings: QuizSettings;
        sections: Section[];
      };

    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      // Verify the category_id exists
      const categoryCheck = await pool.query(
        "SELECT category_id FROM template_categories WHERE category_id = $1",
        [category_id]
      );

      if (categoryCheck.rows.length === 0) {
        throw new HttpError("Category does not exist.", 400);
      }

      const infoResult = await pool.query<{ info_id: number }>(
        `UPDATE form_info 
         SET title = $1, description = $2 
         WHERE info_id = (SELECT info_id FROM templates WHERE template_id = $3 AND owner_id = $4) 
         RETURNING info_id`,
        [title, description, template_id, user_id]
      );

      if (infoResult.rowCount === 0) {
        throw new HttpError(
          "Template not found or you do not have permission to update this template.",
          404
        );
      }

      const info_id = infoResult.rows[0].info_id;

      const settings_id = await updateOrCreateSettings(
        pool,
        settings,
        Number(template_id),
        false
      );

      await pool.query(
        `UPDATE templates 
         SET category_id = $1, 
             info_id = $2, 
             settings_id = $3, 
             is_public = $4, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE template_id = $5 AND owner_id = $6`,
        [category_id, info_id, settings_id, is_public, template_id, user_id]
      );

      for (const section of sections) {
        const section_id = await handleSection(
          pool,
          Number(template_id),
          section,
          false
        );
        for (const item of section.items) {
          await handleItem(pool, Number(template_id), section_id, item, false);
        }
      }

      await pool.query("COMMIT");

      res
        .status(200)
        .json({ success: true, message: "Template updated successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

export default router;
