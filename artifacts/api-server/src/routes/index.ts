import { Router, type IRouter } from "express";
import healthRouter from "./health";
import customersRouter from "./customers";
import panelsRouter from "./panels";
import invertersRouter from "./inverters";
import batteriesRouter from "./batteries";
import systemsRouter from "./systems";
import compatibilityRouter from "./compatibility";
import pvgisRouter from "./pvgis";
import financialRouter from "./financial";
import dashboardRouter from "./dashboard";
import stringSizingRouter from "./string-sizing";
import locationsRouter from "./locations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customersRouter);
router.use(panelsRouter);
router.use(invertersRouter);
router.use(batteriesRouter);
router.use(systemsRouter);
router.use(compatibilityRouter);
router.use(pvgisRouter);
router.use(financialRouter);
router.use(dashboardRouter);
router.use(stringSizingRouter);
router.use(locationsRouter);

export default router;
