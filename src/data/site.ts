import siteData from "./site.json";
import { getPageData } from "../lib/payload-content.mjs";

type SocialLink = {
  label: string;
  href: string;
};

const siteUrl = import.meta.env.SITE_URL ?? "https://www.heyrickishere.com";
const validatedSite = await getPageData("site", siteData) as typeof siteData;

export const siteMeta = {
  ...validatedSite,
  siteUrl,
  socialLinks: validatedSite.socialLinks as SocialLink[],
};
