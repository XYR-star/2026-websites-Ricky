import projectsData from "./projects.json";
import { getPageData } from "../lib/payload-content.mjs";

export const projectsPage = await getPageData("projects", projectsData) as typeof projectsData;
export const projects = projectsPage.items;
