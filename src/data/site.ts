import siteData from "./site.json";
import { validatePageData } from "../lib/page-data.mjs";

type SocialLink = {
  label: string;
  href: string;
};

const siteUrl = import.meta.env.SITE_URL ?? "https://www.heyrickishere.com";
const validatedSite = validatePageData("site", siteData) as typeof siteData;

export const siteMeta = {
  ...validatedSite,
  siteUrl,
  socialLinks: validatedSite.socialLinks as SocialLink[],
};
