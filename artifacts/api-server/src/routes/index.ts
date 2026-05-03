import { Router, type IRouter } from "express";
import healthRouter from "./health";
import feedRouter from "./feed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(feedRouter);

export default router;
