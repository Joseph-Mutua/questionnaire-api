/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
const router = Router();

// Create Form with Initial Version
// Create Form
router.post("/", authenticateUser, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;

  const { title, description } = req.body as {
    title: string;
    description: string;
  };

  if (!user_id) throw new HttpError("User must be logged in.", 403);

  await pool.query("BEGIN");

    const infoResult = await pool.query<{ info_id: number }>(
      "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id",
      [title, description]
    );
    const info_id = infoResult.rows[0].info_id;

    const formResult = await pool.query<{ form_id: number }>(
      "INSERT INTO forms(owner_id, info_id) VALUES($1, $2) RETURNING form_id",
      [user_id, info_id]
    );
    const form_id = formResult.rows[0].form_id;

    const roleIdResult = await pool.query<{ role_id: number }>(
      "SELECT role_id FROM roles WHERE name = 'Owner'"
    );
    const ownerRoleId = roleIdResult.rows[0].role_id;

    await pool.query(
      "INSERT INTO form_user_roles(form_id, user_id, role_id) VALUES ($1, $2, $3)",
      [form_id, user_id, ownerRoleId]
    );

    const versionResult = await pool.query<{ version_id: number }>(
      "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, 'v1.0', $2::jsonb, TRUE) RETURNING version_id",
      [form_id, req.body]
    );
    const version_id = versionResult.rows[0].version_id;

    await pool.query(
      "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
      [version_id, form_id]
    );

    await pool.query("COMMIT");

    const formDetails = await fetchFormDetails(pool, form_id);

    res.status(201).json({
      message: "Form created successfully and version initialized. Owner role assigned.",
      form: formDetails,
    });

});


export default router;