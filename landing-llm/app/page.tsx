import { SiteHeader } from "@/components/site-header";
import { CopilotExperience } from "@/components/copilot-experience";
import { HowItWorks } from "@/components/how-it-works";
import { ModesBento } from "@/components/modes-bento";
import { SiteFooter } from "@/components/site-footer";
import { LanguageProvider } from "@/lib/i18n";

export default function Page() {
  return (
    <LanguageProvider>
      <SiteHeader />
      <main>
        <CopilotExperience />
        <HowItWorks />
        <ModesBento />
      </main>
      <SiteFooter />
    </LanguageProvider>
  );
}
