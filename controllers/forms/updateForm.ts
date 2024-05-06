/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import {
  fetchFormDetails,
  handleItem,
  handleSection,
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

    const ownerCheckResult = await pool.query<{
      owner_id: number;
      revision_id: string;
    }>("SELECT owner_id, revision_id FROM forms WHERE form_id = $1", [form_id]);

    await updateOrCreateSettings(pool, settings, form_id);

    const currentRevision = ownerCheckResult.rows[0].revision_id;
    const revisionParts = currentRevision.substring(1).split(".");
    let majorVersion = parseInt(revisionParts[0]);
    majorVersion += 1;
    const newRevisionId = `v${majorVersion}.0`;

    const newToken = jwt.sign(
      { form_id: form_id, revisionId: newRevisionId, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );

    const newResponderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${newToken}`;

    await pool.query<{ form_id: number }>(
      "UPDATE forms SET revision_id = $1, responder_uri = $2 WHERE form_id = $3 AND owner_id = $4",
      [newRevisionId, newResponderUri, form_id, user_id]
    );

    for (const section of sections) {
      const section_id = await handleSection(pool, form_id, section);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item);
      }
    }

    const form_details = await fetchFormDetails(pool, form_id);

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Form updated successfully",
      form_details: form_details,
    });


  }

);

export default router;
