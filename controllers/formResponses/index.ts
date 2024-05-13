import { Router } from "express";
import deleteRevisionResponses from "./deleteAllRevisionResponses";
import deleteSpecificFormResponse from "./deleteSpecificFormResponse";
import getAllRevisionResponses from "./getAllRevisionResponses";
import updateFormResponse from "./updateFormResponse";

const router = Router();

router.use(deleteRevisionResponses);
router.use(deleteSpecificFormResponse);
router.use(getAllRevisionResponses);
router.use(updateFormResponse)

export default router;