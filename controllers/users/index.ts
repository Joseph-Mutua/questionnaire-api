import { Router } from "express";

import registerUser from "./registerUser";
import loginUser from "./loginUser";
import getUserForms from "./getUserForms";

const router = Router();

router.use(registerUser);
router.use(loginUser);
router.use(getUserForms);

export default router