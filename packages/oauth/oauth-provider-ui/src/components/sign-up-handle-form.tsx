import { Trans } from '@lingui/react/macro'
import type { HandleString } from '@atproto/syntax'
import { InputHandleDefault } from '#/components/forms/input-handle-default'
import { SmartForm, WrappedSmartFormProps } from '#/components/forms/smart-form'

export type SignUpHandleData = {
  handle: HandleString
}

export type SignUpHandleFormProps = WrappedSmartFormProps<SignUpHandleData> & {
  domains: string[]
}

export function SignUpHandleForm({
  domains,

  // FormProp
  ...props
}: SignUpHandleFormProps) {
  return (
    <SmartForm
      {...props}
      validate={({ handle }) => {
        if (handle) return { handle }
      }}
      fields={({ values, setterFor }) => (
        <>
          <InputHandleDefault
            handle={values.handle}
            onHandle={setterFor('handle')}
            domains={domains}
            name="handle"
            required
            autoFocus
            enterKeyHint="done"
            autoComplete="nickname"
          />

          {/* @NOTE Plain copy rather than an admonition: this is background
            about a later step, not something to act on now, and an alert
            surface next to the field it follows reads as a warning about what
            was just typed. */}
          <p className="text-text-light text-sm">
            <Trans>
              You can change this username to any domain name you control after
              your account is set up.
            </Trans>
          </p>
        </>
      )}
    />
  )
}
