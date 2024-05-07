/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
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

const router = Router();

// Update form
router.patch(
  "/:id",
  authenticateUser,

  async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);
    const { sections, settings } = req.body as {
      sections: Section[];
      settings: QuizSettings;
    };

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    if (!form_id) {
      throw new HttpError("Invalid form ID.", 400);
    }
    await pool.query("BEGIN");

    await updateOrCreateSettings(pool, settings, form_id);

    for (const section of sections) {
      const section_id = await handleSection(pool, form_id, section);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item);
      }
    }

    const currentRevision = (
      await pool.query<{ revision_id: string }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
        [form_id]
      )
    ).rows[0].revision_id;

    console.log("currentRevision", currentRevision);

    const newRevisionId = incrementVersion(currentRevision);
    console.log("🚀 ~ newRevisionId:", newRevisionId);

    // Deactivate all other versions
    await pool.query(
      "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
      [form_id]
    );

    // Insert new version and set it as active
    await pool.query<{ version_id: number }>(
      "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, $2, $3, TRUE) RETURNING version_id",
      [form_id, newRevisionId, JSON.stringify(req.body)] // Ensure content is properly formatted as JSON string
    );

    await pool.query("COMMIT"); // Commit all changes

    const form_details = await fetchFormDetails(pool, form_id);

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Form updated successfully",
      form_details: form_details,
    });
  }
);

export default router;
