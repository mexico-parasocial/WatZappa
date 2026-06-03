import {
  ButtonCooldown,
  ButtonCooldownProps,
} from '#/components/forms/button-cooldown.tsx'
import { Trans } from '@lingui/react/macro'
import { KeyIcon } from '@phosphor-icons/react'

export type ButtonRequestResetProps = ButtonCooldownProps

export function ButtonRequestReset({
  children = <Trans>Send reset code</Trans>,
  ...props
}: ButtonRequestResetProps) {
  return (
    <ButtonCooldown idleIcon={KeyIcon} {...props}>
      <span className="truncate">{children}</span>
    </ButtonCooldown>
  )
}
