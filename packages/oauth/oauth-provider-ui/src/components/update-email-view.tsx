import { Button } from '#/components/forms/button.tsx'
import { LayoutTitle } from '#/components/layouts/layout-title.tsx'
import { Trans, useLingui } from '@lingui/react/macro'
import { UpdateEmailDialog } from './update-email-dialog.tsx'

export type UpdateEmailViewProps = {
  email: string
  requestPending?: boolean
  confirmPending?: boolean
  verifyRequestPending?: boolean
  verifyConfirmPending?: boolean
  onRequest: () => Promise<{ tokenRequired: boolean }>
  onConfirm: (data: { email: string; token?: string }) => Promise<void>
  onVerifyRequest: () => Promise<void>
  onVerifyConfirm: (data: { email: string; token: string }) => Promise<void>
}

export function UpdateEmailView({
  email,
  requestPending,
  confirmPending,
  verifyRequestPending,
  verifyConfirmPending,
  onRequest,
  onConfirm,
  onVerifyRequest,
  onVerifyConfirm,
}: UpdateEmailViewProps) {
  const { t } = useLingui()

  return (
    <LayoutTitle
      title={t`Update your email`}
      subtitle={
        <Trans>Change the email address associated with your account.</Trans>
      }
    >
      <div className="space-y-6">
        <p>
          <Trans>
            Your current email address is <strong>{email}</strong>.
          </Trans>
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <UpdateEmailDialog
            email={email}
            requestPending={requestPending}
            confirmPending={confirmPending}
            verifyRequestPending={verifyRequestPending}
            onRequest={onRequest}
            onConfirm={onConfirm}
            onVerifyRequest={onVerifyRequest}
            onVerify={onVerifyConfirm}
          >
            <Button
              color="primary"
              loading={requestPending || confirmPending || verifyConfirmPending}
            >
              <Trans>Change email</Trans>
            </Button>
          </UpdateEmailDialog>
        </div>
      </div>
    </LayoutTitle>
  )
}
