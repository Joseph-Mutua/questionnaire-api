/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

const router = Router();

//Revert form version
// router.patch(
//   "/:form_id/revert/:version_id",
//   authenticateUser,
//   async (req: AuthRequest, res: Response) => {
//     const { form_id, version_id } = req.params;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//       //return res.status(403).json({ error: "User must be logged in." });
//       throw new HttpError("User must be logged in.", 403);
//     }

//     await pool.query("BEGIN");

//     // Validate ownership and check if version belongs to the form
//     const validateQuery = `
//     SELECT 1 FROM forms
//     WHERE form_id = $1 AND owner_id = $2 AND
//     EXISTS (SELECT 1 FROM form_versions WHERE form_id = $1 AND version_id = $3);
//   `;
//     const isValid = await pool.query(validateQuery, [
//       form_id,
//       user_id,
//       version_id,
//     ]);
//     if (isValid.rowCount !== 1) {
//       await pool.query("ROLLBACK");
//       throw new HttpError(
//         "Form or version not found or user is not the owner.",
//         404
//       );
//     }

//     // Use CTE to perform all updates in one SQL statement
//     const revertVersionQuery = `
//     WITH deactivated_versions AS (
//       UPDATE form_versions
//       SET is_active = FALSE
//       WHERE form_id = $1
//       RETURNING version_id
//     ),
//     activated_version AS (
//       UPDATE form_versions
//       SET is_active = TRUE
//       WHERE version_id = $2
//       RETURNING version_id
//     )
//     UPDATE forms
//     SET active_version_id = $2
//     WHERE form_id = $1;
//   `;

//     await pool.query(revertVersionQuery, [form_id, version_id]);

//     await pool.query("COMMIT");
//     res.json({
//       message: "Form reverted to the selected version successfully.",
//     });
//   }
// );

// Set Active Version
router.patch(
  "/:form_id/activate_version/:version_id",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const { form_id, version_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    await pool.query("BEGIN");
    await pool.query(
      "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
      [form_id]
    );
    await pool.query(
      "UPDATE form_versions SET is_active = TRUE WHERE version_id = $1 AND form_id = $2",
      [version_id, form_id]
    );
    await pool.query(
      "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
      [version_id, form_id]
    );

    await pool.query("COMMIT");
    res.status(200).json({ message: "Active version updated successfully." });
  }
);

export default router;
