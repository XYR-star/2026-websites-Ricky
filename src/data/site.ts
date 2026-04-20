type SocialLink = {
  label: string;
  href: string;
};

const siteUrl = import.meta.env.SITE_URL ?? "https://www.heyrickishere.com";

export const siteMeta = {
  title: "Ricky",
  description: "一个记录写作、研究进展与个人工作的中文内容网站。",
  siteUrl,
  intro:
    "我在这里写博客、整理研究线索，也持续记录那些还在生长中的项目与问题意识。",
  about:
    "关注机器学习、智能系统与创造性工具，也在意写作、界面和知识如何被更好地组织。",
  email: "",
  location: "",
  socialLinks: [] as SocialLink[],
};
