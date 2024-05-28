import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { inviteUser, isOwner } from "../../helpers/users/userControllerHelpers";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();
router.post(
  "/invite",
  asyncHandler(authenticateUser),
  asyncHandler(isOwner),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, form_id, role } = req.body as {
      email: string;
      form_id: number;
      role: string;
    };

    await inviteUser(email, form_id, role);
    res
      .status(200)
      .send({ message: "Invitation sent successfully.", success: true });

      
  })
);

export default router;
