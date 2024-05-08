/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
const router = Router();

// Create Form with Initial Version
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

  // Insert into forms
  const formResult = await pool.query<{ form_id: number }>(
    "INSERT INTO forms(owner_id, info_id) VALUES($1, $2) RETURNING form_id",
    [user_id, info_id]
  );

  const form_id = formResult.rows[0].form_id;

  // Insert into form_versions
  const versionResult = await pool.query<{ version_id: number }>(
    "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, 'v1.0', $2::jsonb, TRUE) RETURNING version_id",
    [form_id, req.body]
  );
  const version_id = versionResult.rows[0].version_id;

  // Update forms to set active_version_id
  await pool.query(
    "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
    [version_id, form_id]
  );

  await pool.query("COMMIT");

  const formDetails = await fetchFormDetails(pool, form_id);
  await pool.query("COMMIT");

  res.status(201).json({
    message: "Form created successfully and version initialized.",
    form: formDetails,
  });
});

export default router;

//TODO -->update revision id such that it matches the revision id on the form versions table
//Fetch form by form id and revision id
//Route to update the active version of the form
//When user fetches form they automatically get the latestst version
//Responses should be fetched automatically based on the active version
//User should be ab;le to fetch responses based on a specific version
//User should be able to generate response uri based on a specific version
//Every response should be tied to a specific version of the form
