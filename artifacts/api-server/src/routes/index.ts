import { Router, type IRouter } from "express";
import healthRouter from "./health";
import redditFeedsRouter from "./redditFeeds";
import extraFeedsRouter from "./extraFeeds";
import feedRouter from "./feed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(redditFeedsRouter);
router.use(extraFeedsRouter);
router.use(feedRouter);

export default router;
