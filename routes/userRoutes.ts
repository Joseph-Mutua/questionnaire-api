import { Router } from "express";
import { register, login } from "../controllers/userController";
import { getFormsByUser } from "../controllers/formController";
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.post("/register", register);
router.post("/login", login);

router.get("/:userId/forms", authenticateUser, getFormsByUser); 

export default router;
