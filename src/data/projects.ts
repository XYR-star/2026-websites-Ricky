import projectsData from "./projects.json";
import { validatePageData } from "../lib/page-data.mjs";

export const projectsPage = validatePageData("projects", projectsData) as typeof projectsData;
export const projects = projectsPage.items;
