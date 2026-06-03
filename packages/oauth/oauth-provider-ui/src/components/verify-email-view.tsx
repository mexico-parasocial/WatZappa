import { Button } from '#/components/forms/button.tsx'
import { LayoutTitle } from '#/components/layouts/layout-title.tsx'
import { Trans, useLingui } from '@lingui/react/macro'
import { VerifyEmailDialog } from './verify-email-dialog.tsx'

export type VerifyEmailViewProps = {
  email: string
  requestPending?: boolean
  confirmPending?: boolean
  onRequest: () => void | PromiseLike<void>
  onConfirm: (data: { token: string }) => void | PromiseLike<void>
  onCancel?: () => void
  onDone?: () => void
}

export function VerifyEmailView({
  email,
  requestPending,
  confirmPending,
  onRequest,
  onConfirm,
  onCancel,
  onDone,
}: VerifyEmailViewProps) {
  const { t } = useLingui()

  return (
    <LayoutTitle
      title={t`Verify your email`}
      subtitle={<Trans>Confirm the email address on your account.</Trans>}
    >
      <div className="space-y-6">
        <p>
          <Trans>
            We'll send a verification code to <strong>{email}</strong>.
          </Trans>
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <VerifyEmailDialog
            email={email}
            requestPending={requestPending}
            confirmPending={confirmPending}
            onRequest={onRequest}
            onConfirm={async (data) => {
              await onConfirm(data)
              onDone?.()
            }}
          >
            <Button color="primary" loading={requestPending || confirmPending}>
              <Trans>Verify email</Trans>
            </Button>
          </VerifyEmailDialog>

          {onCancel && (
            <Button onClick={onCancel}>
              <Trans>Back</Trans>
            </Button>
          )}
        </div>
      </div>
    </LayoutTitle>
  )
}
