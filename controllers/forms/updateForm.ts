/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import * as Y from "yjs";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import {
  fetchFormDetails,
  handleItem,
  handleSection,
  incrementVersion,
  updateOrCreateSettings,
} from "../../helpers/forms/formControllerHelpers";

import { QuizSettings, Section } from "../../types";

import { io } from "../../server";
import { Pool } from "pg";

const router = Router();

// Update form
// router.patch("/:id", authenticateUser, async (req: AuthRequest, res: Response) => {
//   const user_id = req.user?.user_id;
//   const form_id = parseInt(req.params.id);
//   const { sections, settings } = req.body as {
//     sections: Section[];
//     settings: QuizSettings;
//   };

//   if (!user_id) {
//     throw new HttpError("User must be logged in.", 403);
//   }

//   if (!form_id) {
//     throw new HttpError("Invalid form ID.", 400);
//   }

//   // Check if user is owner or editor
//   const roleCheckQuery = `
//     SELECT r.name
//     FROM form_user_roles fur
//     JOIN roles r ON fur.role_id = r.role_id
//     WHERE fur.form_id = $1 AND fur.user_id = $2;
//   `;
//   const roleResult = await pool.query<{ name: string }>(roleCheckQuery, [form_id, user_id]);

//   if (roleResult.rowCount === 0 || !['Owner', 'Editor'].includes(roleResult.rows[0].name)) {
//     throw new HttpError("Unauthorized to update this form. Only owners and editors are permitted.", 403);
//   }

//   await pool.query("BEGIN");

//   await updateOrCreateSettings(pool, settings, form_id);

//   for (const section of sections) {
//     const section_id = await handleSection(pool, form_id, section);
//     for (const item of section.items) {
//       await handleItem(pool, form_id, section_id, item);
//     }
//   }

//   const currentRevision = (
//     await pool.query<{ revision_id: string }>(
//       "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
//       [form_id]
//     )
//   ).rows[0].revision_id;

//   const newRevisionId = incrementVersion(currentRevision);

//   await pool.query(
//     "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
//     [form_id]
//   );

//   const versionResult = await pool.query<{ version_id: number }>(
//     "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, $2, $3::jsonb, TRUE) RETURNING version_id",
//     [form_id, newRevisionId, JSON.stringify(req.body)]
//   );

//   const newVersionId = versionResult.rows[0].version_id;

//   await pool.query(
//     "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
//     [newVersionId, form_id]
//   );

//   await pool.query("COMMIT");

//   const form_details = await fetchFormDetails(pool, form_id);
//   res.status(200).json({
//     message: "Form updated successfully",
//     form_details: form_details,
//   });
// });

// Update form
router.patch("/:id", authenticateUser, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const form_id = parseInt(req.params.id);
  const { sections, settings, oldVersionId, changes } = req.body as {
    sections: Section[];
    settings: QuizSettings;
    oldVersionId: number; // The version ID the client based its changes on
    changes: Uint8Array; // Yjs update
  };

  if (!user_id) {
    throw new HttpError("User must be logged in.", 403);
  }

  if (!form_id) {
    throw new HttpError("Invalid form ID.", 400);
  }

  // Role check to ensure user is owner or editor
  const roleCheckQuery = `
    SELECT r.name
    FROM form_user_roles fur
    JOIN roles r ON fur.role_id = r.role_id
    WHERE fur.form_id = $1 AND fur.user_id = $2;
  `;
  const roleResult = await pool.query<{ name: string }>(roleCheckQuery, [
    form_id,
    user_id,
  ]);

  if (
    roleResult.rowCount === 0 ||
    !["Owner", "Editor"].includes(roleResult.rows[0].name)
  ) {
    throw new HttpError(
      "Unauthorized to update this form. Only owners and editors are permitted.",
      403
    );
  }

  await pool.query("BEGIN");

  // Check for version conflicts
  const conflict = await handleVersionConflict(pool, form_id, oldVersionId);
  if (conflict) {
    await pool.query("ROLLBACK");
    res.status(409).json({
      error: "Version conflict. Please refresh and reapply your changes.",
    });
    return;
  }

  // ... existing code for updating settings, sections and items
  await updateOrCreateSettings(pool, settings, form_id);
  for (const section of sections) {
    const section_id = await handleSection(pool, form_id, section);
    for (const item of section.items) {
      await handleItem(pool, form_id, section_id, item);
    }
  }

  // ... (Yjs integration starts here)

  const docs: Map<string, Y.Doc> = new Map();
  let ydoc = docs.get(form_id.toString());
  if (!ydoc) {
    ydoc = new Y.Doc();
    docs.set(form_id.toString(), ydoc);
  }

  Y.applyUpdate(ydoc, changes); // Apply the changes from the client
  const update = Y.encodeStateAsUpdate(ydoc); // Encode the updated state

  io.to(form_id.toString()).emit("formUpdated", update); // Broadcast to others

  // ... (rest of the logic for creating a new form version and updating forms table)
  const currentRevision = (
    await pool.query<{ revision_id: string }>(
      "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
      [form_id]
    )
  ).rows[0].revision_id;
  const newRevisionId = incrementVersion(currentRevision);
  await pool.query(
    "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
    [form_id]
  );

  // Here the new revision content would typically be taken from the ydoc state

  // Here the new revision content would typically be taken from the ydoc state

  const newVersionId = await createNewFormVersion(
    pool,
    form_id,
    newRevisionId,
    JSON.stringify(ydoc)
  ); // Encode the ydoc state into a JSON string and save as the new version content

  // const newVersionId = await createNewFormVersion(
  //   pool,
  //   form_id,
  //   newRevisionId,
  //   Y.encodeStateAsJSON(ydoc)
  // ); // Encode the ydoc state into a JSON string and save as the new version content

  await pool.query(
    "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
    [newVersionId, form_id]
  );

  await pool.query("COMMIT");

  const form_details = await fetchFormDetails(pool, form_id);
  res.status(200).json({
    message: "Form updated successfully",
    form_details: form_details,
  });
});

export async function handleVersionConflict(
  pool: Pool,
  form_id: number,
  oldVersionId: number
): Promise<boolean> {
  const currentActiveVersionId = (
    await pool.query<{ active_version_id: number }>(
      "SELECT active_version_id FROM forms WHERE form_id = $1",
      [form_id]
    )
  ).rows[0].active_version_id;
  return currentActiveVersionId !== oldVersionId; // Conflict if the IDs don't match
}


//Helper function to create a new form version.
async function createNewFormVersion(pool: Pool, form_id: number, revision_id: string, content: string) {
 const versionResult = await pool.query<{ version_id: number }>(
   "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, $2, $3, TRUE) RETURNING version_id",
   [form_id, revision_id, content]
 );

 return versionResult.rows[0].version_id;
}


export default router;


