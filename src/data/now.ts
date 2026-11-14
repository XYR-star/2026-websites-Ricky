import nowData from "./now.json";
import { getPageData } from "../lib/payload-content.mjs";

export const nowPage = await getPageData("now", nowData) as typeof nowData;
