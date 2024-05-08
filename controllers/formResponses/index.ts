import { Router } from "express";
import deleteRevisionResponses from "./deleteAllRevisionResponses";
import deleteSpecificFormResponse from "./deleteSpecificFormResponse";

const router = Router();

router.use(deleteRevisionResponses);
router.use(deleteSpecificFormResponse);

export default router;