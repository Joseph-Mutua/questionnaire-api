/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
import { FormDetails } from "../../types";
const router = Router();

// Routes for form management
// router.post(
//   "/",
//   authenticateUser,

//   async (req: AuthRequest, res: Response) => {
//     const user_id = req.user?.user_id;
//     const { title, description } = req.body as {
//       title: string;
//       description: string;
//     };

//     if (!user_id) {
//       throw new HttpError("User must be logged in.", 403);
//     }

//     await pool.query("BEGIN");
//     const form_info_query =
//       "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";
//     const form_info_values = [title, description];
//     const form_info_result = await pool.query<{ info_id: number }>(
//       form_info_query,
//       form_info_values
//     );

//     const revisionId = "v1.0";
//     const forms_query =
//       "INSERT INTO forms(owner_id, info_id, revision_id) VALUES($1, $2, $3) RETURNING form_id";

//     const forms_values = [
//       user_id,
//       form_info_result.rows[0].info_id,
//       revisionId,
//     ];

//     const forms_result = await pool.query<{ form_id: number }>(
//       forms_query,
//       forms_values
//     );

//     const form_id = forms_result.rows[0].form_id;
//     const initSettingsQuery =
//       "INSERT INTO form_settings(quiz_settings_id, update_window_hours, wants_email_updates) VALUES(NULL, 24, FALSE) RETURNING settings_id";
//     const settingsResult = await pool.query<{ settings_id: number }>(
//       initSettingsQuery
//     );
//     const settings_id = settingsResult.rows[0].settings_id;
//     await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
//       settings_id,
//       form_id,
//     ]);

//     // Create the initial version
//     const versionResult = await pool.query<{version_id: number}>(
//       "INSERT INTO form_versions(form_id, revision_id, content) VALUES($1, $2, $3) RETURNING version_id",
//       [
//         forms_result.rows[0].form_id,
//         "v1.0",
//         JSON.stringify({ title, description }),
//       ]
//     );

//     // Link the active version
//     await pool.query(
//       "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
//       [versionResult.rows[0].version_id, forms_result.rows[0].form_id]
//     );

//     await pool.query("COMMIT");
//     res.status(201).json({
//       message: "Form created successfully",
//       form_id: form_id,
//       form_details: await fetchFormDetails(pool, form_id),
//     });
//   }
// );

// Create Form with Initial Version
router.post("/", authenticateUser, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  console.log("🚀 ~ router.post ~ req:", req.body)
 
  const { title, description } = req.body as {
    title: string;
    description: string;
  };

  if (!user_id) {
    throw new HttpError("User must be logged in.", 403);
  }
  await pool.query("BEGIN");
  // Insert into form_info
  const infoResult = await pool.query<{ info_id: number }>(
    "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id",
    [title, description]
  );
  const info_id = infoResult.rows[0].info_id;

  // Insert into forms
  const formResult = await pool.query<{ form_id: number }>(
    "INSERT INTO forms(owner_id, info_id, revision_id) VALUES($1, $2, 'v1.0') RETURNING form_id",
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

  await pool.query("COMMIT"); // Commit transaction

  const formDetails = await fetchFormDetails(pool, form_id); // Fetch form details after creation
  await pool.query("COMMIT");

  res.status(201).json({
    message: "Form created successfully and version initialized.",
    form: formDetails,
  });
});

export default router;
