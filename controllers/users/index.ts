import { Router } from "express";

import registerUser from "./registerUser";
import loginUser from "./loginUser";
import getUserForms from "./getUserForms";
import inviteNewUser from "./inviteNewUser";

const router = Router();

router.use(registerUser);
router.use(inviteNewUser);
router.use(loginUser);
router.use(getUserForms);

export default router;