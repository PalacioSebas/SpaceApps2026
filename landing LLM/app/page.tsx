import { SiteHeader } from "@/components/site-header";
import { CopilotExperience } from "@/components/copilot-experience";
import { HowItWorks } from "@/components/how-it-works";
import { ModesBento } from "@/components/modes-bento";
import { SiteFooter } from "@/components/site-footer";

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <CopilotExperience />
        <HowItWorks />
        <ModesBento />
      </main>
      <SiteFooter />
    </>
  );
}
