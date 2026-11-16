import { AuthTopBar } from '@/components/auth/auth-top-bar'
import { AuthCard } from '@/components/auth/auth-card'
import { OrbitalBackdrop } from '@/components/auth/orbital-backdrop'
import { ProfilePreview } from '@/components/auth/profile-preview'
import { LanguageProvider } from '@/lib/i18n'

export default function LoginPage() {
  return (
    <LanguageProvider>
    <div className="relative min-h-dvh overflow-hidden bg-void text-stellar">
      <OrbitalBackdrop />
      <div className="relative flex min-h-dvh flex-col">
        <AuthTopBar />
        <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-4 pb-12 pt-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pt-8">
          <section aria-labelledby="auth-title" className="animate-rise lg:col-span-5">
            <AuthCard />
          </section>
          <section
            aria-labelledby="preview-title"
            className="animate-rise lg:col-span-7"
            style={{ animationDelay: '120ms' }}
          >
            <ProfilePreview />
          </section>
        </main>
      </div>
    </div>
    </LanguageProvider>
  )
}
