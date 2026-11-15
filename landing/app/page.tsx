import { LanguageProvider } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { Challenge } from "@/components/challenge";
import { ProductShowcase } from "@/components/product-showcase";
import { HowItWorks } from "@/components/how-it-works";
import { Explore } from "@/components/explore";
import { TechStack } from "@/components/tech-stack";
import { FinalCta } from "@/components/final-cta";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <LanguageProvider>
      <SiteHeader />
      <main>
        <Hero />
        <Challenge />
        <ProductShowcase />
        <HowItWorks />
        <Explore />
        <TechStack />
        <FinalCta />
      </main>
      <SiteFooter />
    </LanguageProvider>
  );
}
