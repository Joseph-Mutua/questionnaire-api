/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";

import { pool } from "../../config/db";
import jwt from "jsonwebtoken"

const router = Router();

router.post(
  "/generateLink/:form_id",
  authenticateUser,

  async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const form_id = req.params.form_id;

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

    const currentRevision = ownerCheckResult.rows[0].revision_id;
    const revisionParts = currentRevision.substring(1).split(".");
    let majorVersion = parseInt(revisionParts[0]);
    majorVersion += 1;
    const newRevisionId = `v${majorVersion}.0`;

    const token = jwt.sign(
      { form_id: form_id, revisionId: newRevisionId, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );

    const responderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;
    
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);

    //Save to db
    res.json({ responderUri });
  }
);
