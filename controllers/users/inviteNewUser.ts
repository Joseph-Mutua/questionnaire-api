/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { inviteUser, isOwner } from "../../helpers/users/userControllerHelpers";

const router = Router();
router.post(
  "/invite",
  authenticateUser,
  isOwner,
  async (req: AuthRequest, res: Response) => {
    const { email, form_id, role_name } = req.body as {
      email: string;
      form_id: number;
      role_name: string;
    };

    await inviteUser(email, form_id, role_name);
    res
      .status(200)
      .send({ message: "Invitation sent successfully.", success: true });
  }
);

export default router;
