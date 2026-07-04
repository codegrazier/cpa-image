import { useI18n } from "@/lib/i18n";

export function SeoContent() {
  const { copy } = useI18n();
  const c = copy.seoContent;
  return (
    <>
      <h1 className="sr-only">{c.h1}</h1>
      <section aria-label={c.productSectionLabel} className="sr-only">
        <h2>{c.productHeading}</h2>
        <p>{c.productProse}</p>
      </section>
      <footer className="sr-only">
        <p>
          {c.footerCopyright} · <a href={c.licenseUrl}>MIT</a> ·{" "}
          <a href={c.githubUrl}>GitHub</a>
        </p>
        <p>{c.footerPrivacy}</p>
      </footer>
    </>
  );
}
