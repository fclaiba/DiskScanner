import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
    ["/", 1, "weekly"],
    ["/pricing", 0.9, "monthly"],
    ["/download", 0.9, "monthly"],
    ["/signup", 0.5, "yearly"],
    ["/legal/terms", 0.2, "yearly"],
    ["/legal/privacy", 0.2, "yearly"],
    ["/legal/refunds", 0.2, "yearly"],
  ];
  return pages.map(([path, priority, changeFrequency]) => ({
    url: `${site.url}${path}`,
    priority,
    changeFrequency,
  }));
}
