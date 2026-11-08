import nowData from "./now.json";
import { validatePageData } from "../lib/page-data.mjs";

export const nowPage = validatePageData("now", nowData) as typeof nowData;
