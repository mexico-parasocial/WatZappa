import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ErrorView } from '#/components/error-view.tsx'
import { ResetPasswordView } from '#/components/reset-password-view.tsx'
import { useSessionContext } from '#/contexts/session.tsx'

export const Route = createFileRoute('/account/reset-password')({
  validateSearch: (search: { email?: unknown }): { email?: string } =>
    typeof search.email === 'string' ? { email: search.email } : {},
  component: ResetPasswordPage,
  errorComponent: ErrorView,
})

function ResetPasswordPage() {
  const { api } = useSessionContext()
  const { email } = Route.useSearch()
  const router = useRouter()

  return (
    <ResetPasswordView
      emailDefault={email}
      onResetPasswordRequest={async (data) => api.initiatePasswordReset(data)}
      onResetPasswordConfirm={async (data) => api.confirmResetPassword(data)}
      onBack={() => {
        if (router.history.canGoBack()) router.history.back()
        else router.navigate({ to: '/account', replace: true })
      }}
    />
  )
}
